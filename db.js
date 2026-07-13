'use strict';
/* Reloop — DB layer (node:sqlite, 외부 의존성 0) */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'reloop.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/* ---------------- 계획서 기반 상수 ---------------- */
const FACT = { pointsPerKg:100, feed:0.14, frass:0.30, water:0.5, energyWh:55, co2:2.53 };

// 배치 처리 생애주기 (dur = 데모용 압축 시간, ms)
const STAGES = [
  {key:'collected_wait', label:'수거 대기',   icon:'🚚', dur:16000, desc:'회수기에서 수거 차량을 기다리는 중'},
  {key:'collected',      label:'수거 완료',   icon:'📦', dur:12000, desc:'수거되어 자원화 시설로 이동'},
  {key:'resourcing',     label:'자원화 처리', icon:'🐛', dur:26000, desc:'블랙솔저플라이 생물전환 · 전기화학 처리'},
  {key:'farming',        label:'스마트팜 재배', icon:'🌱', dur:48000, desc:'회수 자원이 도시농장에 투입되어 작물로 성장'},
  {key:'harvest',        label:'수확',        icon:'🧺', dur:12000, desc:'다 자란 작물을 수확'},
  {key:'stored',         label:'스토어 등록', icon:'🛒', dur:0,     desc:'먹거리로 스토어에 등록 — 순환 완성'},
];

// 스토어 주문 배송 단계 (dur = 데모용 압축 시간, ms)
const ORDER_STAGES = [
  {key:'placed',     label:'주문 접수', icon:'📝', dur:9000,  desc:'주문이 접수되었어요'},
  {key:'packing',    label:'수확·포장', icon:'📦', dur:16000, desc:'스마트팜에서 수확해 포장하는 중'},
  {key:'dispatched', label:'배송 출발', icon:'🚚', dur:11000, desc:'물류 거점에서 출발했어요'},
  {key:'delivering', label:'배송 중',   icon:'🛵', dur:20000, desc:'배송원이 문 앞으로 이동 중'},
  {key:'delivered',  label:'배송 완료', icon:'✅', dur:0,     desc:'문 앞에 도착 — 순환이 완성됐어요'},
];

const CROPS = [
  {crop:'상추', icon:'🥬', item:'lettuce'},
  {crop:'방울토마토', icon:'🍅', item:'tomato'},
  {crop:'청경채', icon:'🥬', item:'bokchoy'},
  {crop:'바질', icon:'🌿', item:'basil'},
];

// 생육 단계별 목표 센서 범위 [lo, hi] — moisture(%), temp(℃), light(klx), ph, ec(mS/cm)
const SENSOR_TARGETS = {
  '발아':   { moisture:[65,80], temp:[22,26], light:[10,16], ph:[5.8,6.2], ec:[1.2,1.6] },
  '생장':   { moisture:[60,75], temp:[20,24], light:[16,24], ph:[5.8,6.3], ec:[1.8,2.2] },
  '수확기': { moisture:[55,68], temp:[18,23], light:[18,26], ph:[6.0,6.5], ec:[2.0,2.6] },
};
const SENSOR_META = {
  moisture:{label:'토양 수분', unit:'%'},
  temp:{label:'온도', unit:'℃'},
  light:{label:'조도', unit:'klx'},
  ph:{label:'양액 pH', unit:''},
  ec:{label:'전기전도도(EC)', unit:'mS/cm'},
};

const STORE_SEED = [
  {id:'lettuce', name:'스마트팜 상추',   category:'농작물',  price:250, icon:'🥬', meta:'150g · 당일수확', base:8,  produce:1, loop:0},
  {id:'tomato',  name:'방울토마토',      category:'농작물',  price:400, icon:'🍅', meta:'200g · 무농약',  base:5,  produce:1, loop:0},
  {id:'bokchoy', name:'유기농 청경채',   category:'농작물',  price:300, icon:'🥬', meta:'200g',          base:6,  produce:1, loop:0},
  {id:'basil',   name:'바질 화분',       category:'농작물',  price:520, icon:'🌿', meta:'키우는 재미',    base:4,  produce:1, loop:0},
  {id:'frass',   name:'프라스 유기질 비료', category:'순환', price:350, icon:'🌱', meta:'2kg · 내 음식물로 만든 비료', base:20, produce:0, loop:1},
  {id:'egg',     name:'제휴 유기농 계란', category:'제휴식품', price:700, icon:'🥚', meta:'10구 · 파트너 농가', base:30, produce:0, loop:0},
  {id:'tofu',    name:'제휴 국산 두부',   category:'제휴식품', price:280, icon:'🧈', meta:'2모',           base:30, produce:0, loop:0},
  {id:'module',  name:'가정용 BSF 소형 모듈', category:'기기', price:3000, icon:'🪴', meta:'집에서 직접 자원순환', base:10, produce:0, loop:0},
];

const COMPLEXES = ['그린빌 1단지','한강센트럴','샘물마을 3차','푸른숲 아파트','해솔마을','별빛타운'];

// 거주지 데이터셋 (검색·선택용) — 아파트 단지 + 주택가(동 단위). 좌표는 지도(340x272) 기준.
const RESIDENCES = [
  { name:'그린빌 1단지', type:'apt',   x:78,  y:96  },
  { name:'한강센트럴',   type:'apt',   x:206, y:70  },
  { name:'샘물마을 3차', type:'apt',   x:280, y:132 },
  { name:'푸른숲 아파트', type:'apt',   x:120, y:172 },
  { name:'해솔마을',     type:'apt',   x:236, y:200 },
  { name:'별빛타운',     type:'apt',   x:66,  y:214 },
  { name:'행복동 주택가', type:'house', x:40,  y:150 },
  { name:'새싹동 주택가', type:'house', x:158, y:244 },
  { name:'은행나무길',   type:'house', x:250, y:158 },
];

/* ---------------- 스키마 ---------------- */
function migrate(){
  db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, complex TEXT, size TEXT,
    points INTEGER DEFAULT 0,
    is_seed INTEGER DEFAULT 0,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS machines(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, complex TEXT, size TEXT,
    status TEXT, requested_at INTEGER, installed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS batches(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    weight REAL, points INTEGER,
    feed_g REAL, frass_g REAL, water_ml REAL, energy_wh REAL, co2_kg REAL,
    stage TEXT, stage_idx INTEGER, stage_started_at INTEGER,
    created_at INTEGER,
    farm_id INTEGER, crop TEXT,
    produced_item TEXT, produced_qty INTEGER
  );
  CREATE TABLE IF NOT EXISTS purchases(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, item_id TEXT, name TEXT, icon TEXT, cost INTEGER, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS store_items(
    id TEXT PRIMARY KEY, name TEXT, category TEXT, price INTEGER, icon TEXT, meta TEXT,
    base_stock INTEGER DEFAULT 0, produced INTEGER DEFAULT 0, is_produce INTEGER DEFAULT 0, is_loop INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS farms(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, crop TEXT, icon TEXT, growth TEXT,
    moisture REAL, temp REAL, light REAL, ph REAL, ec REAL,
    growth_started_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS farm_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farm_id INTEGER, ts INTEGER, msg TEXT, kind TEXT
  );
  CREATE TABLE IF NOT EXISTS facility_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER, msg TEXT, kind TEXT
  );
  CREATE TABLE IF NOT EXISTS devices(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT,
    status TEXT, fill REAL DEFAULT 0, cycle_started_at INTEGER, cycle_dur INTEGER,
    temp REAL, humidity REAL, activity REAL,
    processed_kg REAL DEFAULT 0, feed_g REAL DEFAULT 0, frass_g REAL DEFAULT 0,
    cycles INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
    item_id TEXT, name TEXT, icon TEXT, qty INTEGER, cost INTEGER, kind TEXT,
    status TEXT, stage_idx INTEGER, stage_started_at INTEGER,
    address TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
  `);
}

/* ---------------- 유틸 ---------------- */
const now = () => Date.now();
const rnd = (a,b) => a + Math.random()*(b-a);
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
function resourcesFor(w){
  return {
    feed_g:  +(w*FACT.feed*1000).toFixed(0),
    frass_g: +(w*FACT.frass*1000).toFixed(0),
    water_ml:+(w*FACT.water*1000).toFixed(0),
    energy_wh:+(w*FACT.energyWh).toFixed(0),
    co2_kg:  +(w*FACT.co2).toFixed(2),
  };
}

/* ---------------- 시드 ---------------- */
function seed(){
  const seeded = db.prepare('SELECT v FROM meta WHERE k=?').get('seeded');
  if(seeded) return;

  // store
  const si = db.prepare('INSERT OR REPLACE INTO store_items(id,name,category,price,icon,meta,base_stock,produced,is_produce,is_loop) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(const s of STORE_SEED) si.run(s.id,s.name,s.category,s.price,s.icon,s.meta,s.base,0,s.produce,s.loop);

  // farms (도시농장)
  const fi = db.prepare('INSERT INTO farms(name,crop,icon,growth,moisture,temp,light,ph,ec,growth_started_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const farmDefs = [
    {name:'Reloop 도시농장 1호', crop:'상추', icon:'🥬', growth:'생장'},
    {name:'Reloop 도시농장 2호', crop:'방울토마토', icon:'🍅', growth:'수확기'},
    {name:'Reloop 도시농장 3호', crop:'청경채', icon:'🥬', growth:'발아'},
    {name:'Reloop 도시농장 4호', crop:'바질', icon:'🌿', growth:'생장'},
  ];
  for(const f of farmDefs){
    const t = SENSOR_TARGETS[f.growth];
    fi.run(f.name,f.crop,f.icon,f.growth,
      rnd(t.moisture[0],t.moisture[1]), rnd(t.temp[0],t.temp[1]), rnd(t.light[0],t.light[1]),
      rnd(t.ph[0],t.ph[1]), rnd(t.ec[0],t.ec[1]), now(), now());
  }

  // seed users + 대량 stored 배치 (파일럿 누적 데이터)
  const hourW = [3,2,2,1,1,2,6,12,11,7,6,7,9,7,6,7,8,11,16,15,12,9,6,4]; // 시간대별 가중치
  const hourCdf = []; let acc=0; for(const w of hourW){ acc+=w; hourCdf.push(acc); }
  const hourTot = acc;
  const weightedHour = () => { const r=Math.random()*hourTot; for(let h=0;h<24;h++) if(r<hourCdf[h]) return h; return 23; };

  const ui = db.prepare('INSERT INTO users(name,complex,size,points,is_seed,created_at) VALUES(?,?,?,?,1,?)');
  const mi = db.prepare('INSERT INTO machines(user_id,complex,size,status,requested_at,installed_at) VALUES(?,?,?,?,?,?)');
  const bi = db.prepare(`INSERT INTO batches(user_id,weight,points,feed_g,frass_g,water_ml,energy_wh,co2_kg,stage,stage_idx,stage_started_at,created_at,crop,produced_item,produced_qty)
                         VALUES(?,?,?,?,?,?,?,?, 'stored',5,?,?,?,?,?)`);
  const names = ['김서연','이준호','박민지','최우진','정하윤','강도현','윤지아','임서준','한예은','오태윤','신유나','장현우'];

  db.exec('BEGIN');
  const perComplex = COMPLEXES.map((c,i)=>({complex:c, machineId:null}));
  // 단지별 회수기 설치
  const seedMachineUsers = [];
  for(const c of COMPLEXES){
    const uid = ui.run('관리자('+c+')', c, '500~1,000세대', 0, now()-rnd(20,60)*86400000).lastInsertRowid;
    mi.run(uid, c, '500~1,000세대', 'installed', now()-rnd(20,60)*86400000, now()-rnd(15,40)*86400000);
    seedMachineUsers.push({uid, complex:c});
  }
  // 참여 세대(시드 유저) + 배치
  const DAY = 86400000;
  for(let k=0;k<46;k++){
    const complex = pick(COMPLEXES);
    const uid = ui.run(pick(names), complex, '500~1,000세대', Math.round(rnd(0,1200)), now()-rnd(1,50)*DAY).lastInsertRowid;
    const nBatch = Math.floor(rnd(20,70));
    for(let b=0;b<nBatch;b++){
      const dayOff = Math.floor(rnd(0,9));
      const h = weightedHour();
      const d = new Date(now() - dayOff*DAY);
      d.setHours(h, Math.floor(rnd(0,60)), 0, 0);
      let ts = d.getTime();
      if(ts > now()) ts -= DAY; // 미래 방지
      const w = +rnd(0.2,1.5).toFixed(2);
      const r = resourcesFor(w);
      const crop = pick(CROPS);
      const qty = Math.max(1, Math.round(w*2));
      bi.run(uid, w, Math.round(w*FACT.pointsPerKg), r.feed_g,r.frass_g,r.water_ml,r.energy_wh,r.co2_kg,
             ts, ts, crop.crop, crop.item, qty);
      // 스토어 재고에 반영
      db.prepare('UPDATE store_items SET produced=produced+? WHERE id=? AND is_produce=1').run(qty, crop.item);
    }
  }
  db.prepare('INSERT INTO meta(k,v) VALUES(?,?)').run('seeded', String(now()));
  db.exec('COMMIT');
}

migrate();
seed();

module.exports = { db, FACT, STAGES, ORDER_STAGES, CROPS, SENSOR_TARGETS, SENSOR_META, STORE_SEED, COMPLEXES, RESIDENCES, now, rnd, pick, resourcesFor };
