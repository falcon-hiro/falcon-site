// 床版架替 4Dシミュレーター（株式会社ファルコン）— 画面と3Dの本体
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as K from './koutei.js';
import * as M from './models.js';
import * as C from './catalog.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const fmt = (v, d = 1) => Number(v).toFixed(d);

// ───── 状態 ─────
const S = {
  site: null,                       // {lat, lon, theta, L, name}
  P: { ...K.DEFAULT_PARAMS },
  mach: K.defaultMachines(),
  liv: null,                        // 工程の重機の色・模様（null＝機種ごとの既定）
  parts: [],                        // 部品ライブラリから置いた部品
  t: 0, playing: false, speed: 4, follow: true,
};
let plan = null, G = null, U = [], ANIM = [], FOCUS = null, root = null, sceneRoot = null, labelGroup = null, nameSeq = 0, groundGroup = null;
let CHECKS = {};                    // クレーンの能力の目安
let TRAFFIC = 'normal';             // いまの通行のしかた
S.out = 'gyosha';                   // 出力の種類：gyosha＝工事関係者との打合せ用（目安）／yakusho＝役所・住民説明向け
const WEB = document.body.classList.contains('web');   // HP用（ブラウザだけで動く版）
const TRAFFIC_TEXT = { normal: '通行：いつもどおり2車線で通れます', alt: '通行：片側交互通行（仮設信号で交互に通れます）', closed: '通行：全面通行止め（迂回路をご利用ください）' };
const PH = {};                      // key_side → phase

// ───── 3D基盤 ─────
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc4d8ec); scene.fog = new THREE.Fog(0xd3e0ea, 500, 2400);
// 空（太陽の向きに合わせた大気の色）。同じ空を物の表面の映り込み（環境光）にも使う
const SUN_DIR = new THREE.Vector3(-0.6, 1.1, 0.8).normalize();
function makeSky(k = 1) { const s = new Sky(); s.scale.setScalar(5000); const u = s.material.uniforms; u.turbidity.value = 2.5; u.rayleigh.value = 1.7; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(SUN_DIR);
  if (k !== 1) s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', `gl_FragColor = vec4( retColor * ${k.toFixed(2)}, 1.0 );`);   // 映り込み用は明るさを抑える
  return s; }
scene.add(makeSky());
{ const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(makeSky(0.38)); scene.environment = pm.fromScene(es, 0, 1, 6000).texture; pm.dispose(); }
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6b7a55, 0.35));
const sun = new THREE.DirectionalLight(0xfff3e0, 3.0); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; scene.add(sun); scene.add(sun.target);
function resize() { const r = view.getBoundingClientRect(); renderer.setSize(r.width, r.height); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(view);

// 登録（Blender書き出しで動きを焼き付ける対象）
function R(o) { o.name = 'n' + (++nameSeq); ANIM.push(o); return o; }
function Rdeep(o) { o.traverse(c => R(c)); return o; }
const ph = (key, side = null) => PH[key + '_' + side] || null;
const prog = (p, t) => p ? clamp((t - p.t0) / p.dur, 0, 1) : 0;
const act = (p, t) => !!p && t >= p.t0 && t < p.t1;
const isHalf = () => S.P.method === 'half';
const sideZ = s => isHalf() ? (s === 0 ? -S.P.W / 4 : S.P.W / 4) : 0;
const paveSides = s => (s === 'all' || s === null) ? [0, 1] : [s];
const sel = (key, slot) => (S.mach[key] && S.mach[key][slot]) || K.PHASES[key].slots.find(x => x.k === slot)?.opt[0];

// 通り抜け作業（切削・切断・舗装など）：n回の往復のうち、いまの位置と「済んだか」
function passes(p, n, xa, xb) {
  const f = p * n; const k = Math.min(n - 1, Math.floor(f)); const q = clamp(f - k, 0, 1);
  const dir = k % 2 === 0 ? 1 : -1; const x = dir > 0 ? lerp(xa, xb, q) : lerp(xb, xa, q);
  return { k, q, dir, x, done: (ki, xx) => f >= ki + 1 ? true : (k < ki || p <= 0 ? false : (ki === k ? (dir > 0 ? xx < x : xx > x) : true)) };
}
// 吊り作業の軌跡（クレーン中心まわりの極座標で旋回）
function liftPose(q, c, pick, drop, liftY, off, rotA = 0, rotB = 0) {
  const pol = p => ({ a: Math.atan2(-(p.z - c.z), p.x - c.x), r: Math.hypot(p.x - c.x, p.z - c.z) });
  const fp = (a, r, y) => ({ x: c.x + r * Math.cos(a), y, z: c.z - r * Math.sin(a) });
  const P = pol(pick), D = pol(drop);
  let da = D.a - P.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  // 段取り：空のフックを戻す→下ろす→玉掛け（止まる）→地切り・ゆっくり巻上げ→旋回→揺れを止めながら巻下げ→玉外し→フックを上げる
  let load = { ...pick }, hook, rot = rotA, stage = 0, slung = false, sway = 0, ang = P.a;
  if (q < 0.10) { const v = sm(q / 0.10); hook = fp(P.a + da * (1 - v), lerp(D.r, P.r, v), liftY + off); }
  else if (q < 0.17) { const v = sm((q - 0.10) / 0.07); hook = { x: pick.x, y: lerp(liftY + off, pick.y + off, v), z: pick.z }; }
  else if (q < 0.25) { slung = true; }
  else if (q < 0.37) { const v = (q - 0.25) / 0.12; const e = v < 0.15 ? v * v / 0.3 : v - 0.075; load = { ...pick, y: lerp(pick.y, liftY, clamp(e / 0.925, 0, 1)) }; stage = 1; slung = true; }
  else if (q < 0.64) { const v = sm((q - 0.37) / 0.27); ang = P.a + da * v; load = fp(ang, lerp(P.r, D.r, v), liftY); rot = lerp(rotA, rotB, v); stage = 1; slung = true; sway = -0.45 * Math.sin(Math.PI * 2 * v) * Math.sign(da || 1); }
  else if (q < 0.80) { const u = (q - 0.64) / 0.16; const v = sm(clamp((u - 0.15) / 0.85, 0, 1)); ang = D.a; load = { ...drop, y: lerp(liftY, drop.y, v) }; rot = rotB; stage = 1; slung = true; sway = 0.35 * Math.exp(-5 * u) * Math.sin(u * 14) * Math.sign(da || 1); }
  else if (q < 0.86) { load = { ...drop }; rot = rotB; stage = 2; slung = true; }
  else { load = { ...drop }; rot = rotB; stage = 2; const v = sm((q - 0.86) / 0.14); hook = { x: drop.x, y: lerp(drop.y + off, liftY + off, v), z: drop.z }; }
  if (sway) { const tx = -Math.sin(ang), tz = -Math.cos(ang); load = { x: load.x + tx * sway, y: load.y, z: load.z + tz * sway }; }
  if (!hook) hook = { x: load.x, y: load.y + off, z: load.z };
  return { load, hook, rot, stage, slung, boom: Math.max(P.r, D.r) * 1.12 + 2.5 };
}
// クレーンの姿勢＋玉掛けワイヤー（pts＝荷の吊り点。無ければワイヤーを外す）
function poseCrane(g, hook, boomLen, pts, stow = 0) {
  if (g.userData.type !== 'crane') return;
  const o = g.position;
  if (stow > 0) { // 走るときはブームを縮めて前へ倒す（格納姿勢）
    const u = g.userData, s = sm(stow), sp = { x: o.x + u.L1 - 0.65, y: o.y + u.footY - 0.4, z: o.z };
    hook = { x: lerp(hook.x, sp.x, s), y: lerp(hook.y, sp.y, s), z: lerp(hook.z, sp.z, s) }; boomLen = lerp(boomLen || u.L1, u.L1, s); if (s > 0.01) pts = null;
  }
  M.setCranePose(g, { x: hook.x - o.x, y: hook.y - o.y, z: hook.z - o.z }, boomLen);
  M.setSlings(g, { x: hook.x - o.x, y: hook.y - o.y - 0.25, z: hook.z - o.z }, pts ? pts.map(p => ({ x: p.x - o.x, y: p.y - o.y, z: p.z - o.z })) : null);
}
// 荷の吊り点（4点）：中心 c・向き rot・半分の大きさ hx/hz・上面の高さ top
function liftPts(c, rot, hx, hz, top) { const co = Math.cos(rot), si = Math.sin(rot); return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => { const lx = a * hx * 0.7, lz = b * hz * 0.7; return { x: c.x + lx * co + lz * si, y: c.y + top, z: c.z - lx * si + lz * co }; }); }
// 据え替え：前の場所から次の場所へ（アウトリガーを格納→走行→張り出し）。同じ場所ならそのまま吊る
function relocate(prev, cur, q) {
  if (Math.abs(cur - prev) < 0.01) return { x: cur, q2: q, e: 1 };
  if (q < 0.05) return { x: prev, q2: 0, e: 1 - q / 0.05 };
  if (q < 0.16) return { x: lerp(prev, cur, sm((q - 0.05) / 0.11)), q2: 0, e: 0 };
  if (q < 0.21) return { x: cur, q2: 0, e: (q - 0.16) / 0.05 };
  return { x: cur, q2: (q - 0.21) / 0.79, e: 1 };
}
// クレーンの据え位置：作業半径が大きくなりすぎたら（小さくなりすぎたら）据え替える
function stations(xs, offset, lo, hi, minR, maxR) { const st = []; let cur = null; for (const x of xs) { const d = Math.abs(x - (cur ?? 1e9)); if (cur === null || d < minR || d > maxR) cur = clamp(x + offset, lo, hi); st.push(cur); } return st; }
// タイヤを回す（進んだ距離÷半径）
const VEH = [];
const GATES = [], WORKV = [];   // 規制の出入口（扉）・工事の車両
function trackWheels(g) { const w = [], st = []; g.traverse(c => { if (c.userData && c.userData.wheelR) w.push(c); if (c.userData && c.userData.steer) st.push(c); }); if (w.length) VEH.push({ g, w, st }); }
function spinWheels() { for (const v of VEH) { if (!v.g.visible) continue; const dir = Math.cos(v.g.rotation.y) >= 0 ? 1 : -1; for (const m of v.w) m.rotation.y = -dir * v.g.position.x / m.userData.wheelR; for (const p of v.st) p.rotation.y = v.g.userData.steerAng || 0; } }
// 走る道筋：x の関数として横位置 z（車線を移るところはS字）
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function lanePath(zFar, zNear, xs, xe) { return x => { const u = clamp((x - xs) / (xe - xs), 0, 1); return lerp(zFar, zNear, sm(u)); }; }
// 車を道筋の上に置く：向き（前＝dir）・前輪のかじ角・トレーラーの折れ角を道筋から決める
function drive(g, x, y, zf, dir) {
  const z = zf(x), d = 0.6 * dir, a = Math.atan2(-(zf(x + d) - z), d);
  g.position.set(x, y, z); g.rotation.y = a;
  const fx = x + 3 * dir, a2 = Math.atan2(-(zf(fx + d) - zf(fx)), d);
  g.userData.steerAng = clamp(wrapA(a2 - a) * 2.2, -0.6, 0.6);
  const u = g.userData;
  if (u.trailer) {
    const hx = x + Math.cos(a) * u.hitchX, hz = z - Math.sin(a) * u.hitchX;
    const rx = hx - dir * u.trailerLen, rz = zf(rx);
    u.trailer.rotation.y = clamp(wrapA(Math.atan2(-(hz - rz), hx - rx) - a), -0.9, 0.9);
  }
}
// 荷台の上面の中心（橋の座標）と向き
const _bv = new THREE.Vector3();
function bedPos(g) { const u = g.userData; const par = u.trailer || (u.bedOnBody ? u.body : g); _bv.set(u.bedLocalX ?? u.bedCenterX, u.bedOnBody ? 0.12 : u.bedTopY, 0); g.updateMatrixWorld(true); par.localToWorld(_bv); root.worldToLocal(_bv); return { x: _bv.x, y: _bv.y, z: _bv.z }; }
const bedYaw = g => g.rotation.y + (g.userData.trailer ? g.userData.trailer.rotation.y : 0);

// ───── 機械をつくる ─────
function defaultMachineLivery(id) { const c = K.MACHINES[id]?.cfg?.color; return { body: c ?? 0xf2c200, accent: 0x1b2a4a, pattern: 'solid' }; }
function mk(id, hide = true) {
  const md = K.MACHINES[id]; M.setLivery(md && md.kind === 'signtruck' ? null : (S.liv || defaultMachineLivery(id)));
  let g;
  try {
    switch (md.kind) {
      case 'crane': g = M.crane(md.cfg); break;
      case 'gantry': g = M.gantry(isHalf() ? S.P.W / 2 : S.P.W); break;
      case 'truck': g = M.truck(md.cfg.type); break;
      case 'sweeper': g = M.sweeper(); break;
      case 'miller': g = M.miller(); break;
      case 'saw': g = M.saw(md.cfg.type); break;
      case 'backhoe': g = M.backhoe(); break;
      case 'aerial': g = M.aerial(); break;
      case 'inspect': g = M.inspect(); break;
      case 'signtruck': g = M.signtruck(md.cfg.type); break;
      case 'smallcart': g = M.smallcart(); break;
      case 'pump': g = M.pump(); break;
      case 'mixer': g = M.mixer(); break;
      case 'generator': g = M.generator(); break;
      case 'finisher': g = M.finisher(); break;
      case 'roller': g = M.roller(md.cfg.type); break;
      case 'linetruck': g = M.linetruck(); break;
      default: g = new THREE.Group();
    }
  } finally { M.setLivery(null); }
  g.userData.mid = id; root.add(g); Rdeep(g); trackWheels(g); if (hide) g.visible = false;
  if (['truck', 'crane', 'signtruck', 'pump', 'aerial', 'inspect', 'linetruck', 'sweeper', 'miller', 'finisher', 'roller'].includes(md.kind)) WORKV.push(g);
  return g;
}
// 遮音壁（高欄の上に、柱と半透明の板）
const swOn = e => { const s = S.P.soundWall; return s === 'both' || (s === 'left' && e === 0) || (s === 'right' && e === 1); };
function addSoundWall(g, len, color) {
  const y0 = 1.35, h = 2.6;
  for (let x = -len / 2 + 0.05; x <= len / 2; x += 2.0) g.add(M.box(0.15, h + 0.1, 0.15, 0x7c8691, x, y0 + h / 2, 0, { metal: 0.4 }));
  g.add(M.box(len - 0.05, h, 0.06, color, 0, y0 + h / 2, 0, { opacity: 0.5, double: true }));
  g.add(M.box(len - 0.05, 0.12, 0.1, 0x7c8691, 0, y0 + h, 0));
}
function crew(n) { const a = []; for (let i = 0; i < n; i++) { const p = M.person(i % 2 ? 0xffd400 : 0xff7a00); root.add(p); Rdeep(p); p.visible = false; a.push(p); } return a; }

// ───── 世界をつくる ─────
function buildWorld() {
  if (sceneRoot) scene.remove(sceneRoot);
  sceneRoot = new THREE.Group(); sceneRoot.name = 'root'; scene.add(sceneRoot);
  root = new THREE.Group(); root.name = 'bim'; sceneRoot.add(root);      // 橋と工事（縦断勾配で傾ける）
  if (labelGroup) scene.remove(labelGroup);
  labelGroup = new THREE.Group(); scene.add(labelGroup);                  // 始点・終点の札（書き出さない）
  U = []; ANIM = []; nameSeq = 0; CHECKS = {}; VEH.length = 0; GATES.length = 0; WORKV.length = 0;
  for (const k in PH) delete PH[k];
  if (S.P.lanes === 1 && S.P.method === 'half') S.P.method = 'full';   // 1車線の橋は半分ずつの施工ができない＝全面通行止め
  plan = K.buildPlan(S.P);
  plan.phases.forEach(p => PH[p.key + '_' + p.side] = p);
  const P = S.P, Q = plan.Q;
  const W = P.W, Lb = P.L, x0 = -Lb / 2, x1 = Lb / 2, H = P.H, paveT = 0.08, oldT = 0.22;
  const yG = H - paveT - oldT, hg = clamp(Lb / P.spans / 18, 1.0, 2.8), curbW = 0.5;
  const roadHalf = W / 2 - curbW, laneOff = roadHalf / 2, A = 70;
  const bl = Lb / Q.nBx, pw = Lb / Q.nPx, pWZ = Q.panelWidthZ, deckTop = H - paveT;
  const xa = x0 - 48, xb = x1 + 48;
  G = { W, Lb, x0, x1, H, yG, hg, roadHalf, laneOff, A, bl, pw, deckTop, xa, xb };
  // 縦断勾配：始点・終点の路面標高の差だけ、橋の中央（路面）を軸に傾ける
  const zA = Number.isFinite(P.zStart) ? P.zStart : null, zB = Number.isFinite(P.zEnd) ? P.zEnd : null;
  const th = (zA !== null && zB !== null) ? Math.atan2(zB - zA, Lb) : 0;
  root.rotation.z = th; root.position.set(H * Math.sin(th), H * (1 - Math.cos(th)), 0);
  root.updateMatrixWorld(true);
  G.zA = zA; G.zB = zB; G.grade = Math.tan(th) * 100;
  for (const [x, txt] of [[x0, '始点'], [x1, '終点']]) {
    const z = x < 0 ? zA : zB;
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g2 = c.getContext('2d');
    g2.fillStyle = x < 0 ? '#1f8a4c' : '#c0392b'; g2.fillRect(0, 0, 256, 96); g2.fillStyle = '#fff'; g2.textAlign = 'center';
    g2.font = 'bold 40px "Yu Gothic",sans-serif'; g2.fillText(txt, 128, 44); g2.font = '26px "Yu Gothic",sans-serif'; g2.fillText(z !== null ? `標高 ${fmt(z, 2)}m` : '標高 未設定', 128, 82);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(4.4, 1.65, 1); sp.renderOrder = 10;
    sp.position.copy(root.localToWorld(new THREE.Vector3(x, H + 6, 0))); labelGroup.add(sp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.5, 6), new THREE.MeshBasicMaterial({ color: x < 0 ? 0x1f8a4c : 0xc0392b }));
    pole.position.copy(root.localToWorld(new THREE.Vector3(x, H + 2.6, 0))); labelGroup.add(pole);
  }
  const onDeck = x => (x >= x0 && x <= x1) ? deckTop : H;
  // ポンプ車の据え位置：8mごとに据え替え（アウトリガをたたむ→動く→張る）。cur＝打設している位置
  const pumpStep = cur => {
    const base = x0 - 14, raw = clamp(cur - 12, x0 - 14, x1 - 12), k = (raw - base) / 8, fl = Math.floor(k), fr = k - fl;
    const px = base + (fl + sm(clamp((fr - 0.9) / 0.07, 0, 1))) * 8;
    const e = fr < 0.85 ? 1 : fr < 0.9 ? 1 - sm((fr - 0.85) / 0.05) : fr < 0.97 ? 0 : sm((fr - 0.97) / 0.03);
    return { px, e };
  };

  // 色（舗装・コンクリート・草の色は、ざらつきの模様つきの面として登録する）
  const cOld = 0x9c9a92, cNew = 0xc9c6bd, cSteel = 0x5f7d95, cAsOld = 0x5e5f63, cAsNew = 0x3c3d42;
  for (const c of [cAsOld, cAsNew]) M.setSurface(c, 'asphalt');
  for (const c of [cOld, cNew, 0xb5b1a7, 0xd2cfc6, 0xbdb9b0]) M.setSurface(c, 'concrete');
  for (const c of [0x8a8f5e, 0x8c9a72]) M.setSurface(c, 'grass');
  buildGround(Lb);
  // 橋台・取付道路
  for (const s of [-1, 1]) {
    const xe = s * (Lb / 2 + 1.5), dep = S.site ? 15 : 0;   // 地形があるときは地中まで伸ばす
    root.add(M.box(3, H - 0.3 + dep, W + 1.5, 0xb5b1a7, xe, (H - 0.3 - dep) / 2, 0));
    const xr = s * (Lb / 2 + 3 + A / 2);
    if (!(S.site && P.terrain)) root.add(M.box(A, H - 0.3 + dep, W + 6, 0x8a8f5e, xr, (H - 0.3 - dep) / 2, 0));   // 地形があるときは盛土の箱を置かない
    root.add(M.box(A + 3, 0.3, W, cAsNew, s * (Lb / 2 + (A + 3) / 2), H - 0.15, 0));
    for (const z of [-roadHalf + 0.15, roadHalf - 0.15]) root.add(M.box(A + 3, 0.012, 0.15, 0xf2f2f2, s * (Lb / 2 + (A + 3) / 2), H + 0.006, z));
    if (P.lanes !== 1) for (let x = 0; x < A; x += 6) root.add(M.box(3, 0.012, 0.15, 0xf2f2f2, s * (Lb / 2 + 4 + x), H + 0.006, 0));
    for (const z of [-W / 2 + 0.15, W / 2 - 0.15]) {
      root.add(M.box(A, 0.32, 0.06, 0xd8d8d8, s * (Lb / 2 + 3 + A / 2), H + 0.6, z)); for (let x = 0; x <= A; x += 8) root.add(M.box(0.12, 0.75, 0.12, 0x9a9a9a, s * (Lb / 2 + 3 + x), H + 0.38, z));
      if (swOn(z < 0 ? 0 : 1)) { const g = new THREE.Group(); g.position.set(s * (Lb / 2 + 3 + A * 0.3), H - 0.6, z); addSoundWall(g, A * 0.6, 0xbfe0ee); root.add(g); }
    }
  }
  // 橋脚
  for (let k = 1; k < P.spans; k++) {
    const x = x0 + k * Lb / P.spans, h = yG - hg - 1.0, dep = S.site ? 25 : 0;
    root.add(M.box(1.6, h + dep, W * 0.5, 0xb5b1a7, x, (h - dep) / 2, 0)); root.add(M.box(2.2, 1.0, W + 0.4, 0xb5b1a7, x, h + 0.5, 0));
  }
  // 主桁・横桁・支承
  const gz = []; for (let i = 0; i < P.girders; i++) gz.push(-(W / 2 - 1.0) + i * (W - 2.0) / Math.max(1, P.girders - 1));
  for (const z of gz) root.add(M.box(Lb - 0.4, hg - 0.03, 0.4, cSteel, 0, yG - 0.03 - (hg - 0.03) / 2, z, { metal: 0.35, rough: 0.55 }));
  for (let x = x0 + 3; x < x1 - 1; x += 6) root.add(M.box(0.15, hg * 0.5, W - 2.0, cSteel, x, yG - hg / 2, 0));
  for (let k = 0; k <= P.spans; k++) for (const z of gz) root.add(M.box(0.6, 0.15, 0.6, 0x333333, x0 + k * Lb / P.spans + (k === 0 ? 0.5 : k === P.spans ? -0.5 : 0), yG - hg - 0.06, z));
  // 桁上面（さび→塗装）・ずれ止め
  const sideOfZ = z => z < 0 ? 0 : 1;
  const flange = [];
  for (let j = 0; j < Q.nBx; j++) for (const ps of [0, 1]) {
    const gzs = gz.filter(z => sideOfZ(z) === ps); if (!gzs.length) continue;
    const xc = x0 + (j + 0.5) * bl;
    const rust = new THREE.Group(), paint = new THREE.Group();
    gzs.forEach(z => { rust.add(M.box(bl - 0.02, 0.03, 0.46, 0x8a4b2a, xc, yG - 0.015, z)); paint.add(M.box(bl - 0.02, 0.03, 0.46, 0x9fb2c4, xc, yG - 0.015, z)); });
    const geos = []; gzs.forEach(z => { for (let x = xc - bl / 2 + 0.15; x < xc + bl / 2; x += 0.3) for (const dz of [-0.12, 0.12]) { const c = new THREE.CylinderGeometry(0.011, 0.011, 0.15, 6); c.translate(x, yG + 0.075, z + dz); geos.push(c); } });
    const stud = new THREE.Mesh(mergeGeometries(geos), M.mat(0xb0b0b0, { metal: 0.6 }));
    root.add(rust, paint, stud); R(rust); R(paint); R(stud);
    flange.push({ xc, ps, rust, paint, stud });
  }
  // 旧床版ブロック（切断線つき）・旧舗装・旧区画線
  const blocks = [];
  for (let j = 0; j < Q.nBx; j++) for (const ps of [0, 1]) {
    const xc = x0 + (j + 0.5) * bl, zc = ps === 0 ? -W / 4 : W / 4;
    const g = new THREE.Group(); g.position.set(xc, yG, zc); root.add(g);
    g.add(M.box(bl - 0.02, oldT, W / 2 - 0.02, cOld, 0, oldT / 2, 0));
    const c1 = M.box(0.06, 0.01, W / 2 - 0.02, 0x1a1a1a, bl / 2 - 0.03, oldT + 0.006, 0);
    const c2 = M.box(bl, 0.01, 0.06, 0x1a1a1a, 0, oldT + 0.006, ps === 0 ? W / 4 - 0.03 : -W / 4 + 0.03);
    g.add(c1, c2); R(g); R(c1); R(c2);
    blocks.push({ j, ps, xc, zc, g, cut: [c1, c2] });
  }
  const oldPave = [];
  for (let j = 0; j < Q.nBx; j++) for (const ps of [0, 1]) {
    const xc = x0 + (j + 0.5) * bl, zs = ps === 0 ? -1 : 1;
    const g = new THREE.Group(); root.add(g);
    g.add(M.box(bl, paveT, roadHalf, cAsOld, xc, deckTop + paveT / 2, zs * roadHalf / 2));
    g.add(M.box(bl, 0.01, 0.15, 0xdedede, xc, H + 0.005, zs * (roadHalf - 0.15)));
    if (ps === 0 && j % 2 === 0 && P.lanes !== 1) g.add(M.box(bl * 0.6, 0.01, 0.15, 0xdedede, xc, H + 0.005, -0.08));
    R(g); oldPave.push({ xc, ps, g });
  }
  // 地覆・高欄（5m区切り）：工事前も完成後も「設定の高欄の種類」で、橋全体を同じ形にそろえる
  const nR = Math.max(2, Math.ceil(Lb / 5)), segL = Lb / nR;
  const railSeg = (g, e) => {
    if (P.railType === 'steel') {
      g.add(M.box(segL - 0.03, 0.35, 0.5, 0xd2cfc6, 0, 0.175, 0));
      for (let x = -segL / 2 + 0.6; x < segL / 2; x += 2.0) g.add(M.box(0.1, 1.0, 0.1, 0xe6e9ec, x, 0.85, 0, { metal: 0.4 }));
      for (const y of [0.75, 1.05, 1.32]) g.add(M.box(segL - 0.05, 0.07, 0.07, 0xe6e9ec, 0, y, 0, { metal: 0.4 }));
    } else {
      g.add(M.box(segL - 0.03, 1.35, 0.4, 0xd2cfc6, 0, 0.675, 0)); g.add(M.box(segL - 0.03, 0.06, 0.42, 0xbdb9b0, 0, 1.36, 0));
    }
    if (swOn(e)) addSoundWall(g, segL, 0xbfe0ee);
  };
  const oldRail = [];
  for (const e of [0, 1]) for (let m = 0; m < nR; m++) {
    const xc = x0 + (m + 0.5) * segL, ze = (e === 0 ? -1 : 1) * (W / 2 - 0.25);
    const g = new THREE.Group(); g.position.set(xc, deckTop, ze); root.add(g);
    railSeg(g, e);
    R(g); oldRail.push({ e, m, xc, ze, g });
  }
  // 旧伸縮装置
  const oldJoint = [];
  for (const ps of [0, 1]) for (const end of [0, 1]) {
    const m = M.box(0.5, 0.06, W / 2 - 0.05, 0x3a3a3a, end === 0 ? x0 + 0.25 : x1 - 0.25, H + 0.0, ps === 0 ? -W / 4 : W / 4, { metal: 0.5 });
    root.add(m); R(m); oldJoint.push({ ps, end, m });
  }
  // 新しいPC床版・間詰め・縦目地
  const panelRows = isHalf() ? [0, 1] : ['all'];
  const panels = {};
  for (const s of panelRows) {
    panels[s] = [];
    for (let i = 0; i < Q.nPx; i++) {
      const g = new THREE.Group(); root.add(g);
      g.add(M.box(pw - 0.03, P.panelT, pWZ - 0.03, cNew, 0, 0, 0));
      for (const dx of [-pw / 4, pw / 4]) g.add(M.cyl(0.05, 0.02, 0x333333, dx, P.panelT / 2 + 0.005, 0));
      R(g); g.visible = false;
      panels[s].push({ g, x: x0 + (i + 0.5) * pw, z: sideZ(s === 'all' ? 0 : s), y: yG + oldT - P.panelT / 2 });
    }
  }
  const joints = {};
  for (const s of panelRows) { joints[s] = []; for (let i = 0; i < Q.nPx - 1; i++) { const m = M.box(0.18, 0.012, pWZ - 0.1, 0x7d7d78, x0 + (i + 1) * pw, deckTop + 0.006, sideZ(s === 'all' ? 0 : s)); root.add(m); R(m); m.visible = false; joints[s].push({ x: x0 + (i + 1) * pw, m }); } }
  const tatemeji = [];
  if (isHalf()) for (let i = 0; i < Q.nPx; i++) { const m = M.box(pw, 0.014, 0.3, 0x7d7d78, x0 + (i + 0.5) * pw, deckTop + 0.007, 0); root.add(m); R(m); m.visible = false; tatemeji.push({ x: x0 + (i + 0.5) * pw, m }); }
  // 防水・新舗装・新区画線・壁高欄・新伸縮装置
  const wp = [], newPave = [], newLine = [], newRail = [], newJoint = [];
  for (let j = 0; j < Q.nBx; j++) {
    const xc = x0 + (j + 0.5) * bl;
    for (const ps of [0, 1]) {
      const zs = ps === 0 ? -1 : 1;
      const a = M.box(bl, 0.01, roadHalf, 0x3c4a66, xc, deckTop + 0.005, zs * roadHalf / 2); root.add(a); R(a); a.visible = false; wp.push({ xc, ps, m: a });
      const b = M.box(bl, paveT, roadHalf, cAsNew, xc, deckTop + paveT / 2, zs * roadHalf / 2); root.add(b); R(b); b.visible = false; newPave.push({ xc, ps, m: b });
    }
    const ln = new THREE.Group(); root.add(ln);
    for (const z of [-roadHalf + 0.15, roadHalf - 0.15]) ln.add(M.box(bl, 0.01, 0.15, 0xffffff, xc, H + 0.006, z));
    if (j % 2 === 0 && P.lanes !== 1) ln.add(M.box(bl * 0.6, 0.01, 0.15, 0xffffff, xc, H + 0.006, 0));
    R(ln); ln.visible = false; newLine.push({ xc, g: ln });
  }
  for (const e of [0, 1]) for (let m = 0; m < nR; m++) {
    const xc = x0 + (m + 0.5) * segL, ze = (e === 0 ? -1 : 1) * (W / 2 - 0.25);
    const g = new THREE.Group(); g.position.set(xc, deckTop, ze); root.add(g);
    railSeg(g, e);
    R(g); g.visible = false; newRail.push({ e, xc, ze, m: g });
  }
  for (const end of [0, 1]) { const m = M.box(0.5, 0.07, W - 0.6, 0x2c2c2c, end === 0 ? x0 + 0.25 : x1 - 0.25, H + 0.0, 0, { metal: 0.5 }); root.add(m); R(m); m.visible = false; newJoint.push({ end, m }); }
  // 吊り足場（径間ごと）
  const scaf = [];
  for (let k = 0; k < P.spans; k++) {
    const sl = Lb / P.spans, xc = x0 + (k + 0.5) * sl, y = yG - hg - 0.9;
    const g = new THREE.Group(); root.add(g);
    g.add(M.box(sl - 0.6, 0.06, W + 1.4, 0x9aa0a6, xc, y, 0, { metal: 0.3 }));
    for (const s of [-1, 1]) g.add(M.box(sl - 0.6, 1.8, 0.02, 0xff8c1a, xc, y + 0.93, s * (W / 2 + 0.7), { opacity: 0.55, double: true }));
    for (let x = xc - sl / 2 + 1.5; x < xc + sl / 2 - 1; x += 3) for (const z of [-W / 2 + 1.2, W / 2 - 1.2]) g.add(M.box(0.03, 0.9, 0.03, 0x333333, x, y + 0.45, z));
    R(g); g.visible = false; scaf.push({ xc, g });
  }

  // ───── 交通規制 ─────
  const kisei = ph('kisei'), kirikae = ph('kirikae', 1), kaijo = ph('kaijo');
  const workSide = t => isHalf() ? ((kirikae && t >= kirikae.t0 + kirikae.dur * 0.5) ? 1 : 0) : 'all';
  const cones = [];
  if (isHalf()) for (let x = xa; x <= xb; x += 4) { const c = M.cone(x, onDeck(x) + (x >= x0 && x <= x1 ? paveT : 0), 0); root.add(c); R(c); c.visible = false; cones.push(c); }
  const regSets = {};
  // 出入口：バリケード2枚を観音開きの扉にする（外側の端を軸に、現場の外側へ開く）。誘導員が1人つく
  const addGate = (g, gx, zc, out) => {
    const doors = [];
    for (const sd of [-1, 1]) { const b = M.barricade(2.2); b.position.set(gx, H, zc + sd * 1.1); g.add(b); doors.push({ b, sd, hz: zc + sd * 2.2 }); }
    const es = zc === 0 ? 1 : Math.sign(zc);                       // 誘導員は道路の端の側に立つ
    const guard = M.person(0xffd400, true); g.add(guard);
    GATES.push({ x: gx, zc, out, doors, guard, es, group: g });
  };
  const mkReg = (w) => {
    const g = new THREE.Group(); root.add(g);
    if (w === 'all') {
      for (const [x, out] of [[xa - 2, -1], [xb + 2, 1]]) { addGate(g, x, 0, out); for (const s of [-1, 1]) { const b = M.barricade(W / 2 - 2.2); b.position.set(x, H, s * (2.2 + (W / 2 - 2.2) / 2)); g.add(b); } }
      const s1 = M.signBoard(['通行止め'], '#ffffff', '#c00000', '#c00000'); s1.position.set(xa - 28, H, -W / 2 - 1); g.add(s1);
      const s2 = M.signBoard(['通行止め'], '#ffffff', '#c00000', '#c00000'); s2.position.set(xb + 28, H, W / 2 + 1); s2.rotation.y = Math.PI; g.add(s2);
      const s3 = M.signBoard(['迂回路', '←'], '#1b4fa0', '#ffffff', '#ffffff'); s3.position.set(xa - 40, H, -W / 2 - 1); g.add(s3);
    } else {
      const z = sideZ(w);
      for (const [x, out] of [[xa - 2, -1], [xb + 2, 1]]) addGate(g, x, z, out);
      const s1 = M.signBoard(['片側交互通行', 'この先工事中'], '#ffffff', '#1b2a4a', '#c00000'); s1.position.set(xa - 30, H, -W / 2 - 1); g.add(s1);
      const s2 = M.signBoard(['片側交互通行', 'この先工事中'], '#ffffff', '#1b2a4a', '#c00000'); s2.position.set(xb + 30, H, W / 2 + 1); s2.rotation.y = Math.PI; g.add(s2);
    }
    Rdeep(g); g.visible = false; regSets[w] = g;
  };
  if (isHalf()) { mkReg(0); mkReg(1); } else mkReg('all');
  const sigs = [];
  if (isHalf()) for (const d of [1, -1]) {
    const s = M.signal(); s.position.set(d > 0 ? xa - 7 : xb + 7, H, d > 0 ? -W / 2 - 0.5 : W / 2 + 0.5); if (d < 0) s.rotation.y = Math.PI; root.add(s); R(s); R(s.userData.red); R(s.userData.green); s.visible = false;
    const gd = M.person(0xffd400, true); gd.position.set(d > 0 ? xa - 9 : xb + 9, H, d > 0 ? -W / 2 + 0.2 : W / 2 - 0.2); gd.rotation.y = d > 0 ? 0 : Math.PI; root.add(gd); Rdeep(gd); gd.visible = false;  // 交通誘導員（旗）
    sigs.push({ d, s, gd });
  }
  const kTruck = mk(sel('kisei', 'main')), kTruck2 = kirikae ? mk(sel('kisei', 'main')) : null, kTruck3 = mk(sel('kisei', 'main'));
  U.push(t => {
    const pk = prog(kisei, t), pj = prog(kaijo, t);
    const tx = lerp(xa - 40, xb + 15, pk);
    kTruck.visible = act(kisei, t); kTruck.position.set(tx, H, isHalf() ? sideZ(0) : -laneOff);
    if (kTruck.visible) FOCUS = kTruck.position;
    const cx2 = lerp(xb + 20, xa - 40, clamp(pj / 0.5, 0, 1));
    kTruck3.visible = act(kaijo, t) && pj < 0.5; kTruck3.position.set(cx2, H, 1.6); kTruck3.rotation.y = Math.PI;
    if (kTruck3.visible) FOCUS = kTruck3.position;
    if (kTruck2) { const pc = prog(kirikae, t); kTruck2.visible = act(kirikae, t); kTruck2.position.set(lerp(xb + 15, xa - 40, pc), H, sideZ(1)); kTruck2.rotation.y = Math.PI; if (kTruck2.visible) FOCUS = kTruck2.position; }
    for (const c of cones) {
      let v = t >= kisei.t1 || (act(kisei, t) && c.position.x <= tx);
      if (act(kaijo, t) && pj < 0.5 && c.position.x >= cx2) v = false;
      if (t >= kaijo.t0 + kaijo.dur * 0.5) v = false;
      c.visible = v;
    }
    const on = pk >= 0.85 && pj < 0.1;
    if (isHalf()) { const w = workSide(t); regSets[0].visible = on && w === 0; regSets[1].visible = on && w === 1; }
    else regSets.all.visible = pk >= 0.6 && pj < 0.1;
  });

  // ───── 車両 ─────
  const v = clamp(P.carKmh || 20, 5, 80) / 3.6;   // 車の速さ（m/秒・再生×1のとき）
  const colors = [0xffffff, 0x222222, 0xb0b5bb, 0x8b1a1a, 0x1f3f7a, 0xd9d9d9, 0x4a5a3a];
  const normal = [];
  for (const d of [1, -1]) for (let i = 0; i < 7; i++) { const c = M.car(colors[(i * 3 + (d > 0 ? 0 : 2)) % colors.length], i % 4 === 3 ? 'truck' : 'car'); root.add(c); Rdeep(c); trackWheels(c); c.visible = false; normal.push({ d, i, c }); }
  const alt = [];
  const one = P.lanes === 1;   // 1車線の橋：ふだんも交互に通る
  if (isHalf() || one) for (const d of [1, -1]) for (let j = 0; j < 4; j++) { const c = M.car(colors[(j * 2 + (d > 0 ? 1 : 4)) % colors.length], j === 2 ? 'truck' : 'car'); root.add(c); Rdeep(c); trackWheels(c); c.visible = false; alt.push({ d, j, c }); }
  const Ltot = 2 * (Lb / 2 + A - 2), xmin = -(Lb / 2 + A - 2);
  const D = (xb - xa) + 14, Tg = (D + 40) / v + 3 * 1.4 + 1, Tc = 2 * Tg;
  const D1 = Lb + 24, Tg1 = (D1 + 40) / v + 3 * 1.4 + 1, Tc1 = 2 * Tg1;   // 1車線の橋（ゆずり合い）
  U.push(t => {
    const pk = prog(kisei, t), pj = prog(kaijo, t);
    const before = pk < 0.7 || pj >= 0.5;
    const mode = before ? (one ? 'one' : 'normal') : (isHalf() ? 'alt' : 'closed');
    TRAFFIC = mode === 'one' ? 'normal' : mode;
    for (const n of normal) {
      n.c.visible = mode === 'normal';
      if (!n.c.visible) continue;
      const s = ((t * v + n.i * Ltot / 7 + (n.d < 0 ? 5.3 : 0)) % Ltot + Ltot) % Ltot;
      const x = n.d > 0 ? xmin + s : -(xmin + s);
      n.c.position.set(x, H, n.d > 0 ? -laneOff : laneOff); n.c.rotation.y = n.d > 0 ? 0 : Math.PI; n.c.userData.steerAng = 0;
    }
    const open = isHalf() ? 1 - workSide(t) : 0;
    for (const a of alt) {
      if (mode !== 'alt' && mode !== 'one') { a.c.visible = false; continue; }
      const o1 = mode === 'one', tg = o1 ? Tg1 : Tg, tc = o1 ? Tc1 : Tc;
      const xs = o1 ? (a.d > 0 ? x0 - 12 : x1 + 12) : (a.d > 0 ? xa - 6 : xb + 6), xe = o1 ? (a.d > 0 ? x1 + 12 : x0 - 12) : (a.d > 0 ? xb + 6 : xa - 6);
      const tau = ((t + (a.d > 0 ? 0 : tg)) % tc + tc) % tc;
      const q0 = 7 * a.j + 2;
      let s = -q0; if (tau < tg) { const tt = tau - a.j * 1.4; if (tt > 0) s = -q0 + v * tt; }
      const x = xs + a.d * s;
      a.c.visible = Math.abs(x) < Lb / 2 + A - 2;
      if (o1) { drive(a.c, x, H, () => 0, a.d); continue; }   // 1車線：車線の中央を走り、対向車は橋の手前で待つ
      // 規制の区間に入るところで、開いている車線へ寄る（ハンドルを切って向きも変わる）
      const zf = xx => { const u1 = a.d > 0 ? xx - xs : xs - xx, u2 = a.d > 0 ? xe - xx : xx - xe; return lerp(a.d > 0 ? -laneOff : laneOff, sideZ(open), sm(Math.min(u1, u2) / 14)); };
      drive(a.c, x, H, zf, a.d);
    }
    for (const g of sigs) {
      g.s.visible = mode === 'alt' && pj < 0.35;
      const tau = ((t + (g.d > 0 ? 0 : Tg)) % Tc + Tc) % Tc;
      const green = tau < 3 * 1.4 + 3;
      g.s.userData.green.visible = green; g.s.userData.red.visible = !green;
      // 交通誘導員：止めるときは旗を横に出して止め、通すときは旗を振って進ませる
      g.gd.visible = g.s.visible; M.posePerson(g.gd, t, green ? 'go' : 'stop');
    }
  });

  // ───── 工程ごとの動き ─────
  // 足場
  {
    const p1 = ph('ashiba'), p2 = ph('ashiba_tekkyo');
    const m1 = mk(sel('ashiba', 'main')), m2 = mk(sel('ashiba_tekkyo', 'main'));
    U.push(t => {
      const a = prog(p1, t), b = prog(p2, t);
      const x1m = lerp(x0 - 6, x1 + 6, a), x2m = lerp(x1 + 6, x0 - 6, b);
      m1.visible = act(p1, t); m1.position.set(x1m, H, isHalf() ? sideZ(workSide(t)) : 0); m1.rotation.y = (isHalf() && workSide(t) === 0) ? Math.PI : 0;
      if (m1.userData.type === 'crane') poseCrane(m1, { x: x1m + 2, y: yG - hg - 0.5, z: (isHalf() && workSide(t) === 0 ? -1 : 1) * (W / 2 + 1) });
      m2.visible = act(p2, t); m2.position.set(x2m, H, isHalf() ? sideZ(workSide(t)) : 0); m2.rotation.y = (isHalf() && workSide(t) === 0) ? Math.PI : 0;
      // 高所作業車：6mごとに止まり、アウトリガを張ってバケットを高欄の外へ出す（吊り足場の金具を付ける）→たたんで次へ
      for (const [m, u, xa, xb] of [[m1, a, x0 - 6, x1 + 6], [m2, b, x1 + 6, x0 - 6]]) {
        if (m.userData.type !== 'aerial' || !m.visible) continue;
        const n = Math.max(1, Math.round(Math.abs(xb - xa) / 6)), k = Math.min(n - 1, Math.floor(u * n)), q = u * n - k;
        const xs = i => lerp(xa, xb, (i + 0.5) / n);
        const xv = q < 0.12 && k > 0 ? lerp(xs(k - 1), xs(k), sm(q / 0.12)) : xs(k);
        const e = q < 0.12 ? 0 : q < 0.3 ? sm((q - 0.12) / 0.18) : q > 0.88 ? 1 - sm((q - 0.88) / 0.12) : 1;
        m.position.x = xv;
        const flip = m.rotation.y !== 0, zw = m.position.z, sg = isHalf() ? Math.sign(zw) || 1 : 1;
        const lz = sg * (W / 2 + 1.1) - zw;
        M.setAerialPose(m, { x: 1.5, y: 2.3 + 0.25 * Math.sin(t * 0.8), z: flip ? -lz : lz }, e);
      }
      if (m1.visible) FOCUS = m1.position; if (m2.visible) FOCUS = m2.position;
      for (const s of scaf) s.g.visible = (t >= p1.t1 || (act(p1, t) && s.xc <= x1m)) && !(t >= p2.t1 || (act(p2, t) && s.xc >= x2m));
    });
  }
  const sideList = isHalf() ? [0, 1] : ['all'];
  for (const s of sideList) {
    const zW = sideZ(s === 'all' ? 0 : s);
    const pss = paveSides(s);
    // 舗装切削
    {
      const p = ph('sesaku', s); const mill = mk(sel('sesaku', 'main')); const haul = mk(sel('sesaku', 'haul'));
      U.push(t => {
        const pr = prog(p, t), P2 = passes(pr, pss.length, x0 - 8, x1 + 3), ps = pss[P2.k];
        const z = ps === 0 ? -roadHalf / 2 : roadHalf / 2;
        mill.visible = haul.visible = act(p, t);
        mill.position.set(P2.x, H, z); mill.rotation.y = P2.dir > 0 ? 0 : Math.PI;
        // 切削くずを前のダンプに積む。満杯になったら走り去り、次の空のダンプがバックで寄ってくる（3台で1回分）
        const cyc = (P2.q * 3) % 1; let hx = P2.x + P2.dir * 12, fill = clamp(cyc / 0.9, 0, 1);
        if (cyc > 0.9) hx += P2.dir * sm((cyc - 0.9) / 0.1) * 45;
        if (cyc < 0.08) { hx += P2.dir * (1 - sm(cyc / 0.08)) * 45; fill = 0; }
        drive(haul, hx, H, () => z, P2.dir); M.setDump(haul, 0, fill);
        if (mill.visible) FOCUS = mill.position;
        for (const o of oldPave) { const k = pss.indexOf(o.ps); if (k < 0) continue; if (t < p.t0) continue; o.g.visible = !(t >= p.t1 || P2.done(k, o.xc)); }
      });
    }
    // 地覆・高欄撤去（クレーンで1区切りずつ吊り出す）
    {
      const p = ph('kouran', s); const crane = mk(sel('kouran', 'crane')); const cut = mk(sel('kouran', 'cut')); const truck = mk('dump10'); const cw = crew(2);
      const items = oldRail.filter(o => pss.includes(o.e)).sort((a, b) => b.xc - a.xc || a.e - b.e);
      const st = stations(items.map(o => o.xc), -9, x0 - 13, x1, 3.5, 13);
      U.push(t => {
        const on = act(p, t); crane.visible = cut.visible = truck.visible = on; cw.forEach(c => c.visible = on);
        if (t < p.t0) { items.forEach(o => { o.g.visible = true; o.g.position.set(o.xc, deckTop, o.ze); }); return; }
        if (t >= p.t1) { items.forEach(o => o.g.visible = false); return; }
        const f = prog(p, t) * items.length, i = Math.min(items.length - 1, Math.floor(f)), q = f - i;
        const Rl = relocate(i > 0 ? st[i - 1] : x0 - 25, st[i], q), x = Rl.x, qq = Rl.q2;
        M.setOutrigger(crane, Rl.e); crane.position.set(x, onDeck(x), zW);
        drive(truck, x - 10 + truck.userData.bedCenterX, onDeck(x - 10), () => zW, -1); M.setDump(truck, 0, clamp((i + qq) / items.length, 0, 1) * 0.6);
        const it = items[i]; const dp = bedPos(truck);
        const L = liftPose(qq, { x, z: zW }, { x: it.xc, y: deckTop, z: it.ze }, dp, deckTop + 4.5, 3.4, 0, 0);
        items.forEach((o, k) => { if (k < i) o.g.visible = false; else if (k > i) { o.g.visible = true; o.g.position.set(o.xc, deckTop, o.ze); } });
        it.g.visible = qq < 0.92; it.g.position.set(L.load.x, L.load.y, L.load.z);
        poseCrane(crane, L.hook, L.boom, L.slung && it.g.visible ? liftPts(L.load, 0, segL / 2, 0.25, 1.3) : null, 1 - Rl.e);
        cut.position.set(it.xc + 1.2, deckTop, it.ze + (it.e === 0 ? 1.2 : -1.2)); cut.visible = on && qq < 0.2 && Rl.e === 1;
        cw[0].position.set(it.xc - 1.5, deckTop, it.ze + (it.e === 0 ? 1.6 : -1.6)); cw[1].position.set(x - 4, onDeck(x - 4), zW + 2.6);
        M.posePerson(cw[0], t, 'idle'); M.posePerson(cw[1], t, L.stage === 1 ? 'signal' : 'idle');
        FOCUS = crane.position;
      });
    }
    // 伸縮装置撤去
    {
      const p = ph('shinshuku', s); const m = mk(sel('shinshuku', 'main'));
      U.push(t => {
        const pr = prog(p, t); m.visible = act(p, t);
        const end = pr < 0.5 ? 0 : 1; m.position.set(end === 0 ? x0 + 4 : x1 - 4, deckTop, zW); m.rotation.y = end === 0 ? Math.PI : 0;
        if (m.userData.arm) m.userData.arm.rotation.z = 0.12 * Math.sin(t * 16);
        if (m.visible) FOCUS = m.position;
        for (const o of oldJoint) { if (!pss.includes(o.ps)) continue; if (t < p.t0) continue; o.m.visible = !(t >= p.t1 || (o.end === 0 ? pr > 0.35 : pr > 0.85)); }
      });
    }
    // 床版切断
    {
      const p = ph('setsudan', s); const m = mk(sel('setsudan', 'main'));
      U.push(t => {
        const pr = prog(p, t), P2 = passes(pr, pss.length, x1, x0), ps = pss[P2.k];
        m.visible = act(p, t); m.position.set(P2.x, deckTop, ps === 0 ? -W / 4 : W / 4); m.rotation.y = P2.dir > 0 ? Math.PI : 0;
        if (m.visible) FOCUS = m.position;
        for (const b of blocks) { const k = pss.indexOf(b.ps); if (k < 0) continue; const done = t >= p.t1 || (t >= p.t0 && P2.done(k, -b.xc) ); b.cutDone = done; }
      });
    }
    // 既設床版の撤去・搬出
    {
      const p = ph('tekkyo', s); const crane = mk(sel('tekkyo', 'crane')); const truck = mk(sel('tekkyo', 'haul')); const cw = crew(2);
      const items = blocks.filter(b => pss.includes(b.ps)).sort((a, b) => b.xc - a.xc || a.ps - b.ps);
      const st = stations(items.map(b => b.xc), -11, x0 - 13, x1, 4.5, 14);
      const zfIn = lanePath(-laneOff, zW, xa - 26, xa - 4);   // 取付道路の車線→規制の中の作業帯へ
      let rmax = 0; items.forEach((b, i) => { rmax = Math.max(rmax, Math.hypot(b.xc - st[i], b.zc - zW), 10); });
      CHECKS['tekkyo_' + s] = { radius: rmax, ton: Q.blockTon, mid: () => sel('tekkyo', 'crane'), what: '撤去ブロック1つ' };
      U.push(t => {
        const on = act(p, t); crane.visible = truck.visible = on; cw.forEach(c => c.visible = on);
        for (const b of items) { b.cut[0].visible = b.cut[1].visible = !!b.cutDone; }
        if (t < p.t0) { items.forEach(b => { b.g.visible = true; b.g.position.set(b.xc, yG, b.zc); b.g.rotation.y = 0; }); return; }
        if (t >= p.t1) { items.forEach(b => b.g.visible = false); return; }
        const f = prog(p, t) * items.length, i = Math.min(items.length - 1, Math.floor(f)), q = f - i;
        const Rl = relocate(i > 0 ? st[i - 1] : x0 - 25, st[i], q), x = Rl.x, qq = Rl.q2;
        M.setOutrigger(crane, Rl.e); crane.position.set(x, onDeck(x), zW);
        const bedX = x - 10;
        // トラックは後ろ向きで荷台を寄せ、積んだら走り去る
        const parkX = bedX + truck.userData.bedCenterX, farT = x0 - A + 6; let tx = parkX;
        if (Rl.e < 1 || qq < 0.1) tx = lerp(farT, parkX, sm(qq / 0.1));
        if (qq > 0.88) tx = lerp(parkX, farT, sm((qq - 0.88) / 0.12));
        if (tx < farT + 0.5 && on) truck.visible = false;                              // 取付道路の端＝現場の外へ出た
        drive(truck, parkX, onDeck(parkX), zfIn, -1); const dp = bedPos(truck);      // 止まる位置の荷台
        drive(truck, tx, onDeck(tx), zfIn, -1);                                        // バックで寄せる・走り去る（車線を移るところで折れる）
        const it = items[i];
        const L = liftPose(qq, { x, z: zW }, { x: it.xc, y: yG, z: it.zc }, dp, H + 5, oldT + 2.8, 0, Math.PI / 2);
        items.forEach((b, k) => { if (k < i) b.g.visible = false; else if (k > i) { b.g.visible = true; b.g.position.set(b.xc, yG, b.zc); b.g.rotation.y = 0; } });
        it.g.visible = true; it.g.rotation.y = L.rot;
        const onTruck = bedPos(truck);
        if (L.stage === 2) { it.g.position.set(onTruck.x, onTruck.y, onTruck.z); it.g.rotation.y = bedYaw(truck) + Math.PI / 2; } else it.g.position.set(L.load.x, L.load.y, L.load.z);
        if (it.g.position.x < x0 - A - 15) it.g.visible = false;
        poseCrane(crane, L.hook, L.boom, L.slung ? liftPts(L.stage === 2 ? onTruck : L.load, L.rot, bl / 2, W / 4, oldT) : null, 1 - Rl.e);
        cw[0].position.set(it.xc - 1.8, deckTop, it.zc + 1.4); cw[1].position.set(x - 5, onDeck(x - 5), zW - 2.6);
        M.posePerson(cw[0], t, 'idle'); M.posePerson(cw[1], t, L.stage === 1 ? 'signal' : 'idle');
        FOCUS = crane.position;
      });
    }
    // 桁上面処理（さび落とし・塗装／先付けならずれ止め溶接）
    {
      const p = ph('ketajomen', s); const m = mk(sel('ketajomen', 'main'));
      U.push(t => {
        const pr = prog(p, t), P2 = passes(pr, pss.length, x0, x1), ps = pss[P2.k];
        m.visible = act(p, t); m.position.set(P2.x, m.userData.type === 'cart' ? yG : H, ps === 0 ? -W / 4 : W / 4); m.rotation.y = P2.dir > 0 ? 0 : Math.PI;
        if (m.visible) FOCUS = m.position;
        for (const f of flange) { const k = pss.indexOf(f.ps); if (k < 0) continue; const done = t >= p.t1 || (t >= p.t0 && P2.done(k, f.xc)); f.rust.visible = !done; f.paint.visible = done; f.painted = done; if (S.P.studOrder === 'before') f.stud.visible = done; }
      });
    }
    // PC床版の搬入と架設（1日分ずつトレーラーで運び、1枚ずつ吊る）
    {
      const pH = ph('hannyu', s), p = ph('kasetsu', s);
      const cid = sel('kasetsu', 'crane'), gantryMode = K.MACHINES[cid].kind === 'gantry';
      const crane = mk(cid); const tr = mk(sel('hannyu', 'haul')); const cw = crew(2);
      const row = panels[s], n = row.length, per = Math.max(1, S.P.perDay);
      const stC = gantryMode ? row.map(r => r.x) : stations(row.map(r => r.x), -8, x0 - 13, x1, 0, 14);
      const cxOf = i => stC[i];
      const seq = []; let tt = 0;
      for (let i = 0; i < n; i++) { if (i > 0 && i % per === 0) { seq.push({ type: 'arr', i, t0: tt, t1: tt + 3 }); tt += 3; } seq.push({ type: 'lift', i, t0: tt, t1: tt + 5.5 }); tt += 5.5; }
      let rmax = 0; row.forEach((r, i) => rmax = Math.max(rmax, Math.hypot(r.x - cxOf(i), 0), 10.5));
      CHECKS['kasetsu_' + s] = { radius: gantryMode ? 0 : rmax, ton: Q.panelTon, mid: () => sel('kasetsu', 'crane'), what: 'PC床版1枚' };
      const T = P.panelT, stackOff = k => k * (T + 0.08) + T / 2 + 0.05;
      const zfK = lanePath(-laneOff, zW, xa - 26, xa - 4);
      const farX = x0 - A + 12;   // 取付道路の端（ここで現場に入る／出る）
      // トレーラーを「荷台の中心が bedX にくる位置」へ（道筋に沿って向き・折れ角を決める）
      const putTr = bedX => { const px = bedX - tr.userData.bedCenterX; drive(tr, px, onDeck(px), zfK, 1); return bedPos(tr); };
      const placeStack = (bp, i0) => { const b = Math.floor(i0 / per), bs = b * per, be = Math.min(n, bs + per); const yaw = bedYaw(tr); for (let j = i0; j < be; j++) { const r = row[j]; r.g.visible = true; r.g.position.set(bp.x, bp.y + stackOff(be - 1 - j), bp.z); r.g.rotation.y = yaw + Math.PI / 2; } };
      const placed = (j) => { const r = row[j]; r.g.visible = true; r.g.position.set(r.x, r.y, r.z); r.g.rotation.y = 0; };
      U.push(t => {
        const onH = act(pH, t), onK = act(p, t);
        crane.visible = tr.visible = onH || onK; cw.forEach(c => c.visible = onK);
        if (t < pH.t0) { row.forEach(r => r.g.visible = false); return; }
        if (t >= p.t1) { row.forEach((r, j) => placed(j)); return; }
        row.forEach(r => r.g.visible = false);
        if (onH || t < p.t0) { // 最初の搬入
          const u0 = prog(pH, t), u = sm(u0); const cx = cxOf(0);
          const x = gantryMode ? lerp(x0 + 2, cx - 6, 0) : lerp(x0 - A + 8, cx, sm(Math.min(1, u0 / 0.8)));
          if (!gantryMode) M.setOutrigger(crane, u0 > 0.85 ? (u0 - 0.85) / 0.15 : 0);
          crane.position.set(gantryMode ? row[0].x - 4 : x, gantryMode ? deckTop : onDeck(x), zW);
          const bedX = (gantryMode ? row[0].x - 9 : cx - 10); const fx = lerp(farX, bedX, u);
          placeStack(putTr(fx), 0);
          if (!gantryMode) poseCrane(crane, { x: crane.position.x + 7, y: onDeck(x) + 6, z: zW }, 12, null, u0 < 0.8 ? 1 : 1 - (u0 - 0.8) / 0.2); else M.setGantryPose(crane, { x: 0, y: 1.5, z: 0 });
          FOCUS = tr.position; return;
        }
        if (!gantryMode) M.setOutrigger(crane, 1);
        const tau = prog(p, t) * tt; let sgi = seq.findIndex(sg => tau < sg.t1); if (sgi < 0) sgi = seq.length - 1;
        const sg = seq[sgi], q = clamp((tau - sg.t0) / (sg.t1 - sg.t0), 0, 1), i = sg.i;
        for (let j = 0; j < i; j++) placed(j);
        const cx = cxOf(i), cprev = i > 0 ? cxOf(i - 1) : cx;
        if (sg.type === 'arr') {
          // 空のトレーラーはバックで出ていき、次の日の分を積んだトレーラーが入ってくる
          const bedX = gantryMode ? row[i].x - 9 : cx - 10, prevBed = gantryMode ? row[i - 1].x - 9 : cprev - 10;
          if (q < 0.4) putTr(lerp(prevBed, farX, sm(q / 0.4)));
          else placeStack(putTr(lerp(farX, bedX, sm((q - 0.4) / 0.6))), i);
          if (q > 0.37 && q < 0.43) tr.visible = false;                                   // 入れ替わり
          if (gantryMode) { crane.position.set(cprev, deckTop, zW); M.setGantryPose(crane, { x: 0, y: 1.5, z: 0 }); }
          else { crane.position.set(cprev, onDeck(cprev), zW); poseCrane(crane, { x: cprev + 7, y: deckTop + 6, z: zW }, 12); }
          FOCUS = tr.position; return;
        }
        const Rl = gantryMode ? { x: cx, q2: q, e: 1 } : relocate(cprev, cx, q);
        if (!gantryMode) M.setOutrigger(crane, Rl.e);
        const bedX = gantryMode ? row[i].x - 9 : Rl.x - 10;
        const bp = putTr(bedX);
        const b = Math.floor(i / per), be = Math.min(n, b * per + per);
        placeStack(bp, i);
        const r = row[i]; r.g.visible = true;
        const pick = { x: bp.x, y: bp.y + stackOff(be - 1 - i), z: bp.z }, drop = { x: r.x, y: r.y, z: r.z };
        if (gantryMode) {
          let gx, load = { ...pick }, hy, rot = Math.PI / 2;
          if (q < 0.2) { gx = lerp(cprev, pick.x, sm(q / 0.2)); hy = deckTop + 3; }
          else if (q < 0.3) { gx = pick.x; const v = sm((q - 0.2) / 0.1); load = { ...pick, y: lerp(pick.y, deckTop + 2.5, v) }; hy = load.y + 1.2; }
          else if (q < 0.65) { const v = sm((q - 0.3) / 0.35); gx = lerp(pick.x, drop.x, v); load = { x: gx, y: deckTop + 2.5, z: zW }; hy = load.y + 1.2; rot = lerp(Math.PI / 2, 0, v); }
          else if (q < 0.8) { gx = drop.x; const v = sm((q - 0.65) / 0.15); load = { ...drop, y: lerp(deckTop + 2.5, drop.y, v) }; hy = load.y + 1.2; rot = 0; }
          else { gx = drop.x; load = { ...drop }; rot = 0; hy = lerp(drop.y + 1.2, deckTop + 3, sm((q - 0.8) / 0.2)); }
          crane.position.set(gx, deckTop, zW); M.setGantryPose(crane, { x: load.x - gx, y: hy - 1.2 - deckTop, z: 0 });
          r.g.position.set(load.x, load.y, load.z); r.g.rotation.y = rot;
        } else {
          const x = Rl.x; crane.position.set(x, onDeck(x), zW);
          const L = liftPose(Rl.q2, { x, z: zW }, pick, drop, H + 5, T / 2 + 2.6, Math.PI / 2, 0);
          r.g.position.set(L.load.x, L.load.y, L.load.z); r.g.rotation.y = L.rot;
          poseCrane(crane, L.hook, L.boom, L.slung ? liftPts(L.load, L.rot, G.pw / 2, pWZ / 2, T / 2) : null, 1 - Rl.e);
          M.posePerson(cw[0], t, L.stage === 1 ? 'signal' : 'idle');
        }
        cw[0].position.set(r.x + 1.5, deckTop, zW + 1.6); cw[1].position.set(r.x + 1.5, deckTop, zW - 1.6);
        M.posePerson(cw[1], t, 'idle');
        FOCUS = crane.position;
      });
    }
    // 間詰め・接合
    {
      const p = ph('mazume', s); const m = mk(sel('mazume', 'main')); const cw = crew(1);
      U.push(t => {
        const pr = prog(p, t), cur = lerp(x0, x1, pr), on = act(p, t);
        m.visible = on; cw[0].visible = on;
        if (m.userData.type === 'pump') { const { px, e } = pumpStep(cur); m.position.set(px, onDeck(px), zW); M.setPumpPose(m, { x: cur - px, y: deckTop - onDeck(px), z: 0 }, e); }
        else { m.position.set(cur - 3, deckTop, zW + 1.2); }
        cw[0].position.set(cur, deckTop, zW - 0.8);
        if (on) FOCUS = m.position;
        for (const j of joints[s]) j.m.visible = t >= p.t1 || (on && j.x < cur);
        if (S.P.studOrder === 'after') for (const f of flange) if (pss.includes(f.ps)) f.stud.visible = t >= p.t1 || (on && f.xc < cur);
      });
    }
    if (s === 1) { // 縦目地
      const p = ph('tatemeji'); const m = mk(sel('tatemeji', 'main'));
      U.push(t => {
        const pr = prog(p, t), cur = lerp(x0, x1, pr), on = act(p, t); m.visible = on;
        if (m.userData.type === 'pump') { const { px, e } = pumpStep(cur); m.position.set(px, onDeck(px), sideZ(1)); M.setPumpPose(m, { x: cur - px, y: deckTop - onDeck(px), z: -sideZ(1) }, e); }
        else m.position.set(cur - 3, deckTop, 1.4);
        if (on) FOCUS = m.position;
        for (const j of tatemeji) j.m.visible = t >= p.t1 || (on && j.x < cur);
      });
    }
    // 防水・舗装
    {
      const p = ph('hosou', s); const fin = mk(sel('hosou', 'pave')); const rol = mk(sel('hosou', 'roll')); const rol2 = mk(sel('hosou', 'roll') === 'macadam' ? 'tire' : 'macadam'); const dump = mk('dump10'); const cw = crew(2);
      U.push(t => {
        const pr = prog(p, t), on = act(p, t);
        const pw1 = clamp(pr / 0.3, 0, 1), pw2 = clamp((pr - 0.3) / 0.7, 0, 1);
        const A1 = passes(pw1, pss.length, x0, x1), A2 = passes(pw2, pss.length, x0 - 2, x1 + 6);
        const ps = pss[A2.k], z = ps === 0 ? -roadHalf / 2 : roadHalf / 2;
        const showM = on && pr >= 0.3;
        fin.visible = rol.visible = rol2.visible = dump.visible = showM; cw.forEach(c => c.visible = on);
        fin.position.set(A2.x, deckTop, z); fin.rotation.y = A2.dir > 0 ? 0 : Math.PI;
        const rx = A2.x - A2.dir * (8 + 2.5 * Math.sin(t * 1.3)), rx2 = A2.x - A2.dir * (15 + 2.5 * Math.sin(t * 1.1 + 1));
        rol.position.set(rx, onDeck(rx) === H ? H : deckTop + paveT, z); rol.rotation.y = fin.rotation.y;
        rol2.position.set(rx2, onDeck(rx2) === H ? H : deckTop + paveT, z); rol2.rotation.y = fin.rotation.y;
        // 合材を運ぶダンプ：フィニッシャーの前にバックで付け、荷台を上げてホッパへ落とす→空になったら下げて走り去る（1回の舗装で4台）
        {
          const cyc = (A2.q * 4) % 1; let dx = A2.x + A2.dir * 7.0, ang = 0, fill = 1;
          if (cyc < 0.1) dx += A2.dir * (1 - sm(cyc / 0.1)) * 40;
          else if (cyc < 0.2) ang = sm((cyc - 0.1) / 0.1) * 0.55;
          else if (cyc < 0.8) { ang = 0.55 + 0.1 * sm((cyc - 0.2) / 0.6); fill = 1 - (cyc - 0.2) / 0.6; }
          else if (cyc < 0.9) { ang = 0.65 * (1 - sm((cyc - 0.8) / 0.1)); fill = 0; }
          else { fill = 0; dx += A2.dir * sm((cyc - 0.9) / 0.1) * 40; }
          drive(dump, dx, deckTop, () => z, A2.dir); M.setDump(dump, ang, fill, cyc >= 0.15 && cyc < 0.85 ? 1 : 0);
        }
        const A1p = pss[A1.k];
        cw[0].position.set(on && pr < 0.3 ? A1.x : A2.x - A2.dir * 3, deckTop, (on && pr < 0.3 ? (A1p === 0 ? -1 : 1) : (ps === 0 ? -1 : 1)) * (roadHalf / 2 + 1.2));
        cw[1].position.set((on && pr < 0.3 ? A1.x : A2.x) + 2, deckTop, z * 0.4);
        const wdir = (pr < 0.3 ? A1.dir : A2.dir) > 0 ? 0 : Math.PI; cw.forEach(c => { c.rotation.y = wdir; M.posePerson(c, t, 'walk'); });
        if (on) FOCUS = pr < 0.3 ? cw[0].position : fin.position;
        for (const o of wp) { const k = pss.indexOf(o.ps); if (k < 0) continue; if (t < p.t0) { o.m.visible = false; continue; } o.m.visible = t >= p.t1 || A1.done(k, o.xc) || pw1 >= 1; }
        for (const o of newPave) { const k = pss.indexOf(o.ps); if (k < 0) continue; if (t < p.t0) { o.m.visible = false; continue; } o.m.visible = t >= p.t1 || (pr >= 0.3 && A2.done(k, o.xc + 1)); }
      });
    }
  }
  // 伸縮装置・地覆高欄・区画線
  {
    const p = ph('futaku'); const cr = mk(sel('futaku', 'crane')); const ln = mk(sel('futaku', 'line')); const tk = mk('dump10');
    U.push(t => {
      const pr = prog(p, t), on = act(p, t);
      const zw = isHalf() ? sideZ(workSide(t)) : 0;
      for (const j of newJoint) j.m.visible = t >= p.t1 || (on && pr > (j.end === 0 ? 0.04 : 0.09));
      for (const o of oldJoint) if (t >= p.t0) o.m.visible = false;
      const u = clamp((pr - 0.1) / 0.6, 0, 1), cx = lerp(x0 - 4, x1 + 2, u);
      cr.visible = tk.visible = on && pr < 0.72;
      cr.position.set(cx, onDeck(cx), zw); tk.position.set(cx - 9 + tk.userData.bedCenterX, onDeck(cx - 9), zw); tk.rotation.y = Math.PI;
      const edge = (Math.floor(t * 0.7) % 2 === 0) ? -1 : 1;
      if (cr.userData.type === 'crane') poseCrane(cr, { x: cx + 3, y: deckTop + 0.8, z: edge * (W / 2 - 0.2) }, 12);
      else if (cr.userData.type === 'pump') M.setPumpPose(cr, { x: 3, y: 0, z: edge * (W / 2 - 0.2) - zw });
      for (const r of newRail) r.m.visible = t >= p.t1 || (on && pr > 0.1 && r.xc < cx + 3);
      const lu = clamp((pr - 0.72) / 0.28, 0, 1), lx = lerp(x0 - 6, x1 + 8, lu);
      ln.visible = on && pr >= 0.72; ln.position.set(lx, H, 0.2);
      for (const l of newLine) l.g.visible = t >= p.t1 || (on && pr >= 0.72 && l.xc < lx - 3);
      if (on) FOCUS = pr < 0.72 ? cr.position : ln.position;
    });
  }
  // 旧舗装・旧床版・旧高欄：始まる前は見せる（各工程の更新が担当）／新しい物は完成後も表示
  U.push(t => {
    for (const o of oldPave) { const p0 = ph('sesaku', isHalf() ? o.ps : 'all'); if (t < p0.t0) o.g.visible = true; }
    for (const o of oldJoint) { const p0 = ph('shinshuku', isHalf() ? o.ps : 'all'); if (t < p0.t0) o.m.visible = true; }
    for (const f of flange) { const p0 = ph('ketajomen', isHalf() ? f.ps : 'all'); if (t < p0.t0) { f.rust.visible = true; f.paint.visible = false; if (S.P.studOrder === 'before') f.stud.visible = false; } if (S.P.studOrder === 'after') { const pm = ph('mazume', isHalf() ? f.ps : 'all'); if (t < pm.t0) f.stud.visible = false; } }
    for (const b of blocks) { const p0 = ph('setsudan', isHalf() ? b.ps : 'all'); if (t < p0.t0) b.cutDone = false; }
    for (const s of panelRows) for (const j of joints[s]) { const p0 = ph('mazume', s); if (t < p0.t0) j.m.visible = false; }
    for (const j of tatemeji) { const p0 = ph('tatemeji'); if (t < p0.t0) j.m.visible = false; }
    for (const l of newLine) { const p0 = ph('futaku'); if (t < p0.t0) l.g.visible = false; }
    for (const r of newRail) { const p0 = ph('futaku'); if (t < p0.t0) r.m.visible = false; }
    for (const j of newJoint) { const p0 = ph('futaku'); if (t < p0.t0) j.m.visible = false; }
  });
  // 規制の出入口：工事の車両が12m以内に近づくと誘導員が扉を開け、旗で合図。通り過ぎたら閉める
  U.push(t => {
    for (const gt of GATES) {
      if (!gt.group.visible) continue;
      let dmin = 1e9;
      for (const v of WORKV) {
        if (!v.visible || Math.abs(v.position.z - gt.zc) > 3.2) continue;
        const dir = Math.cos(v.rotation.y) >= 0 ? 1 : -1, back = v.userData.trailer ? 15 : 7;
        const a = v.position.x - dir * back, b = v.position.x + dir * 5, lo = Math.min(a, b), hi = Math.max(a, b);
        dmin = Math.min(dmin, gt.x < lo ? lo - gt.x : gt.x > hi ? gt.x - hi : 0);
      }
      const open = clamp((12 - dmin) / 6, 0, 1), ang = sm(open) * 1.45;
      for (const d of gt.doors) {
        const phi = -gt.out * d.sd * ang;
        d.b.position.set(gt.x - d.sd * 1.1 * Math.sin(phi), H, d.hz - d.sd * 1.1 * Math.cos(phi)); d.b.rotation.y = phi;
      }
      // 誘導員：ふだんは扉の脇→車が来たら扉の端まで歩いて押し開け、旗で合図
      const dr = gt.doors.find(d => d.sd === gt.es), phi = -gt.out * dr.sd * ang;
      const idle = { x: gt.x + gt.out * 1.0, z: dr.hz + gt.es * 0.4 };
      const push = { x: gt.x - dr.sd * 2.2 * Math.sin(phi) + gt.out * 0.5, z: dr.hz - dr.sd * 2.2 * Math.cos(phi) };
      const w = sm(clamp(open * 2.5, 0, 1));
      gt.guard.position.set(lerp(idle.x, push.x, w), H, lerp(idle.z, push.z, w));
      gt.guard.rotation.y = gt.out > 0 ? Math.PI : 0;
      M.posePerson(gt.guard, t, open > 0.02 && open < 0.95 ? 'walk' : open >= 0.95 ? 'go' : 'idle');
    }
  });
  // 置いた部品
  for (const pt of S.parts) {
    const item = C.byId(pt.id); if (!item) continue;
    const g = C.buildPart(item, pt.liv); root.add(g); R(g);
    const y = pt.on === 'deck' ? H : pt.on === 'ground' ? 0 : (pt.h || 0);
    g.position.set(pt.x, y + (pt.dy || 0), pt.z); g.rotation.y = (pt.rot || 0) * Math.PI / 180;
    const a = plan.phases[clamp(pt.from ?? 0, 0, plan.phases.length - 1)], b = plan.phases[clamp(pt.to ?? plan.phases.length - 1, 0, plan.phases.length - 1)];
    U.push(t => { g.visible = t >= a.t0 && t <= b.t1; });
  }
  // 影の範囲
  const span = Lb / 2 + A + 30;
  sun.position.copy(SUN_DIR).multiplyScalar(span * 1.5); sun.target.position.set(0, 0, 0);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 }); sun.shadow.camera.updateProjectionMatrix();
  S.t = clamp(S.t, 0, plan.total);
  applyState(S.t);
  renderPanels();
}

function applyState(t) { FOCUS = null; for (const u of U) u(t); spinWheels(); }

// ───── 地面（地理院の航空写真を貼る）─────
function buildGround(Lb) {
  groundGroup = new THREE.Group(); sceneRoot.add(groundGroup);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), M.mat(S.site ? 0x5d6b50 : 0x8c9a72)); base.rotation.x = -Math.PI / 2; base.position.y = S.site && S.P.terrain ? -70 : -0.06; base.receiveShadow = true; groundGroup.add(base);
  if (!S.site) {
    const river = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(12, Lb * 0.7), 2000), M.mat(0x3a6a80, { rough: 0.08, metal: 0.55, name: 'water' })); river.rotation.x = -Math.PI / 2; river.position.y = -0.03; groundGroup.add(river);
    return;
  }
  groundGroup.rotation.y = -S.site.theta;
  const radius = Math.max(170, Lb / 2 + 150);
  const myRoot = root, site = S.site;
  const notes = [];
  const note = s => { notes.push(s); $('groundNote').textContent = notes.join('／'); };
  Promise.all([groundTexture(site.lat, site.lon, radius), S.P.terrain ? demGrid(site.lat, site.lon, radius).catch(() => null) : Promise.resolve(null)]).then(([r, dem]) => {
    if (root !== myRoot) return;
    const tex = new THREE.CanvasTexture(r.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    // 地形：橋の両端の外側15mの地盤の高さを「路面の高さ」とみなし、そこから H 下を y=0 にする
    let base = 0, elevAt = null;
    if (dem) {
      elevAt = (e, s) => dem.at(r.px + e / r.mpp, r.py + s / r.mpp, r.z);
      const ax = Math.cos(site.theta), ay = Math.sin(site.theta), half = S.P.L / 2 + 5;   // 橋の端から5m外側（取付道路）の地盤
      const eA = elevAt(-ax * half, ay * half), eB = elevAt(ax * half, -ay * half);
      if (eA !== null || eB !== null) {
        const r2 = v => Math.round(v * 100) / 100;
        const aA = r2(eA ?? eB), aB = r2(eB ?? eA);
        G.autoZ = { a: aA, b: aB };
        let low = Infinity; for (let u = -S.P.L / 2; u <= S.P.L / 2; u += 2) { const v = elevAt(ax * u, -ay * u); if (v !== null) low = Math.min(low, v); }
        let changed = false;
        if (S.P.zMode !== 'manual' && (S.P.zStart !== aA || S.P.zEnd !== aB)) { S.P.zStart = aA; S.P.zEnd = aB; changed = true; }
        const zA = Number.isFinite(S.P.zStart) ? S.P.zStart : aA, zB = Number.isFinite(S.P.zEnd) ? S.P.zEnd : aB;
        const deck = (zA + zB) / 2;
        if (!site.hAuto && deck - low > 2) { site.hAuto = true; S.P.H = Math.round((deck - low) * 2) / 2; changed = true; } // 初めて読んだ橋は路面の地上高も合わせる（1回だけ）
        if (changed) { save(); fillForm(); setTimeout(buildWorld, 0); return; }   // 高さを反映して作り直す
        base = deck - S.P.H;
        G.terrain = { deck, low, base };
        note(`地形：国土地理院の標高（${dem.src}）。地形から読んだ路面の標高＝始点 ${fmt(aA, 2)}m・終点 ${fmt(aB, 2)}m／いま使っている高さ＝始点 ${fmt(zA, 2)}m・終点 ${fmt(zB, 2)}m（${S.P.zMode === 'manual' ? '手入力' : '自動'}・縦断勾配 ${fmt(G.grade, 2)}%）／橋の下の一番低い所 約${fmt(low)}m`);
      } else elevAt = null;
    }
    const seg = elevAt ? 180 : 1;
    const geo = new THREE.PlaneGeometry(r.wM, r.hM, seg, seg);
    if (elevAt) { const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const e = r.offX + pa.getX(i), s = r.offZ - pa.getY(i); const v = elevAt(e, s); pa.setZ(i, v === null ? 0 : clamp(v - base, -60, 200) - 0.05); } geo.computeVertexNormals(); }
    const gm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }); gm.color.setScalar(1.3); gm.envMapIntensity = 0.3; gm.name = 'photo';   // 写真は明るさの調整（トーン）で暗く見えるので持ち上げる
    const m = new THREE.Mesh(geo, gm);
    m.rotation.x = -Math.PI / 2; m.position.set(r.offX, -0.02, r.offZ); m.receiveShadow = true;
    groundGroup.add(m); note('写真：地理院タイル（全国最新写真）z' + r.z);
    if (S.P.terrain) osmObjects(site, Math.min(radius, 260), r, elevAt, base).then(n => { if (root === myRoot) note(`建物 ${n.b}棟・電柱など ${n.p}本（OpenStreetMap・形と高さは目安）`); }).catch(e => note('建物・電柱を読めませんでした'));
  }).catch(e => { $('groundNote').textContent = '地面の写真を読めませんでした（' + e.message + '）'; });
}
// 国土地理院の標高タイル（DEM5A→DEM10B の順に使う）
function demGrid(lat, lon, radius) { return cached(`dem|${lat}|${lon}|${radius}`, () => demGrid0(lat, lon, radius)); }
async function demGrid0(lat, lon, radius) {
  const tryOne = async (name, z) => {
    const n = 2 ** z, px = (lon + 180) / 360 * n * 256, lr = lat * Math.PI / 180;
    const py = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n * 256;
    const mpp = 156543.03392 * Math.cos(lr) / n, rp = radius / mpp;
    const tx0 = Math.floor((px - rp) / 256), tx1 = Math.floor((px + rp) / 256), ty0 = Math.floor((py - rp) / 256), ty1 = Math.floor((py + rp) / 256);
    const W = (tx1 - tx0 + 1) * 256, Hh = (ty1 - ty0 + 1) * 256;
    const c = document.createElement('canvas'); c.width = W; c.height = Hh; const ctx = c.getContext('2d', { willReadFrequently: true });
    let ok = 0;
    await Promise.all([...Array((tx1 - tx0 + 1) * (ty1 - ty0 + 1)).keys()].map(k => new Promise(res => {
      const x = tx0 + k % (tx1 - tx0 + 1), y = ty0 + Math.floor(k / (tx1 - tx0 + 1));
      const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { ctx.drawImage(im, (x - tx0) * 256, (y - ty0) * 256); ok++; res(); }; im.onerror = () => res();
      im.src = `https://cyberjapandata.gsi.go.jp/xyz/${name}/${z}/${x}/${y}.png`;
    })));
    if (!ok) throw new Error('none');
    const d = ctx.getImageData(0, 0, W, Hh).data;
    const val = (ix, iy) => { if (ix < 0 || iy < 0 || ix >= W || iy >= Hh) return null; const o = (iy * W + ix) * 4; if (d[o + 3] === 0) return null; const v = d[o] * 65536 + d[o + 1] * 256 + d[o + 2]; if (v === 8388608) return null; return (v < 8388608 ? v : v - 16777216) * 0.01; };
    let good = 0; for (let i = 0; i < 400; i++) if (val(Math.floor(Math.random() * W), Math.floor(Math.random() * Hh)) !== null) good++;
    if (good < 200) throw new Error('sparse');
    return { src: name === 'dem5a_png' ? '5mメッシュ' : '10mメッシュ', z, at: (gx, gy, zPhoto) => { // gx,gy＝写真の画素座標
      const f = 2 ** (z - zPhoto), fx = gx * f - tx0 * 256, fy = gy * f - ty0 * 256;
      const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, w = fy - iy;
      const a = val(ix, iy), b = val(ix + 1, iy), cc = val(ix, iy + 1), dd = val(ix + 1, iy + 1);
      const arr = [a, b, cc, dd]; if (arr.every(x => x === null)) { for (let r = 2; r < 8; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const v = val(ix + dx, iy + dy); if (v !== null) return v; } return null; }
      const avg = arr.filter(x => x !== null).reduce((s, x) => s + x, 0) / arr.filter(x => x !== null).length;
      const [A1, B1, C1, D1] = arr.map(x => x === null ? avg : x);
      return lerp(lerp(A1, B1, u), lerp(C1, D1, u), w);
    } };
  };
  try { return await tryOne('dem5a_png', 15); } catch (e) { return await tryOne('dem_png', 14); }
}
// OpenStreetMap の問い合わせ（混んでいて失敗したら別のサーバーで再試行）
function overpass(q) { return cached('osm|' + q, () => overpass0(q)); }
async function overpass0(q) {
  const eps = ['https://overpass-api.de/api/interpreter'];   // HP用：公開サーバーに負担をかけないよう1回だけ（失敗したら建物なしで続ける）
  let err;
  for (const ep of eps) {
    try { const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }); if (!r.ok) throw new Error('混雑 ' + r.status); return await r.json(); }
    catch (e) { err = e; if (!WEB) await new Promise(r => setTimeout(r, 800)); }
  }
  throw err;
}
// OpenStreetMap の建物（高さは階数×3.2m、無ければ7m）と電柱
async function osmObjects(site, radius, r, elevAt, base) {
  const q = `[out:json][timeout:25];(way["building"](around:${radius},${site.lat},${site.lon});node["power"~"pole|tower"](around:${radius},${site.lat},${site.lon});node["man_made"="utility_pole"](around:${radius},${site.lat},${site.lon}););out geom;`;
  const j = await overpass(q);
  const n = 2 ** r.z;
  const toES = (lat, lon) => { const px = (lon + 180) / 360 * n * 256, lr = lat * Math.PI / 180; const py = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n * 256; return { e: (px - r.px) * r.mpp, s: (py - r.py) * r.mpp }; };
  const ground = (e, s) => elevAt ? (elevAt(e, s) ?? base) - base : 0;
  // 橋と取付道路の帯（建物を置かない）
  const ax = Math.cos(site.theta), ay = Math.sin(site.theta);
  const nearRoad = (e, s) => { const u = e * ax - s * ay, v = e * ay + s * ax; return Math.abs(u) < S.P.L / 2 + 75 && Math.abs(v) < S.P.W / 2 + 2; };
  let nb = 0, np = 0;
  const colors = [0xd9d4ca, 0xc9c4ba, 0xe4e0d8, 0xbfc5cc, 0xd2c3ad];
  for (const el of j.elements || []) {
    if (el.type === 'way' && el.geometry && el.geometry.length > 3 && nb < 600) {
      const pts = el.geometry.map(g => toES(g.lat, g.lon));
      const ce = pts.reduce((a, p) => a + p.e, 0) / pts.length, cs = pts.reduce((a, p) => a + p.s, 0) / pts.length;
      if (nearRoad(ce, cs)) continue;
      const tg = el.tags || {}; const h = parseFloat(tg.height) || (parseFloat(tg['building:levels']) ? parseFloat(tg['building:levels']) * 3.2 : 7);
      const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.e - ce, -(p.s - cs))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: clamp(h, 3, 120), bevelEnabled: false });
      const m = new THREE.Mesh(geo, M.mat(colors[nb % colors.length])); m.rotation.x = -Math.PI / 2; m.position.set(ce, ground(ce, cs) - 0.3, cs); m.castShadow = m.receiveShadow = true;
      groundGroup.add(m); nb++;
    } else if (el.type === 'node' && np < 300) {
      const p = toES(el.lat, el.lon); if (nearRoad(p.e, p.s)) continue;
      const g = new THREE.Group(); g.position.set(p.e, ground(p.e, p.s), p.s);
      const tower = (el.tags || {}).power === 'tower';
      g.add(M.cyl(tower ? 0.6 : 0.17, tower ? 30 : 12, tower ? 0x9aa0a6 : 0xa8a49a, 0, tower ? 15 : 6, 0));
      g.add(M.box(1.8, 0.1, 0.1, 0x666666, 0, tower ? 28 : 11, 0));
      groundGroup.add(g); np++;
    }
  }
  return { b: nb, p: np };
}
// 一度読んだ写真・標高・建物は使い回す（作り直すたびに読みに行くと、配信元から「多すぎる」と断られるため）
const CACHE = new Map();
const cached = (key, fn) => { if (!CACHE.has(key)) CACHE.set(key, fn().catch(e => { CACHE.delete(key); throw e; })); return CACHE.get(key); };
function groundTexture(lat, lon, radius) { return cached(`photo|${lat}|${lon}|${radius}`, () => groundTexture0(lat, lon, radius)); }
function groundTexture0(lat, lon, radius) {
  const mpp0 = 156543.03392 * Math.cos(lat * Math.PI / 180);
  let z = 18; while (z > 15 && (2 * radius / (mpp0 / 2 ** z) / 256) > 9) z--;
  const mpp = mpp0 / 2 ** z, n = 2 ** z;
  const px = (lon + 180) / 360 * n * 256; const lr = lat * Math.PI / 180;
  const py = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n * 256;
  const rp = radius / mpp;
  const tx0 = Math.floor((px - rp) / 256), tx1 = Math.floor((px + rp) / 256), ty0 = Math.floor((py - rp) / 256), ty1 = Math.floor((py + rp) / 256);
  const c = document.createElement('canvas'); c.width = (tx1 - tx0 + 1) * 256; c.height = (ty1 - ty0 + 1) * 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#8c9a72'; ctx.fillRect(0, 0, c.width, c.height);
  const jobs = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push(new Promise(res => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { ctx.drawImage(im, (x - tx0) * 256, (y - ty0) * 256); res(true); }; im.onerror = () => res(false);
    im.src = `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`;
  }));
  return Promise.all(jobs).then(ok => {
    if (!ok.some(Boolean)) throw new Error('タイル取得失敗');
    return { canvas: c, z, px, py, mpp, wM: c.width * mpp, hM: c.height * mpp, offX: (tx0 * 256 + c.width / 2 - px) * mpp, offZ: (ty0 * 256 + c.height / 2 - py) * mpp };
  });
}

// ───── 画面（工程リスト・タイムライン・HUD）─────
const SIDE_LABEL = s => s === 0 ? '第1期・左側' : s === 1 ? '第2期・右側' : '';
function machineOptions(slot, cur) { return slot.opt.map(id => `<option value="${id}" ${id === cur ? 'selected' : ''}>${K.MACHINES[id].name}</option>`).join(''); }
function checkHtml(key, s) {
  const c = CHECKS[key + '_' + s]; if (!c) return '';
  const r = K.craneCheck(c.mid(), c.radius, c.ton); if (!r) return '';
  const mark = !r.ok ? '<b class="ng">目安を超える</b>' : r.warn ? '<b class="warn">目安に近い</b>' : '<b class="ok">目安内</b>';
  return `<div class="chk">${c.what} 約${fmt(c.ton)}t／作業半径 約${fmt(c.radius, 0)}m → 吊れる重さの目安 ${fmt(r.cap)}t ${mark}<span class="kari">（仮の目安・性能表で要確認）</span></div>`;
}
function renderPanels() {
  // 工程リスト
  const shown = new Set();
  $('phaseList').innerHTML = plan.phases.map((p, idx) => {
    const def = K.PHASES[p.key]; const first = !shown.has(p.key); shown.add(p.key);
    const slots = first ? def.slots.map(sl => `<label class="slot">${sl.label}<select data-key="${p.key}" data-slot="${sl.k}">${machineOptions(sl, sel(p.key, sl.k))}</select></label>`).join('') : (def.slots.length ? '<div class="same">重機は上と同じ</div>' : '');
    const chk = (p.key === 'tekkyo' || p.key === 'kasetsu') ? checkHtml(p.key, p.side) : '';
    return `<div class="ph" data-idx="${idx}" style="--c:${p.color}"><div class="phh"><span class="no">${idx + 1}</span><span class="nm">${p.name}</span><span class="sd">${SIDE_LABEL(p.side)}</span><span class="dy">${p.days ? p.days + '日' : ''}</span></div>${slots}${chk}</div>`;
  }).join('');
  $('phaseList').querySelectorAll('select').forEach(el => el.onchange = () => { S.mach[el.dataset.key][el.dataset.slot] = el.value; save(); buildWorld(); });
  $('phaseList').querySelectorAll('.phh').forEach(el => el.onclick = () => { const p = plan.phases[+el.parentElement.dataset.idx]; S.t = p.t0 + 0.01; S.playing = false; });
  // タイムライン
  $('strip').innerHTML = plan.phases.map(p => `<div style="flex:${p.dur};background:${p.color}" title="${p.name} ${SIDE_LABEL(p.side)}"></div>`).join('');
  $('totalDays').textContent = `全${plan.totalDays}日（仮の目安）`;
  renderPlaced();
}
function curPhase(t) { return plan.phases.find(p => t >= p.t0 && t < p.t1) || plan.phases[plan.phases.length - 1]; }
function updateHUD() {
  const p = curPhase(S.t), pr = prog(p, S.t);
  const day = Math.max(1, Math.ceil(p.d0 + pr * p.days + 1e-6));
  $('hudPhase').textContent = `${plan.phases.indexOf(p) + 1}. ${p.name}`;
  $('hudSide').textContent = SIDE_LABEL(p.side);
  $('hudDay').textContent = p.key === 'genkyo' ? '着工前' : (p.key === 'kaijo' && pr > 0.5 ? '供用開始' : `${day}日目 / 全${plan.totalDays}日（仮）`);
  if (S.out === 'yakusho') {
    $('hudMach').textContent = (K.PLAIN[p.key] || '') + '　' + TRAFFIC_TEXT[TRAFFIC];
  } else {
    const ids = []; for (const sl of K.PHASES[p.key].slots) ids.push(K.MACHINES[sel(p.key, sl.k)].name);
    if (p.key === 'kirikae' || p.key === 'kaijo') ids.push(K.MACHINES[sel('kisei', 'main')].name);
    let extra = '';
    const c = CHECKS[p.key + '_' + p.side];
    if (c) { const r = K.craneCheck(c.mid(), c.radius, c.ton); if (r) extra = `　｜${c.what} 約${fmt(c.ton)}t・半径 約${fmt(c.radius, 0)}m・目安の能力 ${fmt(r.cap)}t ${!r.ok ? '目安を超える' : r.warn ? '目安に近い' : '目安内'}（仮）`; }
    $('hudMach').textContent = '重機：' + ids.join('・') + extra;
  }
  $('seek').value = String(S.t / plan.total * 1000);
  $('tnow').textContent = `${fmt(S.t, 0)}秒 / ${fmt(plan.total, 0)}秒`;
  $('playBtn').textContent = S.playing ? '❚❚ 一時停止' : '▶ 再生';
}

// ───── 描画ループ ─────
let last = performance.now(); const prevTarget = new THREE.Vector3();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.playing) { S.t += dt * S.speed; if (S.t >= plan.total) { S.t = plan.total; S.playing = false; if (REC) stopRec(); } }
  applyState(S.t); updateHUD();
  if (S.follow && FOCUS && (S.playing || REC)) {
    prevTarget.copy(controls.target);
    const goal = root.localToWorld(new THREE.Vector3(FOCUS.x, FOCUS.y + 2, FOCUS.z));
    controls.target.lerp(goal, 0.04); camera.position.add(controls.target.clone().sub(prevTarget));
  }
  controls.update(); renderer.render(scene, camera);
  if (REC) drawRec();
  requestAnimationFrame(loop);
}
function camPreset(k) {
  const L = S.P.L, H = S.P.H;
  const T = new THREE.Vector3(0, H, 0); controls.target.copy(T);
  if (k === 'all') camera.position.set(-L * 0.55 - 35, H + 28 + L * 0.15, L * 0.45 + 30);
  if (k === 'side') camera.position.set(0, H * 0.6, S.P.W + 30 + L * 0.55);
  if (k === 'top') camera.position.set(0.01, L + 90, 0.01);
  if (k === 'low') { camera.position.set(-L / 2 - 50, H + 2.5, -2); controls.target.set(0, H + 1, 0); }
  controls.update();
}

// ───── 動画（WebM）：画面＋工程名の文字を重ねて録画 ─────
let REC = null;
function startRec() {
  const c = document.createElement('canvas'); const w = renderer.domElement.width, h = renderer.domElement.height; c.width = w; c.height = h;
  const ctx = c.getContext('2d'); const st = c.captureStream(30);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  const mr = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: 8e6 }); const chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => { const b = new Blob(chunks, { type: 'video/webm' }); dl(b, `床版架替_4D_${stamp()}.webm`); $('recBtn').textContent = '● 動画を録る（WebM）'; };
  REC = { c, ctx, mr }; S.t = 0; S.playing = true; mr.start(500); $('recBtn').textContent = '■ 録画中（終わると保存）';
}
function stopRec() { if (!REC) return; REC.mr.stop(); REC = null; }
function drawRec() {
  const { c, ctx } = REC; ctx.drawImage(renderer.domElement, 0, 0);
  const s = c.height / 720;
  const l1 = $('hudPhase').textContent + ' ' + $('hudSide').textContent, l2 = $('hudDay').textContent, l3 = $('hudMach').textContent;
  ctx.font = `${17 * s}px "Yu Gothic","Meiryo",sans-serif`; const w3 = ctx.measureText(l3).width;
  const bw = Math.min(c.width - 40 * s, Math.max(560 * s, w3 + 50 * s));
  ctx.fillStyle = 'rgba(27,42,74,0.84)'; ctx.fillRect(20 * s, 20 * s, bw, 112 * s);
  ctx.fillStyle = '#c9a227'; ctx.fillRect(20 * s, 20 * s, 8 * s, 112 * s);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${30 * s}px "Yu Gothic","Meiryo",sans-serif`; ctx.fillText(l1, 42 * s, 58 * s);
  ctx.font = `${19 * s}px "Yu Gothic","Meiryo",sans-serif`; ctx.fillText(l2, 42 * s, 90 * s);
  ctx.fillStyle = '#d7deea'; ctx.font = `${17 * s}px "Yu Gothic","Meiryo",sans-serif`; ctx.fillText(l3, 42 * s, 118 * s, bw - 40 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `${15 * s}px "Yu Gothic",sans-serif`; ctx.fillStyle = 'rgba(11,22,38,0.55)'; ctx.fillRect(0, c.height - (S.site ? 52 : 30) * s, c.width, (S.site ? 52 : 30) * s);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText('説明用の簡易シミュレーション（日数・重機の能力・寸法は目安。実際の施工計画・設計・安全の検討には使えません）　株式会社ファルコン', 24 * s, c.height - (S.site ? 32 : 10) * s);
  if (S.site) ctx.fillText('背景の航空写真・地形：国土地理院の地理院タイル（全国最新写真・標高タイル）を加工して作成／建物：© OpenStreetMap contributors', 24 * s, c.height - 10 * s);
}

// ───── Blender用の書き出し（GLB＋工程表JSON）─────
function stamp() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function bakeGLB(speed, fps) {
  const T = plan.total, n = Math.floor(T / speed * fps) + 1;
  const objs = ANIM, rec = objs.map(() => ({ p: [], q: [], s: [] }));
  const was = S.t;
  for (let k = 0; k < n; k++) {
    applyState(Math.min(T, k * speed / fps));
    for (let i = 0; i < objs.length; i++) { const o = objs[i], r = rec[i], sc = o.visible ? 1 : 1e-4; r.p.push(o.position.x, o.position.y, o.position.z); r.q.push(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w); r.s.push(o.scale.x * sc, o.scale.y * sc, o.scale.z * sc); }
    if (k % 50 === 0) { $('expMsg').textContent = `動きを記録中… ${Math.round(k / n * 100)}%`; await new Promise(r => setTimeout(r, 0)); }
  }
  const times = Float32Array.from({ length: n }, (_, k) => k / fps);
  const tracks = []; const saved = [];
  const compress = (arr, w) => { const keepT = [], keepV = []; const same = (a, b) => { for (let c = 0; c < w; c++) if (Math.abs(arr[a * w + c] - arr[b * w + c]) > 1e-5) return false; return true; };
    for (let k = 0; k < n; k++) { if (k === 0 || k === n - 1 || !same(k, k - 1) || !same(k, k + 1)) { keepT.push(times[k]); for (let c = 0; c < w; c++) keepV.push(arr[k * w + c]); } } return [keepT, keepV]; };
  objs.forEach((o, i) => {
    const r = rec[i];
    saved.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible });
    for (const [ch, arr, w, Cls] of [['position', r.p, 3, THREE.VectorKeyframeTrack], ['quaternion', r.q, 4, THREE.QuaternionKeyframeTrack], ['scale', r.s, 3, THREE.VectorKeyframeTrack]]) {
      const [kt, kv] = compress(arr, w);
      if (kt.length > 2 || (kt.length === 2 && kv.slice(0, w).some((x, c) => Math.abs(x - kv[w + c]) > 1e-5))) tracks.push(new Cls(`${o.name}.${ch}`, kt, kv));
    }
    // 最初の状態を静止値として書く
    o.position.fromArray(r.p, 0); o.quaternion.fromArray(r.q, 0); o.scale.fromArray(r.s, 0); o.visible = true;
  });
  const clip = new THREE.AnimationClip('施工手順', (n - 1) / fps, tracks);
  $('expMsg').textContent = 'GLBを作成中…';
  const glb = await new GLTFExporter().parseAsync(sceneRoot, { binary: true, animations: [clip], onlyVisible: false });   // 橋と工事に加えて、地面・川・地形・建物も書き出す
  saved.forEach(x => { x.o.position.copy(x.p); x.o.quaternion.copy(x.q); x.o.scale.copy(x.s); x.o.visible = x.v; });
  applyState(was);
  const meta = {
    title: '橋梁床版架替 4D施工シミュレーション', made: new Date().toISOString(), fps, frames: n, speed,
    site: S.site, params: S.P,
    camera: { pos: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov },
    out: S.out,
    phases: plan.phases.map((p, i) => { applyState(p.t0 + p.dur * 0.5); return { no: i + 1, key: p.key, name: p.name, side: SIDE_LABEL(p.side), start: p.t0 / speed, end: p.t1 / speed, d0: p.d0, days: p.days, plain: K.PLAIN[p.key] || '', traffic: TRAFFIC_TEXT[TRAFFIC], machines: K.PHASES[p.key].slots.map(sl => K.MACHINES[sel(p.key, sl.k)].name) }; }),
    totalDays: plan.totalDays, tracks: tracks.length, objects: objs.length,
  };
  return { glb: new Blob([glb], { type: 'model/gltf-binary' }), meta };
}
async function exportForBlender(mode) {
  const speed = +$('expSpeed').value, fps = 15;
  $('expBtn').disabled = $('expBtn2').disabled = true;
  try {
    const { glb, meta } = await bakeGLB(speed, fps);
    const name = `床版架替_4D_${stamp()}`;
    if (mode === 'download') { dl(glb, name + '.glb'); dl(new Blob([JSON.stringify(meta, null, 1)], { type: 'application/json' }), name + '.json'); $('expMsg').textContent = `書き出しました（${(glb.size / 1e6).toFixed(1)}MB・動き${meta.tracks}本）`; return; }
    $('expMsg').textContent = 'フォルダへ保存中…';
    let r = await fetch(`/api/save?dir=${encodeURIComponent(name)}&file=scene.glb`, { method: 'POST', body: glb }); if (!r.ok) throw new Error('保存できません（serve.py で起動してください）');
    r = await fetch(`/api/save?dir=${encodeURIComponent(name)}&file=scene.json`, { method: 'POST', body: JSON.stringify(meta) }); if (!r.ok) throw new Error('保存できません');
    r = await fetch('/api/blender', { method: 'POST', body: JSON.stringify({ dir: name, render: $('expRender').value, res: $('expRes').value }) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'Blenderを起動できません');
    pollJob(j.job, name);
  } catch (e) { $('expMsg').textContent = '⚠️ ' + e.message; }
  finally { $('expBtn').disabled = $('expBtn2').disabled = false; }
}
async function pollJob(job, name) {
  const r = await fetch('/api/job?id=' + job); const j = await r.json();
  $('expMsg').textContent = j.state === 'running' ? `Blenderで作成中…（${j.progress || ''}）` : j.state === 'done' ? `✅ できました：出力\\${name}\\（${j.files.join('・')}）` : `⚠️ Blenderの処理で問題：${j.error || ''}`;
  if (j.state === 'running') setTimeout(() => pollJob(job, name), 3000);
}

// ───── 説明資料（印刷用HTML）：役所向け／業者向け ─────
async function makeReport() {
  const was = S.t, wasPlay = S.playing; S.playing = false;
  const camSave = { p: camera.position.clone(), t: controls.target.clone() };
  const yak = S.out === 'yakusho';
  const keys = yak ? ['genkyo', 'kisei', 'tekkyo', 'kasetsu', 'hosou', 'kaijo'] : ['kisei', 'kouran', 'tekkyo', 'kasetsu', 'mazume', 'hosou', 'futaku', 'kaijo'];
  const shots = [];
  const snap = () => { const c = document.createElement('canvas'); c.width = 960; c.height = Math.round(960 * renderer.domElement.height / renderer.domElement.width); c.getContext('2d').drawImage(renderer.domElement, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85); };
  for (const k of keys) {
    const p = plan.phases.find(x => x.key === k); if (!p) continue;
    const tm = k === 'kaijo' ? p.t1 - 0.5 : p.t0 + p.dur * 0.5; applyState(tm);
    if (FOCUS && k !== 'genkyo' && k !== 'kaijo') { const off = camera.position.clone().sub(controls.target); controls.target.copy(root.localToWorld(new THREE.Vector3(FOCUS.x, FOCUS.y + 2, FOCUS.z))); camera.position.copy(controls.target).add(off); controls.update(); }
    renderer.render(scene, camera); shots.push({ p, img: snap(), traffic: TRAFFIC_TEXT[TRAFFIC] });
  }
  const rows = plan.phases.map((p, i) => { applyState(p.t0 + p.dur * 0.5); return { i: i + 1, p, traffic: TRAFFIC_TEXT[TRAFFIC].replace('通行：', ''), mach: K.PHASES[p.key].slots.map(sl => K.MACHINES[sel(p.key, (p.key === 'kirikae' ? 'main' : sl.k))].name).join('・') || (p.key === 'kirikae' ? K.MACHINES[sel('kisei', 'main')].name : '') }; });
  S.t = was; applyState(was); S.playing = wasPlay;
  camera.position.copy(camSave.p); controls.target.copy(camSave.t); controls.update();
  const Q = plan.Q, site = S.site;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const title = yak ? '橋梁床版取替工事　施工手順のご説明（案）' : '床版取替　施工手順の打合せ用資料（目安）';
  const chk = k => { const out = []; for (const s of ['all', 0, 1]) { const c = CHECKS[k + '_' + s]; if (!c) continue; const r = K.craneCheck(c.mid(), c.radius, c.ton); if (r) out.push(`${K.MACHINES[c.mid()].name}：${c.what} 約${fmt(c.ton)}t／作業半径 約${fmt(c.radius, 0)}m／目安の能力 ${fmt(r.cap)}t → ${!r.ok ? '目安を超える' : r.warn ? '目安に近い' : '目安内'}`); } return [...new Set(out)]; };
  const table = yak
    ? `<table><tr><th>順</th><th>工程</th><th>内容</th><th>車の通行</th><th>日数の目安</th></tr>${rows.map(r => `<tr><td>${r.i}</td><td>${esc(r.p.name)}<br><small>${SIDE_LABEL(r.p.side)}</small></td><td>${esc(K.PLAIN[r.p.key] || '')}</td><td>${esc(r.traffic)}</td><td>${r.p.days ? r.p.days + '日' : '—'}</td></tr>`).join('')}</table>`
    : `<table><tr><th>順</th><th>工程</th><th>期</th><th>使う重機</th><th>日数（仮）</th></tr>${rows.map(r => `<tr><td>${r.i}</td><td>${esc(r.p.name)}</td><td>${SIDE_LABEL(r.p.side)}</td><td>${esc(r.mach)}</td><td>${r.p.days || '—'}</td></tr>`).join('')}</table>`;
  const qty = yak ? '' : `<h2>数量と吊り荷の目安</h2><table><tr><th>項目</th><th>値</th></tr>
    <tr><td>撤去ブロック</td><td>${Q.nBlocksTotal}個（1つ 約${fmt(G.bl)}m×${fmt(S.P.W / 2)}m・約${fmt(Q.blockTon)}t）</td></tr>
    <tr><td>PC床版</td><td>${Q.nPanelsTotal}枚（1枚 約${fmt(G.pw)}m×${fmt(Q.panelWidthZ)}m×${S.P.panelT}m・約${fmt(Q.panelTon)}t）</td></tr>
    <tr><td>1日の架設枚数</td><td>${S.P.perDay}枚（仮）</td></tr>
    ${[...chk('tekkyo'), ...chk('kasetsu')].map(s => `<tr><td>クレーンの能力の目安（仮）</td><td>${esc(s)}</td></tr>`).join('')}</table>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title><style>
@page{size:A4;margin:12mm}body{font-family:"Yu Gothic","Meiryo",sans-serif;color:#1d2433;font-size:10.5pt;margin:0}
.head{border-bottom:3px solid #c9a227;padding-bottom:6px;margin-bottom:10px}.head h1{font-size:17pt;color:#1b2a4a;margin:0}.head p{margin:3px 0 0;color:#5b6577}
h2{font-size:12pt;color:#1b2a4a;border-left:5px solid #c9a227;padding-left:6px;margin:14px 0 6px;break-after:avoid;page-break-after:avoid}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #c8ced8;padding:4px 6px;vertical-align:top}th{background:#1b2a4a;color:#fff;font-weight:600}
tr,figure,.box{break-inside:avoid;page-break-inside:avoid}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
figure{margin:0;border:1px solid #c8ced8;border-radius:4px;overflow:hidden}figure img{width:100%;display:block}figcaption{padding:4px 6px;font-size:9.5pt}figcaption b{color:#1b2a4a}
.box{background:#f4f5f7;border:1px solid #d9dde4;border-radius:4px;padding:6px 8px}.note{font-size:8.5pt;color:#5b6577;margin-top:10px}small{color:#5b6577}
</style></head><body>
<div class="head"><h1>${title}</h1><p>${site ? esc(site.name) + '　' : ''}橋長 約${fmt(S.P.L)}m・全幅 約${fmt(S.P.W)}m・${S.P.method === 'half' ? '片側交互通行で左右半分ずつ施工' : '全面通行止めで施工'}・全体の日数の目安 約${plan.totalDays}日</p></div>
${yak ? `<div class="box">この資料は、工事の流れを3Dの絵でわかりやすくお伝えするためのものです。実際の日程・規制の時間帯・迂回路は、別途お知らせいたします。</div>` : ''}
<h2>${yak ? '工事の流れ（場面ごと）' : '主な場面'}</h2><div class="grid">${shots.map(s => `<figure><img src="${s.img}"><figcaption><b>${esc(s.p.name)}</b> ${SIDE_LABEL(s.p.side)}<br>${esc(yak ? (K.PLAIN[s.p.key] || '') : K.PHASES[s.p.key].slots.map(sl => K.MACHINES[sel(s.p.key, sl.k)].name).join('・'))}<br><small>${esc(s.traffic)}</small></figcaption></figure>`).join('')}</div>
<h2>工程の一覧</h2>${table}${qty}
<p class="note">※この資料は説明用の簡易シミュレーションから作ったもので、実際の施工計画・設計・安全の検討には使えません。日数・寸法・重機の能力は目安（仮の値を含む）です。${yak ? '' : '施工計画・積算には、メーカーの性能表と現地の条件で確認した値を使ってください。'}図の重機・資材は一般的な形の簡易モデルで、特定のメーカーの製品を示すものではありません。${site ? '<br>背景の航空写真・地形：国土地理院の地理院タイル（全国最新写真・標高タイル）を加工して作成／建物：© OpenStreetMap contributors' : ''}<br>${WEB ? '株式会社ファルコンの「床版架替 4Dシミュレーター（試作版）」で作成' : '株式会社ファルコン　作成'} ${new Date().toLocaleDateString('ja-JP')}</p>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const name = `${yak ? '説明資料_役所向け' : '打合せ用資料_目安'}_床版架替_${stamp()}.html`;
  try { const r = await fetch(`/api/save?dir=${encodeURIComponent('資料_' + stamp())}&file=${encodeURIComponent(name)}`, { method: 'POST', body: blob }); const j = await r.json(); $('expMsg').textContent = '✅ 説明資料を保存しました：' + j.path; }
  catch (e) { dl(blob, name); $('expMsg').textContent = '説明資料をダウンロードしました：' + name; }
  window.open(URL.createObjectURL(blob), '_blank');
}

// ───── 部品ライブラリ ─────
const LIV_PRESETS = {
  falcon: { label: 'ファルコン標準（白×分類色の帯）', f: it => C.defaultLivery(it) },
  navy: { label: '紺×金', f: () => ({ body: 0x1b2a4a, accent: 0xc9a227, pattern: 'stripe', text: 'FALCON' }) },
  yellow: { label: '黄色×黒', f: () => ({ body: 0xf2c200, accent: 0x222222, pattern: 'solid' }) },
  orange: { label: 'オレンジ×白', f: () => ({ body: 0xe8731a, accent: 0xffffff, pattern: 'stripe' }) },
  blue: { label: '青×白（ツートン）', f: () => ({ body: 0x2f6fb5, accent: 0xf3f1ea, pattern: 'twotone' }) },
  green: { label: '緑×白', f: () => ({ body: 0x3a7d44, accent: 0xf3f1ea, pattern: 'stripe' }) },
  logo: { label: '白×紺（社名入り）', f: () => ({ body: 0xf3f1ea, accent: 0x1b2a4a, pattern: 'logo', text: 'FALCON' }) },
};
const hex = v => '#' + (v >>> 0).toString(16).padStart(6, '0');
const unhex = s => parseInt(s.replace('#', ''), 16);
let libSel = null, libLiv = null;
const pv = { r: null, s: null, c: null, obj: null };
function initLibrary() {
  $('libCat').innerHTML = '<option value="">すべての分類</option>' + Object.entries(C.CATS).map(([k, v]) => `<option value="${k}">${k} ${v}</option>`).join('');
  $('livPreset').innerHTML = Object.entries(LIV_PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('') + '<option value="custom">自由に選ぶ</option>';
  $('livPat').innerHTML = Object.entries(M.PATTERNS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('mLivPreset').innerHTML = '<option value="">機種ごとの標準色</option>' + Object.entries(LIV_PRESETS).filter(([k]) => k !== 'falcon').map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('libCat').onchange = $('libQ').oninput = renderLib;
  renderLib();
  pv.r = new THREE.WebGLRenderer({ antialias: true }); pv.r.setPixelRatio(Math.min(2, window.devicePixelRatio)); pv.r.outputColorSpace = THREE.SRGBColorSpace;
  $('pv').appendChild(pv.r.domElement); pv.s = new THREE.Scene(); pv.s.background = new THREE.Color(0xeef1f5);
  pv.s.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 1.4)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(5, 10, 6); pv.s.add(d);
  pv.s.add(new THREE.GridHelper(40, 40, 0xc0c6ce, 0xd8dde3));
  pv.c = new THREE.PerspectiveCamera(35, 1, 0.05, 500);
  const tick = () => { if (pv.obj && !$('libPane').hidden) { pv.obj.rotation.y += 0.008; const w = $('pv').clientWidth; pv.r.setSize(w, w * 0.62); pv.c.aspect = 1 / 0.62; pv.c.updateProjectionMatrix(); pv.r.render(pv.s, pv.c); } requestAnimationFrame(tick); };
  tick();
  for (const id of ['livPreset', 'livBody', 'livAcc', 'livPat', 'livText']) $(id).oninput = onLivChange;
  $('placeBtn').onclick = placePart;
  $('mLivPreset').onchange = () => { const k = $('mLivPreset').value; S.liv = k ? LIV_PRESETS[k].f() : null; save(); buildWorld(); };
}
function renderLib() {
  const cat = $('libCat').value, q = $('libQ').value.trim();
  const list = C.CATALOG.filter(it => (!cat || it.cat === cat) && (!q || it.name.includes(q) || it.id.includes(q.toUpperCase())));
  $('libCount').textContent = `${list.length}種`;
  $('libList').innerHTML = list.map(it => `<button class="li ${libSel && libSel.id === it.id ? 'on' : ''}" data-id="${it.id}"><span class="cid" style="background:${hex(C.CAT_ACCENT[it.cat])}">${it.id}</span>${it.name}<small>${it.dims.join('×')}m</small></button>`).join('');
  $('libList').querySelectorAll('.li').forEach(b => b.onclick = () => selectPart(b.dataset.id));
}
function selectPart(id) {
  libSel = C.byId(id); libLiv = C.defaultLivery(libSel);
  $('livPreset').value = 'falcon'; syncLivInputs(); renderLib(); showPreview();
  $('pvName').textContent = `${libSel.id}　${libSel.name}`;
  $('pvInfo').textContent = `大きさの目安 ${libSel.dims.join('×')} m（長×幅×高）${libSel.moves ? '／動く部分：' + libSel.moves : ''}`;
  $('livBox').classList.toggle('locked', libSel.lock);
  $('livLockNote').hidden = !libSel.lock;
}
function syncLivInputs() { $('livBody').value = hex(libLiv.body); $('livAcc').value = hex(libLiv.accent); $('livPat').value = libLiv.pattern; $('livText').value = libLiv.text || 'FALCON'; }
function onLivChange(e) {
  if (!libSel) return;
  if (e.target.id === 'livPreset') { const k = $('livPreset').value; if (k !== 'custom') { libLiv = LIV_PRESETS[k].f(libSel); syncLivInputs(); } }
  else { $('livPreset').value = 'custom'; libLiv = { body: unhex($('livBody').value), accent: unhex($('livAcc').value), pattern: $('livPat').value, text: $('livText').value || 'FALCON' }; }
  showPreview();
}
function showPreview() {
  if (pv.obj) pv.s.remove(pv.obj);
  pv.obj = C.buildPart(libSel, libLiv); pv.s.add(pv.obj);
  const b = new THREE.Box3().setFromObject(pv.obj), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const r = Math.max(sz.x, sz.y, sz.z, 0.5);
  pv.c.position.set(c.x + r * 1.3, c.y + r * 0.8, c.z + r * 1.5); pv.c.lookAt(c);
}
function placePart() {
  if (!libSel) return;
  const tgt = controls.target;
  S.parts.push({ uid: Date.now(), id: libSel.id, x: +fmt(tgt.x, 1), z: +fmt(tgt.z + 4, 1), on: 'deck', rot: 0, from: plan.phases.indexOf(curPhase(S.t)), to: plan.phases.length - 1, liv: libSel.lock ? null : { ...libLiv } });
  save(); buildWorld();
}
function renderPlaced() {
  const opts = sel => plan.phases.map((p, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}. ${p.name} ${SIDE_LABEL(p.side)}</option>`).join('');
  $('placed').innerHTML = S.parts.length ? S.parts.map((pt, k) => { const it = C.byId(pt.id); return `<div class="pp" data-k="${k}"><b>${pt.id} ${it ? it.name : ''}</b>
    <label>橋軸 x<input type="number" step="0.5" data-f="x" value="${pt.x}"></label><label>横 z<input type="number" step="0.5" data-f="z" value="${pt.z}"></label>
    <label>置く面<select data-f="on"><option value="deck" ${pt.on === 'deck' ? 'selected' : ''}>路面</option><option value="ground" ${pt.on === 'ground' ? 'selected' : ''}>地面</option></select></label>
    <label>向き°<input type="number" step="15" data-f="rot" value="${pt.rot}"></label>
    <label>出る工程<select data-f="from">${opts(pt.from)}</select></label><label>消える工程<select data-f="to">${opts(pt.to)}</select></label>
    <button data-del="${k}">削除</button></div>`; }).join('') : '<p class="muted">まだありません。上で部品を選んで「この場所に置く」を押すと、いま見ている場所（画面の中心）に置かれます。</p>';
  $('placed').querySelectorAll('input,select').forEach(el => el.onchange = () => { const pt = S.parts[+el.closest('.pp').dataset.k]; const f = el.dataset.f; pt[f] = (f === 'on') ? el.value : +el.value; save(); buildWorld(); });
  $('placed').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.parts.splice(+b.dataset.del, 1); save(); buildWorld(); });
}

// ───── 設定フォーム ─────
const FIELDS = ['L', 'W', 'spans', 'girders', 'H', 'panelW', 'panelT', 'blockLen', 'perDay', 'method', 'studOrder', 'railType', 'soundWall', 'terrain', 'zMode', 'zStart', 'zEnd', 'carKmh', 'lanes'];
const STRF = ['method', 'studOrder', 'railType', 'soundWall', 'zMode'];
const NULLF = ['zStart', 'zEnd'];
function fillForm() { FIELDS.forEach(f => { const el = $('p_' + f); if (el) el.value = (S.P[f] === null || S.P[f] === undefined) ? '' : String(S.P[f]); }); }
function readForm() {
  FIELDS.forEach(f => { const el = $('p_' + f); if (!el) return; S.P[f] = STRF.includes(f) ? el.value : f === 'terrain' ? el.value === 'true' : NULLF.includes(f) ? (el.value.trim() === '' ? null : +el.value) : +el.value; });
  if (S.P.lanes === 1 && S.P.method === 'half') { S.P.method = 'full'; const el = $('p_method'); if (el) el.value = 'full'; }
  S.P.L = clamp(S.P.L, 8, 600); S.P.W = clamp(S.P.W, 5, 30); S.P.spans = clamp(Math.round(S.P.spans), 1, 20); S.P.girders = clamp(Math.round(S.P.girders), 2, 10);
  S.P.panelW = clamp(S.P.panelW, 1, 4); S.P.panelT = clamp(S.P.panelT, 0.15, 0.3); S.P.blockLen = clamp(S.P.blockLen, 1, 4); S.P.perDay = clamp(Math.round(S.P.perDay), 1, 30); S.P.H = clamp(S.P.H, 2, 60);
}
function save() { try { localStorage.setItem('shoban_bim_v1', JSON.stringify({ site: S.site, P: S.P, mach: S.mach, liv: S.liv, parts: S.parts, out: S.out })); } catch (e) { } }
function load() { try { const j = JSON.parse(localStorage.getItem('shoban_bim_v1') || 'null'); if (j) { Object.assign(S, { site: j.site, P: { ...K.DEFAULT_PARAMS, ...j.P }, mach: { ...K.defaultMachines(), ...j.mach }, liv: j.liv, parts: j.parts || [], out: j.out || 'gyosha' }); } } catch (e) { } }

// ───── 地図（場所えらび）─────
let map, pickPts = [], pickLayer = null, mode = 'auto';
function initMap() {
  const Lf = window.L;
  map = Lf.map('map', { zoomControl: true, minZoom: 9 }).setView([38.2602, 140.8823], 14);   // ズーム8以下の写真は別の出所表記が要るため使わない
  const photo = Lf.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', { maxZoom: 20, maxNativeZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>（全国最新写真。ズーム9〜13のデータソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO））' });
  const std = Lf.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>（標準地図）' });
  const osm = Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' });
  photo.addTo(map); Lf.control.layers({ '航空写真（地理院）': photo, '標準地図（地理院）': std, 'OpenStreetMap': osm }).addTo(map);
  map.on('click', e => onMapClick(e.latlng));
  document.querySelectorAll('input[name=pickmode]').forEach(r => r.onchange = () => { mode = r.value; pickPts = []; $('mapMsg').textContent = mode === 'auto' ? '橋の上をクリックしてください。地図のデータ（OpenStreetMap）から橋の両端を読み取ります。' : '橋の起点側の端をクリックし、次に終点側の端をクリックしてください。'; });
  if ($('searchBtn')) { $('searchBtn').onclick = searchPlace; $('searchQ').onkeydown = e => { if (e.key === 'Enter') searchPlace(); }; }   // HP用には地名検索がない
  if (S.site) drawSite();
}
async function searchPlace() {
  const q = $('searchQ').value.trim(); if (!q) return;
  $('mapMsg').textContent = '検索中…';
  try { const r = await Promise.reject(new Error('この版では地名検索は使えません')); const j = await r.json();
    if (!j.length) { $('mapMsg').textContent = '見つかりませんでした。地図を動かして探してください。'; return; }
    const go = k => { const [lon, lat] = j[k].geometry.coordinates; map.setView([lat, lon], 17); $('mapMsg').textContent = `「${j[k].properties.title}」へ移動しました。橋をクリックしてください。`; };
    if (j.length === 1) return go(0);
    $('mapMsg').innerHTML = '候補がいくつかあります。選んでください：<br>' + j.slice(0, 10).map((r, k) => `<button class="hb" style="background:#fff;color:#1b2a4a;margin:2px 0;text-align:left;width:100%" data-k="${k}">${r.properties.title}</button>`).join('') + '<br><span class="note">橋の名前では出ないことがあります。そのときは「仙台市若林区」など地名で探してください。</span>';
    $('mapMsg').querySelectorAll('button').forEach(b => b.onclick = () => go(+b.dataset.k));
  } catch (e) { $('mapMsg').textContent = '検索できませんでした：' + e.message; }
}
const toXY = (lat0, p) => ({ x: (p.lng - pLon0) * 111320 * Math.cos(lat0 * Math.PI / 180), y: (p.lat - lat0) * 110540 });
let pLon0 = 0;
async function onMapClick(ll) {
  if (mode === 'two') {
    pickPts.push(ll);
    if (pickPts.length === 1) { if (pickLayer) map.removeLayer(pickLayer); pickLayer = window.L.circleMarker(ll, { radius: 6, color: '#c9a227' }).addTo(map); $('mapMsg').textContent = '次に終点側の端をクリックしてください。'; return; }
    setSite(pickPts[0], pickPts[1], {}); pickPts = []; return;
  }
  $('mapMsg').textContent = '橋を探しています…（OpenStreetMap）';
  const q = `[out:json][timeout:20];way(around:70,${ll.lat},${ll.lng})["bridge"]["highway"];out tags geom;`;
  try {
    const j = await overpass(q);
    if (!j.elements || !j.elements.length) { $('mapMsg').textContent = '近くに橋が見つかりませんでした。「両端をクリック」で指定してください。'; return; }
    pLon0 = ll.lng; const c = toXY(ll.lat, ll);
    let best = null, bd = 1e9;
    for (const w of j.elements) { const g = w.geometry; if (!g || g.length < 2) continue; for (let i = 0; i < g.length - 1; i++) { const a = toXY(ll.lat, { lat: g[i].lat, lng: g[i].lon }), b = toXY(ll.lat, { lat: g[i + 1].lat, lng: g[i + 1].lon }); const dx = b.x - a.x, dy = b.y - a.y; const u = clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1); const d = Math.hypot(a.x + u * dx - c.x, a.y + u * dy - c.y); if (d < bd) { bd = d; best = w; } } }
    const g = best.geometry; const p1 = { lat: g[0].lat, lng: g[0].lon }, p2 = { lat: g[g.length - 1].lat, lng: g[g.length - 1].lon };
    setSite(p1, p2, best.tags || {});
  } catch (e) { $('mapMsg').textContent = '地図データを読めませんでした（' + e.message + '）。「両端をクリック」で指定してください。'; }
}
function setSite(p1, p2, tags) {
  const lat = (p1.lat + p2.lat) / 2, lon = (p1.lng + p2.lng) / 2;
  const dE = (p2.lng - p1.lng) * 111320 * Math.cos(lat * Math.PI / 180), dN = (p2.lat - p1.lat) * 110540;
  const L = Math.hypot(dE, dN), theta = Math.atan2(dN, dE);
  const name = tags.name || tags['bridge:name'] || '（名称不明の橋）';
  let W = S.P.W; if (tags.width && !isNaN(parseFloat(tags.width))) W = clamp(parseFloat(tags.width), 5, 30); else if (tags.lanes) W = clamp(+tags.lanes * 3.25 + 2.0, 6, 30);
  S.site = { lat, lon, theta, L, name, p1: [p1.lat, p1.lng], p2: [p2.lat, p2.lng], tags: { lanes: tags.lanes || '', width: tags.width || '', highway: tags.highway || '' } };
  S.P.L = Math.round(L * 10) / 10; S.P.W = W; S.P.spans = Math.max(1, Math.round(L / 30));
  S.P.zMode = 'auto'; S.P.zStart = null; S.P.zEnd = null;   // 高さは新しい橋の地形から読み直す
  if (tags.lanes) S.P.lanes = (+tags.lanes === 1) ? 1 : 2;   // 地図データの車線数
  save(); drawSite(); fillForm();
}
function drawSite() {
  const s = S.site; if (pickLayer) map.removeLayer(pickLayer);
  pickLayer = window.L.polyline([s.p1, s.p2], { color: '#c9a227', weight: 7, opacity: 0.9 }).addTo(map);
  map.fitBounds(pickLayer.getBounds(), { maxZoom: 18, padding: [80, 80] });
  $('siteInfo').innerHTML = `<b>${s.name}</b><br>橋長 約${fmt(s.L)}m・向き ${fmt((90 - s.theta * 180 / Math.PI + 360) % 360, 0)}°（北から時計回り）<br>${s.tags.lanes ? '車線数 ' + s.tags.lanes + '・' : ''}${s.tags.width ? '幅 ' + s.tags.width + 'm・' : ''}中心 ${fmt(s.lat, 5)}, ${fmt(s.lon, 5)}`;
  $('mapMsg').textContent = '橋を読み取りました。右の寸法を確かめて「3Dで工程を作る」を押してください。';
}

// ───── 保存・読込 ─────
function saveProject() { dl(new Blob([JSON.stringify({ app: 'shoban-bim', v: 1, site: S.site, P: S.P, mach: S.mach, liv: S.liv, parts: S.parts }, null, 1)], { type: 'application/json' }), `床版架替_計画_${stamp()}.json`); }
function loadProject(file) { file.text().then(tx => { const j = JSON.parse(tx); Object.assign(S, { site: j.site, P: { ...K.DEFAULT_PARAMS, ...j.P }, mach: { ...K.defaultMachines(), ...j.mach }, liv: j.liv || null, parts: j.parts || [] }); save(); fillForm(); if (S.site && map) drawSite(); buildWorld(); camPreset('all'); }); }

// ───── 起動 ─────
function showTab(k) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
  $('mapPane').hidden = k !== 'map'; $('simPane').hidden = k !== 'sim';
  if (k === 'map') setTimeout(() => map.invalidateSize(), 50); else resize();
}
function showSide(k) { document.querySelectorAll('.stab').forEach(b => b.classList.toggle('on', b.dataset.s === k)); ['kotei', 'settei', 'lib', 'exp'].forEach(n => $(n + 'Pane').hidden = n !== k); if (k === 'lib') $('libPane').hidden = false; }
window.addEventListener('DOMContentLoaded', () => {
  load(); fillForm(); initMap(); initLibrary();
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  document.querySelectorAll('.stab').forEach(b => b.onclick = () => showSide(b.dataset.s));
  $('build3d').onclick = () => { readForm(); save(); S.t = 0; buildWorld(); showTab('sim'); camPreset('all'); };
  $('sample').onclick = () => { S.site = null; S.P = { ...K.DEFAULT_PARAMS }; fillForm(); save(); S.t = 0; buildWorld(); showTab('sim'); camPreset('all'); };
  $('applyBtn').onclick = () => { readForm(); save(); buildWorld(); };
  $('playBtn').onclick = () => { if (S.t >= plan.total) S.t = 0; S.playing = !S.playing; };
  $('seek').oninput = () => { S.t = +$('seek').value / 1000 * plan.total; };
  $('speed').onchange = () => S.speed = +$('speed').value;
  $('follow').onchange = () => S.follow = $('follow').checked;
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => camPreset(b.dataset.cam));
  $('recBtn').onclick = () => REC ? stopRec() : startRec();
  if ($('expBtn')) { $('expBtn').onclick = () => exportForBlender('blender'); $('expBtn2').onclick = () => exportForBlender('download'); }   // HP用にはBlenderの欄がない
  $('saveBtn').onclick = saveProject; $('loadFile').onchange = e => e.target.files[0] && loadProject(e.target.files[0]);
  $('outMode').value = S.out; $('outMode').onchange = () => { S.out = $('outMode').value; save(); };
  $('reportBtn').onclick = makeReport;
  for (const id of ['p_zStart', 'p_zEnd']) $(id).oninput = () => { $('p_zMode').value = 'manual'; };
  $('zAutoBtn').onclick = () => { readForm(); S.P.zMode = 'auto'; if (G && G.autoZ) { S.P.zStart = G.autoZ.a; S.P.zEnd = G.autoZ.b; } fillForm(); save(); buildWorld(); };
  $('zManualBtn').onclick = () => { readForm(); S.P.zMode = 'manual'; fillForm(); save(); buildWorld(); };
  for (const [id, d] of [['zA_up', [0.1, 0]], ['zA_dn', [-0.1, 0]], ['zB_up', [0, 0.1]], ['zB_dn', [0, -0.1]]]) $(id).onclick = () => {
    readForm(); S.P.zMode = 'manual'; S.P.zStart = Math.round(((S.P.zStart ?? 0) + d[0]) * 100) / 100; S.P.zEnd = Math.round(((S.P.zEnd ?? 0) + d[1]) * 100) / 100; fillForm(); save(); buildWorld(); };
  $('useTerrainH').onclick = () => { if (!G.terrain) { $('groundNote').textContent = '地形の標高がまだ読めていません（地図で橋を選んだときだけ使えます）'; return; } S.P.H = Math.max(2, Math.round((G.terrain.deck - G.terrain.low) * 2) / 2); fillForm(); save(); buildWorld(); };
  buildWorld(); camPreset('all'); showTab(S.site ? 'sim' : 'map'); showSide('kotei');
  requestAnimationFrame(loop);
  window.__bim = { S, get plan() { return plan; }, get G() { return G; }, get ANIM() { return ANIM; }, get map() { return map; }, onMapClick, applyState, buildWorld, bakeGLB, C, camPreset, camera, controls, get root() { return root; }, get focus() { return FOCUS; }, showTab };
});
