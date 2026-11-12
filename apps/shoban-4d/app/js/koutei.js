// 床版取替工事の工程と重機の定義（日数・能力は説明用の目安）
// ⚠️ 日数・クレーン能力は「仮の目安」。性能表・実績に差し替える前提。

export const MACHINES = {
  // クレーン（M＝定格モーメントの仮の目安 t・m。吊れる重さ ≒ min(最大, M ÷ 作業半径)）
  rt25:      { name: 'ラフテレーンクレーン 25t',   kind: 'crane', cfg: { len: 9.5,  wid: 2.6, maxT: 25,  M: 40,  color: 0xf2c200 } },
  rt50:      { name: 'ラフテレーンクレーン 50t',   kind: 'crane', cfg: { len: 11.5, wid: 2.8, maxT: 50,  M: 100, color: 0xf2c200 } },
  at100:     { name: 'オールテレーンクレーン 100t', kind: 'crane', cfg: { len: 13.5, wid: 2.8, maxT: 100, M: 250, color: 0xeeeeee } },
  at220:     { name: 'オールテレーンクレーン 220t', kind: 'crane', cfg: { len: 16,   wid: 3.0, maxT: 220, M: 500, color: 0xeeeeee } },
  crawler80: { name: 'クローラクレーン 80t',       kind: 'crane', cfg: { len: 8.5,  wid: 4.6, maxT: 80,  M: 200, color: 0x2f6fb5, crawler: true } },
  gantry:    { name: '床版架設機（門型）',          kind: 'gantry', cfg: { maxT: 20 } },
  // 運搬
  trailer_semi: { name: 'セミトレーラー',   kind: 'truck', cfg: { type: 'semi' } },
  trailer_low:  { name: '低床トレーラー',   kind: 'truck', cfg: { type: 'low' } },
  dump10:       { name: '10tダンプ',        kind: 'truck', cfg: { type: 'dump' } },
  sweeper:      { name: '路面清掃車（スイーパー）', kind: 'sweeper', cfg: {} },
  // 切削・切断・はつり
  sesakuki:   { name: '路面切削機',             kind: 'miller', cfg: {} },
  wiresaw:    { name: 'ワイヤーソー',           kind: 'saw', cfg: { type: 'wire' } },
  cutter:     { name: 'コンクリートカッター',   kind: 'saw', cfg: { type: 'cutter' } },
  roadcutter: { name: 'ロードカッター（大型カッター）', kind: 'saw', cfg: { type: 'road' } },
  wallsaw:    { name: 'ウォールソー',           kind: 'saw', cfg: { type: 'wall' } },
  backhoe:    { name: 'バックホウ（ブレーカ）', kind: 'backhoe', cfg: {} },
  // 足場・高所
  kosho:  { name: '高所作業車', kind: 'aerial', cfg: {} },
  tenken: { name: '橋梁点検車', kind: 'inspect', cfg: {} },
  // 規制
  hyoshiki:  { name: '標識車',       kind: 'signtruck', cfg: { type: 'board' } },
  kiseizai:  { name: '規制材運搬車', kind: 'signtruck', cfg: { type: 'cones' } },
  yajirushi: { name: '矢印板車',     kind: 'signtruck', cfg: { type: 'arrow' } },
  // 桁・間詰め
  kerenki:   { name: 'ケレン機（小型）',       kind: 'smallcart', cfg: {} },
  pump:      { name: 'コンクリートポンプ車',   kind: 'pump', cfg: {} },
  mortar:    { name: 'モルタルミキサー',       kind: 'mixer', cfg: {} },
  generator: { name: '発電機',                 kind: 'generator', cfg: {} },
  // 舗装・区画線
  finisher:  { name: 'アスファルトフィニッシャー', kind: 'finisher', cfg: {} },
  macadam:   { name: 'マカダムローラー',           kind: 'roller', cfg: { type: 'macadam' } },
  tire:      { name: 'タイヤローラー',             kind: 'roller', cfg: { type: 'tire' } },
  kukakusen: { name: '区画線施工車',               kind: 'linetruck', cfg: {} },
};

// 工程（key → 名前・色・選べる重機の枠）
export const PHASES = {
  genkyo:   { name: '現況（供用中）', color: '#7d8796', slots: [] },
  kisei:    { name: '交通規制', color: '#e07b00', slots: [{ k: 'main', label: '規制車両', opt: ['hyoshiki', 'kiseizai', 'yajirushi'] }] },
  ashiba:   { name: '足場（吊り足場）', color: '#b0892f', slots: [{ k: 'main', label: '作業車', opt: ['kosho', 'tenken', 'rt25'] }] },
  kirikae:  { name: '規制の切替（反対側へ）', color: '#e07b00', slots: [], uses: 'kisei' },
  sesaku:   { name: '舗装切削', color: '#5a5f6b', slots: [{ k: 'main', label: '切削', opt: ['sesakuki'] }, { k: 'haul', label: '積込み', opt: ['dump10', 'sweeper'] }] },
  kouran:   { name: '地覆・高欄撤去', color: '#8b5a2b', slots: [{ k: 'cut', label: '切断', opt: ['wiresaw', 'cutter'] }, { k: 'crane', label: '吊り出し', opt: ['rt25', 'rt50'] }] },
  shinshuku:{ name: '伸縮装置撤去', color: '#6b4a8b', slots: [{ k: 'main', label: '撤去', opt: ['backhoe', 'cutter'] }] },
  setsudan: { name: '床版切断', color: '#a33b3b', slots: [{ k: 'main', label: '切断', opt: ['roadcutter', 'wiresaw', 'wallsaw'] }] },
  tekkyo:   { name: '既設床版の撤去・搬出', color: '#c0392b', slots: [{ k: 'crane', label: 'クレーン', opt: ['rt50', 'at100', 'at220', 'crawler80', 'rt25'] }, { k: 'haul', label: '搬出', opt: ['trailer_semi', 'trailer_low', 'dump10'] }] },
  ketajomen:{ name: '桁上面処理（さび落とし・塗装）', color: '#7a6a3a', slots: [{ k: 'main', label: '作業機', opt: ['kerenki', 'kosho'] }] },
  hannyu:   { name: 'PC床版の搬入', color: '#2e7d5b', slots: [{ k: 'haul', label: '運搬', opt: ['trailer_low', 'trailer_semi'] }] },
  kasetsu:  { name: 'PC床版の架設（1枚ずつ）', color: '#1f8a4c', slots: [{ k: 'crane', label: 'クレーン', opt: ['rt50', 'at100', 'at220', 'gantry', 'crawler80'] }] },
  mazume:   { name: '間詰め・接合（ずれ止め・床版下充填）', color: '#3c7c8c', slots: [{ k: 'main', label: '機械', opt: ['pump', 'mortar', 'generator'] }] },
  tatemeji: { name: '縦目地（左右の床版をつなぐ）', color: '#2f6b8c', slots: [{ k: 'main', label: '機械', opt: ['pump', 'mortar'] }] },
  hosou:    { name: '防水・舗装', color: '#333a44', slots: [{ k: 'pave', label: '敷きならし', opt: ['finisher'] }, { k: 'roll', label: '締固め', opt: ['macadam', 'tire'] }] },
  futaku:   { name: '伸縮装置・地覆高欄・区画線', color: '#556b2f', slots: [{ k: 'crane', label: '吊り込み', opt: ['rt25', 'rt50', 'pump'] }, { k: 'line', label: '区画線', opt: ['kukakusen'] }] },
  ashiba_tekkyo: { name: '足場撤去', color: '#b0892f', slots: [{ k: 'main', label: '作業車', opt: ['kosho', 'tenken'] }] },
  kaijo:    { name: '規制解除・供用開始', color: '#1b6ac9', slots: [] },
};

export const DEFAULT_PARAMS = {
  L: 40,            // 橋長 m
  W: 9.5,           // 全幅 m
  spans: 2,         // 径間数
  girders: 4,       // 主桁本数
  H: 7,             // 路面の地上高 m
  panelW: 2.0,      // PC床版の橋軸方向の幅 m（仮）
  panelT: 0.20,     // PC床版の厚さ m
  blockLen: 2.0,    // 撤去ブロックの橋軸方向の長さ m（仮）
  perDay: 6,        // 1日の架設枚数（仮）
  method: 'half',   // half=片側交互通行（半断面施工）／full=全面通行止め
  studOrder: 'after', // before=桁上面処理で先に溶接／after=架設後に間詰めとまとめて溶接
  railType: 'wall', // 新しい高欄：wall=壁高欄（コンクリート）／steel=鋼製高欄
  soundWall: 'none', // 遮音壁：none／both／left／right（今ある物を外し、新しく付け直す）
  terrain: true,    // 地形（国土地理院の標高）・建物・電柱（OpenStreetMap）を表示
  zMode: 'auto',    // 路面の高さの合わせ方：auto＝地形（標高）から自動／manual＝始点・終点の標高を手入力
  zStart: null,     // 始点（起点側）の路面の標高 m
  zEnd: null,       // 終点側の路面の標高 m
  carKmh: 20,       // 車の速さ（km/h・再生速度×1のとき）
  lanes: 2,         // 車線数：1＝1車線（交互に通る・施工は全面通行止め）／2＝2車線
};

// 役所向けの説明（やさしい言葉）
export const PLAIN = {
  genkyo: '工事を始める前の、いまの橋のようすです。',
  kisei: '工事のために、車線の規制（コーン・看板・誘導員）を始めます。',
  ashiba: '橋の下に、作業用の吊り足場をつけます。下の道路や川に物が落ちないよう防護します。',
  kirikae: '工事する側を反対側に切り替えます。通る車線も入れ替わります。',
  sesaku: '古い舗装（アスファルト）を削り取ります。',
  kouran: '古い橋のふち（地覆・高欄）を切って、クレーンで運び出します。',
  shinshuku: '橋の継ぎ目の金具（伸縮装置）を外します。',
  setsudan: '古いコンクリートの床（床版）を、運べる大きさに切ります。',
  tekkyo: '切った床版をクレーンで1つずつ吊り上げ、トラックで運び出します。',
  ketajomen: '床版を外した鋼の桁の上面のさびを落とし、塗装します。',
  hannyu: '工場で作った新しい床版（プレキャストPC床版）を運び込みます。',
  kasetsu: '新しい床版を、クレーンで1枚ずつ架けていきます。',
  mazume: '床版どうしのすき間をコンクリートで埋めて、一体にします。',
  tatemeji: '左右の床版のつなぎ目をコンクリートで埋めます。',
  hosou: '水がしみこまない膜を貼り、新しい舗装をします。',
  futaku: '継ぎ目の金具、橋のふち（高欄）、白線を新しくします。',
  ashiba_tekkyo: '橋の下の足場を外します。',
  kaijo: '規制を解除し、車が元どおり2車線で通れるようになります。',
};

export function defaultMachines() {
  const m = {};
  for (const [k, ph] of Object.entries(PHASES)) {
    m[k] = {};
    for (const s of ph.slots) m[k][s.k] = s.opt[0];
  }
  return m;
}

// 寸法から数量を出す
export function quantities(P) {
  const sides = P.method === 'half' ? 2 : 1;
  const nBx = Math.max(1, Math.ceil(P.L / P.blockLen - 1e-6));
  const nPx = Math.max(1, Math.ceil(P.L / P.panelW - 1e-6));
  const panelWidthZ = P.method === 'half' ? P.W / 2 : P.W;
  const panelTon = (P.L / nPx) * panelWidthZ * P.panelT * 2.5;           // PC床版1枚の重さ（t）
  const blockTon = (P.L / nBx) * (P.W / 2) * 0.22 * 2.5;                  // 撤去ブロック1つの重さ（旧床版厚0.22m仮定）
  return { sides, nBx, nPx, panelWidthZ, panelTon, blockTon, nBlocksTotal: nBx * 2, nPanelsTotal: nPx * sides };
}

// 工程の並びを作る（半断面なら左右を順に施工し、縦目地を入れる）
export function buildPlan(P) {
  const Q = quantities(P);
  const list = [];
  const push = (key, side, dur, days) => list.push({ key, side, dur, days, name: PHASES[key].name, color: PHASES[key].color });
  const sideList = P.method === 'half' ? [0, 1] : ['all'];
  const blocksPerSide = P.method === 'half' ? Q.nBx : Q.nBx * 2;
  const panelsPerSide = Q.nPx;
  const railSegs = Math.max(2, Math.ceil(P.L / 5));
  const railPerSide = P.method === 'half' ? railSegs : railSegs * 2;

  push('genkyo', null, 7, 0);
  push('kisei', null, 9, 1);
  push('ashiba', null, 5 + P.spans * 2.5, Math.max(2, Math.ceil(P.L / 20)));
  for (const s of sideList) {
    if (s === 1) push('kirikae', 1, 6, 1);
    push('sesaku', s, 9, 1);
    push('kouran', s, Math.min(80, railPerSide * 3.4), Math.max(1, Math.ceil(P.L / 30)));
    push('shinshuku', s, 6, 1);
    push('setsudan', s, 9, Math.max(1, Math.ceil(blocksPerSide / 30)));
    push('tekkyo', s, blocksPerSide * 4.6, Math.ceil(blocksPerSide / P.perDay));
    push('ketajomen', s, 7, Math.max(2, Math.ceil(P.L / 25)));
    push('hannyu', s, 6, 0);
    push('kasetsu', s, panelsPerSide * 5.5 + (Math.ceil(panelsPerSide / P.perDay) - 1) * 3, Math.ceil(panelsPerSide / P.perDay));
    push('mazume', s, 8, Math.max(2, Math.ceil(panelsPerSide / 10)));
    if (s === 1) push('tatemeji', null, 6, 2);
    push('hosou', s, 11, 2);
  }
  push('futaku', null, 14, Math.max(3, Math.ceil(P.L / 15)));
  push('ashiba_tekkyo', null, 7, Math.max(2, Math.ceil(P.L / 25)));
  push('kaijo', null, 16, 1);

  let t = 0, d = 0;
  for (const ph of list) { ph.t0 = t; ph.t1 = t + ph.dur; t = ph.t1; ph.d0 = d; d += ph.days; }
  return { phases: list, total: t, totalDays: d, Q };
}

// クレーンの能力の目安（仮）
export function craneCheck(machineId, radius, ton) {
  const M = MACHINES[machineId];
  if (!M) return null;
  if (M.kind === 'gantry') {
    const cap = M.cfg.maxT;
    return { cap, ok: ton <= cap * 0.9, warn: ton > cap * 0.75 };
  }
  if (M.kind !== 'crane') return null;
  const cap = Math.min(M.cfg.maxT, M.cfg.M / Math.max(radius, 3));
  return { cap, ok: ton <= cap * 0.9, warn: ton > cap * 0.75 };
}
