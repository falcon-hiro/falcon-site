// 空中写真から建物の箱を推定する（ブラウザの中だけで動く）— 株式会社ファルコン
//  ・すでに読み込んである地面の写真（地理院タイル 全国最新写真・ズーム18）を、この端末の中で解析する。追加のタイルは読まない。結果はどこにも送らない
//  ・出来上がりは推定の簡略な箱（位置・形・高さは目安）。計測・設計には使えない。国土地理院が作成したものではない
//  ・推論の部品：ONNX Runtime Web © Microsoft Corporation（MIT License https://github.com/microsoft/onnxruntime/blob/main/LICENSE ）を配布元（jsDelivr）から読む
//  ・学習と統計に、3D都市モデル（Project PLATEAU）仙台市のデータと、地理院タイル（全国最新写真）を利用
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const MODEL = new URL('../model/tatemono_q8.onnx', import.meta.url).href;
const T = 512, STEP = 448;                                  // 窓の大きさと、ずらす幅（64画素ずつ重ねて平均する）
let _job = null, _backend = '';

// 自動で使ってよい端末か（指で操作する端末＝スマートフォンなどは、利用者が選んだときだけ動かす）
export function canAuto() { return !(window.matchMedia && matchMedia('(pointer: coarse)').matches); }

async function session(say) {
  if (!_job) _job = (async () => {
    say('建物を推定する部品を読み込んでいます…（初回だけ・約10MB）');
    const r = await fetch(MODEL); if (!r.ok) throw new Error('推定の部品を読めません（' + r.status + '）');
    const bytes = new Uint8Array(await r.arrayBuffer());     // いったん全部を受け取ってから渡す（配信側の圧縮の影響を受けない）
    const mk = async gpu => {
      const ort = await import(ORT + (gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'));
      ort.env.wasm.wasmPaths = ORT; ort.env.wasm.numThreads = 1;
      const s = await ort.InferenceSession.create(bytes, { executionProviders: [gpu ? 'webgpu' : 'wasm'] });
      _backend = gpu ? 'webgpu' : 'wasm'; return { ort, s };
    };
    if (navigator.gpu) { try { return await mk(true); } catch (e) { /* GPU で動かせない → CPU で試す */ } }
    return mk(false);
  })().catch(e => { _job = null; throw e; });
  return _job;
}
const starts = n => { const a = []; for (let v = 0; v + T < n; v += STEP) a.push(v); a.push(Math.max(0, n - T)); return a; };

// opt＝{ canvas（地面の写真）, mpp（1画素の m）, cx, cy（選んだ場所の画素位置）, radius（m）, onProgress }
// 返り値＝{ buildings: [{ poly: [[東, 南]…]（m）, h（m）, area（㎡） }], backend, ms }
export async function photoBuildings(opt) {
  const say = opt.onProgress || (() => {}); const t0 = performance.now();
  const { canvas, mpp, radius } = opt;
  const R = Math.ceil(radius / mpp) + 16;
  const X0 = Math.max(0, Math.floor(opt.cx - R)), Y0 = Math.max(0, Math.floor(opt.cy - R));
  const cw = Math.min(canvas.width, Math.ceil(opt.cx + R)) - X0, ch = Math.min(canvas.height, Math.ceil(opt.cy + R)) - Y0;
  if (cw < T || ch < T) throw new Error('写真の範囲が足りません');
  const { ort, s } = await session(say);
  const rgba = canvas.getContext('2d').getImageData(X0, Y0, cw, ch).data;
  const N = cw * ch, p1 = new Float32Array(N), hh = new Float32Array(N), cnt = new Uint8Array(N);
  const xs = starts(cw), ys = starts(ch), buf = new Float32Array(3 * T * T), TT = T * T; let k = 0;
  for (const wy of ys) for (const wx of xs) {
    say(`空中写真から建物を推定しています… ${++k}/${xs.length * ys.length}${_backend === 'wasm' ? '（この端末では時間がかかります）' : ''}`);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = ((wy + y) * cw + wx + x) * 4, j = y * T + x; buf[j] = rgba[i]; buf[TT + j] = rgba[i + 1]; buf[2 * TT + j] = rgba[i + 2]; }
    const out = await s.run({ photo: new ort.Tensor('float32', buf, [1, 3, T, T]) });
    const o = out.out.data;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const j = y * T + x, q = (wy + y) * cw + wx + x;
      const a = o[j], b = o[TT + j], c = o[2 * TT + j], m = Math.max(a, b, c), ea = Math.exp(a - m), eb = Math.exp(b - m), ec = Math.exp(c - m);
      p1[q] += eb / (ea + eb + ec); hh[q] += Math.min(200, Math.max(0, Math.expm1(o[3 * TT + j]))); cnt[q]++;
    }
    await new Promise(r => setTimeout(r, 0));               // 画面が固まらないよう、1窓ごとに一息入れる
  }
  say('建物の形を整えています…');
  const core = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const c = cnt[i] || 1; hh[i] /= c; core[i] = p1[i] / c > 0.5 ? 1 : 0; }
  const boxes = hako(open3(core, cw, ch), hh, cw, ch, mpp);
  const res = [];
  for (const b of boxes) {
    let ce = 0, cs = 0; const poly = b.poly.map(p => { const e = (X0 + p[0] - opt.cx) * mpp, s2 = (Y0 + p[1] - opt.cy) * mpp; ce += e; cs += s2; return [Math.round(e * 100) / 100, Math.round(s2 * 100) / 100]; });
    ce /= poly.length; cs /= poly.length;
    if (ce * ce + cs * cs > radius * radius) continue;
    res.push({ poly, h: b.h, area: b.area });
  }
  return { buildings: res, backend: _backend, ms: Math.round(performance.now() - t0), windows: xs.length * ys.length };
}

// ───── 形を整える（建物のかたまりごとに輪郭を取り、ほぼ四角なら四角に、そうでなければ角を減らした多角形にする）─────
function erode3(src, w, h, dil) {
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dil ? 0 : 1;
    for (let dy = -1; dy <= 1 && v === (dil ? 0 : 1); dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; if (dil ? src[yy * w + xx] : !src[yy * w + xx]) { v = dil ? 1 : 0; break; } } }
    dst[y * w + x] = v;
  }
  return dst;
}
const open3 = (m, w, h) => erode3(erode3(m, w, h, false), w, h, true);

function hako(core, hh, w, h, mpp, minArea = 20) {
  const N = w * h, lab = new Int32Array(N), queue = new Int32Array(N), out = []; let id = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!core[s0] || lab[s0]) continue;
    id++; let head = 0, tail = 0; queue[tail++] = s0; lab[s0] = id;
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (head < tail) {                                    // 上下左右につながる画素を1つのかたまりにする
      const p = queue[head++], x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && core[p - 1] && !lab[p - 1]) { lab[p - 1] = id; queue[tail++] = p - 1; }
      if (x < w - 1 && core[p + 1] && !lab[p + 1]) { lab[p + 1] = id; queue[tail++] = p + 1; }
      if (y > 0 && core[p - w] && !lab[p - w]) { lab[p - w] = id; queue[tail++] = p - w; }
      if (y < h - 1 && core[p + w] && !lab[p + w]) { lab[p + w] = id; queue[tail++] = p + w; }
    }
    if (tail * mpp * mpp < minArea * 0.5) continue;
    const bw = x1 - x0 + 9, bh = y1 - y0 + 9; let m = new Uint8Array(bw * bh);
    const hs = new Float32Array(tail);
    for (let i = 0; i < tail; i++) { const p = queue[i], x = p % w, y = (p - x) / w; m[(y - y0 + 4) * bw + (x - x0 + 4)] = 1; hs[i] = hh[p]; }
    m = erode3(erode3(m, bw, bh, true), bw, bh, true);        // 縁の分（内側へ2画素）を戻す
    const c = contour(m, bw, bh); if (c.length < 3) continue;
    const areaPx = Math.abs(shoelace(c)); if (areaPx * mpp * mpp < minArea) continue;
    const rect = minRect(hull(c));
    let poly = rect && areaPx / rect.area > 0.8 ? rect.pts : simplify(c, Math.max(1.5, 0.02 * perimeter(c)));   // ほぼ四角なら、四角にそろえる
    if (poly.length < 3) continue;
    poly = poly.map(p => [p[0] + x0 - 4, p[1] + y0 - 4]);
    const area = Math.abs(shoelace(poly)) * mpp * mpp; if (area < minArea) continue;
    hs.sort(); const med = hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2;
    out.push({ poly, area: Math.round(area * 10) / 10, h: Math.round(Math.min(150, Math.max(2.5, med)) * 10) / 10 });
  }
  return out;
}
const shoelace = p => { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
const perimeter = p => { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += Math.hypot(q[0] - p[i][0], q[1] - p[i][1]); } return a; };
// 外側の輪郭をたどる（画素の中心を順に並べる）
function contour(m, w, h) {
  let s = -1; for (let i = 0; i < m.length; i++) if (m[i]) { s = i; break; }
  if (s < 0) return [];
  const D = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // 西から時計回り
  const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  const sx = s % w, sy = (s - sx) / w, pts = []; let x = sx, y = sy, b = 0, k0 = -1;
  for (let guard = 0; guard < 8 * w * h; guard++) {
    let k = -1; for (let i = 1; i <= 8; i++) { const j = (b + i) % 8; if (fg(x + D[j][0], y + D[j][1])) { k = j; break; } }
    if (k < 0) { pts.push([x, y]); break; }                   // 1画素だけ
    if (x === sx && y === sy) { if (k0 < 0) k0 = k; else if (k === k0) break; }
    pts.push([x, y]); x += D[k][0]; y += D[k][1]; b = (k + (k % 2 ? 5 : 6)) % 8;
  }
  return pts;
}
function hull(p) {
  const a = p.slice().sort((u, v) => u[0] - v[0] || u[1] - v[1]); if (a.length < 3) return a;
  const cr = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]), lo = [], up = [];
  for (const q of a) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = a.length - 1; i >= 0; i--) { const q = a[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
// いちばん小さく囲む長方形
function minRect(hp) {
  if (hp.length < 3) return null; let best = null;
  for (let i = 0; i < hp.length; i++) {
    const p = hp[i], q = hp[(i + 1) % hp.length]; let ux = q[0] - p[0], uy = q[1] - p[1]; const L = Math.hypot(ux, uy); if (!L) continue; ux /= L; uy /= L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const r of hp) { const a = r[0] * ux + r[1] * uy, b = -r[0] * uy + r[1] * ux; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, pts: [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => [a * ux - b * uy, a * uy + b * ux]) };
  }
  return best && best.area > 0 ? best : null;
}
// 輪郭の角を減らす（許す外れ eps 画素）
function simplify(c, eps) {
  const n = c.length; let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(c[i][0] - c[0][0], c[i][1] - c[0][1]); if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n + 1); keep[0] = keep[far] = 1; const at = i => c[i % n];
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [i0, i1] = stack.pop(); if (i1 - i0 < 2) continue;
    const a = at(i0), b = at(i1), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); let mi = -1, md = eps;
    for (let i = i0 + 1; i < i1; i++) { const p = at(i), d = L ? Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L : Math.hypot(p[0] - a[0], p[1] - a[1]); if (d > md) { md = d; mi = i; } }
    if (mi >= 0) { keep[mi] = 1; stack.push([i0, mi], [mi, i1]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(c[i]); return out;
}
