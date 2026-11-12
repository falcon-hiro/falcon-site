// 重機・車両・規制材の簡易3Dモデル（箱と円柱で組む。前＝+x、地面＝y0）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ───── 本物らしく見せる部品（角の丸い箱・ガラスの運転席・保護枠・灯火・ミラー・履帯）─────
const rgCache = new Map();
export function rbox(w, h, d, color, x = 0, y = 0, z = 0, r = 0.12) {
  const key = [w, h, d, r].map(v => v.toFixed(3)).join('|');
  if (!rgCache.has(key)) rgCache.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)));
  const m = new THREE.Mesh(rgCache.get(key), mat(color, typeof color === 'number' ? { rough: 0.48, metal: 0.12 } : undefined)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
const GLASS = () => mat(0x141c26, { metal: 0.9, rough: 0.06, name: 'glass' });
// 運転席：角の丸い箱＋前・横・後ろの窓＋屋根＋ミラー＋前照灯（前＝+x）
export function cabin(L, H, W, color, opts = {}) {
  const g = new THREE.Group();
  g.add(rbox(L, H, W, color, 0, H / 2, 0, 0.14));
  const gm = GLASS(), wy = H * 0.68, wh = H * 0.42;
  const fw = new THREE.Mesh(new THREE.BoxGeometry(0.03, wh, W * 0.86), gm); fw.position.set(L / 2 + 0.005, wy, 0); g.add(fw);
  for (const s of [-1, 1]) { const sw = new THREE.Mesh(new THREE.BoxGeometry(L * 0.72, wh, 0.03), gm); sw.position.set(L * 0.06, wy, s * (W / 2 + 0.005)); g.add(sw); }
  if (opts.rear !== false) { const rw = new THREE.Mesh(new THREE.BoxGeometry(0.03, wh * 0.7, W * 0.6), gm); rw.position.set(-L / 2 - 0.005, wy + wh * 0.1, 0); g.add(rw); }
  g.add(box(L * 0.98, 0.05, W * 0.98, 0x2a2a2a, 0, H + 0.02, 0));                                          // 屋根のふち
  if (opts.mirror !== false) for (const s of [-1, 1]) { g.add(box(0.05, 0.05, 0.35, 0x222222, L / 2 - 0.1, H * 0.62, s * (W / 2 + 0.17))); g.add(box(0.06, 0.32, 0.18, 0x222222, L / 2 - 0.1, H * 0.62, s * (W / 2 + 0.36))); }
  if (opts.lights !== false) for (const s of [-1, 1]) g.add(box(0.05, 0.14, 0.26, 0xfff2c0, L / 2 + 0.01, H * 0.2, s * (W / 2 - 0.25), { emissive: 0x403a20 }));
  if (opts.grille) g.add(box(0.04, H * 0.22, W * 0.5, 0x2a2a2a, L / 2 + 0.01, H * 0.22, 0));
  if (opts.beacon) g.add(cyl(0.1, 0.12, 0xff9a00, 0, H + 0.1, 0));                                       // 回転灯
  return g;
}
// 保護枠（ROPS）と座席：小型の舗装機械など
export function rops(L, W, H, color = 0x222222) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, H, 0.08, color, sx * L / 2, H / 2, sz * W / 2));
  g.add(rbox(L + 0.25, 0.08, W + 0.25, color, 0, H, 0, 0.03));
  g.add(rbox(0.5, 0.45, 0.5, 0x333333, 0, 0.25, 0, 0.06)); g.add(rbox(0.1, 0.5, 0.5, 0x333333, -0.25, 0.5, 0, 0.04));   // 座席
  return g;
}
// 履帯（クローラ）：模様つきのベルト＋前後の輪（起動輪・誘導輪）＋転輪
let _trackTex = null;
function trackTex() {
  if (_trackTex) return _trackTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d');
  x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, 64, 16); x.fillStyle = '#3a3a3a'; for (let i = 0; i < 64; i += 8) x.fillRect(i, 0, 3, 16);
  _trackTex = new THREE.CanvasTexture(c); _trackTex.wrapS = _trackTex.wrapT = THREE.RepeatWrapping; return _trackTex;
}
export function crawler(g, L, W, h = 0.85, tw = 0.6) {
  for (const s of [-1, 1]) {
    const tex = trackTex().clone(); tex.needsUpdate = true; tex.repeat.set(L * 2.2, 1);
    const belt = new THREE.Mesh(new RoundedBoxGeometry(L, h, tw, 4, h / 2.05), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    belt.position.set(0, h / 2, s * (W / 2 - tw / 2)); belt.castShadow = true; g.add(belt);
    for (const x of [L / 2 - h / 2, -L / 2 + h / 2]) g.add(cyl(h * 0.42, tw + 0.04, 0x555555, x, h / 2, s * (W / 2 - tw / 2), 'z'));
    for (let x = -L / 2 + h; x <= L / 2 - h + 1e-6; x += (L - 2 * h) / 3) g.add(cyl(h * 0.2, tw + 0.06, 0x666666, x, h * 0.25, s * (W / 2 - tw / 2), 'z'));
  }
  if (W - tw * 2 > 0.1) g.add(box(L * 0.75, h * 0.5, W - tw * 2, 0x3a3a3a, 0, h * 0.62, 0));
}
// 手すり（はしごの代わりの簡易表現）
export function rail(L, x, y, z, color = 0xf2c200) { const g = new THREE.Group(); g.add(box(L, 0.04, 0.04, color, x, y + 0.9, z)); for (let k = 0; k <= 2; k++) g.add(box(0.04, 0.9, 0.04, color, x - L / 2 + k * L / 2, y + 0.45, z)); return g; }

const matCache = new Map();
// ───── 色・模様（リバリー）─────
// 'BODY'＝車体色（模様つき）、'ACCENT'＝差し色。実在メーカーの塗装・ロゴはまねない（当社オリジナル）。
let LIV = null;
export const PATTERNS = { solid: '無地', stripe: '帯（1本）', twotone: 'ツートン', hazard: '斜めしま（注意）', check: 'チェック', logo: '社名入り' };
export function setLivery(l) { LIV = l; }
const patCache = new Map();
function patternTexture(body, accent, pattern, text) {
  const key = [body, accent, pattern, text].join('|');
  if (patCache.has(key)) return patCache.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  const hex = v => '#' + (v >>> 0).toString(16).padStart(6, '0');
  x.fillStyle = hex(body); x.fillRect(0, 0, 256, 256);
  x.fillStyle = hex(accent);
  if (pattern === 'stripe') x.fillRect(0, 150, 256, 34);
  else if (pattern === 'twotone') x.fillRect(0, 160, 256, 96);
  else if (pattern === 'hazard') { for (let i = -256; i < 512; i += 64) { x.beginPath(); x.moveTo(i, 256); x.lineTo(i + 32, 256); x.lineTo(i + 288, 0); x.lineTo(i + 256, 0); x.fill(); } }
  else if (pattern === 'check') { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 64, j * 64, 64, 64); }
  else if (pattern === 'logo') { x.fillRect(0, 96, 256, 64); x.fillStyle = hex(body); x.font = 'bold 44px "Yu Gothic","Meiryo",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text || 'FALCON', 128, 129); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  patCache.set(key, t); return t;
}
function liveryMat(role) {
  const l = LIV || { body: 0xf2c200, accent: 0x1b2a4a, pattern: 'solid' };
  if (role === 'ACCENT') return mat(l.accent, { rough: 0.5, metal: 0.1 });
  if (!l.pattern || l.pattern === 'solid') return mat(l.body, { rough: 0.45, metal: 0.12 });
  const key = 'LIV|' + [l.body, l.accent, l.pattern, l.text].join('|');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ map: patternTexture(l.body, l.accent, l.pattern, l.text), roughness: 0.45, metalness: 0.12 }));
  return matCache.get(key);
}
// ───── 面の質感（舗装・コンクリート・草）：色ごとに登録しておくと、その色の面にざらつきの模様が付く ─────
const SURF = new Map();
export function setSurface(color, kind) { SURF.set(color, kind); }
const surfTexCache = new Map();
function surfTex(kind) {
  if (surfTexCache.has(kind)) return surfTexCache.get(kind);
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const img = x.createImageData(N, N);
  let seed = kind.length * 7919 + 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grid = n => { const g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = rnd(); return g; };
  const smp = (g, n, u, v) => { const fx = u * n, fy = v * n, ix = Math.floor(fx), iy = Math.floor(fy), x0 = ix % n, y0 = iy % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return (g[y0 * n + x0] * (1 - sx) + g[y0 * n + x1] * sx) * (1 - sy) + (g[y1 * n + x0] * (1 - sx) + g[y1 * n + x1] * sx) * sy; };
  const g1 = grid(6), g2 = grid(24), g3 = grid(96);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, lo = smp(g1, 6, u, v), mid = smp(g2, 24, u, v), hi = smp(g3, 96, u, v), px = rnd();
    let r, g, b;
    if (kind === 'asphalt') { let k = 0.66 + 0.1 * lo + 0.08 * mid + 0.14 * px; if (px > 0.975) k = 1.0; else if (px < 0.04) k = 0.5; r = g = b = k; }
    else if (kind === 'concrete') { let k = 0.8 + 0.1 * lo + 0.06 * mid + 0.04 * px; if (hi > 0.86) k -= 0.1; r = k; g = k; b = k * 0.985; }
    else { r = 0.74 + 0.16 * lo + 0.08 * px; g = 0.8 + 0.12 * mid + 0.08 * px; b = 0.66 + 0.16 * hi; }
    const o = (j * N + i) * 4; img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, g * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  surfTexCache.set(kind, t); return t;
}
const SURF_SCALE = { asphalt: 0.55, concrete: 0.33, grass: 0.09 };
function applySurface(m, kind) {
  m.map = surfTex(kind); m.roughness = kind === 'asphalt' ? 0.92 : kind === 'concrete' ? 0.85 : 0.98;
  const S = SURF_SCALE[kind].toFixed(3);
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOp; varying vec3 vOn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vec3 sc_ = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vOp = position * sc_; vOn = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOp; varying vec3 vOn;')
      .replace('#include <map_fragment>', `vec3 bw_ = abs(vOn); vec2 uv_ = bw_.y > 0.5 ? vOp.xz : (bw_.x > 0.5 ? vOp.zy : vOp.xy);\n vec4 t1_ = texture2D(map, uv_ * ${S}); float t2_ = texture2D(map, uv_ * ${S} * 0.137).g;\n diffuseColor.rgb *= t1_.rgb * (0.8 + 0.3 * t2_);`);
  };
  m.customProgramCacheKey = () => 'surf_' + kind;
}
export function mat(color, o = {}) {
  if (color === 'BODY' || color === 'ACCENT') return liveryMat(color);
  const kind = o.tex ?? (o.opacity === undefined && !o.emissive ? SURF.get(color) : undefined);
  const key = color + JSON.stringify(o) + (kind || '');
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0.05,
      transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissive ? 1.0 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    if (kind) { applySurface(m, kind); m.name = 'surf_' + kind + '_' + color.toString(16).padStart(6, '0'); } else if (o.name) m.name = o.name;   // 名前は Blender 側で質感を付け直す目印
    matCache.set(key, m);
  }
  return matCache.get(key);
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
export function box(w, h, d, color, x = 0, y = 0, z = 0, o) {
  const m = new THREE.Mesh(boxGeo, o && o.material ? o.material : mat(color, o));
  m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function cyl(r, h, color, x = 0, y = 0, z = 0, axis = 'y', seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color));
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
// タイヤ：向きを変える台（pivot）の中にタイヤ。xs の最初の車軸を前輪（かじ取り）にする（steer=false で無し）
export function wheels(g, xs, zHalf, r = 0.5, w = 0.4, steer = true) {
  xs.forEach((x, k) => { for (const s of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(x, r, s * zHalf); if (steer && k === 0) pv.userData.steer = true;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), mat(0x151515, { rough: 0.95, metal: 0 })); t.rotation.x = Math.PI / 2; t.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.03, 16), mat(0xb4b8bc, { metal: 0.85, rough: 0.3 })); rim.position.set(0, s * (w / 2 + 0.005), 0); t.add(rim);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, 0.04, r * 0.16), mat(0x444444)); sp.position.set(0, s * (w / 2 + 0.02), 0); t.add(sp);
    t.userData.wheelR = r; pv.add(t); g.add(pv);
  } });
}
function named(g, name) { g.name = name; return g; }

export function textTexture(lines, bg = '#ffffff', fg = '#c00000', w = 512, h = 256, border = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  if (border) { x.strokeStyle = border; x.lineWidth = 18; x.strokeRect(9, 9, w - 18, h - 18); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const fs = Math.floor(h / (arr.length + 0.6));
  x.font = `bold ${fs}px "Yu Gothic","Meiryo",sans-serif`;
  arr.forEach((s, i) => x.fillText(s, w / 2, h * (i + 1) / (arr.length + 1)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#f2c200'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#111'; for (let i = -64; i < 320; i += 48) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 24, 64); x.lineTo(i + 64 + 24, 0); x.lineTo(i + 64, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _stripe = null;

// ───── クレーン（ラフター・オールテレーン・クローラ）─────
export function crane(cfg) {
  const g = new THREE.Group();
  const { len, wid } = cfg;
  const isCr = !!cfg.crawler;
  if (isCr) {
    crawler(g, len, wid, 1.1, 1.0);
  } else {
    const nAx = len > 12 ? 4 : 2;
    const xs = []; for (let i = 0; i < nAx; i++) xs.push(-len * 0.35 + i * (len * 0.7) / (nAx - 1));
    wheels(g, xs, wid / 2 - 0.3, 0.72, 0.55);
    g.add(rbox(len, 0.9, wid - 0.2, 'BODY', 0, 1.35, 0, 0.12));                                   // 車体
    g.add(box(len * 0.9, 0.04, wid * 0.55, 0x5a5a5a, 0, 1.82, 0, { metal: 0.5 }));                // 縞鋼板のデッキ
    for (const x of xs) for (const s of [-1, 1]) g.add(rbox(1.75, 0.22, 0.62, 0x262626, x, 1.5, s * (wid / 2 - 0.2), 0.08));   // フェンダー
    g.add(rbox(0.3, 0.45, wid * 0.92, 0x2a2a2a, len / 2 + 0.05, 1.0, 0, 0.06));                  // バンパー
    g.add(rbox(0.3, 0.45, wid * 0.92, 0x2a2a2a, -len / 2 - 0.05, 1.0, 0, 0.06));
    const cab = cabin(1.8, 1.55, 1.0, 'BODY', { beacon: true }); cab.position.set(len / 2 - 1.05, 1.8, -wid / 2 + 0.62); g.add(cab);   // 走行用の運転席（片側）
    if (cfg.maxT >= 100) { const cab2 = cabin(1.6, 1.2, wid * 0.9, 'BODY', { mirror: false }); cab2.position.set(len / 2 - 0.9, 1.8, 0); }
    g.add(rbox(1.2, 0.5, 0.5, 0x3a3a3a, -len * 0.15, 1.15, wid / 2 - 0.05, 0.08));                // 燃料タンク
  }
  // アウトリガー（張り出し量 0〜1 を setOutrigger で動かす）
  const outs = [];
  if (!isCr) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const o = new THREE.Group(); o.position.set(sx * len * 0.38, 0, 0); g.add(o);
    o.add(rbox(0.5, 0.42, 0.5, 'BODY', 0, 1.0, sz * (wid / 2 - 0.2), 0.05));                    // 張り出し箱
    const beam = box(0.35, 0.3, 2.2, 0x6a6a6a, 0, 1.0, sz * (wid / 2 - 0.9), { metal: 0.4 }); o.add(beam);
    const jack = new THREE.Group(); o.add(jack);
    jack.add(rbox(0.32, 0.9, 0.32, 0x6a6a6a, 0, 0.55, 0, 0.05)); jack.add(cyl(0.45, 0.08, 0x2a2a2a, 0, 0.04, 0, 'y', 16));
    jack.add(box(1.0, 0.1, 1.0, 0x8a5a2b, 0, -0.02, 0));                                          // 敷板
    outs.push({ beam, jack, sz, wid });
  }
  const pivotH = isCr ? 1.5 : 1.9;
  const upper = new THREE.Group(); upper.position.set(0, pivotH, 0); g.add(upper);
  upper.add(cyl(1.0, 0.4, 0x333333, 0, 0.2, 0, 'y', 24));                                         // 旋回台
  upper.add(rbox(3.8, 1.3, 2.4, 'BODY', -0.8, 0.95, 0, 0.12));                                     // 上部（エンジン室）
  for (let k = 0; k < 4; k++) upper.add(box(0.06, 0.6, 0.02, 0x2a2a2a, -2.0 + k * 0.25, 1.0, 1.21)); // ルーバー
  upper.add(rbox(1.3, 1.5, 2.5, 0x3d3d3d, -3.3, 1.0, 0, 0.16));                                     // カウンターウエイト
  upper.add(box(0.05, 0.25, 2.5, 0xf2c200, -3.96, 1.2, 0));                                         // 反射帯
  const op = cabin(1.6, 1.55, 0.95, 'BODY', { rear: false, mirror: false }); op.position.set(1.0, 0.35, -1.05); upper.add(op);   // 操作室（ガラス）
  upper.add(box(1.1, 0.04, 0.04, 0xf2c200, -1.5, 1.95, -1.15));                                     // 手すり
  const boomRoot = new THREE.Group(); boomRoot.position.set(-0.6, 1.3, 0.25); upper.add(boomRoot);
  // 伸縮ブーム：太い1段目＋細い2段・3段が中から伸びる（格子ブームは1本）
  const L1 = isCr ? 12 : 8.5;
  const sec = (len_, t, c) => { const geo = new RoundedBoxGeometry(1, t, t * 1.05, 2, Math.min(0.08, t / 4)); geo.translate(0.5, 0, 0); const m = new THREE.Mesh(geo, mat(c)); m.scale.x = len_; m.castShadow = true; return m; };
  const s1 = sec(L1, isCr ? 0.9 : 0.85, isCr ? 0xd9d9d9 : 'BODY'); boomRoot.add(s1);
  const s2 = sec(L1 - 0.4, 0.68, isCr ? 0xd9d9d9 : 'BODY'); boomRoot.add(s2);
  const s3 = sec(L1 - 0.8, 0.52, isCr ? 0xd9d9d9 : 'BODY'); boomRoot.add(s3);
  const head = new THREE.Group(); boomRoot.add(head);                                                // ブームの先（滑車）
  head.add(rbox(0.8, 0.7, 0.55, 0x333333, 0, 0, 0, 0.08)); head.add(cyl(0.32, 0.3, 0x777777, 0.25, -0.15, 0, 'z', 16));
  head.add(cyl(0.12, 0.6, 0xc0392b, 0.35, 0.35, 0, 'y', 8));                                         // 頂部の標識灯
  const cyl1 = box(4.0, 0.22, 0.22, 0x9a9a9a, 0, 0, 0, { metal: 0.6, rough: 0.3 }); upper.add(cyl1);  // 起伏シリンダー
  // ワイヤー（2本掛け）・フックブロック・玉掛けワイヤー4本
  const cg = new THREE.CylinderGeometry(0.02, 0.02, 1, 5);
  const ropes = [new THREE.Mesh(cg, mat(0x2a2a2a)), new THREE.Mesh(cg, mat(0x2a2a2a))]; ropes.forEach(r => g.add(r));
  const hook = new THREE.Group(); g.add(hook);
  hook.add(rbox(0.6, 0.75, 0.38, 0xd4a017, 0, 0.38, 0, 0.08)); hook.add(cyl(0.2, 0.42, 0x777777, 0, 0.42, 0, 'z', 16));
  hook.add(box(0.62, 0.08, 0.4, 0x111111, 0, 0.2, 0));
  const hk = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI * 1.3), mat(0x555555)); hk.position.set(0, -0.12, 0); hk.rotation.z = Math.PI * 0.85; hook.add(hk);
  const sg = new THREE.CylinderGeometry(0.018, 0.018, 1, 4); sg.translate(0, 0.5, 0);
  const slings = []; for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(sg, mat(0x8a8a8a)); s.visible = false; g.add(s); slings.push(s); }
  g.userData = { type: 'crane', upper, boomRoot, s1, s2, s3, head, cyl1, ropes, hook, slings, outs, L1, Lmax: L1 * 2.8, footY: pivotH + 1.3, foot: -0.6, crawler: isCr };
  setOutrigger(g, 1);
  setCranePose(g, { x: 8, y: 4, z: 0 });
  return g;
}
// アウトリガーの張り出し（0＝格納・1＝張り出して接地）
export function setOutrigger(g, e) {
  for (const o of g.userData.outs || []) {
    const ext = Math.min(1, e * 2), down = Math.max(0, e * 2 - 1);
    const zc = o.sz * (o.wid / 2 - 0.9 + ext * 1.8);
    o.beam.position.z = zc; o.jack.position.set(0, (1 - down) * 0.55, o.sz * (o.wid / 2 + 0.2 + ext * 1.8));
  }
}
// フックの位置（クレーンの足元からの相対座標）を与えて旋回・起伏を決める。
// boomLen を与えるとブームの長さを固定し、作業半径は起伏（角度）で合わせる（本物の操作に近い）。
export function setCranePose(g, h, boomLen) {
  const u = g.userData;
  const a = Math.atan2(-h.z, h.x);
  const r = Math.max(1.5, Math.hypot(h.x, h.z) - u.foot);
  let L, ang;
  if (boomLen) { L = Math.min(u.Lmax, Math.max(u.L1, boomLen, r + 0.05)); ang = Math.acos(Math.min(0.997, r / L)); }
  else { const tipY = Math.max(h.y + 5.5, u.footY + 3); L = Math.hypot(r, tipY - u.footY); ang = Math.atan2(tipY - u.footY, r); }
  u.upper.rotation.y = a;
  u.boomRoot.rotation.z = ang;
  const ext = Math.max(0, L - u.L1);
  if (u.crawler) { u.s1.scale.x = L; u.s2.visible = u.s3.visible = false; }
  else { u.s2.position.x = ext * 0.5 + 0.2; u.s3.position.x = ext + 0.4; u.s3.scale.x = Math.max(0.5, u.L1 - 0.8); }
  u.head.position.x = L;
  // 起伏シリンダー（上部旋回体からブームの途中へ）
  const p1x = 0.8, p1y = 0.4, bx = -0.6 + 3.2 * Math.cos(ang), by = 1.3 + 3.2 * Math.sin(ang);
  u.cyl1.position.set((p1x + bx) / 2, (p1y + by) / 2, 0.25); u.cyl1.rotation.z = Math.atan2(by - p1y, bx - p1x); u.cyl1.scale.x = Math.hypot(bx - p1x, by - p1y);
  const tipY = u.footY + L * Math.sin(ang);
  const hy = Math.min(h.y + 0.75, tipY - 0.6);
  const n = { x: -Math.sin(a), z: -Math.cos(a) };
  u.ropes.forEach((rp, i) => { const o = (i ? 0.13 : -0.13); rp.position.set(h.x + n.x * o, (tipY + hy) / 2, h.z + n.z * o); rp.scale.y = Math.max(0.1, tipY - hy); });
  u.hook.position.set(h.x, h.y, h.z); u.hook.rotation.y = a;
}
// 玉掛けワイヤー：フックの下から荷の吊り点（クレーンの足元からの相対座標）へ
const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function setSlings(g, from, pts) {
  const s = g.userData.slings; if (!s) return;
  s.forEach((m, i) => {
    const p = pts && pts[i % (pts.length || 1)];
    if (!p) { m.visible = false; return; }
    m.visible = true; m.position.set(from.x, from.y, from.z);
    _v.set(p.x - from.x, p.y - from.y, p.z - from.z); const L = _v.length();
    m.scale.y = Math.max(0.05, L); m.quaternion.setFromUnitVectors(_up, _v.normalize());
  });
}

// ───── 床版架設機（門型）─────
export function gantry(W) { // 床版架設機（門型）：4本の脚と走行台車・2本の主桁・横行台車（巻上機）・フックブロック
  const g = new THREE.Group();
  const top = 5.2, zl = W / 2 - 0.3;
  for (const s of [-1, 1]) {
    g.add(rbox(4.4, 0.3, 0.55, 0x2e2e2e, 0, 0.42, s * zl, 0.06));                              // 走行台車のはり
    for (const x of [-1.7, 1.7]) {
      g.add(cyl(0.22, 0.3, 0x555555, x, 0.22, s * zl, 'z', 16));                                // 車輪
      g.add(rbox(0.36, top - 0.5, 0.36, 0xf0f0f0, x, top / 2 + 0.3, s * zl, 0.05));           // 脚
      g.add(box(0.38, 0.5, 0.38, 0xf2c200, x, 0.85, s * zl)); g.add(box(0.39, 0.12, 0.39, 0x1a1a1a, x, 0.85, s * zl));   // 足元の注意色
    }
    g.add(rbox(3.8, 0.4, 0.4, 0x1f5fa8, 0, top - 0.1, s * zl, 0.05));                          // 脚の上をつなぐはり
    const br = box(3.9, 0.1, 0.1, 0xd8d8d8, 0, top / 2 + 0.3, s * zl); br.rotation.z = 0.93; g.add(br);   // 筋かい
    g.add(box(0.06, top - 1.0, 0.4, 0x8a8f96, 1.92, top / 2 + 0.3, s * zl));                  // はしご
    for (let k = 0; k < 9; k++) g.add(box(0.1, 0.03, 0.4, 0x8a8f96, 1.95, 1.0 + k * 0.48, s * zl));
  }
  for (const x of [-1.25, 1.25]) {                                                               // 主桁（2本）
    g.add(rbox(0.5, 0.75, W + 0.6, 0x1f5fa8, x, top + 0.45, 0, 0.06));
    g.add(box(0.14, 0.06, W + 0.5, 0x8a8f96, x, top + 0.86, 0));                                 // 横行レール
    for (const s of [-1, 1]) g.add(box(0.5, 0.3, 0.12, 0xf2c200, x, top + 0.95, s * (W / 2 + 0.2)));   // 車止め
  }
  g.add(rail(2.4, 0, top + 0.82, W / 2 + 0.25)); g.add(rail(2.4, 0, top + 0.82, -W / 2 - 0.25));
  const trolley = new THREE.Group(); g.add(trolley);                                              // 横行台車
  trolley.add(rbox(3.0, 0.3, 1.5, 0x2e2e2e, 0, 0, 0, 0.05));
  trolley.add(rbox(1.2, 0.6, 1.0, 'BODY', 0, 0.42, 0, 0.1));                                     // 巻上機
  trolley.add(cyl(0.3, 1.1, 0x8a8f96, 0, 0.42, 0, 'x', 16));
  trolley.add(rbox(0.5, 0.5, 0.5, 0x3a3a3a, 0.95, 0.4, 0.35, 0.06));                             // 電動機
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), mat(0x222222)); g.add(cable);
  const hook = new THREE.Group(); g.add(hook);
  hook.add(rbox(0.55, 0.45, 0.3, 0xf2c200, 0, 0.1, 0, 0.06)); hook.add(cyl(0.2, 0.32, 0x333333, 0, 0.1, 0, 'z', 14));
  hook.add(box(0.1, 0.35, 0.1, 0x333333, 0, -0.25, 0));
  g.userData = { type: 'gantry', trolley, cable, hook, top };
  setGantryPose(g, { x: 0, y: 2, z: 0 });
  return g;
}
export function setGantryPose(g, h) {
  const u = g.userData;
  u.trolley.position.set(h.x, u.top + 1.0, h.z);
  const hy = h.y + 0.45;
  u.cable.position.set(h.x, (u.top + hy) / 2, h.z); u.cable.scale.y = Math.max(0.1, u.top - hy);
  u.hook.position.set(h.x, h.y + 0.3, h.z);
}

// ───── トラック・トレーラー ─────
// トレーラー：けん引車（トラクター）と荷台（トレーラー）を連結部（キングピン）でつなぐ。荷台は trailer.rotation.y で折れる
// ダンプ：荷台（body）は後ろの支点で上がる（setDump）。積み荷（pile）の量も変えられる
export function truck(type) {
  const g = new THREE.Group();
  let bedTopY = 1.4, bedCenterX = -4, bedLen = 10;
  const ud = { type: 'truck' };
  if (type === 'semi' || type === 'low') {
    { const c = cabin(2.3, 2.45, 2.45, 'BODY', { grille: true, beacon: true }); c.position.set(3.6, 0.8, 0); g.add(c); }   // トラクター運転席
    g.add(box(2.32, 0.14, 2.47, 'ACCENT', 3.6, 1.25, 0));
    g.add(rbox(0.3, 0.45, 2.45, 0x2a2a2a, 4.85, 0.75, 0, 0.06));                 // バンパー
    for (const s of [-1, 1]) g.add(cyl(0.07, 1.6, 0x9a9a9a, 2.35, 3.0, s * 1.05, 'y', 8));   // 排気筒
    for (const s of [-1, 1]) g.add(cyl(0.3, 1.0, 0xb8bec4, 2.4, 0.85, s * 1.05, 'x', 14));  // 燃料タンク
    g.add(box(3.6, 0.6, 2.3, 0x333333, 2.4, 0.9, 0));
    g.add(cyl(0.6, 0.12, 0x555555, 1.6, 1.25, 0));                // 連結器（カプラー）
    wheels(g, [3.9, 1.6], 1.0, 0.5);
    const hitchX = 1.6;
    const tr = new THREE.Group(); tr.position.set(hitchX, 0, 0); g.add(tr);
    if (type === 'semi') {
      tr.add(box(12.6, 0.3, 2.45, 0x5d6470, -5.9, 1.45, 0)); tr.add(box(12.6, 0.12, 0.3, 0x3d434c, -5.9, 1.24, 0.9)); tr.add(box(12.6, 0.12, 0.3, 0x3d434c, -5.9, 1.24, -0.9));
      for (let x = -11.6; x < 0; x += 1.6) for (const s of [-1, 1]) tr.add(box(0.08, 0.14, 0.08, 0x2d333c, x, 1.67, s * 1.2));   // あおりの柱
      wheels(tr, [-10.2, -11.5, -12.7], 1.0, 0.5, 0.4, false);
      bedTopY = 1.6; bedCenterX = -5.0 - 0.6; bedLen = 12;
      ud.bedLocalX = -6.6; ud.trailerLen = 11.5;
    } else {
      tr.add(box(2.4, 0.35, 2.45, 0x5d6470, -1.3, 1.4, 0)); tr.add(box(0.5, 0.7, 2.45, 0x5d6470, -2.6, 1.05, 0));   // 首（グースネック）
      tr.add(box(9, 0.3, 2.6, 0x5d6470, -7.1, 0.75, 0)); tr.add(box(1.2, 0.5, 2.6, 0x5d6470, -12.1, 0.9, 0));
      wheels(tr, [-11.2, -12.2], 1.0, 0.4, 0.4, false);
      bedTopY = 0.9; bedCenterX = -5.5; bedLen = 9;
      ud.bedLocalX = -7.1; ud.trailerLen = 11.7;
    }
    ud.trailer = tr; ud.hitchX = hitchX;
  } else { // dump
    { const c = cabin(2.0, 2.25, 2.4, 'BODY', { grille: true }); c.position.set(2.6, 0.7, 0); g.add(c); }
    g.add(rbox(0.28, 0.4, 2.4, 0x2a2a2a, 3.7, 0.7, 0, 0.06));                    // バンパー
    g.add(box(7.4, 0.5, 2.2, 0x333333, 0, 0.8, 0));
    for (const s of [-1, 1]) g.add(rbox(0.8, 0.45, 0.45, 0x8a8f96, 0.9, 0.85, s * 1.0, 0.08));   // 燃料タンク・工具箱
    const body = new THREE.Group(); body.position.set(-3.55, 1.15, 0); g.add(body);   // 支点＝荷台の後ろ下
    const C = 0x9a6b1e;
    body.add(box(5.0, 0.15, 2.3, C, 2.55, 0.05, 0));
    for (const s of [-1, 1]) { body.add(box(5.0, 1.1, 0.1, C, 2.55, 0.6, s * 1.15)); for (let k = 0; k < 5; k++) body.add(box(0.08, 1.1, 0.06, 0x7a5418, 0.5 + k * 1.05, 0.6, s * 1.21)); body.add(box(5.0, 0.08, 0.08, 0x7a5418, 2.55, 1.13, s * 1.2)); }
    body.add(box(0.1, 1.4, 2.3, C, 5.05, 0.75, 0));                                     // 前の壁（鳥居）
    body.add(box(1.0, 0.1, 2.3, C, 5.4, 1.42, 0));                                      // 運転席の上の張り出し
    const gate = new THREE.Group(); gate.position.set(0.05, 1.15, 0); body.add(gate);  // 後ろあおり（上の軸で開く）
    gate.add(box(0.1, 1.1, 2.3, C, 0, -0.55, 0));
    const pile = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 2.1), mat(0x3a3a3a)); pile.position.set(2.6, 0.13, 0); pile.geometry.translate(0, 0.5, 0); pile.scale.y = 0.001; body.add(pile);
    const ram = box(0.22, 1, 0.22, 0x888888, 0, 0, 0); g.add(ram);                      // 荷台を押し上げる油圧の筒
    wheels(g, [2.4, -1.5, -2.8], 1.0, 0.5);
    bedTopY = 1.3; bedCenterX = -1.0; bedLen = 5;
    Object.assign(ud, { body, gate, pile, ram, bedLocalX: 2.55, bedOnBody: true });
    setDump(g, 0, 0);
  }
  Object.assign(ud, { bedTopY, bedCenterX, bedLen });
  g.userData = ud;
  return g;
}
// ダンプの荷台：ang＝上げる角度（ラジアン）、fill＝積み荷の高さ（0〜1）、gate＝後ろあおりの開き（0〜1）
export function setDump(g, ang, fill = null, gate = null) {
  const u = g.userData; if (!u || !u.body) return;
  u.body.rotation.z = ang;       // 前が上がる（支点は後ろ）
  if (fill !== null) { u.pile.scale.y = Math.max(0.001, fill * 0.95); u.pile.visible = fill > 0.01; }
  u.gate.rotation.z = -(gate ?? Math.min(1, ang / 0.5)) * 0.9;
  // 油圧の筒：車体の中ほど→荷台の前の下へ
  const bx = -3.55 + 3.6 * Math.cos(ang), by = 1.15 + 3.6 * Math.sin(ang), ax = 0.4, ay = 0.9;
  u.ram.position.set((ax + bx) / 2, (ay + by) / 2, 0); u.ram.rotation.z = Math.atan2(-(bx - ax), by - ay); u.ram.scale.y = Math.max(0.3, Math.hypot(bx - ax, by - ay));
}
// 荷台を持たない車（高所作業車・標識車などの土台）
function cabChassis() {
  const g = new THREE.Group();
  { const c = cabin(2.0, 2.25, 2.4, 0xe8e8e8, { grille: true, beacon: true }); c.position.set(2.6, 0.7, 0); g.add(c); }
  g.add(rbox(0.28, 0.4, 2.4, 0x2a2a2a, 3.7, 0.7, 0, 0.06));
  g.add(box(7.4, 0.5, 2.2, 0x333333, 0, 0.8, 0));
  wheels(g, [2.4, -1.5, -2.8], 1.0, 0.5);
  return g;
}

function gbox(w, h, d, x, y, z, r = 0.1) { const m = rbox(w, h, d, 0x111111, x, y, z, r); m.material = GLASS(); return m; }   // ガラスの箱
export function car(color, kind = 'car') { // 一般車：セダン・ワゴン・小型／箱形のトラック
  const g = new THREE.Group();
  if (kind === 'truck') {
    const c = cabin(1.9, 2.05, 2.2, color, { grille: true }); c.position.set(2.45, 0.6, 0); g.add(c);
    g.add(rbox(0.25, 0.35, 2.2, 0x2a2a2a, 3.5, 0.62, 0, 0.05));
    g.add(box(6.6, 0.3, 1.0, 0x2e2e2e, -0.4, 0.78, 0));
    g.add(rbox(5.3, 2.45, 2.3, 0xe9ecee, -1.45, 2.15, 0, 0.05));                                  // アルミの荷箱
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) g.add(box(0.04, 2.3, 0.02, 0xc5cacf, -3.8 + k * 0.94, 2.15, s * 1.16));
    g.add(box(0.03, 2.2, 0.04, 0x8a8f96, -4.11, 2.15, 0));                                         // 後ろの扉の合わせ目
    for (const s of [-1, 1]) g.add(box(0.04, 0.12, 0.3, 0xc0281c, -4.11, 0.82, s * 0.9, { emissive: 0x400800 }));
    g.add(box(0.1, 0.22, 2.2, 0x2a2a2a, -4.05, 0.58, 0));
    for (const s of [-1, 1]) g.add(box(2.4, 0.3, 0.04, 0x8a8f96, -1.2, 0.72, s * 1.12));         // 横の巻き込み防止
    wheels(g, [2.4, -0.8, -2.6], 0.95, 0.45);
  } else {
    const v = (color >> 3) % 3;                                    // 0 セダン／1 ワゴン（背が高い）／2 小型
    const L = v === 2 ? 3.6 : 4.5, Hb = v === 1 ? 0.8 : 0.66, cabL = v === 1 ? 3.0 : v === 2 ? 2.2 : 2.3, cabH = v === 1 ? 0.72 : 0.56, cabX = v === 1 ? -0.45 : -0.2;
    const y0 = 0.3, yc = y0 + Hb + cabH / 2 - 0.05;
    g.add(rbox(L, Hb, 1.75, color, 0, y0 + Hb / 2, 0, 0.18));
    g.add(gbox(cabL, cabH, 1.58, cabX, yc, 0, 0.14));
    g.add(rbox(cabL - 0.3, 0.07, 1.5, color, cabX, y0 + Hb + cabH - 0.04, 0, 0.03));              // 屋根
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.add(box(0.07, cabH - 0.06, 0.05, color, cabX + sx * (cabL / 2 - 0.14), yc, sz * 0.775));   // 柱
    for (const sz of [-1, 1]) {
      g.add(box(0.05, 0.13, 0.36, 0xfff4d0, L / 2 + 0.005, y0 + Hb * 0.62, sz * 0.6, { emissive: 0x403a20 }));     // 前照灯
      g.add(box(0.05, 0.13, 0.36, 0xc0281c, -L / 2 - 0.005, y0 + Hb * 0.66, sz * 0.6, { emissive: 0x400800 }));    // 尾灯
      g.add(box(0.12, 0.08, 0.16, color, cabX + cabL / 2 - 0.25, y0 + Hb + 0.08, sz * 0.94));                       // ミラー
    }
    g.add(box(0.04, 0.12, 0.7, 0x1e1e1e, L / 2 + 0.01, y0 + Hb * 0.3, 0));                         // グリル
    for (const sx of [-1, 1]) g.add(rbox(0.14, 0.2, 1.72, 0x1e1e1e, sx * (L / 2 - 0.02), y0 + 0.14, 0, 0.05));    // バンパー
    wheels(g, [L / 2 - 0.85, -L / 2 + 0.85], 0.82, 0.32, 0.25);
  }
  return g;
}

export function sweeper() { // 路面清掃車：ダンプの車体に、前のブラシ・横の回転ブラシ・吸い込み口
  const g = truck('dump');
  g.add(rbox(1.4, 0.35, 2.3, 0x3a7d44, 3.95, 0.3, 0, 0.08));
  for (const s of [-1, 1]) { g.add(cyl(0.45, 0.1, 0x555555, 3.3, 0.1, s * 1.25, 'y', 16)); g.add(box(0.08, 0.5, 0.08, 0x333333, 3.3, 0.4, s * 1.1)); }
  g.add(rbox(1.0, 0.3, 1.8, 0x2a2a2a, 0.9, 0.3, 0, 0.06));
  return g;
}
export function miller() { // 路面切削機（4つのクローラ・切削ドラムのカバー・前の積込みコンベヤ・運転台）
  const g = new THREE.Group();
  for (const s of [-1, 1]) for (const x of [-2.3, 2.1]) { const t = new THREE.Group(); t.position.set(x, 0, s * 1.05); crawler(t, 1.6, 0.6, 0.62, 0.5); g.add(t); }
  for (const s of [-1, 1]) for (const x of [-2.3, 2.1]) g.add(rbox(0.35, 1.0, 0.35, 0x6a6a6a, x, 1.0, s * 1.05, 0.05));   // 脚（高さ調整の柱）
  g.add(rbox(6.4, 1.5, 2.5, 0xf2f2f2, 0, 1.75, 0, 0.18));                               // 本体
  g.add(rbox(6.42, 0.45, 2.52, 'BODY', 0, 2.55, 0, 0.12));                               // 上の帯
  g.add(rbox(2.2, 0.9, 2.55, 0x3a3a3a, 0.2, 0.95, 0, 0.1));                              // 切削ドラムのカバー
  const op = rops(1.6, 1.8, 2.1, 0x2a2a2a); op.position.set(-1.6, 2.78, 0); g.add(op);    // 運転台と屋根
  g.add(rail(2.4, -1.6, 2.78, 1.2)); g.add(rail(2.4, -1.6, 2.78, -1.2));
  const conv = new THREE.Group(); conv.position.set(3.2, 2.0, 0); conv.rotation.z = 0.32; g.add(conv);   // 積込みコンベヤ
  conv.add(rbox(7.5, 0.5, 0.95, 'BODY', 3.75, 0, 0, 0.08)); conv.add(box(7.4, 0.06, 0.7, 0x222222, 3.75, 0.27, 0));
  for (let k = 0; k < 6; k++) conv.add(box(0.05, 0.25, 0.97, 0x555555, 0.6 + k * 1.3, 0.1, 0));
  g.add(cyl(0.12, 0.9, 0x666666, -2.8, 3.0, 0.8, 'y', 8));                                // 排気筒
  g.userData = { type: 'miller' }; return g;
}
export function saw(type) { // 切断の機械：ロードカッター／コンクリートカッター／ワイヤーソー／ウォールソー
  const g = new THREE.Group();
  const blade = (r, x, y, z) => { g.add(cyl(r, 0.02, 0xc8ccd0, x, y, z, 'z', 28)); g.add(cyl(r * 0.25, 0.05, 0x555555, x, y, z, 'z', 12)); };
  if (type === 'road' || type === 'cutter') {
    const k = type === 'road' ? 1 : 0.65, col = type === 'road' ? 0xe07b00 : 0xc0392b;
    g.add(rbox(2.0 * k, 0.75 * k, 0.95 * k, col, 0, 0.75 * k, 0, 0.1));                                         // 本体（エンジン）
    g.add(rbox(0.9 * k, 0.4 * k, 0.8 * k, 0xe8e8e8, -0.3 * k, 1.32 * k, 0, 0.1));                                // 水タンク
    g.add(cyl(0.06 * k, 0.5 * k, 0x555555, 0.5 * k, 1.35 * k, 0.25 * k, 'y', 8));                                // 排気筒
    wheels(g, [0.7 * k, -0.7 * k], 0.5 * k, 0.26 * k, 0.16 * k, false);
    blade(0.5 * k, 0.75 * k, 0.42 * k, -0.6 * k);
    const gd = rbox(1.1 * k, 0.5 * k, 0.1 * k, 0x2e2e2e, 0.75 * k, 0.72 * k, -0.6 * k, 0.05); g.add(gd);          // 刃の覆い
    for (const s of [-1, 1]) { const h = box(1.3 * k, 0.05, 0.05, 0x333333, -1.45 * k, 1.25 * k, s * 0.35 * k); h.rotation.z = -0.45; g.add(h); }   // 押し手
    g.add(box(0.05, 0.05, 0.8 * k, 0x333333, -2.03 * k, 1.53 * k, 0));
    g.add(box(1.2 * k, 0.03, 0.03, 0xf2c200, 1.5 * k, 0.5 * k, -0.6 * k));                                         // 切る線を示す指し棒
  } else if (type === 'wire') {
    g.add(rbox(1.6, 0.12, 1.0, 0x2e2e2e, 0, 0.08, 0, 0.03));                                                       // 台
    g.add(rbox(0.7, 0.8, 0.7, 0x2f6fb5, -0.35, 0.55, 0, 0.08));                                                    // 駆動部
    for (const [x, y, r] of [[0.35, 0.95, 0.42], [0.55, 0.35, 0.2], [-0.1, 1.25, 0.15]]) { g.add(cyl(r, 0.08, 0x8a8f96, x, y, 0.42, 'z', 22)); g.add(cyl(r * 0.3, 0.1, 0x333333, x, y, 0.42, 'z', 10)); }
    const w1 = box(2.2, 0.025, 0.025, 0xb8bec4, 1.6, 0.75, 0.42); w1.rotation.z = -0.28; g.add(w1);              // ワイヤー（切る物へ）
    const w2 = box(2.2, 0.025, 0.025, 0xb8bec4, 1.6, 0.25, 0.42); w2.rotation.z = -0.05; g.add(w2);
    g.add(rbox(1.1, 1.0, 0.8, 0x444444, -1.7, 0.55, 0, 0.08));                                                     // 油圧ユニット
    g.add(box(0.5, 0.3, 0.02, 0x1a1a1a, -1.7, 0.7, 0.41)); g.add(box(0.9, 0.05, 0.05, 0x1a1a1a, -1.0, 0.25, 0.2));
  } else { // wall
    g.add(rbox(2.6, 0.1, 0.22, 0x8a8f96, 0, 0.08, 0, 0.03));                                                       // レール
    for (let i = 0; i < 9; i++) g.add(box(0.05, 0.04, 0.24, 0x555555, -1.1 + i * 0.28, 0.14, 0));
    g.add(rbox(0.7, 0.5, 0.5, 0xd4a017, 0, 0.42, 0, 0.08));                                                        // のこの本体
    g.add(cyl(0.12, 0.4, 0x333333, -0.1, 0.75, 0, 'y', 10));
    blade(0.5, 0.25, 0.52, 0.34);
    g.add(rbox(1.1, 0.5, 0.1, 0x2e2e2e, 0.25, 0.8, 0.34, 0.05));
  }
  g.userData = { type: 'saw' }; return g;
}
export function backhoe() { // バックホウ（クローラ・旋回体・ガラスの運転席・ブームとアームの油圧シリンダー・ブレーカ）
  const g = new THREE.Group();
  crawler(g, 3.6, 2.5, 0.8, 0.6);
  const up = new THREE.Group(); up.position.y = 0.95; g.add(up);
  up.add(cyl(0.9, 0.25, 0x333333, 0, 0.1, 0, 'y', 20));
  up.add(rbox(2.0, 1.05, 2.3, 'BODY', -0.8, 0.65, 0.05, 0.14));                            // エンジン室
  up.add(rbox(0.8, 0.95, 2.35, 0x3d3d3d, -2.05, 0.62, 0.05, 0.2));                         // カウンターウエイト
  for (let k = 0; k < 4; k++) up.add(box(0.05, 0.5, 0.02, 0x2a2a2a, -1.4 + k * 0.22, 0.7, 1.21));
  const cab = cabin(1.3, 1.6, 0.95, 'BODY', { mirror: false }); cab.position.set(0.35, 0.15, -0.65); up.add(cab);
  up.add(rail(1.4, -0.8, 1.17, 1.15));
  const arm = new THREE.Group(); arm.position.set(0.9, 0.9, 0.45); up.add(arm);
  const b1 = new RoundedBoxGeometry(1, 0.48, 0.42, 2, 0.08); b1.translate(0.5, 0, 0);
  const m1 = new THREE.Mesh(b1, mat('BODY')); m1.scale.x = 3.2; m1.rotation.z = 0.7; m1.castShadow = true; arm.add(m1);
  const c1 = box(1.69, 0.15, 0.15, 0x9a9a9a, 0.84, 0.2, 0, { metal: 0.6, rough: 0.3 }); c1.rotation.z = 0.87; arm.add(c1);  // ブームシリンダー（ブームの下側）
  const fore = new THREE.Group(); fore.position.set(3.2 * Math.cos(0.7), 3.2 * Math.sin(0.7), 0); arm.add(fore);
  const b2 = new RoundedBoxGeometry(1, 0.38, 0.34, 2, 0.06); b2.translate(0.5, 0, 0);
  const m2 = new THREE.Mesh(b2, mat('BODY')); m2.scale.x = 2.4; fore.add(m2); m2.rotation.z = -1.6; m2.castShadow = true;
  const c2 = box(0.9, 0.12, 0.12, 0x9a9a9a, -0.45, 0.12, 0, { metal: 0.6, rough: 0.3 }); c2.rotation.z = -0.35; fore.add(c2);  // アームシリンダー（ブームの上・ひじの後ろ）
  const br = new THREE.Group(); br.position.set(2.4 * Math.cos(-1.6), 2.4 * Math.sin(-1.6), 0); fore.add(br);
  br.add(rbox(0.38, 1.1, 0.38, 0x2a2a2a, 0, -0.5, 0, 0.06)); br.add(cyl(0.06, 0.45, 0x9a9a9a, 0, -1.25, 0, 'y', 8));   // ブレーカ本体とのみ
  g.userData = { type: 'backhoe', arm }; return g;
}
// 油圧の筒（2点の間に伸ばす）：a・b は同じ親の中の座標
function ramBetween(m, ax, ay, bx, by) {
  m.position.set((ax + bx) / 2, (ay + by) / 2, m.position.z); m.rotation.z = Math.atan2(-(bx - ax), by - ay); m.scale.y = Math.max(0.2, Math.hypot(bx - ax, by - ay));
}
function unitCyl(r, color) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), mat(color, { metal: 0.6, rough: 0.3 })); m.castShadow = true; return m; }
export function aerial() { // 高所作業車（トラック式：運転席の後ろの旋回台・3段の伸縮ブーム・水平を保つバケット・H形のアウトリガ）
  const g = cabChassis();
  g.add(rbox(4.6, 0.3, 2.3, 'BODY', -1.3, 1.2, 0, 0.06));                                     // 荷台の床
  for (const s of [-1, 1]) { g.add(rbox(2.2, 0.5, 0.4, 0xd8d8d8, -1.9, 0.86, s * 1.02, 0.06)); g.add(box(0.03, 0.3, 0.02, 0x444444, -1.9, 0.9, s * 1.23)); }  // 工具箱と取っ手
  g.add(box(0.14, 0.8, 0.14, 0x555555, -2.9, 1.75, 0)); g.add(rbox(0.3, 0.1, 0.7, 0x555555, -2.9, 2.17, 0, 0.03));   // ブーム受け（後ろ）
  g.add(box(0.06, 0.06, 2.3, 0xff3b1f, -3.68, 1.2, 0));                                         // 後ろの反射帯
  // アウトリガ（H形）：前と後ろで横へ張り出し、ジャッキを下ろす
  const outs = [];
  for (const x of [1.15, -3.45]) for (const s of [-1, 1]) {
    g.add(rbox(0.42, 0.36, 0.5, 0x3a3a3a, x, 0.85, s * 0.9, 0.04));
    const o = new THREE.Group(); o.position.set(x, 0.85, s * 0.9); o.userData.s = s; g.add(o);
    o.add(box(0.26, 0.24, 1.0, 'ACCENT', 0, 0, s * 0.5));
    const leg = new THREE.Group(); o.add(leg); o.userData.leg = leg;
    leg.add(box(0.22, 0.75, 0.22, 0x2a2a2a, 0, -0.42, s * 0.92)); leg.add(cyl(0.24, 0.06, 0x222222, 0, -0.8, s * 0.92, 'y', 14));
    outs.push(o);
  }
  // 旋回台（運転席のすぐ後ろ）
  const tur = new THREE.Group(); tur.position.set(0.6, 1.35, 0); g.add(tur);
  tur.add(cyl(0.72, 0.18, 0x3a3a3a, 0, 0.09, 0, 'y', 24));
  tur.add(rbox(1.3, 0.5, 1.2, 'BODY', -0.05, 0.42, 0, 0.1));
  for (const s of [-1, 1]) tur.add(rbox(0.55, 0.85, 0.14, 0xd8d8d8, 0.05, 0.95, s * 0.36, 0.04));   // ブームの根元の支柱
  tur.add(rbox(0.2, 0.55, 0.45, 0x333333, -0.62, 0.6, 0.45, 0.04));                                 // 下の操作盤
  const boom = new THREE.Group(); boom.position.set(0, 1.1, 0); tur.add(boom);
  boom.add(rbox(5.0, 0.46, 0.46, 0xf4f4f4, 2.3, 0, 0, 0.06));                                        // 1段目
  boom.add(box(4.6, 0.05, 0.05, 0x222222, 2.3, -0.05, 0.25));                                        // 油圧ホース
  boom.add(box(4.8, 0.06, 0.47, 'ACCENT', 2.3, 0.0, 0));
  const s2 = new THREE.Group(); boom.add(s2); s2.add(rbox(4.8, 0.37, 0.37, 0xe6e6e6, 2.5, 0, 0, 0.05));   // 2段目
  const s3 = new THREE.Group(); s2.add(s3); s3.add(rbox(4.8, 0.29, 0.29, 0xdcdcdc, 2.6, 0, 0, 0.04));     // 3段目
  const tip = new THREE.Group(); tip.position.set(5.1, 0, 0); s3.add(tip);
  tip.add(rbox(0.3, 0.45, 0.4, 0x555555, 0, -0.1, 0, 0.04));
  const bk = new THREE.Group(); tip.add(bk);                                                           // バケット（いつも水平）
  bk.add(rbox(0.95, 1.0, 1.3, 0xf2f2f2, 0.62, -0.42, 0, 0.08));
  bk.add(box(0.97, 0.12, 1.32, 'ACCENT', 0.62, -0.2, 0));
  for (const s of [-1, 1]) { bk.add(box(1.0, 0.05, 0.05, 0xf2c200, 0.62, 0.32, s * 0.66)); bk.add(box(0.05, 0.05, 1.36, 0xf2c200, 0.62 + s * 0.48, 0.32, 0)); }   // 上の手すり（枠）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bk.add(box(0.04, 0.26, 0.04, 0xf2c200, 0.62 + sx * 0.48, 0.2, sz * 0.66));
  const w = person(0x2f6fb5); w.position.set(0.62, -0.9, 0.1); w.scale.setScalar(0.95); bk.add(w);       // 乗っている作業員
  const ram = unitCyl(0.09, 0x9a9a9a); tur.add(ram);
  g.userData = { type: 'aerial', tur, boom, s2, s3, bk, ram, outs, worker: w };
  setAerialPose(g, null, 0);
  return g;
}
// 高所作業車の姿勢：h＝バケットを持っていく位置（車の座標・null なら格納）、e＝0 格納→1 作業
// 順番：アウトリガを張る → ブームを起こす → 旋回 → 伸ばす（逆の順で格納）
export function setAerialPose(g, h, e = 1) {
  const u = g.userData; if (!u.boom) return;
  const eo = clamp01(e / 0.15), eb = clamp01((e - 0.15) / 0.85);
  for (const o of u.outs) { const s = o.userData.s; o.position.z = s * (0.9 - 0.75 * (1 - eo)); o.userData.leg.position.y = 0.45 * (1 - smooth(clamp01(eo * 1.5 - 0.5))); }
  let yawT = Math.PI, pitchT = 0, extT = 0;
  if (h) {
    const dx = h.x - 0.6, dz = h.z, dy = h.y - 2.45, hor = Math.max(0.5, Math.hypot(dx, dz));
    yawT = Math.atan2(-dz, dx); pitchT = Math.atan2(dy, hor); extT = Math.min(7.6, Math.max(0, Math.hypot(hor, dy) - 5.1));
  }
  const a1 = smooth(clamp01(eb / 0.35)), a2 = smooth(clamp01((eb - 0.3) / 0.4)), a3 = smooth(clamp01((eb - 0.65) / 0.35));
  let d = yawT - Math.PI; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const pitch = (1 - a3) * (a1 * Math.max(pitchT, 0.5)) + a3 * pitchT;
  u.tur.rotation.y = Math.PI + d * a2; u.boom.rotation.z = pitch;
  u.s2.position.x = extT * a3 / 2; u.s3.position.x = extT * a3 / 2;
  u.bk.rotation.z = -pitch;
  const c = Math.cos(pitch), s = Math.sin(pitch), bx = 1.6 * c + 0.23 * s, by = 1.1 + 1.6 * s - 0.23 * c;
  ramBetween(u.ram, 0.5, 0.4, bx, by);
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = u => u * u * (3 - 2 * u);
export function inspect() { // 橋梁点検車：旋回台から腕を高欄の外へ出し、下へ降ろして桁の下に歩廊（作業台）を入れる
  const g = cabChassis(); g.userData = { type: 'inspect' };
  g.add(rbox(4.8, 0.3, 2.3, 'BODY', -1.2, 1.2, 0, 0.06));
  for (const x of [1.1, -3.4]) for (const s of [-1, 1]) {                                          // アウトリガ
    g.add(box(0.26, 0.24, 0.9, 'ACCENT', x, 0.85, s * 1.25)); g.add(box(0.22, 0.75, 0.22, 0x2a2a2a, x, 0.43, s * 1.6)); g.add(cyl(0.24, 0.06, 0x222222, x, 0.05, s * 1.6, 'y', 14));
  }
  g.add(rbox(1.4, 0.9, 1.9, 0x3d3d3d, 0.4, 1.8, 0, 0.12));                                         // つり合いおもり
  g.add(cyl(0.75, 0.2, 0x3a3a3a, -2.2, 1.45, 0, 'y', 22));
  const arm = new THREE.Group(); arm.position.set(-2.2, 1.5, 0); g.add(arm);
  arm.add(rbox(0.6, 2.9, 0.6, 0xf4f4f4, 0, 1.45, 0, 0.06));                                        // 塔
  arm.add(rbox(0.5, 0.5, 5.6, 0xf4f4f4, 0, 2.9, 2.5, 0.06));                                       // 横の腕（高欄の外へ）
  arm.add(box(0.1, 0.1, 2.4, 0x9a9a9a, 0, 2.2, 1.1, { metal: 0.6, rough: 0.3 }));                  // 油圧シリンダー
  arm.add(rbox(0.5, 7.0, 0.5, 0xeaeaea, 0, -0.4, 5.05, 0.06));                                     // 下へ降りる腕
  arm.add(box(0.52, 0.5, 0.52, 'ACCENT', 0, 1.0, 5.05));
  const pf = new THREE.Group(); pf.position.set(0, -3.75, 5.05); arm.add(pf);                      // 桁の下の歩廊（橋の内側へ伸びる）
  pf.add(rbox(1.1, 0.12, 6.0, 0xe07b00, 0, 0, -2.9, 0.03));
  for (const s of [-1, 1]) { pf.add(box(0.04, 0.04, 6.0, 0xf2c200, s * 0.52, 1.0, -2.9)); pf.add(box(0.04, 0.04, 6.0, 0xf2c200, s * 0.52, 0.55, -2.9)); for (let k = 0; k <= 6; k++) pf.add(box(0.04, 1.0, 0.04, 0xf2c200, s * 0.52, 0.5, -k * 0.97)); }
  pf.add(box(1.08, 0.04, 0.04, 0xf2c200, 0, 1.0, -5.88));
  const w = person(0x2f6fb5); w.position.set(0, 0.06, -3.2); w.rotation.y = Math.PI / 2; pf.add(w);
  g.userData.arm = arm; return g;
}
export function signtruck(type) { // 規制の車：標識車（電光の表示板）／矢印板車／規制材運搬車（コーンと看板を積む）
  const g = cabChassis();
  g.add(rbox(4.7, 0.16, 2.3, 0x777777, -1.2, 1.15, 0, 0.04));                                      // 荷台の床
  for (const s of [-1, 1]) g.add(rbox(4.7, 0.4, 0.06, 'BODY', -1.2, 1.42, s * 1.13, 0.02));        // あおり
  g.add(rbox(0.06, 0.4, 2.3, 'BODY', -3.53, 1.42, 0, 0.02));
  g.add(box(0.08, 1.3, 0.08, 0x555555, 1.2, 1.85, 1.0)); g.add(box(0.08, 1.3, 0.08, 0x555555, 1.2, 1.85, -1.0)); g.add(box(0.08, 0.08, 2.1, 0x555555, 1.2, 2.5, 0));   // 鳥居（運転席の後ろの枠）
  for (let k = 0; k < 5; k++) g.add(box(0.1, 0.3, 0.42, k % 2 ? 0xf2c200 : 0x1a1a1a, -3.6, 0.8, -0.84 + k * 0.42));   // 後ろの注意色
  if (type === 'cones') {
    for (const z of [-0.6, 0.6]) for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { const c = cone(-3.0 + i * 0.6, 1.23 + k * 0.13, z); g.add(c); }
    for (let k = 0; k < 4; k++) { const b = box(1.4, 0.9, 0.05, k % 2 ? 0xffffff : 0xf2c200, 0.0, 1.7, -0.3 + k * 0.2); b.rotation.x = 0.15; g.add(b); }   // 立てかけた看板
    g.add(rbox(0.8, 0.5, 0.8, 0x2f6fb5, -0.2, 1.48, 0.7, 0.06));
  } else {
    const tex = textTexture(type === 'arrow' ? ['→→→'] : ['工事中', '←'], '#111111', '#ffd400', 512, 256);
    g.add(rbox(0.5, 0.5, 1.4, 0x444444, -2.4, 1.48, 0, 0.06));                                     // 昇降の台
    g.add(box(0.14, 1.9, 0.14, 0x555555, -2.4, 2.55, 0.5)); g.add(box(0.14, 1.9, 0.14, 0x555555, -2.4, 2.55, -0.5));
    g.add(rbox(0.16, 1.4, 2.5, 0x1a1a1a, -2.4, 3.45, 0, 0.04));                                    // 表示板の枠
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    board.position.set(-2.49, 3.45, 0); board.rotation.y = -Math.PI / 2; g.add(board);
    for (const s of [-1, 1]) g.add(cyl(0.14, 0.14, 0xff9a00, -2.4, 4.22, s * 1.0, 'y', 12));        // 回転灯
    g.add(rbox(1.0, 0.6, 0.8, 0x3a7d44, -0.4, 1.53, 0, 0.08));                                     // 発電機
  }
  g.userData = { type: 'signtruck' }; return g;
}
export function smallcart() { // ケレン機（小型）：手押しの研削機と集じん機
  const g = new THREE.Group();
  g.add(rbox(1.2, 0.5, 0.8, 0x2f6fb5, 0, 0.5, 0, 0.08)); wheels(g, [0.4, -0.4], 0.38, 0.2, 0.12, false);
  g.add(rbox(0.9, 0.12, 0.9, 0x2e2e2e, 0.55, 0.12, 0, 0.04));                                      // 研削部の覆い
  g.add(cyl(0.22, 0.7, 0x8a8f96, -0.25, 1.1, 0, 'y', 14)); g.add(cyl(0.05, 0.6, 0x1a1a1a, 0.2, 0.95, 0.2, 'y', 8));   // 集じんの筒とホース
  for (const s of [-1, 1]) { const h = box(0.9, 0.04, 0.04, 0x333333, -0.85, 0.95, s * 0.3); h.rotation.z = -0.6; g.add(h); }
  g.add(box(0.04, 0.04, 0.64, 0x333333, -1.22, 1.2, 0));
  g.userData = { type: 'cart' }; return g;
}
// コンクリートポンプ車（4段の折り曲げブーム・ブームに沿う輸送管・先端のゴムホース・X形の前アウトリガ・後ろのホッパ）
const PUMP_L = [6.5, 6.0, 5.5, 4.5], PUMP_PX = 0.9, PUMP_PY = 2.85, PUMP_HOSE = 2.6;
export function pump() {
  const g = cabChassis();
  g.add(rbox(3.6, 0.95, 2.25, 'BODY', -1.6, 1.52, 0, 0.12));                                  // ポンプ室の囲い
  g.add(box(3.62, 0.12, 2.27, 'ACCENT', -1.6, 1.25, 0));
  g.add(cyl(0.42, 2.4, 0xe8e8e8, -1.5, 2.25, -0.55, 'x', 18));                                  // 水タンク
  for (const s of [-1, 1]) g.add(cyl(0.13, 2.6, 0x9a9a9a, -1.6, 0.95, s * 0.45, 'x', 12));     // 圧送シリンダー（下）
  // ホッパ（後ろ：生コンを受ける・上に格子）
  g.add(rbox(1.0, 0.75, 1.9, 0x3a5f6a, -3.75, 1.35, 0, 0.08));
  for (let k = 0; k < 6; k++) g.add(box(0.95, 0.04, 0.04, 0x222222, -3.75, 1.74, -0.75 + k * 0.3));
  g.add(box(0.06, 0.06, 2.3, 0xff3b1f, -4.28, 1.0, 0));
  // 輸送管：ホッパ→旋回台
  g.add(cyl(0.11, 4.4, 0x8a8a8a, -1.6, 2.1, 0.75, 'x', 10)); g.add(cyl(0.11, 1.2, 0x8a8a8a, 0.55, 2.55, 0.75, 'y', 10));
  // アウトリガ：前はX形に斜め前へ、後ろは真横へ
  const outs = [];
  for (const [x, ang, len] of [[1.0, 0.65, 2.7], [-3.2, 0, 2.2]]) for (const s of [-1, 1]) {
    const o = new THREE.Group(); o.position.set(x, 1.0, s * 0.95); o.rotation.y = s * ang; o.userData = { s, ang }; g.add(o);
    o.add(rbox(0.3, 0.3, len, 'ACCENT', 0, 0, s * len / 2, 0.04));
    o.add(box(0.24, 0.95, 0.24, 0x2a2a2a, 0, -0.52, s * (len - 0.15))); o.add(cyl(0.3, 0.07, 0x222222, 0, -0.98, s * (len - 0.15), 'y', 14));
    outs.push(o);
  }
  // 旋回台（運転席の後ろの塔）
  g.add(rbox(1.2, 1.4, 1.6, 'BODY', PUMP_PX, 1.75, 0, 0.12));
  const base = new THREE.Group(); base.position.set(PUMP_PX, PUMP_PY, 0); g.add(base);
  base.add(cyl(0.6, 0.3, 0x3a3a3a, 0, -0.25, 0, 'y', 20));
  base.add(rbox(1.0, 0.6, 0.9, 'BODY', 0, 0.1, 0, 0.1));
  // ブーム：各段は前の段の先に付く（j[i] の中に段 i、先に j[i+1]）
  const J = []; let parent = base;
  const wd = [0.55, 0.48, 0.42, 0.36];
  PUMP_L.forEach((L, i) => {
    const j = new THREE.Group(); if (i > 0) j.position.set(PUMP_L[i - 1], 0, 0); parent.add(j); J.push(j);
    j.add(rbox(L, wd[i], wd[i] * 0.8, 0xf2f2f2, L / 2, 0, 0, 0.06));
    j.add(box(L * 0.9, 0.07, wd[i] * 0.82, 'ACCENT', L / 2, -wd[i] * 0.2, 0));
    j.add(cyl(0.1, L - 0.4, 0x8a8a8a, L / 2, wd[i] / 2 + 0.1, 0, 'x', 10));                       // 輸送管
    j.add(cyl(0.2, wd[i] * 0.9, 0x555555, 0, 0, 0, 'z', 14));                                       // 関節のピン
    const cy = box(1.6, 0.13, 0.13, 0x9a9a9a, 0.9, -wd[i] / 2 - 0.08, 0, { metal: 0.6, rough: 0.3 }); cy.rotation.z = 0.12; j.add(cy);   // 折り曲げの油圧シリンダー
    parent = j;
  });
  const hose = new THREE.Group(); g.add(hose);
  const hm = cyl(0.11, PUMP_HOSE, 0x1a1a1a, 0, -PUMP_HOSE / 2, 0, 'y', 10); hose.add(hm);
  hose.add(cyl(0.16, 0.25, 0x666666, 0, -0.05, 0, 'y', 10));
  g.userData = { type: 'pump', base, J, hose, outs };
  setPumpPose(g, { x: 12, y: 0, z: 0 });
  return g;
}
// ポンプ車のブーム：先端のホースの下の口を目標（車の座標）の上へ。
// 4段目はほぼ真下、3段目は距離に応じて下向き、1・2段目は2本の腕として角度を解く（ひじは上）
export function setPumpPose(g, h, e = 1) {
  const u = g.userData; if (!u.J) return;
  for (const o of u.outs) { const k = smooth(clamp01(e)); o.rotation.y = o.userData.s * o.userData.ang * k; o.scale.z = 0.45 + 0.55 * k; }
  const [L1, L2, L3, L4] = PUMP_L;
  const bx = h.x - PUMP_PX, bz = h.z, yaw = Math.atan2(-bz, bx);
  const r = Math.min(20, Math.max(1.5, Math.hypot(bx, bz)));
  const ty = h.y + 0.3 + PUMP_HOSE - PUMP_PY;                         // 先端の高さ（旋回の中心から）
  const a4 = -1.4, a3 = -1.55 + 1.2 * clamp01((r - 4) / 9);
  let px = r - L4 * Math.cos(a4) - L3 * Math.cos(a3), py = ty - L4 * Math.sin(a4) - L3 * Math.sin(a3);
  let d = Math.hypot(px, py); const dmax = L1 + L2 - 0.05, dmin = Math.abs(L1 - L2) + 0.3;
  if (d > dmax) { px *= dmax / d; py *= dmax / d; d = dmax; } if (d < dmin) { px *= dmin / d; py *= dmin / d; d = dmin; }
  const a1 = Math.atan2(py, px) + Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const p1x = L1 * Math.cos(a1), p1y = L1 * Math.sin(a1), a2 = Math.atan2(py - p1y, px - p1x);
  u.base.rotation.y = yaw;
  u.J[0].rotation.z = a1; u.J[1].rotation.z = a2 - a1; u.J[2].rotation.z = a3 - a2; u.J[3].rotation.z = a4 - a3;
  const tr = px + L3 * Math.cos(a3) + L4 * Math.cos(a4), tyy = py + L3 * Math.sin(a3) + L4 * Math.sin(a4);
  u.hose.position.set(PUMP_PX + tr * Math.cos(yaw), PUMP_PY + tyy, -tr * Math.sin(yaw));
  u.hose.rotation.set(0, 0, 0);
}
export function mixer() { // モルタルミキサー：車輪つきの台・傾いた練り胴・エンジン・けん引の棒
  const g = new THREE.Group();
  g.add(rbox(2.4, 0.16, 1.2, 0x555555, 0, 0.62, 0, 0.04)); wheels(g, [0], 0.72, 0.36, 0.2, false);
  g.add(box(1.0, 0.08, 0.08, 0x555555, 1.6, 0.55, 0)); g.add(box(0.08, 0.5, 0.08, 0x555555, 1.3, 0.3, 0));     // けん引の棒と支え
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.3, 20), mat(0xe07b00, { rough: 0.5, metal: 0.15 })); d.position.set(0.25, 1.35, 0); d.rotation.z = -0.9; d.castShadow = true; g.add(d);
  g.add(rbox(0.8, 0.7, 0.9, 0x333333, -0.8, 1.05, 0, 0.08)); g.add(cyl(0.05, 0.4, 0x666666, -0.9, 1.6, 0.25, 'y', 8));   // エンジン
  for (const s of [-1, 1]) g.add(box(0.1, 0.9, 0.1, 0x555555, 0.2, 1.05, s * 0.62));
  g.userData = { type: 'mixer' }; return g;
}
export function generator() { // 発電機：防音の箱・台・吸排気の格子・操作盤・排気筒・吊り金具
  const g = new THREE.Group();
  g.add(rbox(2.7, 0.16, 1.3, 0x222222, 0, 0.08, 0, 0.03));
  g.add(rbox(2.6, 1.3, 1.2, 0x3a7d44, 0, 0.82, 0, 0.1));
  g.add(box(2.62, 0.12, 1.22, 0xe8e8e8, 0, 1.1, 0));
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) g.add(box(0.5, 0.03, 0.02, 0x1a1a1a, 0.85, 0.45 + k * 0.08, s * 0.61));     // 格子
  g.add(box(0.02, 0.5, 0.7, 0x2a2a2a, -1.31, 0.85, 0)); for (let k = 0; k < 3; k++) g.add(box(0.03, 0.08, 0.08, 0xd03020, -1.33, 0.95, -0.2 + k * 0.2));   // 操作盤
  g.add(cyl(0.06, 0.35, 0x666666, 0.9, 1.62, 0.3, 'y', 8)); g.add(box(0.3, 0.14, 0.06, 0x555555, 0, 1.54, 0));
  g.userData = { type: 'generator' }; return g;
}
export function finisher() { // アスファルトフィニッシャ（前のホッパ・運転台と屋根・後ろのスクリード）
  const g = new THREE.Group();
  crawler(g, 3.4, 2.5, 0.7, 0.5);
  g.add(rbox(3.4, 1.15, 2.5, 'BODY', -0.2, 1.3, 0, 0.16));                                 // 本体
  const hop = new THREE.Group(); hop.position.set(2.2, 0.8, 0); g.add(hop);                  // ホッパ（左右の羽根）
  hop.add(box(1.4, 0.12, 2.0, 0x3a3a3a, 0, 0.1, 0));
  for (const s of [-1, 1]) { const w = rbox(1.5, 0.9, 0.12, 'BODY', 0, 0.55, s * 1.25, 0.04); w.rotation.x = s * 0.35; hop.add(w); }
  hop.add(box(0.12, 0.7, 2.6, 'BODY', 0.72, 0.45, 0)); hop.add(cyl(0.18, 2.4, 0x222222, 0.8, -0.35, 0, 'z', 12));    // 前の押し当てローラー
  const scr = rbox(0.7, 0.55, 3.2, 0x3a3a3a, -2.25, 0.4, 0, 0.08); g.add(scr);               // スクリード
  g.add(box(0.72, 0.1, 3.22, 'ACCENT', -2.25, 0.72, 0));
  g.add(rail(3.0, -2.4, 0.7, 1.4, 0xf2c200));                                                  // 後ろの歩廊の手すり
  const op = rops(1.4, 2.2, 1.9, 0x2a2a2a); op.position.set(-0.6, 1.88, 0); g.add(op);
  g.add(cyl(0.1, 0.8, 0x666666, 0.6, 2.4, 0.9, 'y', 8));
  g.userData = { type: 'finisher' }; return g;
}
export function roller(type) { // ローラー（鉄輪または空気タイヤ・運転席の保護枠・散水タンク）
  const g = new THREE.Group();
  if (type === 'macadam') {
    g.add(cyl(0.8, 1.8, 0x8a8a8a, 1.6, 0.8, 0, 'z', 24)); g.add(rbox(1.0, 0.25, 2.0, 'BODY', 1.6, 1.62, 0, 0.06));     // 前の鉄輪とカバー
    for (const s of [-1, 1]) g.add(cyl(0.75, 0.6, 0x8a8a8a, -1.4, 0.75, s * 0.8, 'z', 24));
  } else {
    for (const x of [1.5, -1.5]) for (let i = 0; i < 4; i++) { g.add(cyl(0.55, 0.36, 0x1a1a1a, x, 0.55, -0.9 + i * 0.6, 'z', 18)); g.add(cyl(0.3, 0.38, 0x9a9a9a, x, 0.55, -0.9 + i * 0.6, 'z', 12)); }
  }
  g.add(rbox(3.4, 0.95, 1.9, 'BODY', 0, 1.55, 0, 0.18));                                    // 本体
  g.add(rbox(1.0, 0.7, 1.6, 0xd8d8d8, 0.9, 2.3, 0, 0.14));                                   // 散水タンク
  const op = rops(1.2, 1.5, 1.7, 0x2a2a2a); op.position.set(-0.6, 2.02, 0); g.add(op);
  g.add(cyl(0.08, 0.6, 0x666666, -1.4, 2.4, 0.7, 'y', 8));
  g.userData = { type: 'roller' }; return g;
}
export function linetruck() { // 区画線施工車：塗料を溶かす釜（2基）・ガスボンベ・横の施工機・後ろの矢印板
  const g = cabChassis();
  g.add(rbox(4.7, 0.16, 2.3, 0x777777, -1.2, 1.15, 0, 0.04));
  for (const x of [-0.3, -1.9]) { g.add(cyl(0.72, 1.3, 0xe8e8e8, x, 1.9, 0, 'y', 22)); g.add(cyl(0.76, 0.1, 0x8a8f96, x, 2.58, 0, 'y', 22)); g.add(cyl(0.08, 0.5, 0x555555, x, 2.85, 0, 'y', 8)); g.add(box(0.5, 0.3, 0.1, 0x333333, x, 1.45, 0.74)); }   // 釜とふた・かくはん機・火口
  for (const z of [-0.8, -0.45]) g.add(cyl(0.16, 1.1, 0x9aa0a6, 0.85, 1.8, z, 'y', 12));          // ガスボンベ
  g.add(rbox(0.9, 0.5, 0.5, 0xe07b00, -3.0, 0.4, -1.45, 0.06)); g.add(box(0.5, 0.06, 0.06, 0x555555, -3.0, 0.7, -1.2));   // 横の施工機
  for (const x of [-3.3, -2.7]) g.add(cyl(0.14, 0.08, 0x1a1a1a, x, 0.14, -1.45, 'z', 12));
  g.add(box(0.08, 1.4, 0.08, 0x555555, -3.4, 1.9, 0)); const tex = textTexture(['→→'], '#111111', '#ffd400', 256, 128);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  board.position.set(-3.46, 2.7, 0); board.rotation.y = -Math.PI / 2; g.add(board);
  for (let i = 0; i < 4; i++) g.add(cone(-3.2 + i * 0.25, 1.23, 0.8));
  g.userData = { type: 'linetruck' }; return g;
}

export function cone(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 10), mat(0xff5a00)); c.position.y = 0.38; g.add(c);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), mat(0xffffff)); b.position.y = 0.45; g.add(b);
  g.add(box(0.4, 0.05, 0.4, 0x222222, 0, 0.025, 0));
  g.position.set(x, y, z); return g;
}
export function person(color = 0xff7a00, flag = false) {
  const g = new THREE.Group();
  const legs = []; for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(0, 0.85, s * 0.09); const m = box(0.13, 0.85, 0.13, 0x223355, 0, -0.42, 0); l.add(m); g.add(l); legs.push(l); }
  g.add(cyl(0.2, 0.6, color, 0, 1.15, 0));
  g.add(box(0.42, 0.06, 0.42, 0xd8ff40, 0, 1.3, 0));   // 反射ベストの帯
  const arms = []; for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(0, 1.42, s * 0.25); a.add(box(0.1, 0.6, 0.1, color, 0, -0.3, 0)); g.add(a); arms.push(a); }
  if (flag) { // 右手に赤旗（棒＋布）
    arms[1].add(box(0.025, 0.7, 0.025, 0x8a6a3a, 0, -0.75, 0));
    arms[1].add(box(0.02, 0.32, 0.42, 0xd81e1e, 0, -1.0, 0.22));
  }
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(0xf0c8a0)); h.position.y = 1.6; g.add(h);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff)); hat.position.y = 1.65; g.add(hat);
  g.userData = { legs, arms };
  return g;
}
// 人の動き：歩く（脚と腕を振る）／合図（右腕を上げ下げ）
export function posePerson(g, t, mode) {
  const u = g.userData; if (!u || !u.legs) return;
  if (mode === 'walk') { const s = Math.sin(t * 6); u.arms[1].rotation.x = 0; u.legs[0].rotation.z = s * 0.4; u.legs[1].rotation.z = -s * 0.4; u.arms[0].rotation.z = -s * 0.35; u.arms[1].rotation.z = s * 0.35; }
  else if (mode === 'signal') { u.legs.forEach(l => l.rotation.z = 0); u.arms[0].rotation.z = 0; u.arms[1].rotation.x = -2.6 - 0.35 * Math.sin(t * 3); }
  else if (mode === 'stop') { u.legs.forEach(l => l.rotation.z = 0); u.arms[0].rotation.z = 0; u.arms[1].rotation.z = 0; u.arms[1].rotation.x = -1.57; }       // 旗を横に出して止める
  else if (mode === 'go') { u.legs.forEach(l => l.rotation.z = 0); u.arms[0].rotation.z = 0; u.arms[1].rotation.z = 0; u.arms[1].rotation.x = -1.2 - 0.9 * (0.5 + 0.5 * Math.sin(t * 4)); }  // 旗を振って進ませる
  else { u.legs.forEach(l => l.rotation.z = 0); u.arms.forEach(a => { a.rotation.z = 0; a.rotation.x = 0; }); }
}
export function barricade(width = 2.2) {
  const g = new THREE.Group();
  if (!_stripe) _stripe = stripeTexture();
  const m = new THREE.MeshStandardMaterial({ map: _stripe, side: THREE.DoubleSide });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.35), m); p.position.y = 0.9; p.rotation.y = Math.PI / 2; g.add(p);
  for (const s of [-1, 1]) g.add(box(0.06, 1.1, 0.06, 0x333333, 0, 0.55, s * width / 2));
  return g;
}
export function signBoard(lines, bg = '#ffffff', fg = '#c00000', border = '#c00000') {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.2), new THREE.MeshStandardMaterial({ map: textTexture(lines, bg, fg, 512, 300, border), side: THREE.DoubleSide }));
  p.position.y = 2.2; p.rotation.y = -Math.PI / 2; g.add(p);
  g.add(box(0.08, 2.0, 0.08, 0x666666, 0.05, 1.0, 0));
  return g;
}
export function signal() { // 仮設信号（赤・青の点灯は scale で切替）
  const g = new THREE.Group();
  g.add(box(0.12, 3.2, 0.12, 0x666666, 0, 1.6, 0)); g.add(box(0.3, 0.9, 0.4, 0x222222, 0, 3.3, 0));
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xff2020, { emissive: 0xff0000 })); red.position.set(-0.17, 3.55, 0); g.add(red);
  const green = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0x20ffa0, { emissive: 0x00ff80 })); green.position.set(-0.17, 3.05, 0); g.add(green);
  g.userData = { red, green }; return g;
}
