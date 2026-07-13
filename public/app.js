'use strict';
/* Reloop 프론트엔드 — API 연동 SPA */

/* ---------------- API ---------------- */
async function api(path, opts){ const r = await fetch(path, opts); return r.json(); }
function post(path, body){ return api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})}); }

/* ---------------- 전역 상태 ---------------- */
let UID = null, ME = null, CONFIG = null, current = 'home', poller = null;
const $ = s => document.querySelector(s);
const nf = n => Math.round(n).toLocaleString('ko-KR');
const fx = (n,d=2) => Number(n).toFixed(d);
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2400); }
function relTime(ts){ const s=(Date.now()-ts)/1000; if(s<60)return '방금 전'; if(s<3600)return Math.floor(s/60)+'분 전'; if(s<86400)return Math.floor(s/3600)+'시간 전'; return Math.floor(s/86400)+'일 전'; }
function etaText(ms){ if(ms<=0) return '곧 완료'; const s=Math.ceil(ms/1000); if(s<60) return `약 ${s}초 남음`; return `약 ${Math.ceil(s/60)}분 남음`; }

const SENSOR_KEYS = ['moisture','temp','light','ph','ec'];
const SENSOR_DEC = {moisture:0, temp:1, light:1, ph:2, ec:2};
const DISP = { moisture:[40,90], temp:[14,30], light:[6,30], ph:[5.2,7.0], ec:[0.8,3.0] };
const STEP_SHORT = [['🚚','수거대기'],['📦','수거'],['🐛','자원화'],['🌱','재배'],['🧺','수확'],['🛒','완료']];

/* ---------------- 부트 ---------------- */
let ready=false, pendingTab=null;
function onNav(tab){ if(ready) go(tab); else pendingTab=tab; }
async function boot(){
  // 리스너를 먼저 붙여 로딩 중 탭 클릭을 기억 (booted 후 그 탭으로 이동)
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => onNav(b.dataset.tab)));
  $('#hd-profile').addEventListener('click', () => onNav('me'));
  $('#hd-bell').addEventListener('click', () => onNav('notifications'));
  $('#modalbg').addEventListener('click', e => { if(e.target.id==='modalbg') closeModal(); });
  CONFIG = await api('/api/config');
  const stored = localStorage.getItem('reloop_uid');
  ME = await post('/api/session', {uid: stored ? +stored : null});
  UID = ME.uid; localStorage.setItem('reloop_uid', UID);
  ready=true;
  syncHeader();
  go(pendingTab || 'home');
}
async function refreshMe(){
  const m = await api('/api/me?uid='+UID).catch(()=>null);
  if(!m || m.error || !m.machine){ // 계정 유실/무효 → 세션 재생성 (크래시 대신 자가복구)
    ME = await post('/api/session', {uid:null});
    UID = ME.uid; localStorage.setItem('reloop_uid', UID);
  } else ME = m;
  syncHeader();
}
function syncHeader(){
  $('#hd-pts').textContent = nf(ME.points);
  const badge = $('#track-badge');
  if(ME.activeCount>0){ badge.style.display='grid'; badge.textContent=ME.activeCount; }
  else badge.style.display='none';
  const bb = $('#bell-badge');
  if(ME.notifs>0){ bb.style.display='grid'; bb.textContent=ME.notifs; } else bb.style.display='none';
}

/* ---------------- 라우터 ---------------- */
const RENDER = {home:renderHome, dispose:renderDispose, track:renderTrack, store:renderStore, data:renderData, me:renderMe, device:renderDevice, orders:renderOrders, notifications:renderNotifications, report:renderReport, ops:renderOps};
const POLL = {track:pollTrack, device:pollDevice, orders:pollOrders, ops:pollOps};
async function go(tab){
  current=tab; stopPoll();
  const navTab = (tab==='device'||tab==='notifications'||tab==='ops')?'me' : tab==='orders'?'store' : tab==='report'?'home' : tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on', b.dataset.tab===navTab));
  const host=$('#view'); host.innerHTML='<div class="loading">불러오는 중…</div>';
  try{
    await refreshMe();
    const html = await RENDER[tab]();
    host.innerHTML = '<div class="view">'+html+'</div>';
    if(AFTER[tab]) AFTER[tab]();
    if(POLL[tab]) poller = setInterval(POLL[tab], 2500);
  }catch(e){ console.error(e); host.innerHTML='<div class="empty">오류가 발생했습니다.<br>'+e+'</div>'; }
  host.scrollTop=0;
}
function stopPoll(){ if(poller){ clearInterval(poller); poller=null; } }
const AFTER = {};

/* ================= HOME ================= */
async function renderHome(){
  const s = ME.stats;
  const led = await api('/api/ledger?uid='+UID);
  const active = ME.activeCount>0;
  const installed = ME.machine.status==='installed';
  return `
  <div class="hero">
    <div class="lbl">내가 되돌린 음식물</div>
    <div class="big">${fx(s.kg,1)}<span> kg</span></div>
    <div class="row">
      <div class="mini"><b>${nf(s.co2)}</b><em>절감 CO₂ (kg)</em></div>
      <div class="mini"><b>${nf(ME.points)}</b><em>적립 포인트</em></div>
      <div class="mini"><b>${s.count}</b><em>배출 횟수</em></div>
    </div>
  </div>

  ${active ? `
  <div class="card" style="border:1.5px solid var(--green-100)">
    <div style="display:flex;align-items:center;gap:11px">
      <div style="font-size:26px">🔄</div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:14px">처리 중인 내 음식물 ${ME.activeCount}건</div>
        <div class="note" style="margin-top:2px">가장 빠른 완료까지 ${etaText(ME.nearestEtaMs)} · 지금 어떻게 처리되는지 확인해 보세요.</div>
      </div>
    </div>
    <button class="btn primary" style="margin-top:12px" onclick="go('track')">🔄 처리현황 실시간 추적 →</button>
  </div>` : ''}

  ${!installed ? `
  <div class="card" style="border:1.5px solid var(--green-100)">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="font-size:26px">📦</div>
      <div style="flex:1"><div style="font-weight:800;font-size:14px">우리 단지에 회수기가 아직 없어요</div>
      <div class="note" style="margin-top:2px">설치를 요청하면 음식물 배출로 포인트를 모을 수 있어요.</div></div>
    </div>
    <button class="btn primary" style="margin-top:12px" onclick="go('me')">회수기 설치 요청하기 →</button>
  </div>` : ''}

  <h2 class="sec">♻️ Reloop 순환 여정</h2>
  <div class="sub">내가 버린 음식물이 다시 먹거리로 돌아오기까지</div>
  <div class="card">
    <div class="journey">
      ${[['🗑️','배출'],['🚚','수거'],['🐛','BSF 자원화'],['⚡','전기화학'],['🌱','스마트팜'],['🛒','스토어'],['🙂','다시 나에게']]
        .map((x,i)=>`<div class="jstep ${s.count>0?'active':''}"><div class="dot" style="animation-delay:${i*0.28}s">${x[0]}</div><small>${x[1]}</small></div>`).join('')}
    </div>
    <div class="note">사용자 참여(배출)를 출발점으로 수거·자원화·생산·소비를 하나의 고리로 통합 — 개별 기술이 아닌 <b>연결</b>이 Reloop의 핵심입니다.</div>
  </div>

  <h2 class="sec">🔄 내 음식물의 자원 전환 (누적)</h2>
  <div class="stat-grid">
    <div class="stat"><div class="ic">🐛</div><b>${nf(s.feed_g)} g</b><em>BSF 고단백 사료</em></div>
    <div class="stat"><div class="ic">🌱</div><b>${nf(s.frass_g)} g</b><em>프라스 유기질 비료</em></div>
    <div class="stat"><div class="ic">⚡</div><b>${nf(s.energy_wh)} Wh</b><em>회수 에너지</em></div>
    <div class="stat"><div class="ic">☁️</div><b>${nf(s.co2)} kg</b><em>절감 CO₂</em></div>
  </div>
  ${s.homeKg>0?`<div class="note" style="margin:6px 2px 0">🪴 가정용 모듈 처리분 <b>${fx(s.homeKg,1)}kg</b> (${s.homeCycles}사이클) 이 누적에 포함돼 있어요.</div>`:''}
  <div style="display:flex;gap:10px;margin-top:8px">
    <button class="btn ghost" style="flex:1;margin:0" onclick="go('report')">🌍 임팩트 리포트</button>
    <button class="btn ghost" style="flex:1;margin:0" onclick="dataSub='rank';go('data')">🏆 랭킹 보기</button>
  </div>

  <h2 class="sec">🕘 최근 활동</h2>
  <div class="card">${ledgerRows(led.rows, 6)}</div>`;
}
function ledgerRows(rows, n){
  if(!rows.length) return `<div class="empty">아직 활동이 없어요.<br>‘배출’ 탭에서 첫 순환을 시작해 보세요 🌱</div>`;
  return rows.slice(0,n).map(r=>`<div class="row-item"><div class="ic2">${r.type==='earn'?'♻️':'🛒'}</div>
    <div><div class="t">${r.label}</div><div class="d">${relTime(r.ts)}</div></div>
    <div class="amt ${r.type==='earn'?'plus':'minus'}">${r.type==='earn'?'+':'-'}${r.amt}P</div></div>`).join('');
}

/* ================= DISPOSE ================= */
let pending=null;
async function renderDispose(){
  if(ME.machine.status!=='installed'){
    return `<div class="card center" style="padding:30px 18px">
      <div style="font-size:48px">📦</div>
      <h2 class="sec center" style="justify-content:center">회수기가 설치되어야 배출할 수 있어요</h2>
      <div class="sub center">먼저 우리 단지에 Reloop 회수기 설치를 요청해 주세요.</div>
      <button class="btn primary" onclick="go('me')">설치 요청하러 가기</button></div>`;
  }
  const bat = await api('/api/batches?uid='+UID);
  const recent = bat.batches.slice(0,6);
  return `
  <h2 class="sec">♻️ 음식물 배출하기</h2>
  <div class="sub">회수기 투입구에 음식물을 넣으면 로드셀이 무게를 자동 측정합니다.</div>
  <div class="machine">
    <div class="cap">RELOOP 회수기 · ${ME.complex||'우리 단지'}</div>
    <div class="lid" id="lid"></div>
    <div class="scale" id="scale">0.00<span> kg</span></div>
    <div class="status" id="mstatus">투입구를 열고 음식물을 넣어주세요</div>
    <div class="reward-pop" id="rpop"></div>
    <div class="slider-wrap">
      <label><span>배출량 설정 (데모)</span><span id="slbl">0.60 kg</span></label>
      <input type="range" id="slider" min="0.1" max="2.0" step="0.05" value="0.6">
    </div>
  </div>
  <div style="margin-top:14px">
    <button class="btn primary" id="btn-measure" onclick="doMeasure()">🔓 음식물 투입 · 무게 측정</button>
    <button class="btn ghost" id="btn-confirm" style="margin-top:10px;display:none" onclick="doConfirm()">✅ <b id="confirm-lbl">포인트 적립</b></button>
  </div>
  <div class="card flat" style="margin-top:16px">
    <div style="display:flex;gap:10px;align-items:center">
      <div style="font-size:22px">📡</div>
      <div class="note" style="margin:0">배출 시각·위치·중량이 자동 기록되어 <b>지역별·시간대별 배출 데이터</b>로 집적됩니다. 배출 직후 <b>처리현황</b> 탭에서 내 음식물이 자원화되는 과정을 추적할 수 있어요.</div>
    </div>
  </div>
  <h2 class="sec">📜 내 최근 배출</h2>
  <div class="card">${recent.length? recent.map(b=>`<div class="row-item"><div class="ic2">${b.stageIcon}</div>
    <div><div class="t">${fx(b.weight,2)} kg · ${b.stageLabel}</div><div class="d">${relTime(b.createdAt)}</div></div>
    <div class="amt plus">+${b.points}P</div></div>`).join('') : '<div class="empty">아직 배출 기록이 없어요.</div>'}</div>`;
}
function doMeasure(){
  const lid=$('#lid'), scale=$('#scale'), st=$('#mstatus'), rpop=$('#rpop');
  const bm=$('#btn-measure'), bc=$('#btn-confirm');
  const target=+$('#slider').value;
  lid.classList.add('open'); bm.disabled=true; rpop.textContent='';
  st.textContent='음식물 투입 감지 · 로드셀 측정 중...'; scale.classList.add('measuring');
  const start=performance.now(), dur=1300;
  (function anim(now){
    const p=Math.min((now-start)/dur,1);
    const wob=p<0.85?(Math.sin(p*40)*0.12*(1-p)):0;
    scale.innerHTML=fx(Math.max(0,p<1?target*p+wob:target),2)+'<span> kg</span>';
    if(p<1) requestAnimationFrame(anim);
    else{
      scale.classList.remove('measuring'); lid.classList.remove('open');
      const pts=Math.round(target*CONFIG.fact.pointsPerKg);
      pending={weight:target,points:pts};
      st.textContent=`측정 완료 · ${fx(target,2)}kg`; rpop.textContent=`+${pts}P 적립 대기중`;
      bc.style.display='block'; $('#confirm-lbl').textContent=`+${pts}P 적립하기`;
      bm.disabled=false; bm.textContent='🔓 다시 측정';
    }
  })(start);
}
async function doConfirm(){
  if(!pending) return;
  const w=pending.weight; pending=null;
  const res = await post('/api/dispose', {uid:UID, weight:w});
  if(res.error){ toast('오류: '+res.error); return; }
  ME = res.me; syncHeader();
  const b=res.batch;
  toast(`+${b.points}P 적립! 처리현황에서 추적하세요 🔄`);
  go('track');
}

/* ================= TRACK (처리현황 + 스마트팜 라이브) ================= */
let trackSig='';
let trackSub='batches';
const TRACK_TABS=[
  {k:'batches', label:'내 배출',     icon:'📦'},
  {k:'process', label:'자원화 공정', icon:'♻️'},
  {k:'farms',   label:'도시농장',    icon:'🌱'},
];
async function renderTrack(){
  const bar = `<div class="subtabs">${TRACK_TABS.map(t=>`<button class="subtab ${t.k===trackSub?'on':''}" data-k="${t.k}" onclick="switchTrack('${t.k}')">${t.icon} ${t.label}</button>`).join('')}</div>`;
  return bar + `<div id="track-body">${await renderTrackBody()}</div>`;
}
async function renderTrackBody(){
  if(trackSub==='process') return await subProcess();
  if(trackSub==='farms')   return await subFarms();
  return await subBatches();
}
async function switchTrack(k){
  if(k===trackSub) return;
  trackSub=k;
  document.querySelectorAll('.subtab').forEach(b=>b.classList.toggle('on', b.dataset.k===k));
  const body=document.getElementById('track-body');
  if(body){ body.innerHTML='<div class="loading">불러오는 중…</div>'; body.innerHTML=await renderTrackBody(); }
  const v=document.getElementById('view'); if(v) v.scrollTop=0;
}
async function subBatches(){
  const bat = await api('/api/batches?uid='+UID);
  const batches=bat.batches; trackSig=sigOf(batches);
  const active=batches.filter(b=>b.stage!=='stored').length;
  if(active!==ME.activeCount){ ME.activeCount=active; syncHeader(); }
  return `<div class="sub">배출한 음식물이 지금 어느 단계에 있는지 실시간으로 추적됩니다. 정상 처리되고 있어요 👍</div>
    ${batches.length ? batches.map(batchCard).join('') :
      `<div class="card"><div class="empty">아직 처리 중인 음식물이 없어요.<br>‘배출’ 탭에서 음식물을 배출하면 이곳에서 추적할 수 있어요.</div></div>`}`;
}
async function subProcess(){
  const p = await api('/api/process');
  return `<div class="sub">수거된 음식물이 BSF 생물전환·전기화학 처리를 거쳐 사료·비료·증류수·에너지로 전환되어 스마트팜으로 이송되는 전 과정이 실시간으로 가동됩니다.</div>${processPanel(p)}`;
}
async function subFarms(){
  const [farmsRes, bat] = await Promise.all([api('/api/farms'), api('/api/batches?uid='+UID)]);
  const mineFarms = new Set(bat.batches.filter(b=>b.stage==='farming').map(b=>b.farmId));
  return `<div class="sub">회수 자원(액상비료·증류수·수소 에너지)이 투입되는 도시농장의 환경을 AI가 실시간 제어합니다. 센서가 목표 범위(초록 띠)를 벗어나면 자동으로 보정해요.</div>${farmsRes.farms.map(f=>farmPanel(f, mineFarms.has(f.id))).join('')}`;
}
function procLogHTML(rows){
  return rows.map(l=>`<div class="logline ${l.kind==='elec'?'act':l.kind==='in'?'stage':''}"><span class="lt">${new Date(l.ts).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><span>${l.msg}</span></div>`).join('');
}
function procStatsHTML(p){
  return `
    <div class="proc-stat"><b>${p.processing}건</b><em>현재 처리 중</em></div>
    <div class="proc-stat"><b>${(p.totalKg/1000).toFixed(1)}t</b><em>누적 처리량</em></div>
    <div class="proc-stat"><b>${nf(p.feedKg)}kg</b><em>BSF 사료</em></div>
    <div class="proc-stat"><b>${nf(p.energyKwh)}kWh</b><em>회수 에너지</em></div>`;
}
function processPanel(p){
  return `<div class="proc-panel" id="proc-panel">
    <div class="fh"><span style="font-size:18px">♻️</span><b>Reloop 자원화 공정</b><span class="live"><span class="dotlive"></span>LIVE</span></div>
    <div class="fmeta">가동 시설 ${p.facilities}곳 · 수거 ${p.collecting} · 자원화 ${p.resourcing} · 재배 ${p.farming} · 24h 무인 자동 처리</div>
    ${processSceneSVG()}
    <div class="proc-stats" id="proc-stats">${procStatsHTML(p)}</div>
    <div class="flog"><div class="lgttl">공정 로그</div><div id="proclog">${procLogHTML(p.log)}</div></div>
  </div>`;
}
function sigOf(batches){ return batches.map(b=>b.id+':'+b.stage).join(','); }

function batchCard(b){
  const done = b.stage==='stored';
  const steps = STEP_SHORT.map((s,i)=>`<div class="stepdot ${i<=b.stageIdx?'on':''} ${i===b.stageIdx?'cur':''}">
    <div class="c">${i<b.stageIdx?'✓':s[0]}</div><small>${s[1]}</small></div>`).join('');
  const chips = `
    <div class="chip">🐛 사료 <b>${nf(b.resources.feed_g)}g</b></div>
    <div class="chip">🌱 비료 <b>${nf(b.resources.frass_g)}g</b></div>
    <div class="chip">💧 증류수 <b>${nf(b.resources.water_ml)}ml</b></div>
    <div class="chip">⚡ 에너지 <b>${nf(b.resources.energy_wh)}Wh</b></div>
    <div class="chip">☁️ CO₂ <b>${fx(b.resources.co2_kg,1)}kg</b></div>`;
  return `<div class="batch-card ${done?'done':''}" id="bc-${b.id}" data-stage="${b.stage}">
    <div class="batch-head"><span class="w">${fx(b.weight,2)}kg 배출</span><span class="pill sky">+${b.points}P</span><span class="ago">${relTime(b.createdAt)}</span></div>
    ${stageScene(b.stage, b.crop)}
    <div class="stepline">${steps}</div>
    <div class="batch-stage"><span class="ic">${b.stageIcon}</span>${b.stageLabel}<span class="eta">${done?'':'· '+etaText(b.etaMs)}</span></div>
    <div class="batch-desc">${b.stageDesc}</div>
    <div class="progress"><div class="pf" style="width:${(b.overall*100).toFixed(1)}%"></div></div>
    ${b.stage==='farming'?`<div class="note">🌱 <b>${b.crop}</b>(으)로 도시농장에서 재배 중 — 아래 라이브에서 내 자원이 투입되는 걸 확인하세요.</div>`:''}
    ${done?`<div class="note ok-tag">✅ 순환 완성 — 스토어에 <b>${b.crop||'농작물'}</b>(으)로 등록되었습니다.</div>`:''}
    <div class="res-chips">${chips}</div>
    ${done?'':`<button class="btn ghost sm" style="margin-top:11px" onclick="advance(${b.id})">⏩ 다음 단계로 (데모)</button>`}
  </div>`;
}
async function advance(id){
  const r = await post('/api/batch/advance', {uid:UID, id});
  if(r.error){ toast(r.error); return; }
  const bat = await api('/api/batches?uid='+UID);
  const host=$('#view .view'); if(host){ /* 전체 재렌더 */ }
  go('track');
}

function gauge(f,k){
  const [dlo,dhi]=DISP[k], [tlo,thi]=f.targets[k], v=f.sensors[k];
  const pos=x=>Math.max(0,Math.min(100,(x-dlo)/(dhi-dlo)*100));
  const m=CONFIG.sensorMeta[k];
  return `<div class="gauge" data-g="${k}">
    <div class="gl"><span>${m.label}</span><b class="gv">${fx(v,SENSOR_DEC[k])}${m.unit}</b></div>
    <div class="gtrack"><div class="gband" style="left:${pos(tlo)}%;width:${pos(thi)-pos(tlo)}%"></div>
    <div class="gmark" style="left:${pos(v)}%"></div></div></div>`;
}
function farmPanel(f, mine){
  const logs = f.log.slice(0,6).map(l=>`<div class="logline ${l.kind}"><span class="lt">${new Date(l.ts).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><span>${l.msg}</span></div>`).join('');
  return `<div class="farm-panel" id="farm-${f.id}" data-growth="${f.growth}">
    <div class="fh"><span style="font-size:18px">${f.icon}</span><b>${f.name}</b><span class="live"><span class="dotlive"></span>LIVE</span></div>
    <div class="fmeta" id="fmeta-${f.id}">${f.crop} · 생육 <b>${f.growth}</b> · 재배 중 배치 ${f.activeBatches}개${mine?' · <b>내 배치 포함 🙂</b>':''}</div>
    <div id="fscene-${f.id}">${growSceneSVG(f.growth, f.crop)}</div>
    ${SENSOR_KEYS.map(k=>gauge(f,k)).join('')}
    <div class="flog"><div class="lgttl">AI 제어 로그</div><div id="flog-${f.id}">${logs}</div></div>
  </div>`;
}

async function pollTrack(){
  const body=document.getElementById('track-body'); if(!body) return;
  if(trackSub==='batches'){
    const bat=await api('/api/batches?uid='+UID); const batches=bat.batches;
    const active=batches.filter(b=>b.stage!=='stored').length;
    if(active!==ME.activeCount){ ME.activeCount=active; syncHeader(); }
    if(sigOf(batches)!==trackSig){ body.innerHTML=await subBatches(); return; }
    for(const b of batches){
      const el=document.getElementById('bc-'+b.id); if(!el) continue;
      const pf=el.querySelector('.pf'); if(pf) pf.style.width=(b.overall*100).toFixed(1)+'%';
      const eta=el.querySelector('.eta'); if(eta && b.stage!=='stored') eta.textContent='· '+etaText(b.etaMs);
    }
  } else if(trackSub==='process'){
    const proc=await api('/api/process');
    const ps=document.getElementById('proc-stats'); if(ps) ps.innerHTML=procStatsHTML(proc);
    const pl=document.getElementById('proclog'); if(pl) pl.innerHTML=procLogHTML(proc.log);
    const pm=document.querySelector('#proc-panel .fmeta'); if(pm) pm.innerHTML=`가동 시설 ${proc.facilities}곳 · 수거 ${proc.collecting} · 자원화 ${proc.resourcing} · 재배 ${proc.farming} · 24h 무인 자동 처리`;
  } else {
    const [farmsRes, bat]=await Promise.all([api('/api/farms'), api('/api/batches?uid='+UID)]);
    const farms=farmsRes.farms;
    const mineFarms=new Set(bat.batches.filter(b=>b.stage==='farming').map(b=>b.farmId));
    for(const f of farms){
      const el=document.getElementById('farm-'+f.id); if(!el) continue;
      for(const k of SENSOR_KEYS){
        const g=el.querySelector('[data-g="'+k+'"]'); if(!g) continue;
        const [dlo,dhi]=DISP[k], [tlo,thi]=f.targets[k], v=f.sensors[k];
        const pos=x=>Math.max(0,Math.min(100,(x-dlo)/(dhi-dlo)*100));
        g.querySelector('.gv').textContent=fx(v,SENSOR_DEC[k])+CONFIG.sensorMeta[k].unit;
        g.querySelector('.gmark').style.left=pos(v)+'%';
        const band=g.querySelector('.gband'); band.style.left=pos(tlo)+'%'; band.style.width=(pos(thi)-pos(tlo))+'%';
      }
      const mine=mineFarms.has(f.id);
      const meta=document.getElementById('fmeta-'+f.id);
      if(meta) meta.innerHTML=`${f.crop} · 생육 <b>${f.growth}</b> · 재배 중 배치 ${f.activeBatches}개${mine?' · <b>내 배치 포함 🙂</b>':''}`;
      if(el.dataset.growth!==f.growth){ el.dataset.growth=f.growth; const sc=document.getElementById('fscene-'+f.id); if(sc) sc.innerHTML=growSceneSVG(f.growth, f.crop); }
      const lg=document.getElementById('flog-'+f.id);
      if(lg) lg.innerHTML=f.log.slice(0,6).map(l=>`<div class="logline ${l.kind}"><span class="lt">${new Date(l.ts).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><span>${l.msg}</span></div>`).join('');
    }
  }
}

/* ================= STORE ================= */
async function renderStore(){
  const data = await api('/api/store?uid='+UID);
  const items=data.items, cats=['농작물','제휴식품','순환','기기'];
  const catIcon={'농작물':'🥬','제휴식품':'🍳','순환':'🔄','기기':'🪴'};
  return `
  <div class="hero" style="background:linear-gradient(140deg,#12643f,#0d9488)">
    <div class="lbl">사용 가능 포인트</div>
    <div class="big">${nf(ME.points)}<span> P</span></div>
    <div class="note" style="color:rgba(255,255,255,.9);margin-top:8px">포인트는 <b>스마트팜 농작물·제휴식품</b> 구매에만 사용 — 보상이 다시 플랫폼 내부 소비로 환류됩니다.${data.youContributed?'<br>🌱 당신의 순환에서 수확된 농작물이 스토어에 등록되어 있어요.':''}</div>
  </div>
  ${ME.activeOrders? `<div class="card" style="border:1.5px solid #fde68a;background:#fffef7;cursor:pointer" onclick="go('orders')">
    <div style="display:flex;align-items:center;gap:10px"><div style="font-size:22px">🚚</div>
    <div style="flex:1"><div style="font-weight:800;font-size:13px">진행 중인 배송 ${ME.activeOrders}건</div><div class="note" style="margin-top:1px">탭하여 배송 현황 보기 →</div></div>
    <div style="color:var(--muted)">›</div></div></div>`:''}
  ${cats.map(c=>`<h2 class="sec">${catIcon[c]} ${c}</h2><div class="store-grid">
    ${items.filter(i=>i.category===c).map(i=>itemCard(i, data.youContributed)).join('')}</div>`).join('')}
  <div class="note center" style="margin-top:16px">🌱 ‘프라스 비료’는 내가 버린 음식물로 만든 자원 — 구매 시 순환 고리가 완성됩니다.</div>`;
}
function itemCard(i, contributed){
  const afford=ME.points>=i.price;
  const sold = i.isProduce && i.stock<=0;
  const owned = i.id==='module' && ME.hasModule;
  const dis = owned || !afford || sold;
  return `<div class="item" ${i.id==='module'?'style="grid-column:span 2"':''}>
    <div class="thumb" ${i.id==='module'?'style="height:70px;font-size:44px"':''}>${i.icon}
      ${i.isProduce&&contributed?'<span class="badge-mine">내 순환 수확</span>':''}
      ${i.isProduce?`<span class="badge-stock">재고 ${i.stock}</span>`:''}</div>
    <div class="body">
      <div class="nm">${i.name}${i.isLoop?'<span class="badge-loop">순환</span>':''}</div>
      <div class="meta">${i.meta}</div>
      <div class="buy"><div class="price">${nf(i.price)}<small> P</small></div>
        <button ${dis?'disabled':''} onclick="buy('${i.id}')">${owned?'보유중':(sold?'품절':(afford?'교환':'부족'))}</button></div>
    </div></div>`;
}
async function buy(id){
  const data = await api('/api/store?uid='+UID);
  const it=data.items.find(x=>x.id===id); if(!it) return;
  if(ME.points<it.price){ toast('포인트가 부족해요'); return; }
  openModal(`<h3>${it.icon} ${it.name}</h3><p>${it.meta}</p>
    <div class="kv"><span>가격</span><b>${nf(it.price)} P</b></div>
    <div class="kv"><span>보유 포인트</span><b>${nf(ME.points)} P</b></div>
    <div class="divider"></div>
    <div class="kv"><span>교환 후 잔액</span><b style="color:var(--green-600)">${nf(ME.points-it.price)} P</b></div>
    <button class="btn primary" style="margin-top:16px" onclick="confirmBuy('${id}')">${nf(it.price)}P 로 교환하기</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
async function confirmBuy(id){
  const r = await post('/api/store/buy', {uid:UID, itemId:id});
  closeModal();
  if(r.error){ toast(r.error); return; }
  ME=r.me; syncHeader();
  if(r.item.kind==='device'){ toast('🪴 가정용 모듈 주문 완료! 배송이 시작됐어요'); go('device'); }
  else { toast(`✅ ${r.item.name} 구매 완료 · 배송이 시작됐어요 🚚`); go('orders'); }
}

/* ================= DATA ================= */
let dataSub='map';
const DATA_TABS=[{k:'map',label:'지도',icon:'🗺️'},{k:'stats',label:'통계',icon:'📊'},{k:'rank',label:'랭킹',icon:'🏆'}];
async function renderData(){
  const bar=`<div class="subtabs">${DATA_TABS.map(t=>`<button class="subtab ${t.k===dataSub?'on':''}" data-k="${t.k}" onclick="switchData('${t.k}')">${t.icon} ${t.label}</button>`).join('')}</div>`;
  return bar + `<div id="data-body">${await renderDataBody()}</div>`;
}
async function renderDataBody(){ if(dataSub==='stats') return await renderDataStats(); if(dataSub==='rank') return await renderDataRank(); return await renderDataMap(); }
async function switchData(k){
  if(k===dataSub) return; dataSub=k;
  document.querySelectorAll('.subtab').forEach(b=>b.classList.toggle('on', b.dataset.k===k));
  const body=document.getElementById('data-body');
  if(body){ body.innerHTML='<div class="loading">불러오는 중…</div>'; body.innerHTML=await renderDataBody(); }
  const v=document.getElementById('view'); if(v) v.scrollTop=0;
}
async function renderDataMap(){
  const m=await api('/api/map?uid='+UID);
  const sorted=[...m.residences].sort((a,b)=>b.kg-a.kg);
  const maxKg=Math.max(1,...m.residences.map(c=>c.kg));
  const apts=m.residences.filter(r=>r.type==='apt').length, houses=m.residences.filter(r=>r.type==='house').length;
  return `<div class="sub">아파트 단지와 주택가의 배출량 히트맵 — 진할수록 배출이 많은 지역이에요. 수거 배차·처리시설 배치의 근거가 됩니다.</div>
    ${mapSceneSVG(m.residences, m.mine)}
    <div class="legend" style="justify-content:center;margin:2px 0 12px"><span><i style="background:#22c55e"></i>적음</span><span><i style="background:#f59e0b"></i>보통</span><span><i style="background:#ef4444"></i>많음</span><span>● 아파트 ■ 주택가</span></div>
    <div class="card"><h2 class="sec" style="margin-top:0">🏙️ 참여 거주지 ${m.residences.length}곳 <span style="font-weight:600;color:var(--muted);font-size:11px">아파트 ${apts} · 주택가 ${houses}</span></h2>
      ${sorted.map(c=>`<div class="region-row"><span class="nm">${c.type==='house'?'🏘️':''}${c.nm}</span><div class="track"><div class="fill" style="width:${(c.kg/maxKg*100).toFixed(0)}%"></div></div><span class="kg">${c.kg>0?(c.kg/1000).toFixed(1)+'t':'–'}</span></div>`).join('')}
      ${m.mine && !m.mine.known ? `<div class="note" style="margin-top:10px">📍 <b>${m.mine.nm}</b>는 아직 거주지 목록에 등록되지 않았어요. 내정보 → 회수기 설치에서 거주지를 선택하면 집계에 합류합니다.</div>`:''}
    </div>`;
}
async function renderDataRank(){
  const r=await api('/api/rank?uid='+UID); const ch=r.challenge;
  const maxC=Math.max(1,...r.complexes.map(c=>c.kg));
  return `<div class="sub">배출량 랭킹과 시즌 챌린지 — 사용자 참여가 곧 순환이 됩니다.</div>
    <div class="hero" style="background:linear-gradient(140deg,#b45309,#f59e0b)">
      <div class="lbl">🏆 ${ch.title}</div>
      <div class="big" style="font-size:27px">${(ch.currentKg/1000).toFixed(1)}<span> / ${(ch.goalKg/1000).toFixed(0)} t</span></div>
      <div class="progress" style="background:rgba(255,255,255,.28);margin-top:10px"><div class="pf" style="width:${ch.pct}%;background:#fff"></div></div>
      <div class="note" style="color:rgba(255,255,255,.92);margin-top:8px">목표까지 ${ch.pct}% 달성 · ${ch.desc}</div>
    </div>
    <h2 class="sec">🏙️ 단지 랭킹</h2>
    <div class="card">${r.complexes.map(c=>rankRow(c.rank, c.nm, `${(c.kg/1000).toFixed(1)}t · ${c.hh}세대`, c.kg/maxC)).join('')}</div>
    <h2 class="sec">🙋 개인 랭킹 <span style="font-weight:600;color:var(--muted);font-size:11px">참여자 ${r.participants}명</span></h2>
    <div class="card">${r.top.map(u=>rankRow(u.rank, u.name+(u.isMe?' (나)':''), `${u.complex||'단지 미설정'} · ${u.kg}kg`, null, u.isMe)).join('')}</div>
    ${r.me && r.me.rank>8 ? `<div class="card" style="border:1.5px solid var(--green-100)"><div class="note" style="margin:0 0 4px">내 순위</div>${rankRow(r.me.rank, r.me.name+' (나)', `${r.me.complex||'단지 미설정'} · ${r.me.kg}kg`, null, true)}</div>`:''}`;
}
function rankRow(rank, name, sub, ratio, isMe){
  const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`<b>${rank}</b>`;
  return `<div class="rank-row ${isMe?'me':''}"><div class="rk">${medal}</div>
    <div class="ri"><div class="rn">${name}</div><div class="rs">${sub}</div>${ratio!=null?`<div class="rtrack"><div class="rfill" style="width:${(ratio*100).toFixed(0)}%"></div></div>`:''}</div></div>`;
}
async function renderDataStats(){
  const d = await api('/api/dashboard');
  const maxH=Math.max(1,...d.hourly.map(h=>h.v)), peak=d.hourly.reduce((m,h,i)=>h.v>d.hourly[m].v?i:m,0);
  const maxR=Math.max(1,...d.regions.map(r=>r.v));
  return `
  <h2 class="sec">📊 배출 데이터 대시보드</h2>
  <div class="sub">회수기가 자동 기록한 <b>실제 파일럿 데이터</b> — 지자체·연구기관용 정량 지표 (DB 집계)</div>
  <div class="stat-grid" style="margin-bottom:12px">
    <div class="stat"><div class="ic">♻️</div><b>${nf(d.totalKg)}</b><em>누적 수거량 (kg)</em></div>
    <div class="stat"><div class="ic">☁️</div><b>${nf(d.co2)}</b><em>절감 CO₂ (kg)</em></div>
    <div class="stat"><div class="ic">🏢</div><b>${d.machines}<span style="font-size:11px">대</span></b><em>설치 회수기 · ${d.complexes}개 단지</em></div>
    <div class="stat"><div class="ic">👥</div><b>${nf(d.households)}</b><em>참여자</em></div>
    <div class="stat"><div class="ic">🐛</div><b>${nf(d.feed_kg)}<span style="font-size:11px">kg</span></b><em>BSF 사료 전환</em></div>
    <div class="stat"><div class="ic">🌱</div><b>${nf(d.frass_kg)}<span style="font-size:11px">kg</span></b><em>프라스 비료 전환</em></div>
  </div>
  <div class="card">
    <h2 class="sec" style="margin-top:0">⏰ 시간대별 배출량</h2>
    <div class="sub">저녁·아침 배출 집중 → 수거 차량 배차 최적화 근거</div>
    <div class="bars">${d.hourly.map((h,i)=>`<div class="bar-col"><span class="val">${h.v}</span>
      <div class="bar ${i===peak?'peak':''}" style="height:${Math.max(3,h.v/maxH*100)}%"></div>
      <small>${h.t.split('-')[0]}</small></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--amber)"></i>피크 시간대</span><span><i style="background:var(--green-600)"></i>일반</span></div>
  </div>
  <div class="card">
    <h2 class="sec" style="margin-top:0">🏙️ 단지별 누적 배출량</h2>
    ${d.regions.map(r=>`<div class="region-row"><span class="nm">${r.nm}</span>
      <div class="track"><div class="fill" style="width:${r.v/maxR*100}%"></div></div>
      <span class="kg">${(r.v/1000).toFixed(1)}t</span></div>`).join('')}
  </div>
  <div class="card flat"><div style="display:flex;gap:10px;align-items:flex-start">
    <div style="font-size:22px">💡</div>
    <div class="note" style="margin:0"><b>데이터도 자산입니다.</b> 배출 시점·위치·중량이 집적되면 지역별·시간대별 배출 패턴이 되어, 지자체 수거 배차·처리시설 운영 최적화와 감량 정책 효과 측정에 활용됩니다.</div>
  </div></div>`;
}

/* ================= ME ================= */
async function renderMe(){
  const m=ME.machine, s=ME.stats;
  const led = await api('/api/ledger?uid='+UID);
  return `
  <div class="card center" style="padding:22px">
    <div style="width:64px;height:64px;border-radius:20px;margin:0 auto;background:linear-gradient(135deg,var(--green-600),var(--green-500));display:grid;place-items:center;font-size:30px">🙂</div>
    <div style="font-weight:800;font-size:17px;margin-top:10px">${ME.name}</div>
    <div class="sub center" style="margin-top:2px">${ME.complex||'단지 미설정'} · IT 계열</div>
    <div style="margin-top:8px"><span class="pill">순환 포인트 ${nf(ME.points)}P</span> <span class="pill gray">배출 ${s.count}회</span></div>
  </div>
  <h2 class="sec">📦 회수기 설치</h2>
  <div class="card">${
    m.status==='installed' ? `<div style="display:flex;align-items:center;gap:11px">
      <div class="ic2" style="background:var(--green-100)">✅</div>
      <div style="flex:1"><div class="t" style="font-weight:800">설치 완료</div><div class="d">${ME.complex} · 정상 가동 중</div></div>
      <span class="pill">가동중</span></div>` :
    m.status==='requested' ? `<div style="display:flex;align-items:center;gap:11px">
      <div class="ic2" style="background:#fef3c7">🚚</div>
      <div style="flex:1"><div class="t" style="font-weight:800">설치 검토 중</div><div class="d">${relTime(m.requestedAt)} 요청 · 사업자 배정 대기</div></div>
      <span class="pill amber">검토중</span></div>
      <button class="btn primary" style="margin-top:14px" onclick="installNow()">데모: 설치 완료 처리 →</button>` :
    `<div class="field"><label>거주지 선택 (아파트 · 주택가)</label>
       <input id="res-search" placeholder="이름 검색 — 예: 그린빌, 행복동" oninput="filterResidences()" autocomplete="off"></div>
     <div id="res-list" class="res-list">${residenceItems('')}</div>
     <div id="res-picked" class="res-picked">${pickedResidence?`선택됨: <b>${pickedResidence}</b>`:''}</div>
     <button class="btn primary" onclick="requestMachine()" style="margin-top:10px">회수기 설치 요청</button>
     <div class="note">거주지를 선택하면 배출 데이터가 해당 지역으로 집계됩니다. 단독주택은 동 단위 ‘주택가’로 선택하세요.</div>`}
  </div>
  <h2 class="sec">🪴 가정용 BSF 모듈</h2>
  <div class="card">${ ME.hasModule ? `
    <div style="display:flex;align-items:center;gap:11px">
      <div class="ic2" style="background:var(--green-100)">🪴</div>
      <div style="flex:1"><div class="t" style="font-weight:800">Reloop 홈 모듈 보유 중</div><div class="d">집에서 직접 음식물을 자원화할 수 있어요</div></div>
      <button class="btn ghost sm" onclick="go('device')">기기 관리 →</button>
    </div>` : `
    <div style="display:flex;align-items:center;gap:11px">
      <div class="ic2">🪴</div>
      <div style="flex:1"><div class="t" style="font-weight:700">가정용 BSF 소형 모듈</div><div class="d">스토어에서 3,000P로 구매 · 집에서 직접 자원순환</div></div>
      <button class="btn ghost sm" onclick="go('store')">스토어</button>
    </div>`}
  </div>

  <h2 class="sec">🚚 배송 현황</h2>
  <div class="card">
    <div style="display:flex;align-items:center;gap:11px">
      <div class="ic2" style="background:${ME.activeOrders?'#fef3c7':'var(--green-50)'}">🚚</div>
      <div style="flex:1"><div class="t" style="font-weight:700">${ME.activeOrders? `진행 중인 배송 ${ME.activeOrders}건`:'진행 중인 배송 없음'}</div><div class="d">주문한 농작물·기기의 배송을 추적</div></div>
      <button class="btn ghost sm" onclick="go('orders')">전체 보기 →</button>
    </div>
  </div>

  <h2 class="sec">🛰️ 운영자 모드</h2>
  <div class="card" style="border:1.5px solid var(--green-100)">
    <div style="display:flex;align-items:center;gap:11px">
      <div class="ic2" style="background:#e0f2fe">🛰️</div>
      <div style="flex:1"><div class="t" style="font-weight:800">회수기 관제 · 수거 배차 · 처리 운영</div><div class="d">위치 기반 최적 경로 배차 + 전체 파이프라인 운영 대시보드</div></div>
      <button class="btn ghost sm" onclick="go('ops')">관제 열기 →</button>
    </div>
  </div>

  <h2 class="sec">🧾 포인트 내역</h2>
  <div class="card">${ledgerRows(led.rows, 10)}</div>
  <h2 class="sec">⚙️ 설정</h2>
  <div class="card">
    <div class="row-item"><div class="ic2">🎁</div><div><div class="t">데모: 포인트 충전</div><div class="d">모듈·구매 기능 시연용 +3,000P</div></div>
      <button class="btn ghost sm" style="margin-left:auto" onclick="chargeDemo()">+3,000P</button></div>
    <div class="row-item"><div class="ic2">🔄</div><div><div class="t">데모 데이터 초기화</div><div class="d">내 포인트·배출·구매 기록을 지웁니다</div></div>
      <button class="btn ghost sm" style="margin-left:auto" onclick="resetDemo()">초기화</button></div>
    <div class="row-item"><div class="ic2">🗄️</div><div><div class="t">저장 방식</div><div class="d">서버 SQLite DB · 실제 저장/집계</div></div></div>
  </div>
  <div class="note center" style="padding-bottom:8px">Reloop · 2026 전국 학생 창업·발명 경진대회 프로토타입<br>팀 CNSAi · 남윤수 · 풀스택(Node + SQLite)</div>`;
}
let pickedResidence = null;
function residenceItems(query){
  const q=(query||'').trim().toLowerCase();
  const list=(CONFIG.residences||[]).filter(r=>!q || r.name.toLowerCase().includes(q));
  if(!list.length) return `<div class="res-empty">검색 결과가 없어요 — 가장 가까운 아파트/주택가를 선택하세요.</div>`;
  return list.map(r=>`<div class="res-item ${pickedResidence===r.name?'sel':''}" onclick="pickResidence('${r.name.replace(/'/g,"\\'")}','${r.type}')">
    <span class="ri-ic">${r.type==='house'?'🏘️':'🏢'}</span><span class="ri-nm">${r.name}</span>
    <span class="ri-ty">${r.type==='house'?'주택가':'아파트'}</span>${pickedResidence===r.name?'<span class="ri-chk">✓</span>':''}</div>`).join('');
}
function filterResidences(){ const el=document.getElementById('res-list'); const q=document.getElementById('res-search'); if(el) el.innerHTML=residenceItems(q?q.value:''); }
function pickResidence(name,type){
  pickedResidence=name;
  const el=document.getElementById('res-list'); const q=document.getElementById('res-search');
  if(el) el.innerHTML=residenceItems(q?q.value:'');
  const p=document.getElementById('res-picked'); if(p) p.innerHTML=`선택됨: <b>${type==='house'?'🏘️':'🏢'} ${name}</b>`;
}
async function requestMachine(){
  if(!pickedResidence){ toast('거주지를 선택해 주세요'); return; }
  ME = await post('/api/machine/request', {uid:UID, complex:pickedResidence, size:''});
  syncHeader(); toast('회수기 설치를 요청했어요 🚚'); go('me');
}
async function installNow(){ ME = await post('/api/machine/install', {uid:UID}); syncHeader(); toast('회수기 설치 완료! 이제 배출할 수 있어요 ♻️'); go('me'); }
function resetDemo(){
  openModal(`<h3>데모 초기화</h3><p>내 포인트·배출·구매 기록이 모두 삭제됩니다. 계속할까요?</p>
    <button class="btn dark" onclick="doReset()">초기화</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeModal()">취소</button>`);
}
async function doReset(){ ME = await post('/api/reset', {uid:UID}); closeModal(); syncHeader(); toast('초기화되었습니다'); go('home'); }
async function chargeDemo(){ ME = await post('/api/demo/points', {uid:UID, amount:3000}); syncHeader(); toast('🎁 +3,000P 충전 완료'); go('me'); }

/* ================= DEVICE (가정용 BSF 모듈 관리) ================= */
let deviceSig='';
async function renderDevice(){
  const r = await api('/api/device?uid='+UID);
  const d = r.device;
  if(!d) return `<div class="backrow" onclick="go('me')">‹ 내정보</div>
    <div class="card center" style="padding:30px 18px"><div style="font-size:44px">🪴</div>
    <h2 class="sec center" style="justify-content:center">가정용 BSF 모듈이 없어요</h2>
    <div class="sub center">스토어에서 모듈을 구매하면 집에서 직접 음식물을 자원화할 수 있어요.</div>
    <button class="btn primary" onclick="go('store')">스토어로 가기</button></div>`;
  deviceSig = d.status;
  return renderDeviceBody(d);
}
function renderDeviceBody(d){
  const sm = {idle:{t:'대기 중',c:'gray'}, processing:{t:'생물전환 중',c:'sky'}, ready:{t:'수확 대기',c:'amber'}, maintenance:{t:'청소 필요',c:'amber'}}[d.status];
  return `
  <div class="backrow" onclick="go('me')">‹ 내정보</div>
  <h2 class="sec">🪴 ${d.name}</h2>
  <div class="sub">집에서 직접 음식물을 넣어 블랙솔저플라이로 자원화하고, 고단백 사료와 유기질 비료를 직접 수확하세요.</div>
  <div class="dev-panel">
    <div class="fh"><span style="font-size:18px">🪴</span><b>${d.name}</b><span class="pill ${sm.c}" style="margin-left:auto">${sm.t}</span></div>
    ${deviceSceneSVG(d.status, d.progress)}
    ${d.status==='processing' ? `<div class="dev-prog-wrap"><div class="progress"><div class="pf" id="dev-pf" style="width:${(d.progress*100).toFixed(1)}%"></div></div><div class="eta" id="dev-eta">생물전환 ${(d.progress*100).toFixed(0)}% · ${etaText(d.etaMs)}</div></div>` : ''}
    <div class="dev-sensors">${devGauge('온도',d.temp,'℃',22,36)}${devGauge('습도',d.humidity,'%',40,90)}${devGauge('유충 활동',d.activity,'%',0,100)}</div>
  </div>
  <div class="stat-grid" style="margin-top:12px">
    <div class="stat"><div class="ic">🐛</div><b>${nf(d.feedG)} g</b><em>수확 사료(누적)</em></div>
    <div class="stat"><div class="ic">🌱</div><b>${nf(d.frassG)} g</b><em>수확 비료(누적)</em></div>
    <div class="stat"><div class="ic">♻️</div><b>${fx(d.processedKg,1)} kg</b><em>처리한 음식물</em></div>
    <div class="stat"><div class="ic">🔁</div><b>${d.cycles}회</b><em>완료 사이클</em></div>
  </div>
  <div id="dev-actions">${deviceActions(d)}</div>
  <div class="note center" style="margin-top:6px">가정 처리로 얻은 사료·비료는 직접 사용하는 자원이에요 (플랫폼 포인트와 별개).</div>`;
}
function deviceActions(d){
  if(d.status==='idle') return `<div class="card" style="margin-top:12px">
    <div class="field"><label>투입할 음식물 (데모) <span id="dev-wlbl" style="float:right;color:var(--green-700);font-weight:800">0.40 kg</span></label>
    <input type="range" id="dev-w" min="0.1" max="2" step="0.05" value="0.4" oninput="document.getElementById('dev-wlbl').textContent=(+this.value).toFixed(2)+' kg'"></div>
    <button class="btn primary" onclick="feedDevice()">🍽️ 음식물 투입 · 생물전환 시작</button></div>`;
  if(d.status==='processing') return `<button class="btn ghost" style="margin-top:12px" disabled>🐛 생물전환 진행 중…</button>`;
  if(d.status==='ready') return `<button class="btn primary" style="margin-top:12px" onclick="harvestDevice()">🧺 수확하기 (사료·비료 수거)</button>`;
  if(d.status==='maintenance') return `<div class="card" style="margin-top:12px"><div class="note" style="margin:0 0 10px">🧽 4사이클마다 챔버 청소가 필요해요. 청소하면 다시 사용할 수 있어요.</div><button class="btn dark" onclick="cleanDevice()">🧽 청소 완료 처리</button></div>`;
  return '';
}
function devGauge(label,val,unit,lo,hi){
  const pos=Math.max(0,Math.min(100,(val-lo)/(hi-lo)*100));
  return `<div class="dgauge"><div class="dgl"><span>${label}</span><b>${val}${unit}</b></div><div class="dgt"><div class="dgf" style="width:${pos}%"></div></div></div>`;
}
function renderDeviceInto(d){ deviceSig=d.status; const host=$('#view'); host.innerHTML='<div class="view">'+renderDeviceBody(d)+'</div>'; }
async function feedDevice(){ const w=+document.getElementById('dev-w').value; const r=await post('/api/device/feed',{uid:UID,weight:w}); if(r.error){toast(r.error);return;} renderDeviceInto(r.device); toast('🐛 생물전환을 시작했어요'); }
async function harvestDevice(){ const r=await post('/api/device/harvest',{uid:UID}); if(r.error){toast(r.error);return;} renderDeviceInto(r.device); toast(`🧺 수확 완료 · 사료 ${r.harvested.feed}g · 비료 ${r.harvested.frass}g`); }
async function cleanDevice(){ const r=await post('/api/device/clean',{uid:UID}); if(r.error){toast(r.error);return;} renderDeviceInto(r.device); toast('🧽 청소 완료 · 다시 사용할 수 있어요'); }
async function pollDevice(){
  const r=await api('/api/device?uid='+UID); const d=r.device; if(!d) return;
  if(d.status!==deviceSig){ renderDeviceInto(d); return; }
  const prog=document.getElementById('dev-prog'); if(prog) prog.setAttribute('width',(124*d.progress).toFixed(1));
  const pf=document.getElementById('dev-pf'); if(pf) pf.style.width=(d.progress*100).toFixed(1)+'%';
  const eta=document.getElementById('dev-eta'); if(eta) eta.textContent=`생물전환 ${(d.progress*100).toFixed(0)}% · ${etaText(d.etaMs)}`;
  const ds=document.querySelector('.dev-sensors'); if(ds) ds.innerHTML=`${devGauge('온도',d.temp,'℃',22,36)}${devGauge('습도',d.humidity,'%',40,90)}${devGauge('유충 활동',d.activity,'%',0,100)}`;
}

/* ================= ORDERS (배송 현황) ================= */
let ordersSig='';
function sigOrders(orders){ return orders.map(o=>o.id+':'+o.status).join(','); }
async function renderOrders(){
  const r=await api('/api/orders?uid='+UID); const orders=r.orders;
  ordersSig=sigOrders(orders);
  return renderOrdersInner(orders);
}
function renderOrdersInner(orders){
  return `<div class="backrow" onclick="go('store')">‹ 스토어</div>
  <h2 class="sec">🚚 배송 현황</h2>
  <div class="sub">스토어에서 주문한 농작물·제휴식품·기기의 배송 상태를 실시간으로 확인하세요.</div>
  ${orders.length ? orders.map(orderCard).join('') : `<div class="card"><div class="empty">아직 주문이 없어요.<br>스토어에서 농작물을 구매하면 이곳에서 배송을 추적할 수 있어요.</div></div>`}`;
}
function orderCard(o){
  const done=o.status==='delivered';
  const steps=CONFIG.orderStages.map((s,i)=>`<div class="stepdot ${i<=o.stageIdx?'on':''} ${i===o.stageIdx?'cur':''}"><div class="c">${i<o.stageIdx?'✓':s.icon}</div><small>${s.label}</small></div>`).join('');
  return `<div class="batch-card ${done?'done':''}" id="oc-${o.id}" data-status="${o.status}">
    <div class="batch-head"><span class="w">${o.icon} ${o.name}</span>${o.kind==='device'?'<span class="pill sky">기기</span>':''}<span class="ago">${relTime(o.createdAt)}</span></div>
    ${deliverySceneSVG(o)}
    <div class="stepline">${steps}</div>
    <div class="batch-stage"><span class="ic">${o.stageIcon}</span>${o.stageLabel}<span class="eta">${done?'':'· '+etaText(o.etaMs)}</span></div>
    <div class="batch-desc">${o.stageDesc} · 배송지 ${o.address}</div>
    <div class="progress"><div class="pf" style="width:${(o.overall*100).toFixed(1)}%"></div></div>
    ${done?`<div class="note ok-tag">✅ 배송 완료 — 순환이 완성됐어요.</div>`:''}
  </div>`;
}
async function pollOrders(){
  const r=await api('/api/orders?uid='+UID); const orders=r.orders;
  if(sigOrders(orders)!==ordersSig){ ordersSig=sigOrders(orders); const host=$('#view'); host.innerHTML='<div class="view">'+renderOrdersInner(orders)+'</div>'; return; }
  for(const o of orders){
    const el=document.getElementById('oc-'+o.id); if(!el) continue;
    const pf=el.querySelector('.pf'); if(pf) pf.style.width=(o.overall*100).toFixed(1)+'%';
    const eta=el.querySelector('.eta'); if(eta && o.status!=='delivered') eta.textContent='· '+etaText(o.etaMs);
  }
}

/* ================= NOTIFICATIONS (알림) ================= */
async function renderNotifications(){
  const r = await api('/api/notifications?uid='+UID);
  return `<div class="backrow" onclick="go('home')">‹ 홈</div>
  <h2 class="sec">🔔 알림</h2>
  <div class="sub">수거·배송·기기·순환 소식을 모아서 보여줘요.</div>
  <div class="card">${ r.items.length ? r.items.map(n=>`
    <div class="row-item"><div class="ic2" ${n.kind==='action'?'style="background:#fef3c7"':''}>${n.icon}</div>
      <div style="flex:1;min-width:0"><div class="t">${n.title}</div><div class="d">${n.body}</div></div>
      ${n.kind==='action'?'<span class="pill amber">확인 필요</span>':`<span class="d" style="white-space:nowrap;margin-left:6px">${relTime(n.ts)}</span>`}</div>`).join('')
    : '<div class="empty">새 알림이 없어요.</div>' }</div>
  <div class="note center">기기 수확·청소, 배송 상태, 순환 완성 시 여기에 표시됩니다.</div>`;
}

/* ================= REPORT (개인 환경 임팩트 리포트) ================= */
async function renderReport(){
  const r = await api('/api/report?uid='+UID); const s=r.stats, e=r.equiv;
  const maxW=Math.max(0.1,...r.weekly.map(w=>w.kg));
  return `<div class="backrow" onclick="go('home')">‹ 홈</div>
  <h2 class="sec">🌍 내 환경 임팩트 리포트</h2>
  <div class="sub">내 배출이 만든 실제 변화 (추정)</div>
  <div class="hero">
    <div class="lbl">누적 되돌린 음식물</div><div class="big">${fx(s.kg,1)}<span> kg</span></div>
    <div class="row"><div class="mini"><b>${nf(s.co2)}</b><em>절감 CO₂(kg)</em></div><div class="mini"><b>${s.count}</b><em>배출 횟수</em></div><div class="mini"><b>${nf(s.energy_wh)}</b><em>회수 에너지(Wh)</em></div></div>
  </div>
  <h2 class="sec">🌱 이만큼의 효과예요 (추정)</h2>
  <div class="stat-grid">
    <div class="stat"><div class="ic">🌳</div><b>${e.trees} 그루</b><em>나무 연간 CO₂ 흡수량</em></div>
    <div class="stat"><div class="ic">🚗</div><b>${nf(e.carKm)} km</b><em>자동차 미주행 효과</em></div>
    <div class="stat"><div class="ic">💧</div><b>${nf(e.waterL)} L</b><em>물 절약(전통 단백질 대비)</em></div>
    <div class="stat"><div class="ic">🗑️</div><b>${nf(e.landfillKg)} kg</b><em>매립·소각 회피</em></div>
  </div>
  <h2 class="sec">📈 최근 7일 배출</h2>
  <div class="card"><div class="bars">${r.weekly.map(w=>`<div class="bar-col"><span class="val">${w.kg?fx(w.kg,1):''}</span><div class="bar" style="height:${Math.max(3,w.kg/maxW*100).toFixed(0)}%"></div><small>${w.label}</small></div>`).join('')}</div></div>
  <div class="note center">환산 계수는 공개 자료 기반 추정치이며 실제와 다를 수 있어요.</div>`;
}

/* ================= OPS (운영자 관제) ================= */
async function renderOps(){
  const s = await api('/api/ops');
  return `<div class="backrow" onclick="go('me')">‹ 내정보</div>
  <h2 class="sec">🛰️ 운영자 관제 · 회수기·수거·처리</h2>
  <div class="sub">회수기 적재량을 실시간 모니터링하고, 위치·용량을 고려한 최적 경로로 수거 차량을 배차합니다. 각 단계 처리율에 맞춰 전체가 자동 운영돼요.</div>
  <div id="ops-map">${opsMapSVG(s)}</div>
  <div class="legend" style="justify-content:center;margin:2px 0 10px"><span><i style="background:#22c55e"></i>정상</span><span><i style="background:#f59e0b"></i>수거 임박(60%+)</span><span><i style="background:#ef4444"></i>가득참(90%+)</span></div>
  <div id="ops-panels">${opsPanels(s)}</div>`;
}
function opsPanels(s){
  const bOk = s.bottleneck==='정상'; const p = s.plan; const a = s.autoStatus||{};
  return `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="font-size:22px">🤖</div>
      <div style="flex:1"><div style="font-weight:800;font-size:14px">자동 운영 중 <span class="dotlive" style="display:inline-block;vertical-align:middle;margin-left:2px"></span></div>
        <div class="note" style="margin-top:1px">${a.reason||'회수기 적재량과 처리율을 실시간 분석해 스스로 배차·처리합니다.'}</div></div>
      <span class="pill ${a.active?'sky':'gray'}">${a.active?'수거중':'대기'}</span>
    </div>
    <div class="divider"></div>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="font-size:20px">${bOk?'✅':'⚠️'}</div>
      <div style="flex:1"><div style="font-weight:700;font-size:13px">병목: ${s.bottleneck}</div>
        <div class="note" style="margin-top:1px">${bOk?'모든 단계가 용량 내에서 정상 가동 중':'이 단계에 처리 대기가 쌓이는 중 — 처리율이 유입을 따라가는지 감시'}</div></div>
    </div>
  </div>
  ${p ? `<div class="card"><h2 class="sec" style="margin-top:0">🧭 최근 배차 경로 (최적화)</h2>
    <div class="ops-metrics">
      <div class="om"><b>${p.stops}</b><em>수거 지점</em></div>
      <div class="om"><b>${p.tripCount}회차</b><em>용량 분할</em></div>
      <div class="om"><b>${nf(p.totalLoad)}kg</b><em>총 적재</em></div>
      <div class="om"><b>${nf(p.totalDist)}</b><em>이동거리</em></div>
    </div>
    <div class="ops-saved">📐 최근접이웃 + 2-opt · 단순 배차 대비 <b>${p.saved}% 단축</b> <span>(${nf(p.naiveDist)} → ${nf(p.totalDist)})</span></div>
    ${p.trips.map((t,i)=>`<div class="note" style="margin-top:6px">회차 ${i+1}: 자원화시설 → ${t.stops.join(' → ')} → 복귀 · ${t.load}kg</div>`).join('')}
  </div>` : `<div class="card"><div class="empty">아직 배차 이력이 없어요.<br>회수기가 60%를 넘으면 ‘지금 배차’로 최적 경로를 계산합니다.</div></div>`}
  <h2 class="sec">🗑️ 회수기 적재 현황</h2>
  <div class="card">${s.collectors.map(c=>`<div class="region-row"><span class="nm">${c.complex}</span>
    <div class="track"><div class="fill" style="width:${c.pct}%;background:${c.status==='가득참'?'#ef4444':c.status==='수거 임박'?'#f59e0b':'linear-gradient(90deg,var(--green-500),var(--teal))'}"></div></div>
    <span class="kg">${c.fill}kg</span></div>`).join('')}</div>
  <h2 class="sec">⚙️ 처리 파이프라인 (처리율·대기열)</h2>
  <div class="card">${s.pipeline.map(st=>`<div class="ops-stage"><div class="ost-h"><span>${st.icon} ${st.label}</span><b>${st.capLabel}</b></div>
    <div class="ost-bar"><div class="ost-fill" style="width:${st.util}%;background:${st.util>=95?'#ef4444':st.util>=70?'#f59e0b':'linear-gradient(90deg,var(--green-500),var(--teal))'}"></div></div>
    <div class="ost-q">가동률 ${st.util}% · ${nf(st.queue)} ${st.unit}</div></div>`).join('')}</div>
  <h2 class="sec">📊 운영 통계</h2>
  <div class="stat-grid">
    <div class="stat"><div class="ic">🚛</div><b>${nf(s.stats.collected)}kg</b><em>누적 수거</em></div>
    <div class="stat"><div class="ic">🐛</div><b>${nf(s.stats.processed)}kg</b><em>누적 처리</em></div>
    <div class="stat"><div class="ic">🧭</div><b>${nf(s.stats.distance)}</b><em>총 이동거리</em></div>
    <div class="stat"><div class="ic">📦</div><b>${s.stats.dispatches}회</b><em>배차 · 오버플로 ${s.stats.overflow}</em></div>
  </div>
  <div class="note center">회수기 적재→배차→자원화→스마트팜이 각 단계 처리율(틱당)에 맞춰 자동 운영됩니다. 가득참 발생 시 자동 배차돼요.</div>`;
}
async function dispatchNow(){
  const r = await post('/api/ops/dispatch');
  if(r.error){ toast(r.error); return; }
  toast(`🚛 배차 완료 · 최적 경로(단순 대비 ${r.plan.saved}% 단축)로 수거 시작`);
  const s = await api('/api/ops');
  const map=document.getElementById('ops-map'); if(map) map.innerHTML=opsMapSVG(s);
  const pan=document.getElementById('ops-panels'); if(pan) pan.innerHTML=opsPanels(s);
}
async function pollOps(){
  const s = await api('/api/ops');
  for(const c of s.collectors){
    const g=document.getElementById('ops-col-'+c.id); if(!g) continue;
    const col=c.status==='가득참'?'#ef4444':c.status==='수거 임박'?'#f59e0b':'#22c55e';
    g.querySelector('circle').setAttribute('fill',col);
    const pct=g.querySelector('.ops-pct'); if(pct){ pct.textContent=c.pct+'%'; pct.setAttribute('fill',col); }
  }
  const route=document.getElementById('ops-route'), truck=document.getElementById('ops-truck');
  if(route && truck){
    if(s.truck && s.truck.path){ route.setAttribute('points', s.truck.path.map(p=>p.x+','+p.y).join(' ')); truck.style.opacity='1'; truck.style.transform=`translate(${s.truck.x}px,${s.truck.y}px)`; }
    else { route.setAttribute('points',''); truck.style.opacity='0'; }
  }
  const pan=document.getElementById('ops-panels'); if(pan) pan.innerHTML=opsPanels(s);
}

/* ---------------- Modal ---------------- */
function openModal(html){ $('#modal').innerHTML=html; $('#modalbg').classList.add('show'); }
function closeModal(){ $('#modalbg').classList.remove('show'); }

boot();
