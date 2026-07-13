'use strict';
/* Reloop 운영자 레이어 — 회수기 관제 + 수거 차량 라우팅(용량제약 VRP) + 처리 파이프라인 운영 시뮬레이션 */
const { db, now } = require('./db');

/* ---------------- 운영 파라미터 ---------------- */
const DEPOT = { x:172, y:138, name:'자원화 시설' };
const COLLECTOR_DEFS = [
  { complex:'그린빌 1단지', x:78,  y:96,  cap:200, inflow:15 },
  { complex:'한강센트럴',   x:206, y:70,  cap:200, inflow:11 },
  { complex:'샘물마을 3차', x:280, y:132, cap:180, inflow:10 },
  { complex:'푸른숲 아파트', x:120, y:172, cap:220, inflow:18 },
  { complex:'해솔마을',     x:236, y:200, cap:200, inflow:13 },
  { complex:'별빛타운',     x:66,  y:214, cap:180, inflow:9  },
  // 주택가 거점 회수기 (아파트보다 적재/유입 작음)
  { complex:'행복동 주택가', x:40,  y:150, cap:120, inflow:6, house:true },
  { complex:'새싹동 주택가', x:158, y:244, cap:120, inflow:5, house:true },
  { complex:'은행나무길',   x:250, y:158, cap:100, inflow:5, house:true },
];
const TRUCK_CAP = 500;      // 수거 차량 적재 용량(kg)
const DISPATCH_FRAC = 0.6;  // 수거 대상 임계(적재율)
const OVERFLOW_FRAC = 0.9;  // 가득참(자동 배차 트리거)
const R_RES = 110;          // 자원화 시설 처리율(kg/틱)
const R_FARM = 40;          // 스마트팜 투입 처리율(kg/틱)
const TRUCK_MS = 8000;      // 배차 1회 순회 소요(ms)
const FEED=0.14, FRASS=0.30, WATER=0.5, ENERGY_WH=55;

const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);

/* ---------------- 초기화 / 상태 저장 ---------------- */
function initOps(){
  db.exec(`CREATE TABLE IF NOT EXISTS collectors(id INTEGER PRIMARY KEY AUTOINCREMENT, complex TEXT, x REAL, y REAL, cap REAL, inflow REAL, house INTEGER DEFAULT 0, fill REAL DEFAULT 0);
           CREATE TABLE IF NOT EXISTS ops_kv(k TEXT PRIMARY KEY, v TEXT);`);
  try{ db.exec('ALTER TABLE collectors ADD COLUMN house INTEGER DEFAULT 0'); }catch(e){/* 이미 존재 */}
  // 누락된 회수기만 추가 (idempotent — DB 초기화 불필요)
  const existing = new Set(collectors().map(c=>c.complex));
  const ins = db.prepare('INSERT INTO collectors(complex,x,y,cap,inflow,house,fill) VALUES(?,?,?,?,?,?,?)');
  for(const c of COLLECTOR_DEFS) if(!existing.has(c.complex)) ins.run(c.complex, c.x, c.y, c.cap, c.inflow, c.house?1:0, Math.round(c.cap*(0.2+Math.random()*0.35)));
  if(!getKV('state')) setState(defaultState());
}
const getKV = k => { const r=db.prepare('SELECT v FROM ops_kv WHERE k=?').get(k); return r?r.v:null; };
const setKV = (k,v) => db.prepare('INSERT OR REPLACE INTO ops_kv(k,v) VALUES(?,?)').run(k, v);
const defaultState = () => ({ intake:0, farmQ:0, stocks:{feed:0,frass:0,water:0,energy:0,produce:0},
  truck:{active:false}, stats:{collected:0,processed:0,dispatches:0,distance:0,overflow:0}, bottleneck:'정상', lastPlan:null });
const getState = () => { try{ return Object.assign(defaultState(), JSON.parse(getKV('state'))); }catch(e){ return defaultState(); } };
const setState = s => setKV('state', JSON.stringify(s));
const collectors = () => db.prepare('SELECT * FROM collectors ORDER BY id').all();

/* ---------------- 라우팅 알고리즘 ----------------
   용량제약 차량경로문제(CVRP), 단일 차량·다중 회차.
   1) 최근접 이웃(greedy nearest-neighbor)으로 용량 내 회차 구성
   2) 각 회차를 2-opt 지역탐색으로 순회거리 최소화
   비교 기준(naive): 적재량 많은 순서대로 배차했을 때의 거리 */
const routeDist = seq => { let d=0; for(let i=0;i<seq.length-1;i++) d+=dist(seq[i],seq[i+1]); return d; };
function twoOpt(stops){
  const full = arr => [DEPOT, ...arr, DEPOT];
  let best = stops.slice(), bestD = routeDist(full(best)), improved = true;
  while(improved){
    improved = false;
    for(let i=0;i<best.length-1;i++){
      for(let k=i+1;k<best.length;k++){
        const cand = best.slice(0,i).concat(best.slice(i,k+1).reverse(), best.slice(k+1));
        const d = routeDist(full(cand));
        if(d < bestD - 1e-9){ best=cand; bestD=d; improved=true; }
      }
    }
  }
  return best;
}
function packTrips(order){ // 주어진 방문 순서를 용량 내 회차로 분할 (naive 비교용)
  const trips=[]; let i=0;
  while(i<order.length){
    let trip=[], load=0;
    while(i<order.length && (trip.length===0 || load+order[i].fill<=TRUCK_CAP)){ trip.push(order[i]); load+=order[i].fill; i++; }
    trips.push({stops:trip, load});
  }
  return trips;
}
const tripsDist = trips => trips.reduce((a,t)=>a+routeDist([DEPOT,...t.stops,DEPOT]),0);

function planRoute(){
  const cand = collectors().filter(c => c.fill >= c.cap*DISPATCH_FRAC)
    .map(c => ({ id:c.id, complex:c.complex, x:c.x, y:c.y, fill:+c.fill.toFixed(1) }));
  if(!cand.length) return null;

  // 최적화: 최근접 이웃 구성 + 2-opt
  const pool = cand.slice(), optTrips=[];
  while(pool.length){
    let trip=[], load=0, cur=DEPOT;
    while(true){
      const feasible = pool.filter(c => load + c.fill <= TRUCK_CAP);
      if(!feasible.length) break;
      let nn=feasible[0], nd=dist(cur,nn);
      for(const c of feasible){ const d=dist(cur,c); if(d<nd){ nd=d; nn=c; } }
      trip.push(nn); load+=nn.fill; cur=nn;
      pool.splice(pool.indexOf(nn),1);
    }
    const opt = twoOpt(trip);
    optTrips.push({ stops:opt, load, dist:routeDist([DEPOT,...opt,DEPOT]) });
  }
  const totalDist = optTrips.reduce((a,t)=>a+t.dist,0);
  const totalLoad = optTrips.reduce((a,t)=>a+t.load,0);
  // naive 기준: 적재량 많은 순서
  const naive = packTrips(cand.slice().sort((a,b)=>b.fill-a.fill));
  const naiveDist = tripsDist(naive);
  return {
    trips: optTrips, totalDist:+totalDist.toFixed(1), naiveDist:+naiveDist.toFixed(1),
    totalLoad:Math.round(totalLoad), stops:cand.length, tripCount:optTrips.length,
  };
}

/* ---------------- 배차(디스패치) ---------------- */
function doDispatch(st){
  const plan = planRoute();
  if(!plan) return { error:'수거 임계(60%)를 넘은 회수기가 없어요' };
  const path = [DEPOT];
  for(const t of plan.trips){ for(const s of t.stops) path.push({ x:s.x, y:s.y, id:s.id }); path.push(DEPOT); }
  const cum=[0]; for(let i=1;i<path.length;i++) cum.push(cum[i-1]+dist(path[i-1],path[i]));
  const total = cum[cum.length-1] || 1;
  const stops = path.map((n,i)=>({ id:n.id, x:n.x, y:n.y, prog:cum[i]/total })).filter(n=>n.id);
  st.truck = { active:true, startedAt:now(), path, stops, total, progress:0, collected:{}, load:plan.totalLoad };
  st.stats.dispatches++; st.stats.distance = +(st.stats.distance + plan.totalDist).toFixed(1);
  st.lastPlan = {
    trips: plan.trips.map(t=>({ stops:t.stops.map(s=>s.complex), load:Math.round(t.load), dist:Math.round(t.dist) })),
    totalDist: Math.round(plan.totalDist), naiveDist: Math.round(plan.naiveDist),
    saved: plan.naiveDist>0 ? Math.max(0,Math.round((1-plan.totalDist/plan.naiveDist)*100)) : 0,
    totalLoad: plan.totalLoad, tripCount: plan.tripCount, stops: plan.stops, at: now(),
  };
  return { plan: st.lastPlan };
}
function dispatch(){ const st=getState(); const r=doDispatch(st); setState(st); return r; }
function previewRoute(){ const p=planRoute(); if(!p) return {plan:null}; return { plan:{
  trips:p.trips.map(t=>({stops:t.stops.map(s=>s.complex),load:Math.round(t.load),dist:Math.round(t.dist)})),
  totalDist:Math.round(p.totalDist), naiveDist:Math.round(p.naiveDist),
  saved:p.naiveDist>0?Math.max(0,Math.round((1-p.totalDist/p.naiveDist)*100)):0,
  totalLoad:p.totalLoad, tripCount:p.tripCount, stops:p.stops } }; }

/* ---------------- 틱: 유입 → 배차 → 이동/수거 → 처리 → 병목 ---------------- */
function opsTick(){
  const st = getState();
  const upd = db.prepare('UPDATE collectors SET fill=? WHERE id=?');
  // 1) 가정 배출 유입
  for(const c of collectors()){
    const nf = Math.min(c.cap, c.fill + c.inflow);
    if(c.fill < c.cap && nf >= c.cap) st.stats.overflow++;
    if(nf !== c.fill) upd.run(+nf.toFixed(1), c.id);
  }
  // 2) 완전 자동 배차: 트럭 유휴 & (가득참 임박 or 트럭 한 대 분량 누적)
  if(!st.truck.active){
    const cs2 = collectors();
    const cand = cs2.filter(c => c.fill >= c.cap*DISPATCH_FRAC);
    const candLoad = cand.reduce((a,c)=>a+c.fill,0);
    const urgent = cs2.some(c => c.fill >= c.cap*OVERFLOW_FRAC);
    if(cand.length && (urgent || candLoad >= TRUCK_CAP*0.7)) doDispatch(st);
  }
  // 3) 트럭 이동 & 도착 시 수거
  if(st.truck.active){
    const t = st.truck;
    t.progress = Math.min(1, (now()-t.startedAt)/TRUCK_MS);
    for(const s of t.stops){
      if(t.progress >= s.prog && !t.collected[s.id]){
        const col = db.prepare('SELECT * FROM collectors WHERE id=?').get(s.id);
        if(col){ st.intake += col.fill; st.stats.collected = +(st.stats.collected+col.fill).toFixed(1); upd.run(0, col.id); }
        t.collected[s.id] = true;
      }
    }
    if(t.progress >= 1) st.truck = { active:false };
  }
  // 4) 자원화 처리 (용량 제한)
  const p = Math.min(st.intake, R_RES);
  st.intake = +(st.intake - p).toFixed(1); st.stats.processed = +(st.stats.processed + p).toFixed(1);
  st.stocks.feed += p*FEED; st.stocks.frass += p*FRASS; st.stocks.water += p*WATER; st.stocks.energy += p*ENERGY_WH;
  st.farmQ += p*FRASS;
  // 5) 스마트팜 투입 (용량 제한)
  const f = Math.min(st.farmQ, R_FARM);
  st.farmQ = +(st.farmQ - f).toFixed(1); st.stocks.produce += f*2;
  // 6) 병목 감지
  const cs = collectors();
  st.bottleneck = st.intake > R_RES*1.5 ? '자원화 처리'
    : (!st.truck.active && cs.some(c=>c.fill>=c.cap*OVERFLOW_FRAC)) ? '수거·배차'
    : st.farmQ > R_FARM*2 ? '스마트팜' : '정상';
  setState(st);
}

/* ---------------- 조회 뷰 ---------------- */
function truckPos(t){
  const total = t.total || 1, target = t.progress*total, path = t.path;
  let acc = 0;
  for(let i=0;i<path.length-1;i++){
    const d = dist(path[i], path[i+1]);
    if(acc + d >= target){ const fr = d ? (target-acc)/d : 0;
      return { x:+(path[i].x+(path[i+1].x-path[i].x)*fr).toFixed(1), y:+(path[i].y+(path[i+1].y-path[i].y)*fr).toFixed(1) }; }
    acc += d;
  }
  const last = path[path.length-1]; return { x:last.x, y:last.y };
}
function pipelineView(st, cs){
  const binLoad = cs.reduce((a,c)=>a+c.fill,0);
  const binCap = cs.reduce((a,c)=>a+c.cap,0);
  return [
    { key:'collect',  label:'수거·배차',  icon:'🚛', queue:Math.round(binLoad), unit:'kg 적재 대기', capLabel:`차량 ${TRUCK_CAP}kg`, util:Math.round(binLoad/binCap*100) },
    { key:'resource', label:'자원화 처리', icon:'🐛', queue:Math.round(st.intake), unit:'kg 처리 대기', capLabel:`${R_RES}kg/틱`, util:Math.min(100, Math.round(Math.min(st.intake,R_RES)/R_RES*100)) },
    { key:'farm',     label:'스마트팜',   icon:'🌱', queue:Math.round(st.farmQ), unit:'kg 투입 대기', capLabel:`${R_FARM}kg/틱`, util:Math.min(100, Math.round(Math.min(st.farmQ,R_FARM)/R_FARM*100)) },
  ];
}
function getOpsState(){
  const st = getState(), cs = collectors();
  const truckActive = !!(st.truck && st.truck.active);
  const cand = cs.filter(c => c.fill >= c.cap*DISPATCH_FRAC);
  const candLoad = Math.round(cand.reduce((a,c)=>a+c.fill,0));
  const urgent = cs.some(c => c.fill >= c.cap*OVERFLOW_FRAC);
  const threshold = Math.round(TRUCK_CAP*0.7);
  const autoStatus = {
    active: truckActive, candidates: cand.length, candLoad, threshold,
    reason: truckActive ? '수거 차량 운행 중 — 최적 경로로 순회 수거'
      : urgent ? '가득참 감지 — 즉시 자동 배차 예정'
      : cand.length ? `적재 누적 대기 · ${candLoad}/${threshold}kg 도달 시 자동 배차`
      : '수거 임박(60%+) 회수기 없음 — 대기 중',
  };
  return {
    depot: DEPOT,
    autoStatus,
    collectors: cs.map(c=>({ id:c.id, complex:c.complex, x:c.x, y:c.y, cap:c.cap, fill:+c.fill.toFixed(1), house:!!c.house,
      pct:Math.round(c.fill/c.cap*100),
      status: c.fill>=c.cap*OVERFLOW_FRAC ? '가득참' : c.fill>=c.cap*DISPATCH_FRAC ? '수거 임박' : '정상' })),
    truck: (st.truck && st.truck.active) ? { ...truckPos(st.truck), progress:st.truck.progress, load:Math.round(st.truck.load||0), path:st.truck.path } : null,
    pipeline: pipelineView(st, cs),
    bottleneck: st.bottleneck,
    plan: st.lastPlan || null,
    stats: {
      collected:Math.round(st.stats.collected), processed:Math.round(st.stats.processed),
      dispatches:st.stats.dispatches, distance:Math.round(st.stats.distance), overflow:st.stats.overflow,
      feedKg:+(st.stocks.feed/1000).toFixed(1), frassKg:+(st.stocks.frass/1000).toFixed(1),
      energyKwh:+(st.stocks.energy/1000).toFixed(1), produce:Math.round(st.stocks.produce),
    },
    params: { truckCap:TRUCK_CAP, dispatchFrac:DISPATCH_FRAC, overflowFrac:OVERFLOW_FRAC, rRes:R_RES, rFarm:R_FARM },
  };
}

module.exports = { initOps, opsTick, dispatch, previewRoute, getOpsState };
