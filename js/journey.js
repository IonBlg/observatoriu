// Călătoria: scena 3D (STOPS), camera, regulile trecerii și desenarea (Soare, planete, inele, asteroizi, stele, Luna).
// Copiată din previzualizare (V10), doar împărțită pe fișiere.
import { dims } from './frames.js?v=2026111803';

export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- math ----------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const ease = (t) => t * t * (3 - 2 * t);
export const easeIn = (t) => t * t;
export const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------- canvases ----------
export const DPR = () => Math.min(devicePixelRatio || 1, innerWidth >= 1024 ? 2 : 1.5); // ecrane mari (Retina): planetele desenate la rezoluția reală, nu mărite
export function fit(cv) { const w = Math.round(cv.clientWidth * DPR()), h = Math.round(cv.clientHeight * DPR()); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return [w, h]; }
// fx: punctul (0..1 din lățimea imaginii) ținut în mijloc când ecranul e mai îngust decât imaginea (apusul: Soarele)
export function cover(c, im, w, h, scale, alpha, fx) {
  if (!im || alpha <= 0) return;
  const [iw, ih] = dims(im), sc = Math.max(w / iw, h / ih) * scale;
  const x = fx == null ? (w - iw * sc) / 2 : clamp(w / 2 - fx * iw * sc, w - iw * sc, 0);
  c.globalAlpha = alpha; c.drawImage(im, x, (h - ih * sc) / 2, iw * sc, ih * sc); c.globalAlpha = 1;
}
export function globe(c, im, cx, cy, size, rad, alpha) {
  if (!im || alpha <= 0 || size < 2) return;
  c.save(); c.globalAlpha = alpha;
  c.beginPath(); c.arc(cx, cy, size * rad, 0, Math.PI * 2); c.clip();
  c.drawImage(im, cx - size / 2, cy - size / 2, size, size);
  c.restore();
}
// stars: deterministic from scroll position, streak while travelling fast
export const STARS = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 520; i++) STARS.push({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd(), b: 0.35 + rnd() * 0.65 });
export let lastCz = null, vel = 0;
export function stars(c, w, h, cz, alpha, ox, oy) {
  if (alpha <= 0) return;
  ox = ox || 0; oy = oy || 0;
  const WW = w + 80, HH = h + 80, wrap = (v, M) => ((v + 40) % M + M) % M - 40;
  const D = cz * 0.09;
  if (lastCz != null) vel = vel * 0.8 + Math.abs(cz - lastCz) * 0.2; lastCz = cz;
  const len = clamp((vel - 0.08) * 0.05, 0, 0.09); // streaks only while flying fast
  const cx = w / 2, cy = h / 2, f = Math.max(w, h) * 0.5;
  c.save(); c.globalAlpha = alpha; c.strokeStyle = '#FFF1DD'; c.fillStyle = '#FFF1DD'; c.lineCap = 'round';
  for (const s of STARS) {
    let z = s.z - (D % 1); if (z <= 0.02) z += 1;
    const x0 = cx + s.x / z * f * 0.35, y0 = cy + s.y / z * f * 0.35, x = wrap(x0 + ox, WW), y = wrap(y0 + oy, HH);
    if (x0 < -40 || x0 >= w + 40 || y0 < -40 || y0 >= h + 40 || x < -20 || x > w + 20 || y < -20 || y > h + 20) continue; // aceleași stele ca fără rotire, deplasate ciclic
    const sz = (1 - z) * 1.8 + 0.4;
    c.globalAlpha = alpha * s.b * Math.min(1, (1 - z) * 1.6 + 0.2);
    if (len > 0.004) {
      const z2 = z + len, x2 = x + cx + s.x / z2 * f * 0.35 - x0, y2 = y + cy + s.y / z2 * f * 0.35 - y0;
      c.lineWidth = sz; c.beginPath(); c.moveTo(x2, y2); c.lineTo(x, y); c.stroke();
    } else c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  c.restore();
}

// ---------- scena 3D: opririle, de la Soare spre exterior (unități: diametre de Pământ; contează doar raporturile) ----------
// D = diametrul real · au = distanța medie față de Soare (contor și texte) · x, y = cât de mult în lateral stă planeta
// (partea, stânga/dreapta, alternează singură în ordinea opririlor active; panourile se pun singure în partea opusă)
// weight = câtă derulare primește oprirea (× 100vh) · fr = raza discului în dreptunghiul globului (fracție din latură, ca în fostele cadre)
// O planetă nouă: pui off: false, harta și parametrii ei în globe.js (BODIES) și panourile cu data-stop="<key>" data-at. Camera nu se rescrie.
export const STOPS = [
// PROMPT-11: Luna e o oprire ca celelalte (fără coborârea spre Tycho); cele 4,6 ecrane pe care le avea în plus s-au împărțit
// proporțional între celelalte opriri (× 1,146), deci lungimea drumului și ceasul (21:00 → 02:00) rămân aceleași.
  { key: 'soare',   name: 'Soarele', dot: '#FFD9A0', D: 109.2, au: 0,     x: 0,   y: 0,    weight: 3.44, music: 'soare' },
  { key: 'mercur',  name: 'Mercur',  dot: '#CFCAC4', D: 0.383, au: 0.387, x: 1.0, y: 0.12, weight: 3.78, music: 'mercur', fr: 0.45 },
  { key: 'venus',   name: 'Venus',   dot: '#EAD9B0', D: 0.949, au: 0.723, x: 1.4, y: 0.12, weight: 3.44, music: 'venus', fr: 0.45 },
  { key: 'pamant',  name: 'Pământ',  dot: '#9DB8FF', D: 1,     au: 1,     x: 1.4, y: 0.10, weight: 3.21, music: 'pamant', fr: 0.4215 },
  // Luna: lângă Pământ, puțin mai departe pe drum și spre interior (dx, dy, dz față de Pământ); 6 panouri
  { key: 'luna',    name: 'Luna',    dot: '#E8E2D8', D: 0.273, au: 1,     of: 'pamant', dx: 0.8, dy: 0.05, dz: 2.6, weight: 6.0, leg: 1.6, music: 'luna', fr: 0.5 },
  { key: 'marte',   name: 'Marte',   dot: '#E08A5A', D: 0.532, au: 1.524, x: 1.2, y: 0.12, weight: 4.58, music: 'marte', fr: 0.45 },
  { key: 'jupiter', name: 'Jupiter', dot: '#E3C9A8', D: 11.21, au: 5.203, x: 8.5, y: 0.6,  weight: 4.58, music: 'jupiter', fr: 0.45 },
  { key: 'saturn',  name: 'Saturn',  dot: '#E6D3A3', D: 9.45,  au: 9.537, x: 7.5, y: 0.5,  weight: 5.04, music: 'saturn', fr: 0.205, ext: 2.33 },   // ext: inelele (marginea inelului F) / diametrul planetei
  { key: 'uranus',  name: 'Uranus',  dot: '#B5E3E8', D: 4.01,  au: 19.19, x: 3.6, y: 0.3,  weight: 4.01, music: 'uranus', fr: 0.235 },
  { key: 'neptun',  name: 'Neptun',  dot: '#7FA6E8', D: 3.88,  au: 30.07, x: 3.6, y: 0.3,  weight: 4.01, music: 'neptun', fr: 0.45 }
];
// adâncimea: scară logaritmică comprimată (drumul Marte → Jupiter se simte de ~3 ori mai lung decât Pământ → Marte)
export const ZK = 26, ZA = 0.3, zOf = (au) => ZK * Math.log(1 + au / ZA);
export const ACT = STOPS.filter((s) => !s.off);
// planetele mari au nevoie de mai mult loc: fiecare stă mai departe cu ZD × suma diametrelor de până la ea (inclusiv ea),
// altfel Jupiter s-ar vedea ca un disc mare încă de la Marte (pozițiile nu se schimbă când activezi alte planete)
export const ZD = 8;
(function placeBodies() { // prima planetă stă în stânga, apoi alternează; o lună stă spre interior față de planeta ei
  let side = -1, cum = 0;
  STOPS.forEach((s) => {
    if (s.key !== 'soare' && !s.of) cum += s.D;
    s.z = zOf(s.au) + ZD * cum;
    if (s.key === 'soare') { s.side = 1; s.pos = [0, 0, 0]; return; }
    if (s.of) { const p = STOPS.find((q) => q.key === s.of); s.side = -p.side; s.pos = [p.pos[0] - p.side * s.dx, p.pos[1] + s.dy, p.pos[2] + s.dz]; return; }
    s.side = side; s.pos = [side * s.x, side * s.y, s.z];
    if (!s.off) side = -side;
  });
})();
export const SUN = ACT[0], BODY = ACT.filter((s) => s !== SUN);
export const NEXT = STOPS[STOPS.indexOf(ACT[ACT.length - 1]) + 1] || null; // spre ea pleacă drumul după ultima oprire

// ---------- firul derulării: segmente în vh, apoi u = 0..1 ----------
export const SEG = []; export let TOTAL = 0;
export const push = (type, vh, o) => { SEG.push(Object.assign({ type, vh, a: TOTAL }, o)); TOTAL += vh; };
push('ocular', 70);
push('sun', SUN.weight * 100, { stop: SUN });
push('turn', 130, { stop: SUN });
for (let i = 1; i < ACT.length; i++) {
  const s = ACT[i], p = ACT[i - 1];
  push('leg', s.leg ? s.leg * 100 : 120 + 170 * Math.abs(Math.log((1 + s.au / ZA) / (1 + p.au / ZA))), { from: i === 1 ? null : p, to: s });
  push('hold', s.weight * 100, { stop: s });
}
push('tail', 140, { from: ACT[ACT.length - 1] });
SEG.forEach((g) => { g.b = (g.a + g.vh) / TOTAL; g.a = g.a / TOTAL; });
export const segOf = (type, key) => SEG.find((g) => g.type === type && (!key || (g.stop || g.to || {}).key === key));
export const segAt = (u) => { for (const g of SEG) if (u < g.b) return g; return SEG[SEG.length - 1]; };

// ---------- camera: poziție în lume + orientare (yaw: + = spre dreapta, pitch: + = în jos) ----------
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], vlen = (a) => Math.hypot(a[0], a[1], a[2]), vnorm = (a) => vmul(a, 1 / (vlen(a) || 1));
export const flat = (a) => vnorm([a[0], 0, a[2]]), rightOf = (h) => [h[2], 0, -h[0]];
export function toCam(rel, o) {
  const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  const x1 = rel[0] * cy - rel[2] * sy, z1 = rel[0] * sy + rel[2] * cy;
  return [x1, rel[1] * cp - z1 * sp, rel[1] * sp + z1 * cp];
}
// privim spre un punct astfel încât el să apară pe ecran la (ox, oy) față de centru
export const look = (rel, ox, oy, f) => ({ yaw: Math.atan2(rel[0], rel[2]) - Math.atan(ox / f), pitch: Math.atan2(rel[1], Math.hypot(rel[0], rel[2])) - Math.atan(oy / f) });
export const mixO = (a, b, k) => { let d = b.yaw - a.yaw; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return { yaw: a.yaw + d * k, pitch: lerp(a.pitch, b.pitch, k) }; };

/* Regulile trecerii (aceleași pentru toate opririle; se calculează din STOPS și din mărimea ecranului):
   1. apropierea: fiecare planetă are o linie de zbor care trece PE LÂNGĂ ea, la distanța b ≥ 2 raze de centru.
      Camera vine pe linie și se oprește la distanța d, de unde planeta ocupă ~52% din înălțime (cel mult ~57% la
      sfârșitul opririi), întreagă, puțin lateral (în partea ei) sau, pe telefon, în treimea de sus.
   2. plecarea: camera merge mai departe pe linie și se întoarce spre următoarea țintă; planeta rămâne în urmă
      și iese din cadru prin partea ei, la mărime apropiată de cea de la oprire.
   3. distanța cameră–centru nu scade niciodată sub 1,6 raze (verificare cu ?debug), fără excepții (și la Lună). */
export const TOP_SAFE = 112;   // telefon: bara de sus + contorul
export const HOLD = 0.12;      // în timpul opririi camera se mai apropie puțin
export let PATH = null;
export function buildPath(W, H) {
  const f = Math.min(W, H), port = W < H && W <= 760;
  // mărimea planetei la oprire; cu inele (ext = lățimea totală / diametru) planeta se micșorează ca inelele să încapă pe lățime
  const tgt = (B) => { const t = port ? Math.min(0.86 * W, 0.4 * H) : Math.min(0.52 * H, 0.86 * W), e = B && B.ext || 1; return e > 1 ? Math.min(t, (port ? 0.94 : 0.5) * W / e) : t; };
  const home = (B) => {
    const r = tgt(B) * (B.ext || 1) / 2;   // jumătate din lățimea vizibilă (cu inele)
    const edge = B.side < 0 && W > 760 ? 150 : Math.max(0.05 * W, 24);   // în stânga lăsăm loc pentru cuprins
    return port ? [0, Math.max(H / 3, TOP_SAFE + r + 10) - H / 2] : [B.side * Math.max(0, Math.min(0.3 * W, W / 2 - r - edge)), 0];
  };
  const P = { f, W, H, port, tgt, home, stop: {}, legs: {} };
  let prev = SUN.pos;
  BODY.forEach((B) => {
    const h = flat(vsub(B.pos, prev)), R = B.D / 2, d = f * B.D / tgt(B), b = clamp(0.68 * d, Math.max(2, 1.3 * (B.ext || 1)) * R, 0.9 * d), L = Math.sqrt(d * d - b * b);   // trecem și pe lângă inele
    const C = vsub(B.pos, vmul(rightOf(h), B.side * b));   // punctul cel mai apropiat de planetă pe linia de zbor
    const S = { h, d, b, L, P0: vsub(C, vmul(h, L)), P1: vsub(C, vmul(h, L - HOLD * d)), hm: home(B) };
    P.stop[B.key] = S; prev = B.pos;
  });
  const mk = (A, B, Bpos, end, h1, ua, ub, kind) => {
    const SA = A && A !== SUN ? P.stop[A.key] : null;
    let p0, t0, offA = null, tau = 0.3;
    if (!SA) { p0 = SUN.pos; t0 = flat(vsub(Bpos, SUN.pos)); }
    else { p0 = SA.P1; t0 = SA.h; offA = SA.hm; }
    const len = vlen(vsub(end, p0)), k1 = 0.4 * len, k2 = 0.4 * len;
    const cp = [p0, vadd(p0, vmul(t0, k1)), vsub(end, vmul(h1, k2)), end], tab = [0];
    let last = p0;
    for (let i = 1; i <= 200; i++) { const p = bezAt(cp, i / 200); tab.push(tab[i - 1] + vlen(vsub(p, last))); last = p; }
    return { A: SA ? A : null, B, Bpos, offA, tau, cp, tab, ua, ub, kind };
  };
  for (let i = 1; i < ACT.length; i++) {
    const A = ACT[i - 1], B = ACT[i], g = segOf('leg', B.key), S = P.stop[B.key];
    P.legs[B.key] = mk(A, B, B.pos, S.P0, S.h, g.a, g.b, 'ease');
  }
  { // coada: plecăm de la ultima oprire spre următoarea (chiar dacă e încă ascunsă)
    const A = ACT[ACT.length - 1], SA = P.stop[A.key], np = NEXT ? NEXT.pos : vadd(A.pos, [-A.side * 2, 0, 12]), h = flat(vsub(np, A.pos));
    const end = vadd(SA.P1, vmul(h, 0.45 * vlen(vsub(np, SA.P1)))), g = segOf('tail');
    P.legs._tail = mk(A, null, np, end, h, g.a, g.b, 'tail');
  }
  // centura de asteroizi (2,2–3,3 au, între Marte și Jupiter): pietre mici împrăștiate în jurul drumului, trec pe lângă cameră
  P.belt = [];
  const BL = ACT.slice(1).map((B) => P.legs[B.key]).find((L) => L && L.A && L.A.au < 2.2 && L.B && L.B.au > 3.3);
  if (BL) {
    let sd = 99; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 220; i++) {
      const sp = 0.18 + r() * 0.64, p = along(BL, sp), t = vnorm(vsub(along(BL, Math.min(1, sp + 0.002)), p));
      const u1 = vnorm([t[2], 0, -t[0]]), u2 = [t[1] * u1[2] - t[2] * u1[1], t[2] * u1[0] - t[0] * u1[2], t[0] * u1[1] - t[1] * u1[0]];
      const ang = r() * Math.PI * 2, rad = 0.45 + r() ** 1.6 * 4.5;   // cel puțin 0,45 unități de drum: nicio piatră nu lovește camera
      const pos = vadd(p, vadd(vmul(u1, Math.cos(ang) * rad), vmul(u2, Math.sin(ang) * rad * 0.55)));
      const shape = []; for (let k = 0; k < 9; k++) shape.push(0.62 + r() * 0.38);
      P.belt.push({ pos, D: 0.015 + r() ** 2.5 * 0.09, shape, rot: r() * 6.28, spin: (r() - 0.5) * 0.004, tone: 0.42 + r() * 0.22 });
    }
  }
  PATH = P; return P;
}
export function bezAt(cp, t) { const q = 1 - t, [a, b, c, d] = cp; return [0, 1, 2].map((k) => q * q * q * a[k] + 3 * q * q * t * b[k] + 3 * q * t * t * c[k] + t * t * t * d[k]); }
export function along(L, s) { // punctul de pe drum la fracția s din lungime
  const T = L.tab, x = s * T[T.length - 1]; let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] < x) lo = mid; else hi = mid; }
  return bezAt(L.cp, (lo + (x - T[lo]) / ((T[hi] - T[lo]) || 1)) / (T.length - 1));
}
export function camera(u) {
  const P = PATH, f = P.f, g = segAt(u), t = seg(u, g.a, g.b);
  if (g.type === 'ocular' || g.type === 'sun') return { scene: 'sun', t, g };
  if (g.type === 'turn') return { scene: 'turn', t, g };
  const C = (pos, o, roll, scene) => ({ scene: scene || 'space', t, g, P: pos, yaw: o.yaw, pitch: o.pitch, roll: roll || 0 });
  const lookAt = (pos, tp, off) => look(vsub(tp, pos), off[0], off[1], f);
  if (g.type === 'hold') { const s = g.stop, S = P.stop[s.key], pos = vadd(S.P0, vmul(vsub(S.P1, S.P0), t)); return C(pos, lookAt(pos, s.pos, S.hm)); }
  const L = g.type === 'tail' ? P.legs._tail : P.legs[g.to.key];
  const tt = seg(u, L.ua, L.ub);
  const s = L.kind === 'tail' ? 0.35 * tt + 0.65 * easeIn(tt) : ease(tt);
  const pos = along(L, s);
  // ținta: privim spre ea; cât e mică, o ținem aproape de centru, apoi alunecă spre locul ei de oprire
  let oT;
  if (L.B) { const S = P.stop[L.B.key], rel = vsub(L.B.pos, pos), k = ease(clamp((f * L.B.D / vlen(rel) / P.tgt(L.B) - 0.2) / 0.6, 0, 1)); oT = look(rel, S.hm[0] * k, S.hm[1] * k, f); }
  else oT = look(vsub(L.Bpos, pos), 0, 0, f);
  // planeta lăsată în urmă: la început încă o privim, apoi ne întoarcem spre țintă
  const o = L.A ? mixO(lookAt(pos, L.A.pos, L.offA), oT, ease(clamp(tt / L.tau, 0, 1))) : oT;
  return C(pos, o);
}
// oprirea „curentă” (cuprins, contor, muzică, credite)
export function stopAt(u) {
  const g = segAt(u);
  if (g.type === 'leg') return seg(u, g.a, g.b) < 0.5 && g.from ? g.from : g.to;
  if (g.type === 'tail') return g.from;
  return g.stop || SUN;
}
// proiecția unui corp pe ecran (pixeli CSS); null = în spatele camerei
// departe, discul se micșorează mai repede decât în perspectivă (distanțele sunt comprimate): planetele îndepărtate rămân puncte
export function project(B, cam) {
  const P = PATH, rel = vsub(B.pos, cam.P), dist = vlen(rel), c = toCam(rel, cam);
  if (c[2] <= 0.02 * dist) return null;
  const ref = 1.6 * P.f * Math.max(B.D, 0.6) / P.tgt(B), q = dist > ref ? (dist - ref) / ref : 0, k = 1 / (1 + q * q) ** 1.5;
  // departe apare încet, ca punct: pragul ține de mărimea planetei (Jupiter se vede de mai departe decât Mercur)
  const fa = Math.max(60, 5 * ref), alpha = clamp((fa - dist) / (0.35 * fa), 0, 1);
  return { dist, alpha, D: P.f * B.D / dist * k, sx: P.W / 2 + P.f * c[0] / c[2], sy: P.H / 2 + P.f * c[1] / c[2] };
}
// verificarea distanței (doar cu ?debug): camera nu intră niciodată în planete
export const DEBUG = /[?&]debug\b/.test(location.search), DBG = { checks: 0, bad: [] };
export function distCheck(u, cam) {
  if (!DEBUG || !cam.P) return;
  DBG.checks++;
  for (const B of BODY) {
    const q = vlen(vsub(B.pos, cam.P)) / (B.D / 2);
    if (q < 1.6) { DBG.bad.push([u, B.key, q]); console.warn('[debug] camera prea aproape de ' + B.name + ': ' + q.toFixed(2) + ' × raza (u = ' + u.toFixed(4) + ')'); }
  }
}
// ferestrele în care fiecare corp se vede (pentru cadre) și e mare pe ecran (pentru panouri); se recalculează la redimensionare
export const VIS = {};
// aceeași măsurare ca în previzualizare, împărțită în bucăți (la pornire se face între cadre, fără sarcini lungi)
export const MW_N = 3000;
export function measureWindows(W, H) { mwBegin(); mwRange(0, MW_N + 1, W, H); mwEnd(); }
export function mwBegin() { BODY.forEach((B) => { VIS[B.key] = { v0: 1, v1: 0, big: [] }; }); }
export function mwRange(i0, i1, W, H) {
  const N = MW_N;
  for (let i = i0; i < Math.min(i1, N + 1); i++) {
    const u = i / N, cam = camera(u); if (cam.scene !== 'space') continue;
    distCheck(u, cam);
    for (const B of BODY) {
      const p = project(B, cam); if (!p) continue;
      const V = VIS[B.key], on = p.sx + p.D / 2 > 0 && p.sx - p.D / 2 < W && p.sy + p.D / 2 > 0 && p.sy - p.D / 2 < H;
      if (on && p.D >= 1) { V.v0 = Math.min(V.v0, u); V.v1 = Math.max(V.v1, u); }
      if (p.D >= 0.25 * H && p.sx > 0 && p.sx < W && p.sy > 0 && p.sy < H) V.big.push(u);
    }
  }
}
export function mwEnd() {
  const N = MW_N;
  BODY.forEach((B) => { // fereastra mare care conține oprirea
    const V = VIS[B.key], h = segOf('hold', B.key), mid = (h.a + h.b) / 2; let a = mid, b = mid;
    const has = new Set(V.big.map((u) => Math.round(u * N)));
    while (has.has(Math.round(a * N) - 1)) a -= 1 / N;
    while (has.has(Math.round(b * N) + 1)) b += 1 / N;
    V.a = Math.min(a, h.a); V.b = Math.max(b, h.b);
  });
}
// ---------- Soarele: o singură imagine NASA/SDO (discul HMI, protuberanțele AIA 304), desenată live în globe.js ----------
// draw(c, cx, cy, D) desenează discul (WebGL); fără el (sau până sosește harta), un disc cald, simplu
export function drawSun(c, cx, cy, R, alpha, draw) {
  if (alpha <= 0 || R < 1) return false;
  c.save(); c.globalAlpha = alpha;
  // lumina caldă din jurul discului: discretă și desenată sub disc, ca să nu acopere textura
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 2.6);
  g.addColorStop(0, 'rgba(255,196,120,0.26)'); g.addColorStop(0.16, 'rgba(255,170,90,0.09)'); g.addColorStop(0.5, 'rgba(255,140,70,0.025)'); g.addColorStop(1, 'rgba(255,130,60,0)');
  c.fillStyle = g; c.fillRect(cx - R * 2.6, cy - R * 2.6, R * 5.2, R * 5.2);
  c.globalCompositeOperation = 'source-over';
  c.restore();
  const r = draw ? draw(c, cx, cy, 2 * R, alpha) : false;
  if (!r) { c.save(); c.globalAlpha = alpha; c.fillStyle = '#F4B356'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.restore(); }
  return r;
}
// centura de asteroizi: fiecare piatră e un poligon neregulat, luminat din aceeași direcție (stânga-sus), discret
export function drawBelt(c, cam, w, h, dpr, u) {
  const P = PATH;
  for (const a of P.belt) {
    const rel = vsub(a.pos, cam.P), dist = vlen(rel); if (dist > 14 || dist < 0.08) continue;
    const q = toCam(rel, cam); if (q[2] < 0.05) continue;
    const sx = (P.W / 2 + P.f * q[0] / q[2]) * dpr, sy = (P.H / 2 + P.f * q[1] / q[2]) * dpr, D = P.f * a.D / dist * dpr;
    if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40 || D < 0.6) continue;
    const al = clamp((14 - dist) / 6, 0, 1) * clamp(D / 2, 0.45, 1), g = Math.round(255 * a.tone);
    if (D < 3) { c.globalAlpha = al * 0.8; c.fillStyle = 'rgb(' + g + ',' + Math.round(g * 0.95) + ',' + Math.round(g * 0.88) + ')'; c.fillRect(sx - D / 2, sy - D / 2, Math.max(D, 1), Math.max(D, 1)); continue; }
    const rr = D / 2, rot = a.rot + a.spin * u * 4000;
    c.save(); c.globalAlpha = al; c.translate(sx, sy); c.rotate(rot); c.beginPath();
    a.shape.forEach((k, i) => { const t = i / a.shape.length * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(t) * rr * k, Math.sin(t) * rr * k); });
    c.closePath(); c.rotate(-rot);
    const gr = c.createLinearGradient(-rr * 0.7, -rr * 0.7, rr * 0.7, rr * 0.7);
    gr.addColorStop(0, 'rgb(' + Math.min(255, g + 70) + ',' + Math.min(255, g + 62) + ',' + Math.min(255, g + 50) + ')'); gr.addColorStop(1, 'rgb(' + Math.round(g * 0.25) + ',' + Math.round(g * 0.23) + ',' + Math.round(g * 0.22) + ')');
    c.fillStyle = gr; c.fill(); c.restore();
  }
  c.globalAlpha = 1;
}
// după întoarcere, Soarele rămâne în spate doar ca lumină caldă pe marginea din stânga-sus
export function sunGlow(c, w, h, a) {
  if (a <= 0.003) return;
  const r = Math.max(w, h) * 0.95, g = c.createRadialGradient(-w * 0.08, -h * 0.12, 0, -w * 0.08, -h * 0.12, r);
  g.addColorStop(0, 'rgba(255,222,160,' + a.toFixed(3) + ')'); g.addColorStop(0.4, 'rgba(255,190,120,' + (a * 0.3).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,170,100,0)');
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
}
// stele în timpul întoarcerii: se mișcă pe orizontală, cu dâre după viteză
export function starsPan(c, w, h, pan, speed, alpha) {
  if (alpha <= 0) return;
  const W2 = w * 1.5;
  c.save(); c.strokeStyle = '#FFF1DD'; c.fillStyle = '#FFF1DD'; c.lineCap = 'round';
  for (const s of STARS) {
    const depth = 0.35 + 0.65 * (1 - s.z), x = ((((s.x * 0.5 + 0.5) * W2 - pan * W2 * depth) % W2) + W2) % W2 - (W2 - w) / 2, y = (s.y * 0.5 + 0.5) * h;
    if (x < -40 || x > w + 40) continue;
    const sz = depth * 1.6 + 0.3, len = speed * w * 0.06 * depth;
    c.globalAlpha = alpha * s.b * (0.4 + 0.6 * depth);
    if (len > 1.5) { c.lineWidth = sz; c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y); c.stroke(); }
    else c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  c.restore();
}
