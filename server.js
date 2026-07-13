'use strict';
/* Reloop — 풀스택 서버 (Node 내장 http + node:sqlite, 외부 의존성 0) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const {
  db, FACT, STAGES, ORDER_STAGES, CROPS, SENSOR_TARGETS, SENSOR_META, COMPLEXES, RESIDENCES,
  now, rnd, pick, resourcesFor
} = require('./db');
const ops = require('./ops');
ops.initOps();

const PORT = process.env.PORT || 5178;
const PUB = path.join(__dirname, 'public');
const stageIdx = k => STAGES.findIndex(s => s.key === k);

/* ===================== 처리 엔진 ===================== */

// 배출 배치의 단계를 경과 시간 기준으로 진행 (재시작에도 안전 · 조회 시에도 호출)
const upd = db.prepare(`UPDATE batches SET stage=?, stage_idx=?, stage_started_at=?, farm_id=?, crop=?, produced_item=?, produced_qty=? WHERE id=?`);
function leastLoadedFarm(){
  const farms = db.prepare('SELECT id, crop FROM farms').all();
  let best=null, bestN=1e9;
  for(const f of farms){
    const n = db.prepare("SELECT COUNT(*) c FROM batches WHERE farm_id=? AND stage='farming'").get(f.id).c;
    if(n<bestN){ bestN=n; best=f; }
  }
  return best;
}
function produceIntoStore(crop, weight){
  const cropDef = CROPS.find(c=>c.crop===crop) || CROPS[0];
  const qty = Math.max(1, Math.round(weight*2));
  db.prepare('UPDATE store_items SET produced=produced+? WHERE id=? AND is_produce=1').run(qty, cropDef.item);
  return { item:cropDef.item, qty };
}
function advanceBatch(b){
  if(b.stage === 'stored') return b;
  let idx = b.stage_idx, started = b.stage_started_at;
  let farm_id = b.farm_id, crop = b.crop, pItem = b.produced_item, pQty = b.produced_qty;
  let changed = false;
  const t = now();
  while(idx < STAGES.length-1){
    const dur = STAGES[idx].dur;
    if(t - started >= dur){
      started += dur; idx++; changed = true;
      const key = STAGES[idx].key;
      if(key === 'farming' && !farm_id){
        const f = leastLoadedFarm();
        if(f){ farm_id = f.id; crop = f.crop; }
      }
      if(key === 'stored' && !pItem){
        const out = produceIntoStore(crop || '상추', b.weight);
        pItem = out.item; pQty = out.qty;
      }
    } else break;
  }
  if(changed){
    upd.run(STAGES[idx].key, idx, started, farm_id, crop, pItem, pQty, b.id);
    return db.prepare('SELECT * FROM batches WHERE id=?').get(b.id);
  }
  return b;
}
function advanceUserBatches(uid){
  const rows = db.prepare("SELECT * FROM batches WHERE user_id=? AND stage!='stored'").all(uid);
  for(const b of rows) advanceBatch(b);
}
function advanceAll(){
  const rows = db.prepare("SELECT * FROM batches WHERE stage!='stored'").all();
  for(const b of rows) advanceBatch(b);
}

// 배치에 진행률/단계 정보 붙이기
function decorateBatch(b){
  const s = STAGES[b.stage_idx];
  const dur = s.dur;
  const within = dur>0 ? Math.min(1, (now()-b.stage_started_at)/dur) : 1;
  const overall = b.stage==='stored' ? 1 : Math.min(1,(b.stage_idx + within)/(STAGES.length-1));
  let etaMs = 0;
  if(b.stage!=='stored'){
    etaMs = Math.max(0, dur - (now()-b.stage_started_at));
    for(let i=b.stage_idx+1;i<STAGES.length-1;i++) etaMs += STAGES[i].dur;
  }
  return {
    id:b.id, weight:b.weight, points:b.points,
    resources:{feed_g:b.feed_g, frass_g:b.frass_g, water_ml:b.water_ml, energy_wh:b.energy_wh, co2_kg:b.co2_kg},
    stage:b.stage, stageIdx:b.stage_idx, stageLabel:s.label, stageIcon:s.icon, stageDesc:s.desc,
    within, overall, etaMs, createdAt:b.created_at,
    farmId:b.farm_id, crop:b.crop, producedItem:b.produced_item, producedQty:b.produced_qty,
  };
}

/* ===================== AI 스마트팜 제어 루프 ===================== */
const NOISE = { moisture:2.6, temp:0.55, light:1.1, ph:0.045, ec:0.075 };
const GROWTH_SEQ = ['발아','생장','수확기'];
const ACTUATOR = {
  moisture:{ lo:'💧 관수 밸브 개방 · 회수 증류수 공급', hi:'💧 관수 중단 · 배수 조절' },
  temp:    { lo:'🔥 난방 가동 (수소 연료전지 폐열 재활용)', hi:'🌬️ 환기팬 가동 · 온도 하강' },
  light:   { lo:'💡 LED 광량 상향', hi:'💡 LED 광량 하향 · 차광' },
  ph:      { lo:'⚗️ 양액 pH 상향 보정', hi:'⚗️ 양액 pH 하향 보정' },
  ec:      { lo:'🌱 액상비료(프라스 유래) 추가 투입 · EC 상향', hi:'💧 회수 증류수 희석 · EC 하향' },
};
function farmTick(){
  const farms = db.prepare('SELECT * FROM farms').all();
  const insLog = db.prepare('INSERT INTO farm_log(farm_id,ts,msg,kind) VALUES(?,?,?,?)');
  for(const f of farms){
    let growth = f.growth, gStart = f.growth_started_at;
    // 생육 단계 전환 (약 55초마다)
    if(now() - gStart > 55000){
      const ni = (GROWTH_SEQ.indexOf(growth)+1) % GROWTH_SEQ.length;
      const ngrowth = GROWTH_SEQ[ni];
      insLog.run(f.id, now(), `🔄 생육 단계 전환: ${growth} → ${ngrowth} · 목표 범위 갱신`, 'stage');
      growth = ngrowth; gStart = now();
    }
    const T = SENSOR_TARGETS[growth];
    const vals = { moisture:f.moisture, temp:f.temp, light:f.light, ph:f.ph, ec:f.ec };
    let worst=null, worstDev=0;
    const next = {};
    for(const k of Object.keys(vals)){
      const [lo,hi] = T[k]; const mid=(lo+hi)/2;
      const cur = vals[k];
      // 외란 + 제어(목표 중앙으로 끌어당김)
      let v = cur + (mid-cur)*0.32 + (Math.random()*2-1)*NOISE[k];
      next[k] = +v.toFixed(k==='ph'?2:(k==='ec'?2:1));
      // 범위 이탈 정도
      let dev = 0;
      if(cur < lo) dev = (lo-cur)/(hi-lo);
      else if(cur > hi) dev = (cur-hi)/(hi-lo);
      if(dev > worstDev){ worstDev=dev; worst={k, dir: cur<lo?'lo':'hi', cur}; }
    }
    db.prepare('UPDATE farms SET moisture=?,temp=?,light=?,ph=?,ec=?,growth=?,growth_started_at=?,updated_at=? WHERE id=?')
      .run(next.moisture,next.temp,next.light,next.ph,next.ec,growth,gStart,now(),f.id);
    // 가장 벗어난 센서 1개에 대해 액추에이터 로그 (제어 동작)
    if(worst && worstDev>0.06){
      const m = SENSOR_META[worst.k];
      insLog.run(f.id, now(), `${ACTUATOR[worst.k][worst.dir]} (${m.label} ${worst.cur.toFixed(m.unit==='%'?0:2)}${m.unit})`, 'act');
    } else if(Math.random()<0.25){
      insLog.run(f.id, now(), `✅ 전 항목 목표 범위 내 · 안정 유지 중`, 'ok');
    }
    // 로그 트림 (팜당 최근 40개)
    db.prepare(`DELETE FROM farm_log WHERE farm_id=? AND id NOT IN (SELECT id FROM farm_log WHERE farm_id=? ORDER BY id DESC LIMIT 40)`).run(f.id,f.id);
  }
}

/* ===================== 자원화 공정 로그 ===================== */
const FAC_CH = ['A','B','C'];
function genFacilityMsg(){
  const r = Math.random();
  if(r<0.24) return {msg:`🚚 ${pick(COMPLEXES)} 수거 완료 · ${Math.round(rnd(120,540))}kg 입고`, kind:'in'};
  if(r<0.50) return {msg:`🐛 BSF 챔버 ${pick(FAC_CH)} · 유충 사료전환 ${Math.round(rnd(28,96))}% 진행`, kind:'bsf'};
  if(r<0.72) return {msg:`⚡ 전기분해조 ${pick([1,2])}호 · 수소 ${rnd(0.2,1.8).toFixed(1)}㎥ 회수`, kind:'elec'};
  if(r<0.88) return {msg:`🌱 프라스 비료 ${Math.round(rnd(10,60))}kg 산출 · 스마트팜 이송`, kind:'out'};
  return {msg:`💧 증류수 ${Math.round(rnd(20,120))}L 회수 · 양액 조제`, kind:'out'};
}
const insFac = db.prepare('INSERT INTO facility_log(ts,msg,kind) VALUES(?,?,?)');
function pushFacility(){ const m=genFacilityMsg(); insFac.run(now(), m.msg, m.kind);
  db.prepare('DELETE FROM facility_log WHERE id NOT IN (SELECT id FROM facility_log ORDER BY id DESC LIMIT 40)').run(); }
function facilityTick(){ if(Math.random()<0.55) pushFacility(); }
// 최초 실행 시 로그 채우기
if(db.prepare('SELECT COUNT(*) c FROM facility_log').get().c === 0){ for(let i=0;i<10;i++) pushFacility(); }

/* ===================== 주문 배송 엔진 ===================== */
function advanceOrder(o){
  if(o.status==='delivered') return o;
  let idx=o.stage_idx, started=o.stage_started_at, changed=false; const t=now();
  while(idx < ORDER_STAGES.length-1){
    const dur = ORDER_STAGES[idx].dur;
    if(t-started >= dur){ started+=dur; idx++; changed=true; } else break;
  }
  if(changed){
    db.prepare('UPDATE orders SET status=?, stage_idx=?, stage_started_at=? WHERE id=?').run(ORDER_STAGES[idx].key, idx, started, o.id);
    return db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);
  }
  return o;
}
function decorateOrder(o){
  const s = ORDER_STAGES[o.stage_idx]; const dur = s.dur;
  const within = dur>0 ? Math.min(1,(now()-o.stage_started_at)/dur) : 1;
  const overall = o.status==='delivered' ? 1 : Math.min(1,(o.stage_idx+within)/(ORDER_STAGES.length-1));
  let eta=0;
  if(o.status!=='delivered'){ eta=Math.max(0,dur-(now()-o.stage_started_at)); for(let i=o.stage_idx+1;i<ORDER_STAGES.length-1;i++) eta+=ORDER_STAGES[i].dur; }
  return { id:o.id, name:o.name, icon:o.icon, qty:o.qty, cost:o.cost, kind:o.kind, address:o.address,
    status:o.status, stageIdx:o.stage_idx, stageLabel:s.label, stageIcon:s.icon, stageDesc:s.desc,
    within, overall, etaMs:eta, createdAt:o.created_at };
}
function advanceUserOrders(uid){ for(const o of db.prepare("SELECT * FROM orders WHERE user_id=? AND status!='delivered'").all(uid)) advanceOrder(o); }
function advanceAllOrders(){ for(const o of db.prepare("SELECT * FROM orders WHERE status!='delivered'").all()) advanceOrder(o); }

/* ===================== 가정용 BSF 모듈(기기) 엔진 ===================== */
const DEVICE_CYCLE_BASE = 30000;   // 생물전환 1사이클 기본 시간(ms)
function deviceProgress(d){
  if(d.status==='processing') return Math.min(1,(now()-d.cycle_started_at)/(d.cycle_dur||DEVICE_CYCLE_BASE));
  if(d.status==='ready') return 1;
  return 0;
}
function deviceReadFlip(d){ // processing → ready (조회/틱 공통)
  if(d.status==='processing' && deviceProgress(d)>=1){
    db.prepare('UPDATE devices SET status=?, updated_at=? WHERE id=?').run('ready', now(), d.id);
    d.status='ready';
  }
  return d;
}
function deviceTickOne(d){
  deviceReadFlip(d);
  const T = d.status==='processing' ? {temp:31,hum:66,act:84} : d.status==='ready' ? {temp:29,hum:60,act:34} : {temp:26.5,hum:54,act:8};
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const temp = +(d.temp + (T.temp-d.temp)*0.3 + (Math.random()*2-1)*0.4).toFixed(1);
  const hum  = +(clamp(d.humidity + (T.hum-d.humidity)*0.3 + (Math.random()*2-1)*1.2, 30, 95)).toFixed(0);
  const act  = +(clamp(d.activity + (T.act-d.activity)*0.3 + (Math.random()*2-1)*3, 0, 100)).toFixed(0);
  db.prepare('UPDATE devices SET temp=?, humidity=?, activity=?, updated_at=? WHERE id=?').run(temp,hum,act,now(),d.id);
}
function deviceTickAll(){ for(const d of db.prepare('SELECT * FROM devices').all()) deviceTickOne(d); }
function getDevice(uid){ return db.prepare('SELECT * FROM devices WHERE user_id=? ORDER BY id DESC LIMIT 1').get(uid); }
function deviceView(uid){
  const d = getDevice(uid); if(!d) return null;
  deviceReadFlip(d);
  return {
    id:d.id, name:d.name, status:d.status, fill:+(d.fill||0).toFixed(2), progress:deviceProgress(d),
    temp:d.temp, humidity:d.humidity, activity:d.activity,
    processedKg:+(d.processed_kg||0).toFixed(2), feedG:Math.round(d.feed_g||0), frassG:Math.round(d.frass_g||0), cycles:d.cycles||0,
    etaMs: d.status==='processing' ? Math.max(0,(d.cycle_dur||DEVICE_CYCLE_BASE)-(now()-d.cycle_started_at)) : 0,
  };
}

// 서버 틱: 3초마다 배치 진행 + 스마트팜 제어 + 공정 로그 + 배송/기기 + 운영(회수기·배차·처리)
setInterval(() => { try{ advanceAll(); farmTick(); facilityTick(); advanceAllOrders(); deviceTickAll(); ops.opsTick(); }catch(e){ console.error('tick', e); } }, 3000);

/* ===================== 조회 헬퍼 ===================== */
function getUser(uid){ return db.prepare('SELECT * FROM users WHERE id=?').get(uid); }
function getMachine(uid){ return db.prepare('SELECT * FROM machines WHERE user_id=? ORDER BY id DESC LIMIT 1').get(uid); }
function userStats(uid){
  const r = db.prepare(`SELECT COUNT(*) cnt, COALESCE(SUM(weight),0) kg,
    COALESCE(SUM(feed_g),0) feed, COALESCE(SUM(frass_g),0) frass, COALESCE(SUM(energy_wh),0) energy
    FROM batches WHERE user_id=?`).get(uid);
  const dev = getDevice(uid);                       // 가정용 모듈 처리분 합산 (BSF만 — 사료·비료)
  const dkg = dev ? (dev.processed_kg||0) : 0, dfeed = dev ? (dev.feed_g||0) : 0, dfrass = dev ? (dev.frass_g||0) : 0;
  const kg = r.kg + dkg;
  return { count:r.cnt, kg:+kg.toFixed(2), co2:Math.round(kg*FACT.co2),
    feed_g:Math.round(r.feed+dfeed), frass_g:Math.round(r.frass+dfrass), energy_wh:Math.round(r.energy),
    homeKg:+dkg.toFixed(2), homeCycles: dev ? (dev.cycles||0) : 0 };
}
function me(uid){
  const u = getUser(uid); if(!u) return null;
  advanceUserBatches(uid);
  advanceUserOrders(uid);
  const m = getMachine(uid);
  const active = db.prepare("SELECT * FROM batches WHERE user_id=? AND stage!='stored'").all(uid).map(decorateBatch);
  active.sort((a,b)=>a.etaMs-b.etaMs);
  const dev = getDevice(uid);
  const hasModule = !!dev;
  let notifs = 0;
  if(dev){ deviceReadFlip(dev); if(dev.status==='ready' || dev.status==='maintenance') notifs++; }
  const activeOrders = db.prepare("SELECT COUNT(*) c FROM orders WHERE user_id=? AND status!='delivered'").get(uid).c;
  return {
    uid:u.id, name:u.name, complex:u.complex, size:u.size, points:u.points,
    machine: m ? {status:m.status, complex:m.complex, requestedAt:m.requested_at, installedAt:m.installed_at} : {status:'none'},
    stats: userStats(uid),
    activeCount: active.length,
    nearestEtaMs: active.length ? active[0].etaMs : null,
    hasModule, activeOrders, notifs,
  };
}

/* ===================== 라우트 ===================== */
const routes = {};
const R = (method, path, fn) => { routes[method+' '+path] = fn; };

R('GET','/api/config', () => ({ stages:STAGES, orderStages:ORDER_STAGES, sensorMeta:SENSOR_META, sensorTargets:SENSOR_TARGETS, fact:FACT, residences:RESIDENCES }));

R('GET','/api/me', (q) => me(+q.get('uid')) || {error:'no user'});

R('POST','/api/session', (q,body) => {
  let u = body.uid ? getUser(body.uid) : null;
  if(!u){
    const id = db.prepare('INSERT INTO users(name,complex,size,points,is_seed,created_at) VALUES(?,?,?,0,0,?)')
      .run(body.name||'남윤수','', '', now()).lastInsertRowid;
    u = getUser(id);
  }
  return me(u.id);
});

R('POST','/api/machine/request', (q,body) => {
  const u = getUser(body.uid); if(!u) return {error:'no user'};
  db.prepare('UPDATE users SET complex=?, size=? WHERE id=?').run(body.complex||'', body.size||'', u.id);
  const existing = getMachine(u.id);
  if(existing && existing.status!=='none'){
    db.prepare('UPDATE machines SET complex=?, size=?, status=?, requested_at=? WHERE id=?')
      .run(body.complex||'', body.size||'', 'requested', now(), existing.id);
  } else {
    db.prepare('INSERT INTO machines(user_id,complex,size,status,requested_at) VALUES(?,?,?,?,?)')
      .run(u.id, body.complex||'', body.size||'', 'requested', now());
  }
  return me(u.id);
});

R('POST','/api/machine/install', (q,body) => {
  const m = getMachine(body.uid);
  if(m) db.prepare('UPDATE machines SET status=?, installed_at=? WHERE id=?').run('installed', now(), m.id);
  return me(body.uid);
});

R('POST','/api/dispose', (q,body) => {
  const u = getUser(body.uid); if(!u) return {error:'no user'};
  const m = getMachine(u.id);
  if(!m || m.status!=='installed') return {error:'machine not installed'};
  const w = Math.max(0.05, Math.min(5, +body.weight||0));
  const pts = Math.round(w*FACT.pointsPerKg);
  const r = resourcesFor(w);
  const id = db.prepare(`INSERT INTO batches(user_id,weight,points,feed_g,frass_g,water_ml,energy_wh,co2_kg,stage,stage_idx,stage_started_at,created_at)
    VALUES(?,?,?,?,?,?,?,?, 'collected_wait',0,?,?)`).run(u.id,w,pts,r.feed_g,r.frass_g,r.water_ml,r.energy_wh,r.co2_kg, now(), now()).lastInsertRowid;
  db.prepare('UPDATE users SET points=points+? WHERE id=?').run(pts, u.id);
  const b = decorateBatch(db.prepare('SELECT * FROM batches WHERE id=?').get(id));
  return { batch:b, me:me(u.id) };
});

R('GET','/api/batches', (q) => {
  const uid = +q.get('uid');
  advanceUserBatches(uid);
  const rows = db.prepare('SELECT * FROM batches WHERE user_id=? ORDER BY id DESC LIMIT 30').all(uid);
  return { batches: rows.map(decorateBatch) };
});

R('POST','/api/batch/advance', (q,body) => {
  const b = db.prepare('SELECT * FROM batches WHERE id=? AND user_id=?').get(body.id, body.uid);
  if(!b) return {error:'no batch'};
  if(b.stage==='stored') return { batch:decorateBatch(b) };
  // 현재 단계를 즉시 끝내도록 시작 시각을 앞당김
  db.prepare('UPDATE batches SET stage_started_at=? WHERE id=?').run(now()-STAGES[b.stage_idx].dur-1, b.id);
  const nb = advanceBatch(db.prepare('SELECT * FROM batches WHERE id=?').get(b.id));
  return { batch: decorateBatch(nb) };
});

R('GET','/api/farms', () => {
  const farms = db.prepare('SELECT * FROM farms ORDER BY id').all();
  return { farms: farms.map(f => farmView(f, 6)) };
});
R('GET','/api/farm', (q) => {
  const f = db.prepare('SELECT * FROM farms WHERE id=?').get(+q.get('id'));
  if(!f) return {error:'no farm'};
  return { farm: farmView(f, 30) };
});
function farmView(f, logN){
  const activeBatches = db.prepare("SELECT COUNT(*) c FROM batches WHERE farm_id=? AND stage='farming'").get(f.id).c;
  const log = db.prepare('SELECT ts,msg,kind FROM farm_log WHERE farm_id=? ORDER BY id DESC LIMIT ?').all(f.id, logN);
  return {
    id:f.id, name:f.name, crop:f.crop, icon:f.icon, growth:f.growth,
    sensors:{moisture:f.moisture, temp:f.temp, light:f.light, ph:f.ph, ec:f.ec},
    targets: SENSOR_TARGETS[f.growth],
    activeBatches, updatedAt:f.updated_at, log,
  };
}

R('GET','/api/store', (q) => {
  const uid = +q.get('uid')||0;
  const items = db.prepare('SELECT * FROM store_items').all();
  const contributed = uid ? db.prepare("SELECT COUNT(*) c FROM batches WHERE user_id=? AND stage='stored'").get(uid).c : 0;
  return { items: items.map(it => {
    const sold = db.prepare('SELECT COUNT(*) c FROM purchases WHERE item_id=?').get(it.id).c;
    const stock = it.is_produce ? Math.max(0, it.base_stock + it.produced - sold) : Math.max(0, it.base_stock - sold + 999);
    return { id:it.id, name:it.name, category:it.category, price:it.price, icon:it.icon, meta:it.meta,
             isProduce:!!it.is_produce, isLoop:!!it.is_loop, stock: it.is_produce?stock:9999 };
  }), youContributed: contributed>0 };
});

R('POST','/api/store/buy', (q,body) => {
  const u = getUser(body.uid); if(!u) return {error:'no user'};
  const it = db.prepare('SELECT * FROM store_items WHERE id=?').get(body.itemId);
  if(!it) return {error:'no item'};
  if(u.points < it.price) return {error:'부족한 포인트'};
  if(it.is_produce){
    const sold = db.prepare('SELECT COUNT(*) c FROM purchases WHERE item_id=?').get(it.id).c;
    if(it.base_stock + it.produced - sold <= 0) return {error:'품절'};
  }
  if(it.id==='module' && getDevice(u.id)) return {error:'이미 보유 중인 기기예요'};
  db.prepare('UPDATE users SET points=points-? WHERE id=?').run(it.price, u.id);
  db.prepare('INSERT INTO purchases(user_id,item_id,name,icon,cost,created_at) VALUES(?,?,?,?,?,?)')
    .run(u.id, it.id, it.name, it.icon, it.price, now());
  // 배송 주문 생성
  const kind = it.id==='module' ? 'device' : 'produce';
  const address = u.complex || '우리 집';
  db.prepare('INSERT INTO orders(user_id,item_id,name,icon,qty,cost,kind,status,stage_idx,stage_started_at,address,created_at) VALUES(?,?,?,?,?,?,?,?,0,?,?,?)')
    .run(u.id, it.id, it.name, it.icon, 1, it.price, kind, ORDER_STAGES[0].key, now(), address, now());
  // 가정용 모듈이면 기기 활성화 (중복 방지)
  if(it.id==='module' && !getDevice(u.id)){
    db.prepare('INSERT INTO devices(user_id,name,status,fill,cycle_started_at,cycle_dur,temp,humidity,activity,created_at,updated_at) VALUES(?,?,?,0,?,?,?,?,?,?,?)')
      .run(u.id, 'Reloop 홈 모듈', 'idle', now(), DEVICE_CYCLE_BASE, 27, 55, 10, now(), now());
  }
  return { me: me(u.id), item:{id:it.id, name:it.name, kind} };
});

R('GET','/api/orders', (q) => {
  const uid = +q.get('uid');
  advanceUserOrders(uid);
  const rows = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 20').all(uid);
  return { orders: rows.map(decorateOrder) };
});

R('GET','/api/ops', () => ops.getOpsState());
R('GET','/api/ops/route', () => ops.previewRoute());
R('POST','/api/ops/dispatch', () => ops.dispatch());

R('POST','/api/demo/points', (q,body) => {
  const amt = Math.max(0, Math.min(100000, Math.round(+body.amount||0)));
  db.prepare('UPDATE users SET points=points+? WHERE id=?').run(amt, body.uid);
  return me(body.uid);
});

R('GET','/api/device', (q) => ({ device: deviceView(+q.get('uid')) }));

R('POST','/api/device/feed', (q,body) => {
  const d = getDevice(body.uid); if(!d) return {error:'기기를 보유하고 있지 않아요'};
  deviceReadFlip(d);
  if(d.status==='maintenance') return {error:'청소가 필요해요'};
  if(d.status==='processing') return {error:'이미 생물전환이 진행 중이에요'};
  if(d.status==='ready') return {error:'먼저 수확해 주세요'};
  const w = Math.max(0.05, Math.min(3, +body.weight||0));
  const dur = DEVICE_CYCLE_BASE + Math.round(w*12000);
  db.prepare('UPDATE devices SET status=?, fill=?, cycle_started_at=?, cycle_dur=?, updated_at=? WHERE id=?')
    .run('processing', w, now(), dur, now(), d.id);
  return { device: deviceView(body.uid) };
});

R('POST','/api/device/harvest', (q,body) => {
  const d = getDevice(body.uid); if(!d) return {error:'기기를 보유하고 있지 않아요'};
  deviceReadFlip(d);
  if(d.status!=='ready') return {error:'아직 수확할 수 없어요'};
  const feed = d.fill*FACT.feed*1000, frass = d.fill*FACT.frass*1000;
  const cycles = (d.cycles||0)+1;
  const status = cycles % 4 === 0 ? 'maintenance' : 'idle';
  db.prepare('UPDATE devices SET status=?, fill=0, processed_kg=processed_kg+?, feed_g=feed_g+?, frass_g=frass_g+?, cycles=?, updated_at=? WHERE id=?')
    .run(status, d.fill, feed, frass, cycles, now(), d.id);
  return { device: deviceView(body.uid), harvested:{feed:Math.round(feed), frass:Math.round(frass)} };
});

R('POST','/api/device/clean', (q,body) => {
  const d = getDevice(body.uid); if(!d) return {error:'기기를 보유하고 있지 않아요'};
  if(d.status!=='maintenance') return {error:'청소가 필요하지 않아요'};
  db.prepare('UPDATE devices SET status=?, updated_at=? WHERE id=?').run('idle', now(), d.id);
  return { device: deviceView(body.uid) };
});

R('GET','/api/ledger', (q) => {
  const uid = +q.get('uid');
  const dis = db.prepare('SELECT created_at ts, weight, points FROM batches WHERE user_id=? ORDER BY id DESC LIMIT 30').all(uid);
  const pur = db.prepare('SELECT created_at ts, name, cost FROM purchases WHERE user_id=? ORDER BY id DESC LIMIT 30').all(uid);
  const rows = [
    ...dis.map(d=>({ts:d.ts, type:'earn', label:`음식물 배출 ${d.weight.toFixed(2)}kg`, amt:d.points})),
    ...pur.map(p=>({ts:p.ts, type:'spend', label:p.name, amt:p.cost})),
  ].sort((a,b)=>b.ts-a.ts).slice(0,20);
  return { rows };
});

R('GET','/api/dashboard', () => {
  advanceAll();
  const agg = db.prepare('SELECT COUNT(*) cnt, COALESCE(SUM(weight),0) kg, COALESCE(SUM(co2_kg),0) co2, COALESCE(SUM(feed_g),0) feed, COALESCE(SUM(frass_g),0) frass FROM batches').get();
  const machines = db.prepare("SELECT COUNT(*) c FROM machines WHERE status='installed'").get().c;
  const complexes = db.prepare("SELECT COUNT(DISTINCT complex) c FROM machines WHERE status='installed' AND complex<>''").get().c;
  const households = db.prepare('SELECT COUNT(DISTINCT user_id) c FROM batches').get().c;
  // 시간대별 (3시간 버킷 8개)
  const buckets = new Array(8).fill(0);
  for(const row of db.prepare('SELECT created_at, weight FROM batches').all()){
    const h = new Date(row.created_at).getHours();
    buckets[Math.floor(h/3)] += row.weight;
  }
  const hourly = buckets.map((v,i)=>({t:`${String(i*3).padStart(2,'0')}-${String(i*3+3).padStart(2,'0')}`, v:Math.round(v)}));
  // 단지별
  const regions = db.prepare(`SELECT u.complex nm, SUM(b.weight) v FROM batches b JOIN users u ON u.id=b.user_id
    WHERE u.complex<>'' GROUP BY u.complex ORDER BY v DESC LIMIT 6`).all().map(r=>({nm:r.nm, v:Math.round(r.v)}));
  return {
    totalKg:Math.round(agg.kg), co2:Math.round(agg.co2), batches:agg.cnt,
    feed_kg:Math.round(agg.feed/1000), frass_kg:Math.round(agg.frass/1000),
    machines, complexes, households, hourly, regions,
  };
});

R('GET','/api/process', () => {
  advanceAll();
  const cnt = k => db.prepare('SELECT COUNT(*) c FROM batches WHERE stage=?').get(k).c;
  const processing = db.prepare("SELECT COUNT(*) c FROM batches WHERE stage!='stored'").get().c;
  const agg = db.prepare('SELECT COALESCE(SUM(weight),0) kg, COALESCE(SUM(feed_g),0) feed, COALESCE(SUM(frass_g),0) frass, COALESCE(SUM(water_ml),0) water, COALESCE(SUM(energy_wh),0) energy FROM batches').get();
  const log = db.prepare('SELECT ts,msg,kind FROM facility_log ORDER BY id DESC LIMIT 18').all();
  return {
    facilities: 4,
    processing,
    collecting: cnt('collected_wait')+cnt('collected'),
    resourcing: cnt('resourcing'),
    farming: cnt('farming'),
    totalKg: Math.round(agg.kg),
    feedKg: Math.round(agg.feed/1000),
    frassKg: Math.round(agg.frass/1000),
    waterL: Math.round(agg.water/1000),
    energyKwh: +(agg.energy/1000).toFixed(1),
    h2: +(agg.energy*0.006).toFixed(1),
    log,
  };
});

R('GET','/api/map', (q) => {
  const uid = +q.get('uid');
  const residences = RESIDENCES.map(res => {
    const kg = db.prepare('SELECT COALESCE(SUM(b.weight),0) s FROM batches b JOIN users u ON u.id=b.user_id WHERE u.complex=?').get(res.name).s;
    const machines = db.prepare("SELECT COUNT(*) c FROM machines WHERE complex=? AND status='installed'").get(res.name).c;
    const households = db.prepare('SELECT COUNT(DISTINCT b.user_id) c FROM batches b JOIN users u ON u.id=b.user_id WHERE u.complex=?').get(res.name).c;
    return { nm:res.name, type:res.type, x:res.x, y:res.y, kg:Math.round(kg), machines, households };
  });
  const u = getUser(uid);
  let mine = null;
  const known = RESIDENCES.map(r=>r.name);
  if(u && u.complex){
    const mk = db.prepare('SELECT COALESCE(SUM(weight),0) s FROM batches WHERE user_id=?').get(uid).s;
    mine = { nm:u.complex, kg:Math.round(mk), known:known.includes(u.complex) };
  }
  return { residences, mine };
});

R('GET','/api/rank', (q) => {
  const uid = +q.get('uid');
  const complexes = db.prepare(`SELECT u.complex nm, SUM(b.weight) kg, COUNT(DISTINCT b.user_id) hh
    FROM batches b JOIN users u ON u.id=b.user_id WHERE u.complex<>'' GROUP BY u.complex ORDER BY kg DESC`).all()
    .map((r,i)=>({ rank:i+1, nm:r.nm, kg:Math.round(r.kg), hh:r.hh }));
  const users = db.prepare(`SELECT u.id, u.name, u.complex, COALESCE(SUM(b.weight),0) bkg, COUNT(b.id) cnt
    FROM users u LEFT JOIN batches b ON b.user_id=u.id GROUP BY u.id`).all();
  const devKg = {}; for(const d of db.prepare('SELECT user_id, processed_kg FROM devices').all()) devKg[d.user_id] = (devKg[d.user_id]||0) + (d.processed_kg||0);
  const ranked = users.map(u=>({ id:u.id, name:u.name, complex:u.complex, kg:u.bkg + (devKg[u.id]||0), cnt:u.cnt }))
    .filter(u => u.cnt>0 || (devKg[u.id]||0)>0)
    .sort((a,b)=>b.kg-a.kg)
    .map((u,i)=>({ rank:i+1, name:u.name, complex:u.complex, kg:+u.kg.toFixed(1), isMe:u.id===uid }));
  const meRow = ranked.find(r=>r.isMe) || null;
  const total = db.prepare('SELECT COALESCE(SUM(weight),0) s FROM batches').get().s;
  const goal = 3000;
  const challenge = { title:'이번 시즌 도시 자원순환 챌린지', desc:'모두의 배출량으로 목표를 채워요', goalKg:goal, currentKg:Math.round(total), pct:Math.min(100,Math.round(total/goal*100)) };
  return { complexes, top: ranked.slice(0,8), me: meRow, participants: ranked.length, challenge };
});

R('GET','/api/notifications', (q) => {
  const uid = +q.get('uid');
  advanceUserBatches(uid); advanceUserOrders(uid);
  const items = [];
  const dev = getDevice(uid);
  if(dev){
    deviceReadFlip(dev);
    if(dev.status==='ready') items.push({ ts:dev.updated_at, icon:'🧺', title:'홈 모듈 수확 준비 완료', body:'생물전환이 끝났어요. 사료·비료를 수확하세요.', kind:'action' });
    else if(dev.status==='maintenance') items.push({ ts:dev.updated_at, icon:'🧽', title:'홈 모듈 청소 필요', body:'챔버를 청소하면 다시 사용할 수 있어요.', kind:'action' });
    else if(dev.status==='processing') items.push({ ts:dev.updated_at, icon:'🐛', title:'홈 모듈 생물전환 중', body:'유충이 음식물을 자원화하고 있어요.', kind:'info' });
  }
  for(const o of db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 10").all(uid)){
    const d = decorateOrder(o);
    if(d.status==='delivered') items.push({ ts:o.stage_started_at, icon:'📦', title:`${o.name} 배송 완료`, body:`${o.address}에 도착했어요.`, kind:'info' });
    else items.push({ ts:o.stage_started_at, icon:d.stageIcon, title:`${o.name} · ${d.stageLabel}`, body:'배송을 추적하고 있어요.', kind:'info' });
  }
  for(const b of db.prepare("SELECT * FROM batches WHERE user_id=? AND stage='stored' ORDER BY id DESC LIMIT 3").all(uid)){
    items.push({ ts:b.stage_started_at, icon:'♻️', title:`${b.weight.toFixed(1)}kg 순환 완성`, body:`스토어에 ${b.crop||'농작물'}(으)로 등록됐어요.`, kind:'info' });
  }
  items.sort((a,b)=>b.ts-a.ts);
  return { items: items.slice(0,20), actionable: items.filter(i=>i.kind==='action').length };
});

R('GET','/api/report', (q) => {
  const uid = +q.get('uid');
  const st = userStats(uid);
  const DAY = 86400000, now0 = now();
  const rows = db.prepare('SELECT created_at, weight FROM batches WHERE user_id=?').all(uid);
  const weekly = [];
  for(let i=6;i>=0;i--){
    const start = now0-(i+1)*DAY, end = now0-i*DAY;
    let s=0; for(const r of rows) if(r.created_at>=start && r.created_at<end) s+=r.weight;
    weekly.push({ label:['일','월','화','수','목','금','토'][new Date(end-1).getDay()], kg:+s.toFixed(1) });
  }
  const co2 = st.co2, kg = st.kg;
  const equiv = {
    trees: +(co2/22).toFixed(1),
    carKm: Math.round(co2/0.17),
    waterL: Math.round(kg*0.75*30),
    landfillKg: Math.round(kg),
  };
  return { stats:st, weekly, equiv };
});

R('POST','/api/reset', (q,body) => {
  const uid = body.uid;
  db.prepare('DELETE FROM batches WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM purchases WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM machines WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM devices WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM orders WHERE user_id=?').run(uid);
  db.prepare('UPDATE users SET points=0, complex=?, size=? WHERE id=?').run('','',uid);
  return me(uid);
});

/* ===================== HTTP 서버 ===================== */
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
function serveStatic(req,res){
  let p = req.url.split('?')[0];
  if(p==='/') p='/index.html';
  const file = path.join(PUB, path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
  if(!file.startsWith(PUB)){ res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err,data)=>{
    if(err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  });
}
function sendJSON(res, obj, code=200){ const s=JSON.stringify(obj); res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}); res.end(s); }

const server = http.createServer((req,res)=>{
  const u = new URL(req.url, `http://${req.headers.host}`);
  if(u.pathname.startsWith('/api/')){
    const key = req.method+' '+u.pathname;
    const fn = routes[key];
    if(!fn){ return sendJSON(res, {error:'not found'}, 404); }
    if(req.method==='GET'){
      try{ return sendJSON(res, fn(u.searchParams)); }
      catch(e){ console.error(e); return sendJSON(res,{error:String(e)},500); }
    }
    let body=''; req.on('data',c=>{ body+=c; if(body.length>1e6) req.destroy(); });
    req.on('end',()=>{
      let parsed={}; try{ parsed = body?JSON.parse(body):{}; }catch(e){}
      try{ const out = fn(u.searchParams, parsed); sendJSON(res, out, out&&out.error? (out.error==='no user'?404:400) :200); }
      catch(e){ console.error(e); sendJSON(res,{error:String(e)},500); }
    });
    return;
  }
  serveStatic(req,res);
});
server.listen(PORT, ()=> console.log(`Reloop 풀스택 서버 실행 → http://localhost:${PORT}`));
