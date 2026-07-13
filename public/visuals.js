'use strict';
/* Reloop — 처리 단계/스마트팜 애니메이션 SVG 장면 (자체 제작, 외부 에셋 0) */

function cropVisual(crop){
  switch(crop){
    case '방울토마토': return {emoji:'🍅', color:'#ef4444', dark:'#b91c1c'};
    case '바질':       return {emoji:'🌿', color:'#16a34a', dark:'#15803d'};
    case '청경채':     return {emoji:'🥬', color:'#22c55e', dark:'#15803d'};
    default:           return {emoji:'🥬', color:'#22c55e', dark:'#15803d'};
  }
}
function sceneWrap(inner, bg){ return `<div class="scene" style="background:${bg}"><svg viewBox="0 0 320 126" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg></div>`; }

/* 배출/수거 대기 — 회수기 + 로드셀 계량 */
function sceneBin(){
  return sceneWrap(`
    <ellipse cx="160" cy="116" rx="66" ry="7" fill="rgba(0,0,0,.06)"/>
    <rect x="123" y="46" width="74" height="66" rx="9" fill="#3b4757"/>
    <rect x="123" y="46" width="74" height="16" rx="9" fill="#4b586b"/>
    <rect x="141" y="41" width="38" height="7" rx="3.5" fill="#1f2733"/>
    <rect x="133" y="72" width="54" height="26" rx="5" fill="#08201a"/>
    <text x="160" y="90" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="700" fill="#4ade80">⚖ 계량중<animate attributeName="opacity" values="1;.4;1" dur="1s" repeatCount="indefinite"/></text>
    <rect x="113" y="108" width="94" height="6" rx="3" fill="#64748b"/>
    <g class="svg-anim" style="animation:drop 1.9s ease-in infinite"><path d="M154 16 q7 -9 13 0 q3 9 -6.5 13 q-9.5 -4 -6.5 -13Z" fill="#84cc16"/></g>
    <g class="svg-anim" style="animation:drop 1.9s ease-in .95s infinite"><circle cx="170" cy="14" r="5" fill="#f59e0b"/></g>`,
  'linear-gradient(135deg,#eef2f0,#d7ebe0)');
}

/* 수거 — 트럭 주행 */
function sceneTruck(){
  return sceneWrap(`
    <rect x="0" y="103" width="320" height="3" fill="#cbd5e1"/>
    <g stroke="#e2e8f0" stroke-width="3" stroke-dasharray="14 12">
      <line x1="0" y1="112" x2="320" y2="112"><animate attributeName="x1" values="0;-26" dur=".6s" repeatCount="indefinite"/><animate attributeName="x2" values="320;294" dur=".6s" repeatCount="indefinite"/></line>
    </g>
    <g class="svg-anim" style="animation:truckmove 3.4s linear infinite">
      <rect x="18" y="58" width="58" height="36" rx="5" fill="#16a34a"/>
      <rect x="34" y="42" width="20" height="18" rx="3" fill="#475569"/>
      <rect x="76" y="68" width="26" height="26" rx="4" fill="#22c55e"/>
      <rect x="82" y="72" width="13" height="10" rx="2" fill="#c7f0d8"/>
      <circle cx="38" cy="98" r="8" fill="#1f2937"/><circle cx="38" cy="98" r="3" fill="#94a3b8"/>
      <circle cx="90" cy="98" r="8" fill="#1f2937"/><circle cx="90" cy="98" r="3" fill="#94a3b8"/>
      <text x="47" y="82" text-anchor="middle" font-size="11" fill="#fff" font-weight="700">♻</text>
    </g>`,
  'linear-gradient(135deg,#e0f2fe,#dbeafe)');
}

/* 자원화 — BSF 생물전환 + 전기화학 처리 */
function sceneResource(){
  return sceneWrap(`
    <line x1="160" y1="14" x2="160" y2="112" stroke="rgba(255,255,255,.12)"/>
    <text x="82" y="24" text-anchor="middle" font-size="9.5" fill="#cbd5e1" font-weight="600">🐛 BSF 생물전환</text>
    <text x="240" y="24" text-anchor="middle" font-size="9.5" fill="#cbd5e1" font-weight="600">⚡ 전기화학</text>
    <ellipse cx="82" cy="94" rx="48" ry="15" fill="#3f2d1e"/>
    <ellipse cx="70" cy="90" rx="7" ry="3" fill="#5b4327"/><ellipse cx="96" cy="93" rx="6" ry="3" fill="#5b4327"/>
    <g class="svg-anim" style="transform-origin:62px 84px;animation:wriggle 1.1s ease-in-out infinite"><ellipse cx="62" cy="84" rx="12" ry="4.5" fill="#efe3c2"/><ellipse cx="66" cy="84" rx="2.5" ry="3.5" fill="#cbb98c"/></g>
    <g class="svg-anim" style="transform-origin:90px 88px;animation:wriggle 1.35s ease-in-out .2s infinite"><ellipse cx="90" cy="88" rx="11" ry="4.5" fill="#e7d8b0"/></g>
    <g class="svg-anim" style="transform-origin:76px 76px;animation:wriggle .95s ease-in-out .45s infinite"><ellipse cx="76" cy="76" rx="9" ry="4" fill="#efe3c2"/></g>
    <rect x="206" y="50" width="68" height="56" rx="6" fill="rgba(56,189,248,.16)" stroke="rgba(125,211,252,.5)"/>
    <rect x="224" y="38" width="5" height="34" rx="2" fill="#94a3b8"/>
    <rect x="251" y="38" width="5" height="34" rx="2" fill="#94a3b8"/>
    <g fill="#7dd3fc">
      <circle class="svg-anim" style="animation:bubbleup 1.7s ease-in infinite" cx="226" cy="98" r="3"/>
      <circle class="svg-anim" style="animation:bubbleup 1.7s ease-in .55s infinite" cx="240" cy="98" r="2.4"/>
      <circle class="svg-anim" style="animation:bubbleup 1.7s ease-in 1.05s infinite" cx="254" cy="98" r="3.4"/>
    </g>
    <text x="240" y="36" text-anchor="middle" font-size="12" class="svg-anim" style="animation:spark 1.4s infinite">⚡</text>`,
  'linear-gradient(135deg,#1f2937,#0f172a)');
}

/* 스마트팜 재배 — LED / 작물 성장 / 물방울 / 양액 기포 (스마트팜 패널에도 사용) */
function growSceneSVG(growth, crop){
  const c = cropVisual(crop||'상추');
  const s = growth==='발아' ? 0.45 : growth==='생장' ? 0.75 : 1;
  const fruit = crop==='방울토마토' && growth!=='발아';
  return sceneWrap(`
    <ellipse cx="160" cy="20" rx="122" ry="17" fill="#fde68a" opacity=".16" class="svg-anim" style="animation:ledpulse 2.5s infinite"/>
    <rect x="58" y="11" width="204" height="9" rx="4.5" fill="#fde68a" class="svg-anim" style="animation:ledpulse 1.9s infinite"/>
    <g stroke="#fde68a" stroke-width="2" stroke-linecap="round" class="svg-anim" style="animation:rays 2.3s infinite">
      <line x1="92" y1="22" x2="84" y2="50"/><line x1="128" y1="22" x2="124" y2="52"/><line x1="170" y1="22" x2="170" y2="54"/><line x1="212" y1="22" x2="220" y2="52"/><line x1="248" y1="22" x2="256" y2="50"/>
    </g>
    <rect x="42" y="95" width="236" height="20" rx="5" fill="#08281f"/>
    <rect x="42" y="95" width="236" height="6" rx="3" fill="#0d9488" opacity=".55"/>
    <g fill="#5eead4">
      <circle class="svg-anim" style="animation:bubbleup 2.1s ease-in infinite" cx="72" cy="111" r="2.4"/>
      <circle class="svg-anim" style="animation:bubbleup 2.1s ease-in .8s infinite" cx="152" cy="111" r="2"/>
      <circle class="svg-anim" style="animation:bubbleup 2.1s ease-in 1.5s infinite" cx="232" cy="111" r="3"/>
    </g>
    <g style="transform-origin:160px 95px;transform:scale(${s})">
      <g class="svg-anim" style="transform-origin:160px 92px;animation:sway 3.2s ease-in-out infinite">
        <rect x="158" y="50" width="4" height="46" rx="2" fill="#15803d"/>
        <path d="M160 66 q-27 -6 -35 -23 q23 -2 35 15Z" fill="${c.color}"/>
        <path d="M160 60 q27 -6 35 -23 q-23 -2 -35 15Z" fill="${c.dark}"/>
        <path d="M160 80 q-22 -4 -30 -18 q20 -2 30 12Z" fill="${c.color}"/>
        <path d="M160 76 q22 -4 30 -18 q-20 -2 -30 12Z" fill="${c.dark}"/>
        <path d="M160 55 q-15 -8 -19 -19 q13 0 19 11Z" fill="${c.color}"/>
        <path d="M160 53 q15 -8 19 -19 q-13 0 -19 11Z" fill="${c.dark}"/>
        ${fruit?`<circle cx="150" cy="66" r="5" fill="#ef4444"/><circle cx="172" cy="62" r="5" fill="#ef4444"/><circle cx="164" cy="74" r="4.5" fill="#f87171"/>`:''}
      </g>
    </g>
    <g fill="#7dd3fc">
      <circle class="svg-anim" style="animation:dripdown 2.3s ease-in infinite" cx="112" cy="28" r="3"/>
      <circle class="svg-anim" style="animation:dripdown 2.6s ease-in .6s infinite" cx="160" cy="28" r="2.5"/>
      <circle class="svg-anim" style="animation:dripdown 2.3s ease-in 1.15s infinite" cx="208" cy="28" r="3"/>
    </g>
    <text x="248" y="84" font-size="8" fill="#5eead4" opacity=".85" class="svg-anim" style="animation:floaty 3s infinite">O₂</text>`,
  'linear-gradient(160deg,#0f2b22,#12643f)');
}

/* 수확 — 바구니에 담기 */
function sceneHarvest(crop){
  const c = cropVisual(crop||'상추');
  return sceneWrap(`
    <path d="M118 76 h84 l-9 36 h-66Z" fill="#b45309"/>
    <path d="M118 76 h84 l-9 36 h-66Z" fill="none" stroke="#92400e" stroke-width="1.5"/>
    <rect x="114" y="70" width="92" height="9" rx="4.5" fill="#92400e"/>
    <g class="svg-anim" style="animation:pickup 2.1s ease-out infinite">
      <circle cx="160" cy="58" r="12" fill="${c.color}"/><path d="M160 48 l3 -8" stroke="${c.dark}" stroke-width="2.5" stroke-linecap="round"/>
    </g>
    <circle cx="140" cy="82" r="11" fill="${c.dark}"/><circle cx="162" cy="80" r="12" fill="${c.color}"/><circle cx="184" cy="83" r="10" fill="${c.dark}"/>`,
  'linear-gradient(135deg,#dcfce7,#bbf7d0)');
}

/* 스토어 등록 — 장바구니 + 체크 */
function sceneStore(crop){
  const c = cropVisual(crop||'상추');
  return sceneWrap(`
    <path d="M126 52 h68 v54 a6 6 0 0 1 -6 6 h-56 a6 6 0 0 1 -6 -6Z" fill="#ecfdf5" stroke="#16a34a" stroke-width="2"/>
    <path d="M141 52 v-7 a19 19 0 0 1 38 0 v7" fill="none" stroke="#16a34a" stroke-width="3"/>
    <text x="160" y="94" text-anchor="middle" font-size="30">${c.emoji}</text>
    <g class="svg-anim" style="transform-origin:196px 56px;animation:floaty 2s infinite">
      <circle cx="196" cy="56" r="14" fill="#22c55e"/>
      <path d="M189 56 l5 5 l9 -11" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`,
  'linear-gradient(135deg,#fef9c3,#dcfce7)');
}

/* ===== 자원화 공정 라이브 — 상시 재생되는 대형 공정 애니메이션 ===== */
function processSceneSVG(){
  return `<div class="scene tall" style="background:linear-gradient(165deg,#0b1220,#0f2b22)"><svg viewBox="0 0 320 238" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="belt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a4658"/><stop offset="1" stop-color="#1e293b"/></linearGradient>
      <linearGradient id="liq" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#38bdf8" stop-opacity=".28"/><stop offset="1" stop-color="#0369a1" stop-opacity=".5"/></linearGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="#fde68a" stop-opacity=".95"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
    </defs>

    <!-- ① 수거 · 투입 -->
    <text x="10" y="15" font-size="9" fill="#94a3b8" font-weight="700">① 수거 · 투입</text>
    <g class="svg-anim" style="animation:truckin 4s ease-in-out infinite">
      <rect x="6" y="28" width="30" height="16" rx="3" fill="#16a34a"/><rect x="14" y="22" width="12" height="8" rx="2" fill="#475569"/>
      <circle cx="14" cy="46" r="4" fill="#111827"/><circle cx="30" cy="46" r="4" fill="#111827"/>
    </g>
    <rect x="52" y="30" width="150" height="13" rx="4" fill="url(#belt)"/>
    <g stroke="#556377" stroke-width="2"><line x1="52" y1="36" x2="202" y2="36" stroke-dasharray="9 7"><animate attributeName="x1" values="52;44" dur=".5s" repeatCount="indefinite"/><animate attributeName="x2" values="202;194" dur=".5s" repeatCount="indefinite"/></line></g>
    <g class="svg-anim" style="animation:beltmove 3s linear infinite"><circle cx="60" cy="26" r="5" fill="#84cc16"/></g>
    <g class="svg-anim" style="animation:beltmove 3s linear 1s infinite"><rect x="57" y="22" width="9" height="8" rx="2" fill="#f59e0b"/></g>
    <g class="svg-anim" style="animation:beltmove 3s linear 2s infinite"><circle cx="60" cy="26" r="4" fill="#22c55e"/></g>
    <path d="M204 30 h24 l-7 16 h-10Z" fill="#475569"/>

    <!-- ② 자원화 -->
    <text x="10" y="66" font-size="9" fill="#94a3b8" font-weight="700">② 자원화</text>
    <rect x="10" y="74" width="142" height="74" rx="8" fill="rgba(132,204,22,.07)" stroke="rgba(132,204,22,.28)"/>
    <text x="18" y="88" font-size="8.5" fill="#a3e635" font-weight="600">🐛 BSF 생물전환 챔버</text>
    <g class="svg-anim" style="transform-origin:56px 138px;animation:consume 3.6s ease-in-out infinite"><ellipse cx="56" cy="138" rx="36" ry="9" fill="#3f2d1e"/><ellipse cx="46" cy="135" rx="7" ry="3" fill="#5b4327"/><ellipse cx="66" cy="137" rx="6" ry="3" fill="#5b4327"/></g>
    <g class="svg-anim" style="transform-origin:44px 130px;animation:crawl 2.6s ease-in-out infinite"><g class="svg-anim" style="transform-origin:44px 130px;animation:wriggle 1s infinite"><ellipse cx="44" cy="130" rx="9" ry="3.6" fill="#efe3c2"/></g></g>
    <g class="svg-anim" style="transform-origin:64px 133px;animation:crawl 3s ease-in-out .5s infinite"><g class="svg-anim" style="transform-origin:64px 133px;animation:wriggle 1.2s .2s infinite"><ellipse cx="64" cy="133" rx="8" ry="3.4" fill="#e7d8b0"/></g></g>
    <g class="svg-anim" style="transform-origin:54px 126px;animation:crawl 2.3s ease-in-out .9s infinite"><g class="svg-anim" style="transform-origin:54px 126px;animation:wriggle .9s .4s infinite"><ellipse cx="54" cy="126" rx="7" ry="3" fill="#efe3c2"/></g></g>
    <g class="svg-anim" style="animation:pelletfall 2s ease-in infinite"><circle cx="120" cy="104" r="3.2" fill="#b45309"/></g>
    <g class="svg-anim" style="animation:pelletfall 2s ease-in .7s infinite"><circle cx="132" cy="104" r="3.2" fill="#22c55e"/></g>
    <g class="svg-anim" style="animation:pelletfall 2s ease-in 1.3s infinite"><circle cx="126" cy="104" r="3" fill="#b45309"/></g>
    <rect x="112" y="128" width="30" height="16" rx="3" fill="#1f2937"/><text x="127" y="139" font-size="6.5" fill="#cbd5e1" text-anchor="middle">사료·비료</text>

    <rect x="160" y="74" width="148" height="74" rx="8" fill="rgba(56,189,248,.06)" stroke="rgba(125,211,252,.28)"/>
    <text x="168" y="88" font-size="8.5" fill="#7dd3fc" font-weight="600">⚡ 전기화학 반응조</text>
    <rect x="176" y="102" width="66" height="40" rx="4" fill="url(#liq)"/>
    <rect x="192" y="96" width="5" height="30" rx="2" fill="#94a3b8"/><rect x="222" y="96" width="5" height="30" rx="2" fill="#94a3b8"/>
    <g fill="#7dd3fc">
      <circle class="svg-anim" style="animation:bubbleup 1.7s ease-in infinite" cx="196" cy="136" r="2.6"/>
      <circle class="svg-anim" style="animation:bubbleup 1.7s ease-in .5s infinite" cx="209" cy="136" r="2.2"/>
      <circle class="svg-anim" style="animation:bubbleup 1.7s ease-in 1s infinite" cx="222" cy="136" r="3"/>
    </g>
    <g class="svg-anim" style="animation:gasrise 2.6s ease-in infinite"><circle cx="256" cy="118" r="6" fill="#a5f3fc"/><text x="256" y="121" font-size="6" fill="#0e7490" text-anchor="middle" font-weight="700">H₂</text></g>
    <circle cx="284" cy="92" r="12" fill="url(#glow)" class="svg-anim" style="animation:ledpulse 1.5s infinite"/>
    <rect x="270" y="100" width="30" height="18" rx="3" fill="#1f2937" stroke="#475569"/><text x="285" y="112" font-size="6.5" fill="#fde68a" text-anchor="middle">연료전지</text>
    <text x="284" y="96" font-size="11" text-anchor="middle" class="svg-anim" style="animation:spark 1.2s infinite">⚡</text>

    <!-- ③ 산출물 → 스마트팜 -->
    <text x="10" y="172" font-size="9" fill="#94a3b8" font-weight="700">③ 산출물 → 스마트팜</text>
    <rect x="10" y="188" width="268" height="11" rx="5.5" fill="#1a2433" stroke="#334155"/>
    <g>
      <circle class="svg-anim" style="animation:flowpipe 2.8s linear infinite" cx="16" cy="193.5" r="3.6" fill="#b45309"/>
      <circle class="svg-anim" style="animation:flowpipe 2.8s linear .7s infinite" cx="16" cy="193.5" r="3.6" fill="#22c55e"/>
      <circle class="svg-anim" style="animation:flowpipe 2.8s linear 1.4s infinite" cx="16" cy="193.5" r="3.6" fill="#38bdf8"/>
      <circle class="svg-anim" style="animation:flowpipe 2.8s linear 2.1s infinite" cx="16" cy="193.5" r="3.6" fill="#f59e0b"/>
    </g>
    <g transform="translate(282,174)">
      <path d="M0 24 h30 v-15 l-15 -8 -15 8Z" fill="#0d9488" opacity=".45"/>
      <line x1="0" y1="9" x2="15" y2="1" stroke="#5eead4" stroke-width="1"/><line x1="30" y1="9" x2="15" y2="1" stroke="#5eead4" stroke-width="1"/>
      <text x="15" y="21" font-size="13" text-anchor="middle">🌱</text>
    </g>
  </svg></div>`;
}

/* ===== 가정용 BSF 모듈 장면 ===== */
function deviceSceneSVG(status, progress){
  const active = status==='processing' || status==='ready';
  const led = status==='processing' ? '#22c55e' : status==='ready' ? '#f59e0b' : status==='maintenance' ? '#ef4444' : '#94a3b8';
  const p = Math.max(0, Math.min(1, progress||0));
  const interior = active ? `
    <ellipse cx="136" cy="99" rx="46" ry="9" fill="#3f2d1e"/>
    <ellipse cx="122" cy="97" rx="7" ry="3" fill="#5b4327"/><ellipse cx="150" cy="99" rx="6" ry="3" fill="#5b4327"/>
    <g class="svg-anim" style="transform-origin:118px 92px;animation:crawl 2.5s ease-in-out infinite"><g class="svg-anim" style="transform-origin:118px 92px;animation:wriggle 1s infinite"><ellipse cx="118" cy="92" rx="9" ry="3.6" fill="#efe3c2"/></g></g>
    <g class="svg-anim" style="transform-origin:150px 95px;animation:crawl 3s ease-in-out .5s infinite"><g class="svg-anim" style="transform-origin:150px 95px;animation:wriggle 1.2s .2s infinite"><ellipse cx="150" cy="95" rx="8" ry="3.4" fill="#e7d8b0"/></g></g>
    <g class="svg-anim" style="transform-origin:134px 86px;animation:crawl 2.2s ease-in-out .9s infinite"><g class="svg-anim" style="transform-origin:134px 86px;animation:wriggle .9s .4s infinite"><ellipse cx="134" cy="86" rx="7" ry="3" fill="#efe3c2"/></g></g>
    ${status==='processing' ? `<g fill="#cbd5e1" opacity=".55"><circle class="svg-anim" style="animation:gasrise 2.4s ease-in infinite" cx="120" cy="54" r="2.5"/><circle class="svg-anim" style="animation:gasrise 2.4s ease-in 1.2s infinite" cx="152" cy="54" r="2"/><circle class="svg-anim" style="animation:gasrise 2.4s ease-in .6s infinite" cx="136" cy="54" r="2.2"/></g>` : ''}`
    : status==='maintenance'
      ? `<text x="136" y="82" font-size="24" text-anchor="middle" class="svg-anim" style="transform-origin:136px 78px;animation:floaty 2s infinite">🧽</text><text x="136" y="102" font-size="8" fill="#fca5a5" text-anchor="middle">챔버 청소 필요</text>`
      : `<text x="136" y="80" font-size="9" fill="#64748b" text-anchor="middle">대기 중</text><text x="136" y="95" font-size="7.5" fill="#475569" text-anchor="middle">음식물을 투입하세요</text>`;
  return `<div class="scene" style="height:150px;background:linear-gradient(160deg,#0f172a,#0b2018)"><svg viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="58" y="24" width="204" height="108" rx="14" fill="#1e293b" stroke="#334155"/>
    <rect x="150" y="16" width="20" height="12" rx="4" fill="#334155"/>
    <rect x="74" y="40" width="124" height="68" rx="8" fill="#0a1f17" stroke="#14532d"/>
    ${interior}
    <circle cx="230" cy="48" r="6" fill="${led}" ${status==='processing'?'class="svg-anim" style="animation:ledpulse 1.2s infinite"':''}/>
    <text x="230" y="66" font-size="7.5" fill="#cbd5e1" text-anchor="middle">${status==='processing'?'가동':status==='ready'?'완료':status==='maintenance'?'점검':'대기'}</text>
    <rect x="218" y="80" width="24" height="20" rx="3" fill="#0a1f17" stroke="#334155"/><text x="230" y="94" font-size="12" text-anchor="middle">🪴</text>
    <rect x="74" y="116" width="124" height="8" rx="4" fill="#0a1f17" stroke="#14532d"/>
    <rect x="74" y="116" width="${(124*p).toFixed(1)}" height="8" rx="4" fill="${status==='ready'?'#f59e0b':'#22c55e'}" id="dev-prog"/>
  </svg></div>`;
}

/* ===== 배송 장면 ===== */
function deliverySceneSVG(o){
  const delivered = o && o.status==='delivered';
  const road = delivered ? '' : '<animate attributeName="x1" values="0;-22" dur=".55s" repeatCount="indefinite"/><animate attributeName="x2" values="320;298" dur=".55s" repeatCount="indefinite"/>';
  return `<div class="scene" style="height:118px;background:linear-gradient(160deg,#e0f2fe,#dcfce7)"><svg viewBox="0 0 320 118" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="92" width="320" height="26" fill="rgba(0,0,0,.04)"/>
    <g stroke="#94a3b8" stroke-width="3" stroke-dasharray="12 10" opacity=".5"><line x1="0" y1="97" x2="320" y2="97">${road}</line></g>
    <g transform="translate(10,50)"><path d="M0 34 h34 v-18 l-17 -9 -17 9Z" fill="#0d9488" opacity=".55"/><text x="17" y="30" font-size="15" text-anchor="middle">🌱</text></g>
    <g transform="translate(256,46)"><path d="M0 42 h48 v-24 l-24 -14 -24 14Z" fill="#fca5a4"/><path d="M-3 20 l27 -16 l27 16" fill="none" stroke="#dc2626" stroke-width="3" stroke-linejoin="round"/><rect x="18" y="24" width="13" height="18" rx="1" fill="#7c2d12"/></g>
    ${delivered
      ? `<text x="238" y="88" font-size="20">📦</text><g class="svg-anim" style="transform-origin:244px 58px;animation:floaty 2s infinite"><circle cx="244" cy="58" r="11" fill="#22c55e"/><path d="M239 58 l4 4 l7 -9" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`
      : `<g class="svg-anim" style="animation:truckmove 3.2s linear infinite"><rect x="1" y="66" width="15" height="11" rx="2" fill="#b45309"/><text x="3" y="93" font-size="22">🛵</text></g>`}
  </svg></div>`;
}

/* ===== 회수기 지도 + 배출 히트맵 ===== */
function mapSceneSVG(residences, mine){
  const maxKg = Math.max(1, ...residences.map(c=>c.kg));
  const heat = r => r>0.66 ? '#ef4444' : r>0.33 ? '#f59e0b' : '#22c55e';
  const pins = residences.map(c=>{
    const px=c.x, py=c.y, r=c.kg/maxKg, rad=12+r*22;
    const isMine = mine && mine.known && mine.nm===c.nm;
    const isHouse = c.type==='house';
    const marker = isHouse
      ? `<rect x="${px-5}" y="${py-5}" width="10" height="10" rx="2" fill="${heat(r)}" stroke="#fff" stroke-width="2"/>`
      : `<circle cx="${px}" cy="${py}" r="5.5" fill="${heat(r)}" stroke="#fff" stroke-width="2"/>`;
    return `<g>
      <circle cx="${px}" cy="${py}" r="${rad.toFixed(1)}" fill="${heat(r)}" opacity="${c.kg>0?0.24:0.08}" class="svg-anim" style="transform-origin:${px}px ${py}px;animation:heat 3s ease-in-out infinite"/>
      ${isMine?`<circle cx="${px}" cy="${py}" r="9" fill="none" stroke="#0d9488" stroke-width="2.5" class="svg-anim" style="transform-origin:${px}px ${py}px;animation:ping 1.8s ease-out infinite"/>`:''}
      ${marker}
      <text x="${px}" y="${(py-rad-4).toFixed(0)}" text-anchor="middle" font-size="8" font-weight="700" fill="#0f172a">${isHouse?'🏘️':''}${c.nm}${isMine?' 🏠':''}</text>
      <text x="${px}" y="${(py+rad+10).toFixed(0)}" text-anchor="middle" font-size="7.5" fill="#475569">${c.kg>0?(c.kg/1000).toFixed(1)+'t':'–'}</text>
    </g>`;
  }).join('');
  let minePin = '';
  if(mine && !mine.known){
    const px=166, py=120;
    minePin = `<g>
      <circle cx="${px}" cy="${py}" r="15" fill="#0d9488" opacity="0.22" class="svg-anim" style="transform-origin:${px}px ${py}px;animation:heat 3s infinite"/>
      <circle cx="${px}" cy="${py}" r="9" fill="none" stroke="#0d9488" stroke-width="2.5" class="svg-anim" style="transform-origin:${px}px ${py}px;animation:ping 1.8s ease-out infinite"/>
      <circle cx="${px}" cy="${py}" r="5.5" fill="#0d9488" stroke="#fff" stroke-width="2"/>
      <text x="${px}" y="${py-19}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#0d9488">📍 미등록 거주지</text></g>`;
  }
  return `<div class="scene" style="height:266px;background:linear-gradient(160deg,#eef4f1,#e1ede7)"><svg viewBox="0 0 340 266" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <path d="M-10 150 Q 80 122 150 150 T 350 142 L 350 188 Q 250 200 150 184 T -10 198 Z" fill="#bae6fd" opacity="0.65"/>
    <circle cx="38" cy="48" r="24" fill="#bbf7d0" opacity=".65"/><circle cx="302" cy="56" r="19" fill="#bbf7d0" opacity=".65"/>
    <g stroke="#ffffff" stroke-width="4" opacity=".85"><line x1="0" y1="104" x2="340" y2="99"/><line x1="0" y1="228" x2="340" y2="233"/><line x1="112" y1="0" x2="122" y2="266"/><line x1="252" y1="0" x2="242" y2="266"/></g>
    <g class="svg-anim" style="animation:maproute 7s linear infinite"><text x="0" y="106" font-size="13">🚛</text></g>
    ${pins}${minePin}
  </svg></div>`;
}

/* ===== 운영자 관제 지도 (회수기 적재·경로·수거차량) ===== */
function opsStatusColor(s){ return s==='가득참' ? '#ef4444' : s==='수거 임박' ? '#f59e0b' : '#22c55e'; }
function opsMapSVG(state){
  const d = state.depot, t = state.truck;
  const pins = state.collectors.map(c=>{
    const col = opsStatusColor(c.status);
    return `<g id="ops-col-${c.id}">
      <circle cx="${c.x}" cy="${c.y}" r="7" fill="${col}" stroke="#fff" stroke-width="2"/>
      <text x="${c.x}" y="${c.y-11}" text-anchor="middle" font-size="8" font-weight="700" fill="#0f172a">${c.complex}</text>
      <text class="ops-pct" x="${c.x}" y="${c.y+17}" text-anchor="middle" font-size="8" font-weight="800" fill="${col}">${c.pct}%</text>
    </g>`;
  }).join('');
  const routePts = (t && t.path) ? t.path.map(p=>p.x+','+p.y).join(' ') : '';
  return `<div class="scene" style="height:272px;background:linear-gradient(160deg,#eef4f1,#e1ede7)"><svg viewBox="0 0 340 272" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <path d="M-10 152 Q 80 124 150 152 T 350 144 L 350 190 Q 250 202 150 186 T -10 200 Z" fill="#bae6fd" opacity="0.6"/>
    <circle cx="38" cy="46" r="22" fill="#bbf7d0" opacity=".6"/><circle cx="302" cy="54" r="18" fill="#bbf7d0" opacity=".6"/>
    <g stroke="#ffffff" stroke-width="4" opacity=".85"><line x1="0" y1="106" x2="340" y2="101"/><line x1="0" y1="232" x2="340" y2="237"/><line x1="112" y1="0" x2="122" y2="272"/><line x1="252" y1="0" x2="242" y2="272"/></g>
    <polyline id="ops-route" points="${routePts}" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-dasharray="6 5" opacity="0.85"/>
    <g><rect x="${d.x-12}" y="${d.y-9}" width="24" height="18" rx="3" fill="#334155"/><text x="${d.x}" y="${d.y+4}" text-anchor="middle" font-size="11">🏭</text><text x="${d.x}" y="${d.y-13}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#334155">자원화 시설</text></g>
    ${pins}
    <g id="ops-truck" style="opacity:${t?1:0};transform:translate(${t?t.x:0}px,${t?t.y:0}px);transition:transform 1.5s linear"><text x="-8" y="5" font-size="16">🚛</text></g>
  </svg></div>`;
}

/* 단계 키 → 장면 */
function stageScene(key, crop){
  switch(key){
    case 'collected_wait': return sceneBin();
    case 'collected':      return sceneTruck();
    case 'resourcing':     return sceneResource();
    case 'farming':        return growSceneSVG('생장', crop);
    case 'harvest':        return sceneHarvest(crop);
    case 'stored':         return sceneStore(crop);
    default:               return sceneBin();
  }
}
