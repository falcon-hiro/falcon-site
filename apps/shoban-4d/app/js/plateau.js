// 国土交通省 Project PLATEAU の3D都市モデル（建築物モデル）を、選んだ場所の周りだけ読み込む
//  ・読み方：データカタログ（市区町村→建築物の 3D Tiles の場所）→ tileset.json をたどる → その場所にかかる葉のタイル（b3dm）だけ読む
//  ・座標：タイルは地心直交座標（地球の中心が原点）。選んだ場所を原点にした「東・上・南」（m）へ直す
//  ・高さ：タイルは楕円体高（標高＋ジオイド高）。国土地理院の標高の地形に合うよう、建物の足元と地形の差の中央値を引く
//  ・使うのは形だけ（テクスチャ＝写真と、建物ごとの属性は使わない・保存しない）。出典の表示が必要（PLATEAU・公共データ利用規約 第1.0版）
//  ・配信は試験運用。読めないときは null を返し、呼ぶ側が OpenStreetMap の建物に戻す。自動で再試行しない
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const API = 'https://api.plateauview.mlit.go.jp/datacatalog';
const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';
const A = 6378137.0, F = 1 / 298.257222101, E2 = F * (2 - F);   // GRS80
const D2R = Math.PI / 180;
const MAX_TILES = 16, MAX_MB = 80;                               // 読みすぎない歯止め

let _loader = null;
function loader() {
  if (_loader) return _loader;
  const d = new DRACOLoader(); d.setDecoderPath(DRACO_PATH);
  _loader = new GLTFLoader(); _loader.setDRACOLoader(d);
  return _loader;
}
const ecef = (lat, lon, h) => { const sp = Math.sin(lat), cp = Math.cos(lat), n = A / Math.sqrt(1 - E2 * sp * sp); return [(n + h) * cp * Math.cos(lon), (n + h) * cp * Math.sin(lon), (n * (1 - E2) + h) * sp]; };
async function getJSON(url, opt) { const r = await fetch(url, opt); if (!r.ok) throw new Error('応答 ' + r.status); return r.json(); }
const _ts = new Map(), _sets = new Map();
// 建物データを読む先は、PLATEAU の配信サーバー1か所だけに限る（ほかの場所を指すデータは使わない＝説明に書いた通信先と実際をそろえる）
const DATA_HOST = 'assets.cms.plateau.reearth.io';
const okHost = url => { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === DATA_HOST; } catch (e) { return false; } };
const getTileset = url => { if (!okHost(url)) return Promise.reject(new Error('想定外の配信先')); if (!_ts.has(url)) _ts.set(url, getJSON(url)); return _ts.get(url); };

// 緯度経度 → 市区町村 → 建築物モデルの 3D Tiles（区ごとに分かれていることがある）
async function findTilesets(lat, lon, wantLod) {
  const r0 = await fetch(`${API}/citygml/r:${lon},${lat}`);
  if (r0.status === 404) return null;                             // この場所は PLATEAU の整備範囲の外
  if (!r0.ok) throw new Error('応答 ' + r0.status);
  const c = await r0.json();
  const city = (c.cities || [])[0]; if (!city || !city.cityCode) return null;
  const q = `{ datasets(input:{areaCodes:["${city.cityCode}"], includeTypes:["bldg"]}){ id name year ... on PlateauDataset { items{ name url format lod texture } } } }`;
  const key = city.cityCode + '|' + wantLod;
  if (_sets.has(key)) return _sets.get(key);
  const g = await getJSON(`${API}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const out = [];
  for (const ds of (g.data && g.data.datasets) || []) {
    const items = (ds.items || []).filter(i => i.format === 'CESIUM3DTILES' && i.url && okHost(i.url));
    if (!items.length) continue;
    // 軽い順：指定のLOD → テクスチャなし を優先
    const score = i => (i.lod === wantLod ? 0 : 10 + Math.abs(i.lod - wantLod)) + (i.texture === 'NONE' ? 0 : 1);
    const it = items.sort((a, b) => score(a) - score(b))[0];
    out.push({ url: it.url, lod: it.lod, texture: it.texture, name: ds.name, year: ds.year });
  }
  const res = { cityName: city.cityName || city.name || '', cityCode: city.cityCode, sets: out };
  _sets.set(key, res); return res;
}

// タイルの範囲（region＝西・南・東・北〔ラジアン〕・高さ）と、選んだ場所の円が重なるか
function hits(bv, lat, lon, rad) {
  if (!bv || !bv.region) return true;                            // region 以外は判定できないので読む側に倒す
  const [w, s, e, n] = bv.region; const dLat = rad / A, dLon = dLat / Math.cos(lat);
  return lon + dLon >= w && lon - dLon <= e && lat + dLat >= s && lat - dLat <= n;
}
async function collectLeaves(tilesetUrl, lat, lon, rad, leaves, depth = 0) {
  const ts = await getTileset(tilesetUrl);
  const base = tilesetUrl.slice(0, tilesetUrl.lastIndexOf('/') + 1);
  if (!hits(ts.root.boundingVolume, lat, lon, rad)) return;
  const walk = async t => {
    if (!hits(t.boundingVolume, lat, lon, rad)) return;
    const kids = (t.children || []).filter(k => hits(k.boundingVolume, lat, lon, rad));
    const uri = t.content && (t.content.uri || t.content.url);
    if (uri && /\.json(\?|$)/.test(uri)) { if (depth < 3) await collectLeaves(new URL(uri, base).href, lat, lon, rad, leaves, depth + 1); return; }
    if (kids.length) { for (const k of kids) await walk(k); return; }
    if ((t.children || []).length) return;                       // 子はあるが、この場所にかかる子がない＝この場所には建物がない
    if (uri) leaves.push(new URL(uri, base).href);
  };
  await walk(ts.root);
}

// b3dm（頭28バイト＋表＋glb）から glb を取り出す
function glbOf(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic === 'glTF') return buf;
  if (magic !== 'b3dm') throw new Error('知らない形式 ' + magic);
  const off = 28 + dv.getUint32(12, true) + dv.getUint32(16, true) + dv.getUint32(20, true) + dv.getUint32(24, true);
  return buf.slice(off);
}

/** 選んだ場所の周りの建物を読む。
 *  opt = { lat, lon（度）, radius（m）, lod（1か2）, elevAt(e, s)→標高〔m〕か null, onProgress(文字) }
 *  返り値 = { geometry（位置＝東, 標高相当, 南〔m〕・頂点色つき）, count（棟）, city, year, lod, geoid（引いた高さ m）, tiles, mb } または null（PLATEAUなし） */
export async function plateauBuildings(opt) {
  const lat = opt.lat * D2R, lon = opt.lon * D2R, R = opt.radius, say = opt.onProgress || (() => {});
  const found = await findTilesets(opt.lat, opt.lon, opt.lod || 1);
  if (!found || !found.sets.length) return null;
  const leaves = []; let used = null;
  for (const s of found.sets) {
    const n0 = leaves.length;
    try { await collectLeaves(s.url, lat, lon, R, leaves); } catch (e) { continue; }
    if (leaves.length > n0 && !used) used = s;
  }
  if (!leaves.length) return null;
  if (leaves.length > MAX_TILES) leaves.length = MAX_TILES;
  // 原点（選んだ場所・楕円体の面）と、東・北・上の向き
  const O = ecef(lat, lon, 0), sp = Math.sin(lat), cp = Math.cos(lat), sl = Math.sin(lon), cl = Math.cos(lon);
  const pos = [], col = [], bld = [];                             // bld＝建物ごとの {e, s, minU, i0, i1}
  let bytes = 0, k = 0;
  const v = new THREE.Vector3();
  const palette = [[0.85, 0.83, 0.79], [0.79, 0.77, 0.73], [0.89, 0.88, 0.85], [0.75, 0.77, 0.80], [0.82, 0.76, 0.68], [0.72, 0.72, 0.70]];
  for (const url of leaves) {
    say(`PLATEAUの建物を読み込み中… ${++k}/${leaves.length}`);
    if (!okHost(url)) continue;
    const r = await fetch(url); if (!r.ok) continue;
    const buf = await r.arrayBuffer(); bytes += buf.byteLength;
    const gltf = await loader().parseAsync(glbOf(buf), '');
    const rtc = (((gltf.parser.json.extensions || {}).CESIUM_RTC) || {}).center || [0, 0, 0];
    const dx0 = rtc[0] - O[0], dy0 = rtc[1] - O[1], dz0 = rtc[2] - O[2];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(m => {
      if (!m.isMesh) return;
      const g = m.geometry, pa = g.attributes.position, ba = g.attributes._batchid, idx = g.index;
      const nTri = (idx ? idx.count : pa.count) / 3;
      // 頂点を「東・上・南」へ（glTF は上がY → 上がZ へ回してから、地心直交座標 → 東北上）
      const E = new Float32Array(pa.count), U = new Float32Array(pa.count), S = new Float32Array(pa.count);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
        const dx = v.x + dx0, dy = -v.z + dy0, dz = v.y + dz0;
        E[i] = -sl * dx + cl * dy;
        const n = -sp * cl * dx - sp * sl * dy + cp * dz;
        U[i] = cp * cl * dx + cp * sl * dy + sp * dz;
        S[i] = -n;
      }
      // 建物ごと（_BATCHID）にまとめる。番号がないデータは 15m の升目をひとまとまりにする
      const groups = new Map();
      for (let t = 0; t < nTri; t++) {
        const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        const key = ba ? ba.getX(a) : Math.floor(E[a] / 15) + ',' + Math.floor(S[a] / 15);
        let gr = groups.get(key); if (!gr) { gr = { tri: [], se: 0, ss: 0, n: 0, minU: Infinity, maxU: -Infinity, pa: 0 }; groups.set(key, gr); }
        gr.tri.push(a, b, c);
        gr.pa += Math.abs((E[b] - E[a]) * (S[c] - S[a]) - (E[c] - E[a]) * (S[b] - S[a])) / 2;
        for (const q of [a, b, c]) { gr.se += E[q]; gr.ss += S[q]; gr.n++; if (U[q] < gr.minU) gr.minU = U[q]; if (U[q] > gr.maxU) gr.maxU = U[q]; }
      }
      for (const gr of groups.values()) {
        const ce = gr.se / gr.n, cs = gr.ss / gr.n;
        if (ce * ce + cs * cs > R * R) continue;                  // 円の外の建物は使わない
        const c = palette[bld.length % palette.length], i0 = pos.length / 3;
        for (const q of gr.tri) { pos.push(E[q], U[q], S[q]); col.push(c[0], c[1], c[2]); }
        bld.push({ e: ce, s: cs, minU: gr.minU, h: gr.maxU - gr.minU, area: gr.pa / 2, i0, i1: pos.length / 3 });
      }
      g.dispose(); if (m.material && m.material.map) m.material.map.dispose();
    });
    if (bytes > MAX_MB * 1e6) break;
  }
  if (!bld.length) return null;
  // 高さ合わせ：建物の足元（楕円体高）− その場所の地形の標高 ＝ ジオイド高のはず。中央値を1つ引く
  if (opt.skipDatum) return { positions: new Float32Array(pos), buildings: bld.map(b => ({ e: b.e, s: b.s, h: b.h, area: b.area, i0: b.i0, i1: b.i1 })), city: found.cityName, cityCode: found.cityCode, year: used ? used.year : null, lod: used ? used.lod : null, tiles: k, mb: bytes / 1e6 };
  const diffs = [];
  if (opt.elevAt) for (const b of bld) { const z = opt.elevAt(b.e, b.s); if (z !== null && Number.isFinite(z)) diffs.push(b.minU - z); }
  diffs.sort((a, b) => a - b);
  if (diffs.length < 10) throw new Error('高さを合わせる建物が足りません（' + diffs.length + '棟）');   // 少ないと中央値が安定しない（技術B 2026-11-25）
  const geoid = diffs[Math.floor(diffs.length / 2)];
  const spread = diffs[Math.floor(diffs.length * 0.75)] - diffs[Math.floor(diffs.length * 0.25)];
  if (geoid < 15 || geoid > 55) throw new Error(`高さの差が想定外（${geoid.toFixed(1)}m）`);   // 日本のジオイド高はおよそ20〜45m
  for (let i = 1; i < pos.length; i += 3) pos[i] -= geoid;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  return { geometry, count: bld.length, city: found.cityName, cityCode: found.cityCode, year: used ? used.year : null, lod: used ? used.lod : null, texture: used ? used.texture : null,
    geoid, spread, samples: diffs.length, tiles: k, mb: bytes / 1e6, hosts: ['api.plateauview.mlit.go.jp', 'assets.cms.plateau.reearth.io'] };
}
