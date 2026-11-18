// Cadrele: doar apusul de la început (fotografii time-lapse de pe Stația Spațială, NASA Crew Earth Observations, ISS030-E-235760…235829) rămâne secvență de imagini.
// Soarele, planetele și Luna se desenează live, din hărți (globe.js); coborârea spre Tycho și ridicarea au fost scoase (PROMPT-11).
// Vizitatorul descarcă doar ce urmează să vadă, în trepte:
//   1. pornirea: primele 8 cadre din apus (ecranul de încărcare așteaptă doar după ele);
//   2. după `load`: foile cu cadre-cheie (prioritate scăzută); când pagina e liniștită, rar, restul apusului;
//   3. după prima derulare: apusul întreg.
// Între două cadre vecine se face o estompare încrucișată (trecere lină).

const conn = navigator.connection || {};
// telefon: ecran îngust, economie de date sau rețea lentă
export const SET = innerWidth < 768 || conn.saveData || /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '') ? 'm' : 'd';

// câte cadre folosim din secvență și câte are folderul (apusul: 70 de fotografii, câte una la ~3 s;
// calculator 1920 × 1080 ≈ 6,3 MB, telefon 1000 × 1500 ≈ 3,6 MB — estomparea dintre cadre le leagă)
const COUNT = {
  d: { apus: [70, 70] },
  m: { apus: [70, 70] }
};
export const SEQ = {}; const SRC = {};
for (const k in COUNT[SET]) { SEQ[k] = COUNT[SET][k][0]; SRC[k] = COUNT[SET][k][1]; }
export const DIR = { apus: 'apus' };
export const ORDER = ['apus'];
export const BASE = 'media/' + SET + '/';
const pad = (n) => String(n).padStart(3, '0');
// cadrul i din n → fișierul din folder (prima și ultima fotografie sunt mereu incluse)
const fileOf = (name, i) => (SEQ[name] > 1 ? Math.round(i * (SRC[name] - 1) / (SEQ[name] - 1)) : 0) + 1;
const url = (name, i) => BASE + DIR[name] + '/f' + pad(fileOf(name, i)) + '.webp?v=14';

const WARM = 6;      // cadre decodate păstrate permanent din fiecare secvență (împrăștiate pe toată secvența)
const MAXQ = 6;      // cel mult 6 descărcări deodată
const STRIDE = SET === 'm' ? 6 : 5;    // înainte de prima derulare: din restul apusului, doar fiecare al 6-lea / al 5-lea cadru
// stările unui cadru: 0 nedescărcat · 1 se descarcă · 2 descărcat (imaginea e în memorie) · 3 în cache-ul browserului · 4 eșuat
export const F = {};
ORDER.forEach((n) => {
  const N = SEQ[n], f = F[n] = { name: n, n: N, imgs: new Array(N).fill(null), st: new Uint8Array(N), y: new Float64Array(N).fill(Infinity), bm: new Map(), pending: new Set(), last: null, keep: 40, warm: new Set(), shown: -1 };
  for (let k = 0; k < WARM; k++) f.warm.add(Math.round(k * (N - 1) / (WARM - 1)));
});
F.apus.keep = SET === 'm' ? 20 : 16; // cadre decodate ținute în jurul poziției (1920 × 1080 are ~8 MB decodat, 1000 × 1500 ~6 MB)

let onChange = () => {}, onLoad = () => {};
export function hooks(change, load) { onChange = change; onLoad = load; }

// ---------- decodarea (img.decode() + createImageBitmap(img), fără redimensionare) ----------
export const hasBM = 'createImageBitmap' in window;
export async function bake(im) { try { await im.decode(); } catch (e) {} return await createImageBitmap(im); }

// ---------- descărcarea ----------
const active = new Map();
function start(f, i, done) {
  f.st[i] = 1;
  const im = new Image(), u = url(f.name, i), r = { f, i, im, tries: 0 };
  im.decoding = 'async';
  active.set(f.name + ':' + i, r);
  im.onload = () => {
    active.delete(f.name + ':' + i); f.st[i] = 2; f.imgs[i] = im;
    if (hasBM && f.warm.has(i) && !f.bm.has(i)) bake(im).then((b) => { f.bm.set(i, b); onChange(); }).catch(() => {});
    onLoad(f.name, i); onChange(); if (done) done(true); else later();
  };
  // o conexiune pierdută: încercăm de încă două ori, apoi renunțăm
  im.onerror = () => {
    if (r.tries++ < 2 && f.st[i] === 1) { setTimeout(() => { if (f.st[i] === 1) im.src = u + '&r=' + r.tries; }, 400 * r.tries); return; }
    active.delete(f.name + ':' + i); f.st[i] = 4; if (done) done(false); else later();
  };
  im.src = u;
}
function cancel(r) {
  r.im.onload = r.im.onerror = null; r.im.src = '';
  r.f.st[r.i] = 0; active.delete(r.f.name + ':' + r.i);
}

// pornirea: doar primele n cadre din apus (ecranul de încărcare așteaptă numai după ele)
export function boot(n, progress) {
  const f = F.apus; let next = 0, left = n, ok = 0;
  return new Promise((res) => {
    const one = () => {
      if (next >= n) return;
      start(f, next++, (good) => { ok += good ? 1 : 0; progress(n - left + 1, n, ok); if (--left === 0) res(ok); else one(); });
    };
    for (let k = 0; k < MAXQ; k++) one();
  });
}

// ---------- coada cu priorități ----------
// timeline (din app.js): pentru fiecare secvență, poziția de derulare (px) a primului și ultimului cadru; zonele opririlor;
// near: pentru fiecare secvență, zonele în care se descarcă întreagă (la o oprire de ea)
let TL = null, Y = 0, H = 800, running = false, paused = false, timer = 0;
export function setTimeline(t) {
  TL = t;
  ORDER.forEach((n) => {
    const f = F[n], w = t.seq[n];
    if (!w) { f.y.fill(Infinity); return; }
    for (let i = 0; i < f.n; i++) f.y[i] = w.y0 + (f.n > 1 ? i / (f.n - 1) : 0) * (w.y1 - w.y0);
  });
  (t.extra || []).forEach((e) => { F[e.n].y[e.i] = e.y; });
  later();
}
const zoneAt = (y) => { const Z = TL.zones; let c = 0; for (let k = 0; k < Z.length; k++) if (y >= Z[k].y0) c = k; return c; };
export const zoneNow = () => (TL ? zoneAt(Y) : 0);
export function run() { running = true; later(); }
// treptele: `idle` = după load și după ce pagina e liniștită; `moved` = după prima derulare a vizitatorului
let idle = false, moved = false;
const moveFns = [];
export const onFirstMove = (fn) => { if (moved) fn(); else moveFns.push(fn); };
const whenIdle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1200));
const onLoaded = () => { loadSheets(); whenIdle(() => { idle = true; later(); }); };
if (document.readyState === 'complete') onLoaded(); else addEventListener('load', onLoaded, { once: true });
function firstMove() {
  if (moved) return; moved = true; later();
  ['wheel', 'touchmove', 'keydown', 'scroll'].forEach((t) => removeEventListener(t, onMove));
  moveFns.splice(0).forEach((fn) => fn());
}
const onMove = (e) => { if (e.type !== 'scroll' || scrollY > 2) firstMove(); };
['wheel', 'touchmove', 'keydown', 'scroll'].forEach((t) => addEventListener(t, onMove, { passive: true }));
export const started = () => moved;
export function plan(y, h) { Y = y; H = h; later(); }
function later() { if (!timer) timer = setTimeout(planNow, 50); }
function planNow() {
  timer = 0;
  if (!TL || !running || paused) return;
  if (!moved) { // înainte de prima derulare: nimic din călătorie; din apus, rar, după ce pagina e liniștită
    if (!idle || active.size >= MAXQ) return;
    const f = F.apus;
    for (let i = 0; i < f.n && active.size < MAXQ; i++) if (i % STRIDE === 0 && (f.st[i] === 0 || f.st[i] === 3)) start(f, i);
    return;
  }
  const c = zoneAt(Y);
  const whole = (n) => { const z = TL.near[n]; return z && c >= z[0] && c <= z[1]; };
  // cererile pentru secvențe care nu mai sunt aproape se anulează
  for (const r of [...active.values()]) if (!whole(r.f.name) && Math.abs(r.f.y[r.i] - Y) > 2 * H) cancel(r);
  // imaginile descărcate și îndepărtate rămân doar în cache-ul browserului (nu le ținem în memorie)
  for (const n of ORDER) {
    const f = F[n];
    for (let i = 0; i < f.n; i++) if (f.st[i] === 2 && !f.bm.has(i) && !f.pending.has(i) && (f.y[i] < Y - 6 * H || f.y[i] > Y + 12 * H)) { f.imgs[i] = null; f.st[i] = 3; }
  }
  if (active.size >= MAXQ) return;
  const cand = [];
  for (const n of ORDER) {
    const f = F[n], all = whole(n);
    for (let i = 0; i < f.n; i++) {
      const s = f.st[i]; if (s === 1 || s === 2 || s === 4) continue;
      const yy = f.y[i]; if (yy === Infinity) continue;
      if (!all && Math.abs(yy - Y) > 1.5 * H) continue;   // în afara zonei: doar ce e chiar lângă poziție (un salt)
      cand.push([yy >= Y ? yy - Y : (Y - yy) * 1.5, f, i]);   // în ordinea distanței față de poziția curentă
    }
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, f, i] of cand) { if (active.size >= MAXQ) break; start(f, i); }
}
// ---------- foile cu cadre-cheie: 12 cadre mici pe secvență (se folosesc doar dacă nu trebuie mărite peste 1,5×) ----------
const NK = 12;
let sheetsAsked = false;
function loadSheets() { // în ordinea drumului, una câte una, cu prioritate scăzută
  if (sheetsAsked) return; sheetsAsked = true;
  const list = ORDER.slice();
  const next = () => {
    const n = list.shift(); if (!n) return;
    const im = new Image(); im.decoding = 'async'; im.fetchPriority = 'low';
    im.onload = () => { F[n].sheet = { im, cells: null, busy: false }; whenIdle(() => slice(F[n])); next(); };
    im.onerror = () => next();
    im.src = 'media/foi/' + n + (SET === 'm' ? '-m' : '') + '.webp?v=2'; // pe telefon foaia are decupajul de telefon (2:3)
  };
  next();
}
function slice(f) { // celulele foii, ca imagini separate (doar decupare, fără redimensionare)
  const s = f.sheet; if (!s || s.cells || s.busy || !hasBM) return;
  s.busy = true;
  const w = s.im.naturalWidth / NK, h = s.im.naturalHeight;
  s.im.decode().catch(() => {}).then(() => createImageBitmap(s.im))
    .then((whole) => Promise.all(Array.from({ length: NK }, (_, k) => createImageBitmap(whole, k * w, 0, w, h))).then((c) => { whole.close && whole.close(); return c; }))
    .then((c) => { s.cells = c; s.busy = false; onChange(); }).catch(() => { s.busy = false; });
}
function cell(f, p) { const s = f.sheet; if (!s) return null; if (!s.cells) { slice(f); return null; } return s.cells[Math.round(Math.min(1, Math.max(0, p)) * (NK - 1))]; }

// pagina ascunsă: coada se oprește
document.addEventListener('visibilitychange', () => { paused = document.hidden; if (!paused) later(); });

// ---------- fereastra de cadre decodate (6 permanente + ±40 în jurul poziției) ----------
export function ensure(f, idx) {
  if (!hasBM) return;
  const dir = idx >= (f.last == null ? idx : f.last) ? 1 : -1; f.last = idx;
  let budget = 4 - f.pending.size;
  const order = [];
  for (let d = 0; d <= Math.min(36, f.keep - 4); d++) order.push(idx + dir * d);
  for (let d = 1; d <= 8; d++) order.push(idx - dir * d);
  for (const i of order) {
    if (budget <= 0) break;
    if (i < 0 || i >= f.n) continue;
    const im = f.imgs[i];
    if (f.bm.has(i) || f.pending.has(i) || !im || !im.complete || !im.naturalWidth) continue;
    f.pending.add(i); budget--;
    bake(im).then((b) => { f.pending.delete(i); f.bm.set(i, b); onChange(); }).catch(() => f.pending.delete(i));
  }
  // cadrul afișat ultima dată nu se eliberează (se ține până vine unul real mai aproape)
  for (const [i, b] of f.bm) if (Math.abs(i - idx) > f.keep && !f.warm.has(i) && i !== f.shown) { b.close && b.close(); f.bm.delete(i); }
}
export function sleep(f) {
  for (const [i, b] of f.bm) if (!f.warm.has(i)) { b.close && b.close(); f.bm.delete(i); } f.last = null; f.shown = -1;
}
/** Ce desenăm la poziția p (0..1): { a, b, k } = cadrul a, peste el cadrul b cu opacitatea k (estompare încrucișată).
 *  maxW = lățimea (px) la care va fi desenat cadrul: o celulă din foaia cu cadre-cheie se folosește doar dacă nu
 *  trebuie mărită peste 1,5×; altfel se ține ultimul cadru real afișat. null = nimic încă. */
export function pick(f, p, maxW) {
  const n = f.n; if (!n) return null;
  const x = Math.min(1, Math.max(0, p)) * (n - 1), i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), k = x - i0;
  ensure(f, k < 0.5 ? i0 : i1);
  const b0 = f.bm.get(i0), b1 = f.bm.get(i1);
  if (b0 && b1 && i1 !== i0 && k > 0.004) { f.shown = k < 0.5 ? i0 : i1; return { a: b0, b: b1, k }; }
  if (b0 || b1) { f.shown = b0 ? i0 : i1; return { a: b0 || b1, b: null, k: 0 }; }
  // cel mai apropiat cadru decodat, dacă e chiar lângă poziție
  let best = null, bd = 1e9, bi = -1;
  for (const [j, v] of f.bm) { const d = Math.abs(j - x); if (d < bd) { bd = d; best = v; bi = j; } }
  if (best && bd <= 2.5) { f.shown = bi; return { a: best, b: null, k: 0 }; }
  const c = cell(f, p);
  if (c && (!maxW || c.width * 1.5 >= maxW)) return { a: c, b: null, k: 0 };
  // ultimul cadru real afișat (nu o foaie mărită)
  if (f.shown >= 0 && f.bm.has(f.shown)) return { a: f.bm.get(f.shown), b: null, k: 0 };
  if (best) { f.shown = bi; return { a: best, b: null, k: 0 }; }
  return null;
}
export function frameAt(f, p, maxW) { const r = pick(f, p, maxW); return r ? r.a : null; }
export const dims = (x) => [x.naturalWidth || x.width, x.naturalHeight || x.height];
export function stats() { const s = {}; ORDER.forEach((n) => { const f = F[n]; s[n] = { loaded: [...f.st].filter((v) => v === 2 || v === 3).length, n: f.n, bm: f.bm.size, foaie: f.sheet ? (f.sheet.cells ? 'celule' : 'da') : '-' }; }); return { set: SET, active: active.size, idle, moved, seq: s }; }
