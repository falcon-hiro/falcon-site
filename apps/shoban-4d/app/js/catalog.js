// 部品ライブラリ（重機・架設資材 12分類 約125種）
// 重機・架設資材の部品一覧（寸法は説明用の目安・実在メーカーの塗装やロゴはまねていない）
// 形は一般的な外形に似せた簡易モデル。色・模様は当社オリジナル（実在メーカーの塗装・ロゴはまねない）。
// 交通規制（I）は一般的な色に固定（模様を変えられない）。
import * as THREE from 'three';
import * as M from './models.js';

const B = 'BODY', A = 'ACCENT';
const DK = 0x222222, ST = 0x8a9099, CN = 0xbdb9b0, GL = 0x2b3a55, WH = 0xeeeeee, WD = 0xa0703c, RB = 0x1a1a1a;
const box = M.box, cyl = M.cyl;

export const CATS = {
  A: '掘削・積込み', B: '運搬', C: '揚重・吊具', D: '基礎・杭', E: '舗装・路盤', F: 'コンクリート',
  G: '解体・切断', H: '高所・点検', I: '交通規制・保安', J: '橋梁の架設資材', K: '仮設・その他', L: '測量',
};
export const CAT_ACCENT = { A: 0x1b2a4a, B: 0x1b2a4a, C: 0xc9a227, D: 0x6b4a8b, E: 0x333a44, F: 0x3c7c8c, G: 0xa33b3b, H: 0xe07b00, I: 0xc00000, J: 0x2e7d5b, K: 0x556b2f, L: 0x1b6ac9 };

// ───── 共通の部品 ─────
function tracks(g, L, W, h = 0.8, tw = 0.6) { for (const s of [-1, 1]) g.add(box(L, h, tw, RB, 0, h / 2, s * (W / 2 - tw / 2))); g.add(box(L * 0.7, h * 0.6, W - tw * 2, 0x444444, 0, h * 0.6, 0)); }
function truckBase(g, L, W, axles = 2, cabLen = 2.0, cabH = 2.4) {
  const r = 0.5; const xs = [];
  xs.push(L / 2 - cabLen / 2 - 0.2);
  for (let i = 1; i < axles; i++) xs.push(-L / 2 + 1.0 + (i - 1) * 1.3);
  M.wheels(g, xs, W / 2 - 0.3, r, 0.4);
  g.add(box(L, 0.4, W * 0.8, DK, 0, 0.9, 0));
  g.add(box(cabLen, cabH, W, B, L / 2 - cabLen / 2, 0.9 + cabH / 2, 0));
  g.add(box(0.05, cabH * 0.4, W * 0.85, GL, L / 2 + 0.01, 0.9 + cabH * 0.7, 0));
  g.add(box(cabLen * 0.98, 0.18, W * 1.01, A, L / 2 - cabLen / 2, 0.9 + cabH * 0.35, 0));
  return 1.1;
}
function armGeo(len, t = 0.4) { const g = new THREE.BoxGeometry(1, t, t); g.translate(0.5, 0, 0); const m = new THREE.Mesh(g, M.mat(B)); m.scale.x = len; m.castShadow = true; return m; }
function excavatorArm(up, x, y, boomL, armL, tool = 'bucket', ang = [0.75, -1.5]) {
  const root = new THREE.Group(); root.position.set(x, y, 0.4); up.add(root);
  const b = armGeo(boomL, 0.45); b.rotation.z = ang[0]; root.add(b);
  const j = new THREE.Group(); j.position.set(boomL * Math.cos(ang[0]), boomL * Math.sin(ang[0]), 0); root.add(j);
  const a = armGeo(armL, 0.35); a.rotation.z = ang[1]; j.add(a);
  const tip = new THREE.Group(); tip.position.set(armL * Math.cos(ang[1]), armL * Math.sin(ang[1]), 0); j.add(tip);
  if (tool === 'bucket') tip.add(box(0.9, 0.8, 1.0, DK, 0.2, -0.3, 0));
  else if (tool === 'breaker') { tip.add(box(0.4, 1.4, 0.4, DK, 0, -0.7, 0)); tip.add(box(0.1, 0.5, 0.1, ST, 0, -1.6, 0)); }
  else if (tool === 'crusher') { tip.add(box(0.6, 0.6, 0.8, DK, 0, -0.3, 0)); for (const s of [-1, 1]) { const c = box(0.25, 1.0, 0.5, DK, s * 0.3, -0.9, 0); c.rotation.z = s * 0.3; tip.add(c); } }
  else if (tool === 'clam') { tip.add(box(0.2, 3.5, 0.2, ST, 0, -1.7, 0)); for (const s of [-1, 1]) { const c = box(0.5, 0.9, 1.0, DK, s * 0.3, -3.8, 0); c.rotation.z = s * 0.35; tip.add(c); } }
  root.userData.joint = j; return root;
}
function leader(g, x, h, w = 0.8) { g.add(box(w, h, w, B, x, h / 2 + 1.5, 0)); g.add(box(w * 1.1, 0.3, w * 1.1, A, x, h + 1.5, 0)); for (const s of [-1, 1]) { const st = box(0.2, h * 0.75, 0.2, ST, x - 2.0, h * 0.4, s * 0.8); st.rotation.z = -0.25; g.add(st); } }
function house(g, L, W, H, color = WH) { g.add(box(L, H, W, color, 0, H / 2, 0)); g.add(box(L + 0.1, 0.12, W + 0.1, A, 0, H + 0.06, 0)); g.add(box(0.9, 1.9, 0.05, 0x5d6470, L * 0.3, 0.95, W / 2 + 0.03)); g.add(box(1.2, 0.8, 0.05, GL, -L * 0.2, 1.5, W / 2 + 0.03)); }
function frameTower(g, w, h, d, color = B, step = 1.8) { // 格子の柱（ベント・タワー）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.15, h, 0.15, color, sx * w / 2, h / 2, sz * d / 2));
  for (let y = step; y < h; y += step) { g.add(box(w, 0.08, 0.08, color, 0, y, d / 2)); g.add(box(w, 0.08, 0.08, color, 0, y, -d / 2)); g.add(box(0.08, 0.08, d, color, w / 2, y, 0)); g.add(box(0.08, 0.08, d, color, -w / 2, y, 0)); }
}
function scaffoldBay(g, L, H, W) {
  for (let x = -L / 2; x <= L / 2 + 1e-6; x += 1.8) for (const z of [-W / 2, W / 2]) g.add(box(0.05, H, 0.05, ST, x, H / 2, z));
  for (let y = 1.7; y <= H; y += 1.7) { for (const z of [-W / 2, W / 2]) g.add(box(L, 0.05, 0.05, ST, 0, y, z)); g.add(box(L, 0.04, W, WD, 0, y - 0.02, 0)); g.add(box(L, 0.04, 0.04, 0xf2c200, 0, y + 0.9, W / 2)); }
}
function rotors(g, y, r) { for (const [x, z] of [[r, r], [-r, r], [r, -r], [-r, -r]]) { g.add(cyl(0.05, 0.08, DK, x, y, z)); g.add(box(0.5, 0.01, 0.06, 0x555555, x, y + 0.05, z)); } }

// ───── 部品の作り方（family）─────
const F = {
  excavator: p => { const g = new THREE.Group(); tracks(g, p.L * 0.42, p.W, p.H * 0.27); const up = new THREE.Group(); up.position.y = p.H * 0.3; g.add(up);
    up.add(box(p.L * 0.32, p.H * 0.33, p.W * 0.92, B, -p.L * 0.05, p.H * 0.17, 0)); up.add(box(p.L * 0.12, p.H * 0.33, p.W * 0.92, A, -p.L * 0.24, p.H * 0.17, 0));
    if (p.canopy) { for (const s of [-1, 1]) g.add(box(0.06, 1.2, 0.06, DK, p.L * 0.05, p.H * 0.72, s * 0.5)); up.add(box(1.0, 0.06, 1.1, DK, p.L * 0.05, p.H * 0.8, -0.1)); }
    else up.add(box(p.L * 0.11, p.H * 0.38, p.W * 0.35, GL, p.L * 0.08, p.H * 0.5, -p.W * 0.28));
    if (p.blade) g.add(box(0.3, 0.5, p.W, B, p.L * 0.26, 0.3, 0));
    excavatorArm(up, p.L * 0.08, p.H * 0.35, p.L * (p.long ? 0.55 : 0.42), p.L * (p.long ? 0.6 : 0.3), p.tool || 'bucket', p.tool === 'clam' ? [0.9, -0.3] : [0.75, -1.5]); g.userData.swing = up; return g; },
  wheelloader: p => { const g = new THREE.Group(); M.wheels(g, [p.L * 0.18, -p.L * 0.25], p.W / 2 - 0.3, 0.75, 0.6);
    g.add(box(p.L * 0.35, 1.1, p.W * 0.8, B, -p.L * 0.22, 1.4, 0)); g.add(box(p.L * 0.25, 0.9, p.W * 0.7, B, p.L * 0.12, 1.2, 0)); g.add(box(p.L * 0.14, 1.4, p.W * 0.6, GL, -p.L * 0.03, 2.5, 0));
    g.add(box(p.L * 0.06, 0.3, p.W * 0.8, A, -p.L * 0.38, 1.9, 0)); g.add(box(1.0, 1.0, p.W, DK, p.L * 0.45, 0.7, 0)); for (const s of [-1, 1]) { const a = box(p.L * 0.32, 0.25, 0.25, B, p.L * 0.32, 1.3, s * p.W * 0.35); a.rotation.z = -0.2; g.add(a); } return g; },
  dozer: p => { const g = new THREE.Group(); tracks(g, p.L * 0.65, p.W * 0.85, 0.9); g.add(box(p.L * 0.55, 1.2, p.W * 0.6, B, -0.2, 1.5, 0)); g.add(box(p.L * 0.2, 1.1, p.W * 0.5, GL, -p.L * 0.12, 2.6, 0));
    g.add(box(0.35, 1.3, p.W, A, p.L * 0.45, 0.7, 0)); g.add(box(0.2, 1.0, 0.2, DK, -p.L * 0.45, 0.5, 0)); return g; },
  skidsteer: p => { const g = new THREE.Group(); M.wheels(g, [0.6, -0.6], p.W / 2 - 0.2, 0.38, 0.3); g.add(box(p.L * 0.6, 1.1, p.W * 0.8, B, -0.2, 1.0, 0)); g.add(box(0.8, 0.8, p.W * 0.7, GL, 0, 1.8, 0));
    for (const s of [-1, 1]) g.add(box(p.L * 0.6, 0.2, 0.15, A, 0.2, 1.6, s * p.W * 0.45)); g.add(box(0.6, 0.6, p.W, DK, p.L * 0.45, 0.4, 0)); return g; },
  dump: p => { const g = new THREE.Group(); const y = truckBase(g, p.L, p.W, p.axles || 3, 1.9, p.H * 0.75);
    const bl = p.L - 2.4; g.add(box(bl, 0.12, p.W, B, -p.L / 2 + bl / 2 + 0.1, y + 0.1, 0)); for (const s of [-1, 1]) g.add(box(bl, 0.9, 0.08, B, -p.L / 2 + bl / 2 + 0.1, y + 0.55, s * p.W / 2));
    g.add(box(0.08, 0.9, p.W, B, -p.L / 2 + 0.1, y + 0.55, 0)); g.add(box(0.08, 1.2, p.W, A, -p.L / 2 + bl + 0.1, y + 0.7, 0)); return g; },
  semi: p => { const g = new THREE.Group(); g.add(box(2.4, 2.6, p.W, B, p.L / 2 - 1.2, 2.0, 0)); g.add(box(2.4, 0.2, p.W * 1.01, A, p.L / 2 - 1.2, 1.4, 0)); g.add(box(3.6, 0.5, p.W * 0.9, DK, p.L / 2 - 2.0, 0.9, 0)); M.wheels(g, [p.L / 2 - 1.0, p.L / 2 - 3.2], p.W / 2 - 0.3);
    const bl = p.L - 4.0; const low = p.low; const by = low ? 0.8 : 1.4; g.add(box(bl, 0.3, p.W, ST, -p.L / 2 + bl / 2, by, 0));
    if (low) g.add(box(2.0, 0.3, p.W, ST, p.L / 2 - 4.2, 1.4, 0)); M.wheels(g, [-p.L / 2 + 1.0, -p.L / 2 + 2.2, ...(low ? [] : [-p.L / 2 + 3.4])], p.W / 2 - 0.3, low ? 0.4 : 0.5); return g; },
  pole: p => { const g = F.semi({ ...p, L: 9 }); g.add(box(p.L - 9, 0.25, 0.3, ST, -4.5 - (p.L - 9) / 2, 1.2, 0)); const d = new THREE.Group(); d.position.x = -p.L + 1.5; g.add(d); d.add(box(2.5, 0.3, p.W, ST, 0, 1.3, 0)); M.wheels(d, [0.5, -0.6], p.W / 2 - 0.3); g.add(box(p.L - 2, 0.6, 0.6, 0x6b8e23, -p.L / 2 + 1.5, 1.8, 0)); return g; },
  spmt: p => { const g = new THREE.Group(); g.add(box(p.L, 0.5, p.W, B, 0, p.H - 0.25, 0)); g.add(box(p.L, 0.08, p.W * 1.01, A, 0, p.H - 0.5, 0)); const n = Math.round(p.L / 1.4);
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) g.add(cyl(0.35, 0.3, RB, -p.L / 2 + 0.7 + i * 1.4, 0.35, s * (p.W / 2 - 0.4), 'z')); g.add(box(1.4, 1.2, p.W * 0.6, B, p.L / 2 + 0.7, 1.0, 0)); return g; },
  cargocrane: p => { const g = F.dump({ ...p, axles: 2 }); const up = new THREE.Group(); up.position.set(p.L / 2 - 2.4, 1.3, 0); g.add(up); up.add(box(0.6, 1.2, 0.6, B, 0, 0.6, 0));
    const bm = armGeo(4.5, 0.3); bm.rotation.z = 0.2; bm.position.y = 1.2; bm.rotation.y = Math.PI; up.add(bm); g.add(box(0.2, 0.2, p.W + 1.6, A, p.L / 2 - 2.4, 0.9, 0)); g.userData.swing = up; return g; },
  carrier: p => { const g = new THREE.Group(); tracks(g, p.L * 0.75, p.W, p.H * 0.25, 0.45); g.add(box(p.L * 0.55, 0.5, p.W, B, -p.L * 0.15, p.H * 0.4, 0)); for (const s of [-1, 1]) g.add(box(p.L * 0.55, 0.45, 0.06, B, -p.L * 0.15, p.H * 0.6, s * p.W / 2));
    if (p.H > 2) { g.add(box(p.L * 0.22, p.H * 0.45, p.W * 0.8, B, p.L * 0.32, p.H * 0.55, 0)); g.add(box(0.05, p.H * 0.2, p.W * 0.7, GL, p.L * 0.43, p.H * 0.65, 0)); } else g.add(box(0.1, 1.0, 0.6, DK, -p.L * 0.5, 1.0, 0)); return g; },
  forklift: p => { const g = new THREE.Group(); M.wheels(g, [0.8, -0.9], p.W / 2 - 0.15, 0.32, 0.25); g.add(box(p.L * 0.6, 0.9, p.W, B, -0.3, 0.8, 0)); g.add(box(0.5, 0.8, p.W, A, -1.4, 1.0, 0));
    for (const s of [-1, 1]) g.add(box(0.06, 2.0, 0.06, DK, -0.6 + s * 0, 2.0, s * 0.5)); g.add(box(1.2, 0.05, p.W, DK, -0.5, 2.2, 0));
    for (const s of [-1, 1]) g.add(box(0.12, p.H, 0.12, DK, 1.0, p.H / 2, s * 0.35)); for (const s of [-1, 1]) g.add(box(1.2, 0.05, 0.12, ST, 1.7, 0.15, s * 0.3)); return g; },
  crane: p => { const g = M.crane({ len: p.L * 0.85, wid: p.W, crawler: !!p.crawler }); if (p.lattice) g.userData.boom.material = M.mat(0xd9d9d9); M.setCranePose(g, { x: p.reach || 10, y: 6, z: 0 }); if (p.twoCab) g.add(box(1.5, 1.4, p.W * 0.95, GL, -p.L * 0.38, 2.2, 0)); return g; },
  towercrane: p => { const g = new THREE.Group(); frameTower(g, 1.8, p.H, 1.8, B, 3); const up = new THREE.Group(); up.position.y = p.H; g.add(up);
    up.add(box(p.jib, 0.8, 0.8, B, p.jib / 2 - 1, 0.6, 0)); up.add(box(12, 0.8, 0.8, B, -6, 0.6, 0)); up.add(box(2.5, 2.0, 1.6, DK, -10, 0.0, 0)); up.add(box(1.4, 1.4, 1.2, GL, 1.2, -0.6, 1.2)); up.add(box(1, 4, 1, A, 0, 2.6, 0));
    up.add(box(1.0, 0.5, 1.0, DK, p.jib * 0.6, 0.0, 0)); up.add(box(0.05, 12, 0.05, DK, p.jib * 0.6, -6, 0)); g.userData.swing = up; return g; },
  gantrycrane: p => { const g = new THREE.Group(); for (const s of [-1, 1]) { for (const x of [-2, 2]) g.add(box(0.6, p.H, 0.6, B, x, p.H / 2, s * p.W / 2)); g.add(box(5, 0.5, 0.8, B, 0, 0.25, s * p.W / 2)); }
    g.add(box(1.0, 1.2, p.W + 1.2, A, 2, p.H + 0.6, 0)); g.add(box(1.0, 1.2, p.W + 1.2, A, -2, p.H + 0.6, 0)); g.add(box(2.5, 1.0, 1.6, B, 0, p.H + 1.7, 0)); g.add(box(0.05, p.H * 0.6, 0.05, DK, 0, p.H * 0.7, 0)); return g; },
  jibcrane: p => { const g = new THREE.Group(); g.add(cyl(0.25, p.H, B, 0, p.H / 2, 0)); g.add(box(1.4, 0.3, 1.4, CN, 0, 0.15, 0)); g.add(box(p.jib, 0.35, 0.3, A, p.jib / 2, p.H - 0.3, 0)); g.add(box(0.5, 0.5, 0.4, DK, p.jib * 0.7, p.H - 0.8, 0)); return g; },
  spider: p => { const g = new THREE.Group(); tracks(g, p.L * 0.8, p.W, 0.45, 0.25); g.add(box(p.L * 0.7, 0.7, p.W * 0.9, B, 0, 0.8, 0)); g.add(box(p.L * 0.2, 0.4, p.W * 0.9, A, -p.L * 0.3, 1.0, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = box(1.8, 0.12, 0.12, B, sx * 1.4, 0.7, sz * 0.9); leg.rotation.y = sx * sz * 0.6; leg.rotation.z = -sx * 0.25; g.add(leg); }
    const bm = armGeo(4.0, 0.25); bm.position.set(-0.5, 1.2, 0); bm.rotation.z = 0.45; g.add(bm); return g; },
  spreader: p => { const g = new THREE.Group(); g.add(box(p.L, 0.4, 0.3, B, 0, 3, 0)); g.add(box(p.L, 0.02, 0.31, A, 0, 3.2, 0)); for (const s of [-1, 1]) { const w = box(0.03, 3.2, 0.03, DK, s * p.L / 4, 4.5, 0); w.rotation.z = -s * 0.35; g.add(w); g.add(box(0.03, 2.8, 0.03, DK, s * (p.L / 2 - 0.3), 1.6, 0)); } return g; },
  sling: p => { const g = new THREE.Group(); for (const s of [-1, 1]) { const w = box(0.035, p.L, 0.035, p.belt ? 0xe0c020 : DK, s * 0.8, p.L / 2, 0); w.rotation.z = s * 0.2; g.add(w); } g.add(box(0.3, 0.3, 0.1, ST, 0, p.L, 0)); return g; },
  shackle: p => { const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 16, Math.PI), M.mat(0xc0392b)); t.position.y = 0.25; g.add(t); for (const s of [-1, 1]) g.add(box(0.05, 0.15, 0.05, 0xc0392b, s * 0.1, 0.18, 0)); g.add(cyl(0.02, 0.28, ST, 0, 0.1, 0, 'x'));
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 16, Math.PI * 1.4), M.mat(0xd4a017)); h.position.set(0.5, 0.15, 0); h.rotation.z = Math.PI; g.add(h); return g; },
  pilerig: p => { const g = new THREE.Group(); tracks(g, p.L * 0.8, p.W, 0.9); g.add(box(p.L * 0.6, 1.4, p.W * 0.7, B, -0.6, 1.6, 0)); g.add(box(1.4, 1.4, 1.0, GL, 0.6, 2.6, -1.0)); leader(g, p.L * 0.45, p.leaderH || 20);
    if (p.auger) g.add(cyl(p.auger / 2, (p.leaderH || 20) * 0.7, ST, p.L * 0.45 + 0.6, (p.leaderH || 20) * 0.4, 0)); return g; },
  auger: p => { const g = new THREE.Group(); g.add(cyl(0.08, p.H, ST, 0, p.H / 2, 0)); for (let y = 0.3; y < p.H; y += 0.5) { const t = new THREE.Mesh(new THREE.TorusGeometry(p.W / 2, 0.03, 4, 16), M.mat(ST)); t.rotation.x = Math.PI / 2 + 0.2; t.position.y = y; g.add(t); } return g; },
  earthdrill: p => { const g = F.crane({ L: p.L, W: p.W, crawler: true, reach: 5 }); g.add(box(0.3, 20, 0.3, DK, 6.2, 10, 0)); g.add(cyl(0.7, 1.6, ST, 6.2, 0.8, 0)); return g; },
  casing: p => { const g = new THREE.Group(); g.add(box(p.L * 0.6, 1.0, p.W, B, -p.L * 0.2, 0.5, 0)); g.add(cyl(1.3, 2.2, A, p.L * 0.25, 1.1, 0)); g.add(cyl(0.9, 4.0, ST, p.L * 0.25, 2.0, 0)); g.add(box(1.2, 1.8, 1.2, DK, p.L * 0.25, 5.5, 0)); return g; },
  vibro: p => { const g = new THREE.Group(); g.add(box(p.L, p.H * 0.6, p.W, B, 0, p.H * 0.6, 0)); g.add(box(p.L * 0.5, p.H * 0.3, p.W * 0.6, A, 0, p.H * 0.15, 0)); g.add(box(0.3, 0.6, 0.3, ST, 0, p.H + 0.2, 0)); return g; },
  pressin: p => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) g.add(box(0.4, 1.6, 0.6, ST, -1.6 + i * 0.6, 0.8, 0)); g.add(box(p.L, 0.6, p.W, B, 0, 2.0, 0)); g.add(box(1.0, 1.2, 1.2, A, p.L / 2 - 0.5, 2.9, 0)); g.add(box(0.5, 0.5, 0.8, DK, -p.L / 2 + 0.6, 1.4, 0)); return g; },
  grader: p => { const g = new THREE.Group(); M.wheels(g, [p.L * 0.43, -p.L * 0.25, -p.L * 0.4], p.W / 2 - 0.3, 0.6, 0.45); g.add(box(p.L * 0.5, 0.4, 0.5, B, p.L * 0.15, 1.6, 0));
    g.add(box(p.L * 0.35, 1.2, p.W * 0.8, B, -p.L * 0.3, 1.3, 0)); g.add(box(p.L * 0.15, 1.5, p.W * 0.7, GL, -p.L * 0.08, 2.5, 0)); const bl = box(0.3, 0.6, 3.1, A, p.L * 0.08, 0.45, 0); bl.rotation.y = 0.5; g.add(bl); return g; },
  finisher: () => M.finisher(),
  roller: p => { const g = new THREE.Group(); const t = p.type;
    if (t === 'macadam') { g.add(cyl(0.8, 1.8, ST, 1.6, 0.8, 0, 'z')); for (const s of [-1, 1]) g.add(cyl(0.75, 0.6, ST, -1.4, 0.75, s * 0.8, 'z')); }
    else if (t === 'tandem') { for (const x of [1.5, -1.5]) g.add(cyl(0.6, p.W * 0.9, ST, x, 0.6, 0, 'z')); }
    else if (t === 'tire') { for (const x of [1.5, -1.5]) for (let i = 0; i < 4; i++) g.add(cyl(0.55, 0.38, RB, x, 0.55, -0.9 + i * 0.6, 'z')); }
    else if (t === 'vib') { g.add(cyl(0.75, p.W * 0.9, ST, 2.0, 0.75, 0, 'z')); for (const s of [-1, 1]) g.add(cyl(0.75, 0.6, RB, -1.6, 0.75, s * 0.8, 'z')); }
    else { g.add(cyl(0.3, 0.7, ST, 0.5, 0.3, 0, 'z')); g.add(cyl(0.3, 0.7, ST, -0.5, 0.3, 0, 'z')); g.add(box(1.4, 0.4, 0.7, B, 0, 0.7, 0)); g.add(box(0.05, 0.05, 0.6, DK, -1.2, 1.0, 0)); return g; }
    g.add(box(p.L * 0.7, 1.0, p.W * 0.85, B, 0, 1.6, 0)); g.add(box(p.L * 0.7, 0.15, p.W * 0.86, A, 0, 1.2, 0)); g.add(box(1.2, 1.2, 1.4, GL, -0.4, 2.7, 0)); return g; },
  miller: () => M.miller(),
  stabilizer: p => { const g = new THREE.Group(); M.wheels(g, [p.L * 0.35, -p.L * 0.35], p.W / 2 - 0.4, 0.9, 0.7); g.add(box(p.L * 0.9, 1.2, p.W * 0.8, B, 0, 1.9, 0)); g.add(box(2.0, 1.0, p.W, A, 0, 0.6, 0)); g.add(box(1.4, 1.2, 1.4, GL, -1.0, 3.1, 0)); return g; },
  distributor: p => { const g = new THREE.Group(); const y = truckBase(g, p.L, p.W, 2); g.add(cyl(0.9, p.L - 2.8, B, -0.9, y + 0.9, 0, 'x')); g.add(box(0.15, 0.15, p.W + 1.0, A, -p.L / 2 - 0.1, 0.6, 0)); return g; },
  sweeper: () => M.sweeper(),
  plate: p => { const g = new THREE.Group(); if (p.rammer) { g.add(box(0.3, 0.1, 0.3, ST, 0, 0.05, 0)); g.add(box(0.25, 0.6, 0.25, B, 0, 0.45, 0)); g.add(box(0.05, 0.3, 0.5, DK, -0.2, 0.9, 0)); }
    else { g.add(box(0.9, 0.08, 0.5, ST, 0, 0.04, 0)); g.add(box(0.5, 0.4, 0.4, B, 0, 0.35, 0)); const h = box(0.8, 0.04, 0.04, DK, -0.6, 0.7, 0); h.rotation.z = 0.6; g.add(h); } return g; },
  mixertruck: p => { const g = new THREE.Group(); const y = truckBase(g, p.L, p.W, p.L > 7 ? 3 : 2); const d = cyl(p.W * 0.45, p.L - 3, B, -0.8, y + p.W * 0.5, 0, 'x'); d.rotation.z = Math.PI / 2 - 0.15; g.add(d);
    const band = cyl(p.W * 0.46, 0.4, A, -0.8, y + p.W * 0.5, 0, 'x'); band.rotation.z = Math.PI / 2 - 0.15; g.add(band); g.add(box(0.8, 0.15, 0.4, ST, -p.L / 2 - 0.3, 1.4, 0)); return g; },
  pump: () => M.pump(),
  linepump: p => { const g = new THREE.Group(); truckBase(g, p.L, p.W, 2); g.add(box(p.L - 2.5, 1.2, p.W * 0.9, B, -1.0, 1.8, 0)); for (let i = 0; i < 4; i++) g.add(cyl(0.065, 3, ST, -p.L / 2 - 1.5 - i * 3, 0.07, 0, 'x')); return g; },
  pipe: p => { const g = new THREE.Group(); g.add(cyl(0.065, p.L, ST, 0, 0.1, 0, 'x')); const h = cyl(0.06, 1.5, RB, p.L / 2 + 0.2, 0.7, 0); h.rotation.z = 0.4; g.add(h); return g; },
  deckfinisher: p => { const g = new THREE.Group(); for (const s of [-1, 1]) { g.add(box(p.L, 0.1, 0.1, ST, 0, 0.05, s * p.W / 2)); g.add(box(1.0, 1.2, 0.4, B, 0, 0.7, s * p.W / 2)); } g.add(box(1.2, 0.4, p.W, B, 0, 1.3, 0)); g.add(box(0.6, 0.3, p.W - 0.4, A, 0, 0.35, 0)); return g; },
  cbucket: p => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(p.W / 2, 0.2, p.H, 16), M.mat(B)); c.position.y = p.H / 2 + 0.2; g.add(c); g.add(box(0.3, 0.4, 0.3, DK, 0, 0.1, 0)); return g; },
  vibrator: () => { const g = new THREE.Group(); g.add(cyl(0.03, 0.5, ST, 0, 0.25, 0)); g.add(box(0.3, 0.25, 0.25, B, 0.6, 0.12, 0)); g.add(box(0.6, 0.03, 0.03, RB, 0.3, 0.05, 0)); return g; },
  mixer: () => M.mixer(),
  breaker: p => { const g = new THREE.Group(); g.add(box(0.5, p.L, 0.5, B, 0, p.L / 2 + 0.3, 0)); g.add(box(0.12, 0.5, 0.12, ST, 0, 0.25, 0)); g.add(box(0.6, 0.15, 0.6, A, 0, p.L + 0.3, 0)); return g; },
  crusher: p => { const g = new THREE.Group(); g.add(box(0.7, 0.8, 0.9, B, 0, 1.4, 0)); for (const s of [-1, 1]) { const j = box(0.25, 1.1, 0.6, DK, s * 0.35, 0.55, 0); j.rotation.z = s * 0.3; g.add(j); } return g; },
  handbreaker: () => { const g = new THREE.Group(); g.add(box(0.15, 0.4, 0.15, 0xc0392b, 0, 0.5, 0)); g.add(box(0.04, 0.3, 0.04, ST, 0, 0.15, 0)); g.add(box(0.05, 0.05, 0.45, DK, 0, 0.72, 0)); return g; },
  saw: p => M.saw(p.type),
  coredrill: () => { const g = new THREE.Group(); g.add(box(0.5, 0.05, 0.4, ST, 0, 0.03, 0)); g.add(box(0.06, 1.4, 0.06, ST, -0.15, 0.75, 0)); g.add(box(0.3, 0.35, 0.3, B, 0.05, 1.0, 0)); g.add(cyl(0.08, 0.5, ST, 0.05, 0.5, 0)); return g; },
  waterjet: p => { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(box(p.L, 0.08, 0.08, ST, 0, 0.6, s * 0.5)); g.add(box(0.6, 0.5, 1.2, B, 0, 0.9, 0)); g.add(box(0.05, 0.6, 0.05, DK, 0, 0.35, 0)); g.add(box(1.0, 0.04, 0.04, RB, -0.8, 0.1, 0.4)); return g; },
  aerial: () => M.aerial(),
  scissor: p => { const g = new THREE.Group(); M.wheels(g, [0.8, -0.8], p.W / 2 - 0.15, 0.2, 0.18); g.add(box(p.L, 0.4, p.W, B, 0, 0.45, 0));
    for (let i = 0; i < 3; i++) { for (const s of [1, -1]) { const c = box(p.L * 1.0, 0.08, 0.08, A, 0, 1.0 + i * 1.0, s * p.W / 2); c.rotation.z = (i % 2 ? 1 : -1) * 0.45; g.add(c); } } g.add(box(p.L, 0.1, p.W, B, 0, 3.6, 0)); g.add(box(p.L, 0.05, 0.05, DK, 0, 4.6, p.W / 2)); g.add(box(p.L, 0.05, 0.05, DK, 0, 4.6, -p.W / 2)); return g; },
  inspect: () => M.inspect(),
  lift: p => { const g = new THREE.Group(); frameTower(g, 0.6, p.H, 0.6, ST, 1.5); g.add(box(p.L * 0.8, 2.2, p.W, B, 0.8, 1.2, 0)); g.add(box(p.L * 0.8, 0.1, p.W + 0.02, A, 0.8, 2.3, 0)); return g; },
  signtruck: p => M.signtruck(p.type),
  cushion: p => { const g = F.dump({ L: p.L, W: p.W, H: 2.5, axles: 2 }); g.add(box(1.0, 1.0, p.W, 0xffd400, -p.L / 2 - 0.5, 1.0, 0)); g.add(box(0.05, 0.8, p.W, DK, -p.L / 2 - 1.0, 1.0, 0)); return g; },
  arrowboard: () => { const g = new THREE.Group(); const t = M.textTexture(['→'], '#111111', '#ffd400', 256, 160); const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, emissive: 0x222200 })); pl.position.y = 1.3; pl.rotation.y = -Math.PI / 2; g.add(pl);
    for (const s of [-1, 1]) g.add(box(0.05, 1.0, 0.05, DK, 0, 0.5, s * 0.4)); return g; },
  signboard: p => M.signBoard(p.text || ['工事中'], '#ffffff', '#1b2a4a', '#c00000'),
  conebar: () => { const g = new THREE.Group(); g.add(M.cone(0, 0, -1.0)); g.add(M.cone(0, 0, 1.0)); const bar = cyl(0.03, 2.0, 0xffffff, 0, 0.62, 0, 'z'); g.add(bar); for (let i = -2; i <= 2; i += 2) g.add(cyl(0.031, 0.35, 0xff2020, 0, 0.62, i * 0.35, 'z')); return g; },
  cone: () => M.cone(),
  barricade: () => M.barricade(1.2),
  block: p => { const g = new THREE.Group(); g.add(box(0.5, p.H, p.L, 0xeeeeee, 0, p.H / 2, 0)); for (let i = 0; i < 4; i++) g.add(box(0.51, p.H * 0.98, 0.25, 0xd02020, 0, p.H / 2, -p.L / 2 + 0.25 + i * 0.5)); return g; },
  signal: () => M.signal(),
  warnlight: () => { const g = new THREE.Group(); g.add(cyl(0.08, 0.15, 0xff8800, 0, 0.9, 0)); g.add(cyl(0.02, 0.8, DK, 0, 0.4, 0)); return g; },
  flagger: p => { const g = M.person(0xffd400); const f = box(0.02, 0.4, 0.5, p.flag || 0xff2020, 0.45, 1.85, 0); g.add(f); g.add(box(0.03, 0.9, 0.03, DK, 0.45, 1.4, 0)); if (p.auto) g.add(box(0.6, 0.15, 0.6, DK, 0, 0.07, 0)); return g; },
  person: () => M.person(),
  bent: p => { const g = new THREE.Group(); frameTower(g, p.W, p.H, p.W, B, 1.5); g.add(box(p.W + 1.2, 0.4, 0.4, A, 0, p.H + 0.2, 0)); for (const s of [-1, 1]) g.add(cyl(0.15, 0.3, DK, s * p.W / 3, p.H + 0.55, 0)); return g; },
  launcher: () => { const g = new THREE.Group(); g.add(box(2, 0.6, 1, B, 0, 0.3, 0)); for (let i = 0; i < 3; i++) g.add(cyl(0.12, 0.8, ST, -0.6 + i * 0.6, 0.72, 0, 'z')); g.add(box(0.8, 0.25, 0.25, A, 1.3, 0.5, 0)); return g; },
  nose: p => { const g = new THREE.Group(); for (const s of [-1, 1]) { const top = box(p.L, 0.15, 0.3, B, 0, p.H, s * p.W / 2); g.add(top); const bot = box(p.L, 0.15, 0.3, B, 0, 0.1, s * p.W / 2); g.add(bot);
      for (let x = -p.L / 2; x < p.L / 2; x += 2) { const d = box(2.8, 0.1, 0.1, A, x + 1, p.H / 2, s * p.W / 2); d.rotation.z = (Math.round(x) % 4 === 0 ? 1 : -1) * Math.atan2(p.H, 2); g.add(d); } }
    for (let x = -p.L / 2; x <= p.L / 2; x += 4) g.add(box(0.1, 0.1, p.W, B, x, p.H, 0)); return g; },
  trolley: p => { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(box(p.L * 2, 0.15, 0.1, ST, 0, 0.08, s * 0.75)); g.add(box(p.L, 0.4, p.W, B, 0, 0.6, 0)); M.wheels(g, [0.9, -0.9], 0.75, 0.25, 0.1); return g; },
  jack: p => { const g = new THREE.Group(); g.add(cyl(p.W / 2, p.H * 0.7, B, 0, p.H * 0.35, 0)); g.add(cyl(p.W * 0.35, p.H * 0.3, ST, 0, p.H * 0.85, 0)); if (p.hole) g.add(cyl(p.W * 0.15, p.H + 0.02, DK, 0, p.H / 2, 0)); return g; },
  sandle: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const b = box(1.0, 0.2, 0.2, WD, 0, 0.1 + i * 0.2, -0.4 + k * 0.27); if (i % 2) b.rotation.y = Math.PI / 2; g.add(b); } return g; },
  hangscaffold: p => { const g = new THREE.Group(); g.add(box(p.L, 0.05, p.W, WD, 0, 0.0, 0)); for (let x = -p.L / 2; x <= p.L / 2; x += 1.8) for (const s of [-1, 1]) { g.add(box(0.03, 2.0, 0.03, DK, x, 1.0, s * p.W / 2)); } for (const s of [-1, 1]) g.add(box(p.L, 0.05, 0.05, 0xf2c200, 0, 0.95, s * p.W / 2)); return g; },
  systemhang: p => { const g = new THREE.Group(); g.add(box(p.L, 0.08, p.W, 0x9aa0a6, 0, 0, 0)); g.add(box(p.L, 0.02, p.W, A, 0, 0.05, 0)); for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) g.add(box(0.03, 1.6, 0.03, DK, x * p.L / 2, 0.8, z * p.W / 2)); return g; },
  asagao: () => { const g = new THREE.Group(); const p1 = box(2.0, 0.04, 3.0, ST, 1.0, 0.35, 0); p1.rotation.z = 0.35; g.add(p1); const s = box(0.06, 2.2, 0.06, DK, 1.6, -0.2, 0); s.rotation.z = 0.8; g.add(s); return g; },
  net: p => { const g = new THREE.Group(); g.add(box(0.02, p.H, p.L, 0x3a7d44, 0, p.H / 2, 0, { opacity: 0.55 })); for (const s of [-1, 1]) g.add(box(0.05, p.H, 0.05, ST, 0, p.H / 2, s * p.L / 2)); return g; },
  plate2: p => { const g = new THREE.Group(); g.add(box(p.L, p.H, p.W, p.color || ST, 0, p.H / 2, 0)); if (p.rib) for (let i = 0; i < 6; i++) g.add(box(0.02, 0.005, p.W * 0.9, 0x6a7079, -p.L / 2 + 0.2 + i * (p.L - 0.4) / 5, p.H + 0.002, 0)); return g; },
  hbeam: p => { const g = new THREE.Group(); g.add(box(p.L, 0.02, 0.3, B, 0, 0.01, 0)); g.add(box(p.L, 0.02, 0.3, B, 0, 0.29, 0)); g.add(box(p.L, 0.26, 0.012, B, 0, 0.15, 0)); return g; },
  trestle: p => { const g = new THREE.Group(); for (let x = -p.L / 2; x <= p.L / 2; x += 6) for (const s of [-1, 1]) g.add(box(0.3, 6, 0.3, ST, x, 0, s * (p.W / 2 - 0.6)));
    for (const s of [-1, 1]) g.add(box(p.L, 0.6, 0.3, ST, 0, 3.3, s * (p.W / 2 - 0.6))); for (let x = -p.L / 2 + 0.5; x < p.L / 2; x += 1) g.add(box(0.98, 0.2, p.W, ST, x, 3.7, 0)); return g; },
  shoring: p => { const g = new THREE.Group(); if (p.pipe) { g.add(cyl(0.03, p.H, B, 0, p.H / 2, 0)); g.add(box(0.15, 0.02, 0.15, ST, 0, 0.01, 0)); g.add(box(0.15, 0.02, 0.15, ST, 0, p.H, 0)); }
    else { for (const s of [-1, 1]) g.add(cyl(0.024, p.H, B, 0, p.H / 2, s * p.W / 2)); g.add(box(0.05, 0.05, p.W, B, 0, p.H - 0.3, 0)); } return g; },
  formwork: () => { const g = new THREE.Group(); g.add(box(0.02, 0.9, 1.8, 0xc8a16a, 0, 0.45, 0)); for (let i = 0; i < 4; i++) g.add(box(0.05, 0.9, 0.05, WD, -0.04, 0.45, -0.75 + i * 0.5)); return g; },
  slab: p => { const g = new THREE.Group(); g.add(box(p.L, p.H, p.W, p.color || 0xc9c6bd, 0, p.H / 2, 0)); if (p.loops) for (let i = 0; i < 8; i++) g.add(box(0.15, 0.08, 0.04, ST, p.L / 2 + 0.07, p.H / 2, -p.W / 2 + 0.6 + i * (p.W - 1.2) / 7));
    for (const s of [-1, 1]) g.add(cyl(0.05, 0.03, DK, s * p.L / 4, p.H + 0.01, 0)); return g; },
  joint: p => { const g = new THREE.Group(); g.add(box(p.L, 0.2, p.W, DK, 0, 0.1, 0)); for (let z = -p.W / 2 + 0.2; z < p.W / 2; z += 0.25) g.add(box(p.L * 0.9, 0.02, 0.08, ST, 0, 0.21, z)); return g; },
  bearing: () => { const g = new THREE.Group(); g.add(box(0.5, 0.03, 0.5, ST, 0, 0.015, 0)); for (let i = 0; i < 4; i++) g.add(box(0.46, 0.02, 0.46, i % 2 ? RB : ST, 0, 0.04 + i * 0.022, 0)); g.add(box(0.5, 0.03, 0.5, ST, 0, 0.14, 0)); return g; },
  wallrail: p => { const g = new THREE.Group(); g.add(box(p.L, p.H, 0.3, CN, 0, p.H / 2, 0)); g.add(box(p.L, 0.05, 0.32, 0x999999, 0, p.H, 0)); return g; },
  curb: p => { const g = new THREE.Group(); g.add(box(p.L, 0.25, 0.5, CN, 0, 0.125, 0)); return g; },
  generator: () => M.generator(),
  compressor: p => { const g = new THREE.Group(); M.wheels(g, [0], p.W / 2, 0.3, 0.2); g.add(box(p.L * 0.8, 1.1, p.W, B, 0, 0.95, 0)); g.add(box(p.L * 0.8, 0.12, p.W + 0.02, A, 0, 1.1, 0)); g.add(box(0.9, 0.06, 0.06, DK, p.L * 0.5, 0.5, 0)); return g; },
  subpump: () => { const g = new THREE.Group(); g.add(cyl(0.12, 0.5, 0x2f6fb5, 0, 0.25, 0)); g.add(box(1.5, 0.05, 0.05, RB, 0.75, 0.5, 0)); return g; },
  lighttruck: p => { const g = new THREE.Group(); const y = truckBase(g, p.L, p.W, 2); g.add(box(p.L - 2.4, 0.9, p.W * 0.9, B, -1.0, y + 0.45, 0)); g.add(box(0.15, 7, 0.15, ST, -1.5, y + 4.4, 0)); g.add(box(0.3, 0.6, 1.6, 0xfff6c0, -1.5, y + 8.0, 0, { emissive: 0x777755 })); return g; },
  balloon: () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), M.mat(0xffffff, { emissive: 0x666666 })); s.position.y = 4.3; g.add(s);
    g.add(cyl(0.04, 3.8, ST, 0, 1.9, 0)); for (let i = 0; i < 3; i++) { const l = box(0.03, 1.2, 0.03, DK, 0.35 * Math.cos(i * 2.1), 0.5, 0.35 * Math.sin(i * 2.1)); l.rotation.set(0.3 * Math.sin(i * 2.1), 0, -0.3 * Math.cos(i * 2.1)); g.add(l); } return g; },
  welder: () => { const g = new THREE.Group(); g.add(box(0.8, 0.6, 0.5, B, 0, 0.4, 0)); g.add(box(0.8, 0.06, 0.52, A, 0, 0.72, 0)); M.wheels(g, [0.25, -0.25], 0.27, 0.1, 0.05); return g; },
  toilet: () => { const g = new THREE.Group(); g.add(box(0.9, 2.3, 0.9, 0x6aa6d8, 0, 1.15, 0)); g.add(box(0.95, 0.12, 0.95, 0xffffff, 0, 2.36, 0)); g.add(box(0.03, 1.8, 0.7, 0x4a86b8, 0.46, 1.0, 0)); return g; },
  house: p => { const g = new THREE.Group(); house(g, p.L, p.W, p.H); return g; },
  fence: p => { const g = new THREE.Group(); g.add(box(0.03, p.H, p.L, 0xf0f0f0, 0, p.H / 2 + 0.1, 0)); g.add(box(0.035, 0.2, p.L, A, 0, p.H - 0.2, 0)); for (const s of [-1, 1]) g.add(box(0.05, p.H + 0.2, 0.05, ST, -0.05, (p.H + 0.2) / 2, s * p.L / 2)); return g; },
  tubescaffold: p => { const g = new THREE.Group(); scaffoldBay(g, p.L, p.H, p.W); return g; },
  framescaffold: p => { const g = new THREE.Group(); for (let x = -p.L / 2; x <= p.L / 2 + 1e-6; x += 1.8) { for (const z of [-p.W / 2, p.W / 2]) g.add(box(0.045, 1.7, 0.045, B, x, 0.85, z)); g.add(box(0.045, 0.045, p.W, B, x, 1.5, 0)); }
    g.add(box(p.L, 0.04, p.W, ST, 0, 1.72, 0)); for (const z of [-p.W / 2, p.W / 2]) { const d = box(Math.hypot(1.8, 1.7), 0.03, 0.03, ST, 0, 0.85, z); d.rotation.z = Math.atan2(1.7, 1.8); g.add(d); } return g; },
  ts: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const l = box(0.03, 1.4, 0.03, 0xc8a16a, 0.25 * Math.cos(i * 2.1), 0.65, 0.25 * Math.sin(i * 2.1)); l.rotation.set(0.18 * Math.sin(i * 2.1), 0, -0.18 * Math.cos(i * 2.1)); g.add(l); }
    g.add(box(0.2, 0.3, 0.2, B, 0, 1.55, 0)); g.add(cyl(0.05, 0.15, DK, 0.1, 1.6, 0, 'x')); return g; },
  gnss: () => { const g = new THREE.Group(); g.add(cyl(0.015, 2.0, 0xeeeeee, 0, 1.0, 0)); g.add(cyl(0.1, 0.08, B, 0, 2.04, 0)); for (let i = 0; i < 2; i++) { const l = box(0.015, 1.4, 0.015, DK, 0.3 * (i ? 1 : -1), 0.65, 0.2); l.rotation.z = (i ? 1 : -1) * 0.22; g.add(l); } return g; },
  uav: () => { const g = new THREE.Group(); g.add(box(0.35, 0.12, 0.25, B, 0, 0.3, 0)); for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const a = box(0.5, 0.03, 0.03, DK, x * 0.2, 0.3, z * 0.2); a.rotation.y = x * z * Math.PI / 4; g.add(a); } rotors(g, 0.33, 0.35); return g; },
};

// ───── 部品一覧（id＝分類コード-連番）─────
const R = []; let cnt = {};
function add(cat, name, fam, dims, p = {}, opt = {}) {
  cnt[cat] = (cnt[cat] || 0) + 1;
  const id = `${cat}-${String(cnt[cat]).padStart(2, '0')}`;
  R.push({ id, cat, name, fam, dims, p: { L: dims[0], W: dims[1], H: dims[2], ...p }, lock: cat === 'I' || !!opt.lock, moves: opt.moves || '' });
}
// A 掘削・積込み
add('A', 'バックホウ 0.8m³（20t級）', 'excavator', [9.5, 2.8, 3.0], {}, { moves: '旋回・ブーム・アーム・バケット' });
add('A', 'バックホウ 0.45m³（12t級）', 'excavator', [7.6, 2.5, 2.8], {}, { moves: '同上' });
add('A', 'バックホウ 0.25m³（7t級・排土板）', 'excavator', [6.0, 2.3, 2.6], { blade: 1 }, { moves: '同上' });
add('A', 'ミニショベル 0.1m³（3t級）', 'excavator', [4.5, 1.6, 2.5], { blade: 1, canopy: 1 }, { moves: '旋回・ブーム左右振り・排土板' });
add('A', 'ロングアームのバックホウ', 'excavator', [12, 2.8, 3.1], { long: 1 }, { moves: '同上' });
add('A', 'ホイールローダ 2m³', 'wheelloader', [7.5, 2.6, 3.3], {}, { moves: '中折れ・リフト・チルト' });
add('A', 'スキッドステアローダ', 'skidsteer', [3.0, 1.6, 2.0], {}, { moves: 'アーム・バケット' });
add('A', 'ブルドーザ 15t', 'dozer', [5.5, 3.0, 3.0], {}, { moves: '排土板上下・チルト' });
add('A', 'テレスコ式クラムシェル', 'excavator', [10, 2.8, 3.2], { tool: 'clam' }, { moves: '旋回・伸縮・開閉' });
// B 運搬
add('B', 'ダンプトラック 10t', 'dump', [7.7, 2.5, 3.0], { axles: 3 }, { moves: '荷台の上げ下げ' });
add('B', 'ダンプトラック 4t', 'dump', [6.0, 2.2, 2.6], { axles: 2 }, { moves: '荷台の上げ下げ' });
add('B', 'ダンプトラック 2t', 'dump', [4.7, 1.7, 2.0], { axles: 2 }, { moves: '荷台の上げ下げ' });
add('B', 'セミトレーラ（平床）', 'semi', [16.5, 2.5, 2.8], {}, { moves: '連結部で折れる' });
add('B', '低床トレーラ', 'semi', [16, 3.0, 2.5], { low: 1 }, { moves: '連結部で折れる' });
add('B', 'ポールトレーラ（長尺物用）', 'pole', [24, 2.5, 3.0], {}, { moves: 'ポール伸縮・後ろの台車' });
add('B', '多軸台車（自走式）', 'spmt', [10, 3.0, 1.2], {}, { moves: '全輪操舵・高さ調整' });
add('B', 'クレーン付トラック 4t', 'cargocrane', [8.0, 2.2, 3.0], {}, { moves: '旋回・起伏・伸縮・アウトリガ' });
add('B', '不整地運搬車 6t', 'carrier', [5.2, 2.2, 2.6], {}, { moves: '荷台の上げ下げ' });
add('B', 'クローラキャリア（小型）', 'carrier', [2.6, 1.0, 1.3], {}, { moves: '荷台の上げ下げ' });
add('B', 'フォークリフト 3t', 'forklift', [3.7, 1.2, 2.2], {}, { moves: 'マスト昇降・チルト' });
// C 揚重・吊具
add('C', 'ラフテレーンクレーン 25t', 'crane', [11.3, 2.6, 3.5], {}, { moves: '旋回・起伏・伸縮・巻上げ' });
add('C', 'ラフテレーンクレーン 50t', 'crane', [12, 2.8, 3.8], {}, { moves: '同上' });
add('C', 'オールテレーンクレーン 100〜200t', 'crane', [15, 3.0, 4.0], {}, { moves: '同上' });
add('C', 'トラッククレーン', 'crane', [14, 2.8, 3.8], { twoCab: 1 }, { moves: '同上' });
add('C', 'クローラクレーン（格子ブーム）100t', 'crane', [8, 4.6, 3.5], { crawler: 1, lattice: 1, reach: 14 }, { moves: '旋回・起伏・巻上げ' });
add('C', 'クローラクレーン（伸縮式）', 'crane', [9, 3.5, 3.3], { crawler: 1 }, { moves: '旋回・起伏・伸縮' });
add('C', 'タワークレーン', 'towercrane', [2, 2, 40], { jib: 40 }, { moves: '旋回・トロリー' });
add('C', '門型クレーン', 'gantrycrane', [5, 16, 10], {}, { moves: 'レール走行・横行・巻上げ' });
add('C', 'ジブクレーン（定置）', 'jibcrane', [1.4, 1.4, 7], { jib: 7 }, { moves: '旋回・巻上げ' });
add('C', 'クローラ式小型クレーン', 'spider', [2.8, 0.8, 1.5], {}, { moves: '足を広げる・旋回・伸縮' });
add('C', '吊り天秤', 'spreader', [8, 0.3, 0.5], {}, { moves: '吊られて回る' });
add('C', 'ワイヤーロープ', 'sling', [5, 0.04, 0.04], {}, { moves: '' });
add('C', '吊りベルト', 'sling', [4, 0.1, 0.01], { belt: 1 }, { moves: '' });
add('C', 'シャックル・フック', 'shackle', [0.6, 0.3, 0.3], {}, { moves: '' });
// D 基礎・杭
add('D', '三点支持式杭打機', 'pilerig', [7, 4.5, 3.5], { leaderH: 24 }, { moves: 'リーダ起伏・オーガ昇降' });
add('D', 'アースオーガ（スクリュー）', 'auger', [0.6, 0.6, 12], {}, { moves: '回転・昇降' });
add('D', 'アースドリル', 'earthdrill', [9, 3, 3.5], {}, { moves: '回転・昇降・旋回' });
add('D', 'オールケーシング掘削機', 'casing', [6, 3, 3.5], {}, { moves: '鋼管回転・グラブ上下' });
add('D', 'バイブロハンマ', 'vibro', [2.5, 1.0, 1.5], {}, { moves: '振動（クレーンで吊る）' });
add('D', '油圧式杭圧入引抜機', 'pressin', [4, 2, 3], {}, { moves: '杭の上を自走・昇降' });
add('D', '地盤改良機（かくはん式）', 'pilerig', [8, 3.5, 3.5], { leaderH: 20, auger: 1.0 }, { moves: '回転・昇降' });
// E 舗装・路盤
add('E', 'モーターグレーダ 3.1m', 'grader', [8.0, 2.5, 3.3], {}, { moves: 'ブレード回転・上下・中折れ' });
add('E', 'アスファルトフィニッシャ', 'finisher', [6.0, 2.5, 3.0], {}, { moves: 'ホッパ開閉・スクリード伸縮' });
add('E', 'マカダムローラ 10t', 'roller', [5.0, 2.2, 2.9], { type: 'macadam' }, { moves: '走行' });
add('E', 'タンデムローラ（振動）', 'roller', [4.5, 1.8, 2.9], { type: 'tandem' }, { moves: '振動' });
add('E', 'タイヤローラ', 'roller', [4.7, 2.0, 3.0], { type: 'tire' }, { moves: '走行' });
add('E', '振動ローラ（土工用）', 'roller', [5.8, 2.3, 3.0], { type: 'vib' }, { moves: '中折れ・振動' });
add('E', 'ハンドガイドローラ', 'roller', [2.5, 0.8, 1.1], { type: 'hand' }, { moves: '振動' });
add('E', '路面切削機 2m', 'miller', [15, 2.5, 3.5], {}, { moves: 'コンベヤの旋回・起伏' });
add('E', 'スタビライザ', 'stabilizer', [8, 2.6, 3.2], {}, { moves: 'ロータ上下' });
add('E', 'アスファルトディストリビュータ', 'distributor', [7, 2.2, 2.8], {}, { moves: '散布バーを広げる' });
add('E', '路面清掃車', 'sweeper', [6, 2.2, 2.8], {}, { moves: 'ブラシ回転' });
add('E', 'プレートコンパクタ', 'plate', [0.9, 0.5, 1.0], {}, { moves: '振動' });
add('E', 'ランマー', 'plate', [0.4, 0.4, 1.0], { rammer: 1 }, { moves: '振動' });
// F コンクリート
add('F', '生コン車 10t', 'mixertruck', [7.6, 2.5, 3.3], {}, { moves: 'ドラム回転・シュート旋回' });
add('F', '生コン車 4t', 'mixertruck', [6.0, 2.2, 2.8], {}, { moves: 'ドラム回転・シュート旋回' });
add('F', 'コンクリートポンプ車（ブーム式）', 'pump', [10, 2.5, 3.7], {}, { moves: '旋回・各段の折り曲げ' });
add('F', '配管式ポンプ車', 'linepump', [7, 2.2, 2.8], {}, { moves: '' });
add('F', '輸送管・先端ホース', 'pipe', [3, 0.125, 0.125], {}, { moves: '先端が揺れる' });
add('F', '床版コンクリートフィニッシャ（レール走行）', 'deckfinisher', [6, 10, 1.0], {}, { moves: '橋の方向に走る' });
add('F', 'コンクリートバケット', 'cbucket', [1.2, 1.2, 1.6], {}, { moves: '口の開閉' });
add('F', '棒状バイブレータ', 'vibrator', [0.9, 0.3, 0.5], {}, { moves: '振動' });
add('F', 'モルタルミキサー', 'mixer', [1.2, 0.7, 1.1], {}, { moves: 'ドラム回転' });
// G 解体・切断
add('G', '油圧ブレーカ（アタッチメント）', 'breaker', [2.0, 0.6, 0.6], {}, { moves: 'のみの往復' });
add('G', 'バックホウ＋ブレーカ', 'excavator', [7.6, 2.5, 2.8], { tool: 'breaker' }, { moves: '旋回・のみの往復' });
add('G', '圧砕機（アタッチメント）', 'crusher', [1.8, 1.0, 0.6], {}, { moves: '開閉・旋回' });
add('G', 'バックホウ＋圧砕機', 'excavator', [9.5, 2.8, 3.0], { tool: 'crusher' }, { moves: '旋回・開閉' });
add('G', 'ハンドブレーカ', 'handbreaker', [0.6, 0.3, 0.3], {}, { moves: '往復' });
add('G', 'ワイヤーソー', 'saw', [1.5, 0.8, 1.2], { type: 'wire' }, { moves: 'ワイヤ循環・前後移動' });
add('G', 'ウォールソー', 'saw', [3, 0.8, 0.8], { type: 'wall' }, { moves: '円刃回転・レール走行' });
add('G', 'コンクリートカッター（路面用）', 'saw', [1.5, 0.7, 1.0], { type: 'cutter' }, { moves: '回転' });
add('G', 'ロードカッター（大型）', 'saw', [2.2, 1.0, 1.4], { type: 'road' }, { moves: '回転' });
add('G', 'コアドリル', 'coredrill', [0.5, 0.4, 1.5], {}, { moves: '回転・送り' });
add('G', 'ウォータージェット（はつり用）', 'waterjet', [2.5, 1.2, 1.5], {}, { moves: 'ノズル走行' });
// H 高所・点検
add('H', '高所作業車（トラック式 12m）', 'aerial', [7.0, 2.2, 3.0], {}, { moves: '旋回・起伏・伸縮' });
add('H', '高所作業車（垂直昇降式）', 'scissor', [2.5, 1.2, 2.2], {}, { moves: '昇降' });
add('H', '橋梁点検車（アーム式）', 'inspect', [12, 2.5, 3.8], {}, { moves: '屈折・旋回・作業台走行' });
add('H', '工事用エレベーター（リフト）', 'lift', [3, 1.5, 20], {}, { moves: '昇降' });
// I 交通規制・保安（一般的な色に固定）
add('I', '標識車（表示板）', 'signtruck', [4.7, 1.7, 3.5], { type: 'board' }, { moves: '表示板の起こし倒し・点滅' });
add('I', '矢印板車', 'signtruck', [4.7, 1.7, 3.5], { type: 'arrow' }, { moves: '点滅' });
add('I', '規制材運搬車', 'signtruck', [4.7, 1.7, 2.5], { type: 'cones' }, { moves: '' });
add('I', '衝撃吸収車', 'cushion', [5, 1.7, 2.5], {}, { moves: '緩衝装置の展開' });
add('I', '矢印板（単体）', 'arrowboard', [1.0, 0.6, 1.6], {}, { moves: '点滅' });
add('I', '工事看板', 'signboard', [1.4, 0.3, 2.8], { text: ['工事中', 'ご協力を'] }, { moves: '' });
add('I', 'カラーコーン', 'cone', [0.38, 0.38, 0.7], {}, { moves: '' });
add('I', 'カラーコーン＋コーンバー', 'conebar', [0.4, 2.0, 0.7], {}, { moves: '' });
add('I', 'バリケード', 'barricade', [0.6, 1.2, 0.8], {}, { moves: '' });
add('I', '仮設防護柵（ブロック）', 'block', [2.0, 0.5, 0.8], {}, { moves: '' });
add('I', '仮設信号機', 'signal', [0.5, 0.5, 3.0], {}, { moves: '灯の色が変わる' });
add('I', '保安灯（回転灯・点滅灯）', 'warnlight', [0.15, 0.15, 1.0], {}, { moves: '回転・点滅' });
add('I', '交通誘導員', 'flagger', [0.5, 0.3, 1.7], {}, { moves: '旗を振る' });
add('I', '自動旗振り機', 'flagger', [0.6, 0.6, 1.8], { auto: 1 }, { moves: '旗を振る' });
// J 橋梁の架設資材
add('J', 'ベント（仮支柱）', 'bent', [2, 2, 10], {}, { moves: 'ジャッキで上下' });
add('J', '送り出し装置', 'launcher', [2, 1, 1], {}, { moves: '桁を押し出す' });
add('J', '手延べ機', 'nose', [24, 3, 2], {}, { moves: '前進・先端のたわみ' });
add('J', '架設用台車＋軌条', 'trolley', [3, 2, 1], {}, { moves: '走行' });
add('J', '油圧ジャッキ（100〜500t）', 'jack', [0.3, 0.3, 0.3], {}, { moves: '伸縮' });
add('J', 'センターホールジャッキ（PC緊張用）', 'jack', [0.4, 0.4, 0.6], { hole: 1 }, { moves: '伸縮' });
add('J', 'サンドル（盤木）', 'sandle', [1, 1, 0.8], {}, { moves: '積み増し' });
add('J', '吊り足場（従来型）', 'hangscaffold', [5.4, 3, 2], {}, { moves: '' });
add('J', 'システム吊り足場（パネル）', 'systemhang', [1.8, 1.8, 1.6], {}, { moves: 'パネル単位で取付け' });
add('J', '朝顔（防護棚）', 'asagao', [2, 3, 1], {}, { moves: '' });
add('J', '防護ネット・養生シート', 'net', [0.02, 5, 2], {}, { moves: '' });
add('J', '覆工板', 'plate2', [2, 1, 0.2], { rib: 1 }, { moves: '' });
add('J', '敷鉄板', 'plate2', [6, 1.5, 0.022], {}, { moves: '' });
add('J', 'H形鋼', 'hbeam', [10, 0.3, 0.3], {}, { moves: '' });
add('J', '仮桟橋', 'trestle', [18, 8, 4], {}, { moves: '' });
add('J', '支保工（枠組）', 'shoring', [0.05, 1.2, 1.8], {}, { moves: '高さ調整' });
add('J', 'パイプサポート', 'shoring', [0.06, 0.06, 3], { pipe: 1 }, { moves: '高さ調整' });
add('J', '型枠（合板）', 'formwork', [0.1, 1.8, 0.9], {}, { moves: '' });
add('J', 'プレキャストPC床版', 'slab', [2.0, 10, 0.22], { loops: 1 }, { moves: '吊られて据え付け' });
add('J', 'RC床版ブロック（撤去用に切断）', 'slab', [2, 3, 0.22], { color: 0x9c9a92 }, { moves: '吊り上げ' });
add('J', '伸縮装置', 'joint', [0.4, 9, 0.2], {}, { moves: '' });
add('J', '支承（ゴム・鋼製）', 'bearing', [0.5, 0.5, 0.15], {}, { moves: '' });
add('J', '壁高欄', 'wallrail', [5, 0.3, 1.1], {}, { moves: '' });
add('J', '地覆', 'curb', [5, 0.5, 0.25], {}, { moves: '' });
// K 仮設・その他
add('K', '発電機 25〜60kVA', 'generator', [2.0, 0.9, 1.2], {}, { moves: '' });
add('K', 'エンジン式コンプレッサー', 'compressor', [3.0, 1.5, 1.5], {}, { moves: '' });
add('K', '水中ポンプ', 'subpump', [0.25, 0.25, 0.5], {}, { moves: '' });
add('K', '照明車', 'lighttruck', [4.7, 1.7, 2.4], {}, { moves: '柱の伸縮・灯具旋回' });
add('K', 'バルーン投光器', 'balloon', [1.2, 1.2, 4.9], {}, { moves: '伸縮' });
add('K', '溶接機', 'welder', [0.8, 0.5, 0.7], {}, { moves: '' });
add('K', '仮設トイレ', 'toilet', [0.9, 0.9, 2.4], {}, { moves: '扉' });
add('K', '現場事務所（ユニットハウス）', 'house', [5.4, 2.4, 2.6], {}, { moves: '扉' });
add('K', '仮囲い（鋼板）', 'fence', [3.0, 0.1, 3.0], {}, { moves: '' });
add('K', '単管足場', 'tubescaffold', [5.4, 0.9, 5.1], {}, { moves: '' });
add('K', 'くさび緊結式足場', 'tubescaffold', [5.4, 0.6, 3.4], {}, { moves: '' });
add('K', '枠組足場', 'framescaffold', [5.4, 1.2, 1.7], {}, { moves: '' });
// L 測量
add('L', 'トータルステーション', 'ts', [0.3, 0.3, 1.6], {}, { moves: '回転' });
add('L', 'GNSS受信機（ポール）', 'gnss', [0.2, 0.2, 2.0], {}, { moves: '' });
add('L', 'UAV（ドローン）', 'uav', [1, 1, 0.3], {}, { moves: '飛行' });

export const CATALOG = R;
export const byId = id => R.find(r => r.id === id);

// 既定の色・模様（当社オリジナル：白地に分類色の帯）
export function defaultLivery(item) {
  return { body: 0xf3f1ea, accent: CAT_ACCENT[item.cat] || 0x1b2a4a, pattern: 'stripe', text: 'FALCON' };
}
export function buildPart(item, livery) {
  M.setLivery(item.lock ? { body: 0xf2c200, accent: 0x111111, pattern: 'solid' } : (livery || defaultLivery(item)));
  let g;
  try { g = F[item.fam](item.p); } finally { M.setLivery(null); }
  g.userData.partId = item.id;
  return g;
}
