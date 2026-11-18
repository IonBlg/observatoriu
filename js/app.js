// Tot ce nu ține de primul ecran: camera și desenarea călătoriei, panourile, ceasul, cuprinsul, pastila, contorul, lupa,
// programul și biletul. Se încarcă din main.js cu import(), după primul ecran. Codul e copiat din previzualizare (V10).
// Planetele și Luna ca glob se desenează live, din hărți, cu WebGL (globe.js); restul desenării e neschimbat.
import { SEQ, SET, BASE, F, hooks, run, plan, setTimeline, frameAt, pick, sleep, stats, onFirstMove, started } from './frames.js?v=2026111803';
import { createGlobes, angleOf, surfacePoint, BODIES, TEX_ORDER } from './globe.js?v=2026111803';
import {
  RM, clamp, ease, seg, lerp, fit, cover, stars, starsPan, sunGlow, drawSun, drawBelt,
  STOPS, ACT, SUN, BODY, SEG, TOTAL, segOf, segAt, PATH, buildPath, camera, stopAt, project,
  DEBUG, DBG, distCheck, VIS, measureWindows, mwBegin, mwRange, mwEnd, MW_N, vlen, vsub, toCam
} from './journey.js?v=2026111803';

// ---------- pornirea: pregătim drumul în bucăți mici (între cadre), apoi dispare ecranul de încărcare ----------
let revealed = false, ready = false, startP = null;
const loadEl = document.getElementById('load');
hooks(() => { dirty = true; fv++; if (revealed) req(); }, () => {});
const pause = () => new Promise((r) => setTimeout(r, 0));
async function steps(gen) { let t = performance.now(); for (const _ of gen) if (performance.now() - t > 12) { await pause(); t = performance.now(); } }
// stilurile complete (style.css) se încarcă fără să blocheze afișarea; pagina apare doar după ce sunt aplicate
const cssReady = () => new Promise((res) => {
  const t0 = performance.now(), ok = () => [...document.styleSheets].some((s) => s.href && s.href.indexOf('css/style.css') >= 0);
  (function wait() { if (ok() || performance.now() - t0 > 4000) res(); else setTimeout(wait, 30); })();
});
export function start(progress) {
  if (!startP) startP = (async () => {
    await steps(layoutSteps(innerWidth, innerHeight)); if (progress) progress(0.95);
    placeAnchors(); await steps(timelineSteps()); ready = true; dirty = true;
    await cssReady(); reveal();
  })();
  return startP;
}
function reveal() {
  if (revealed) return; revealed = true;
  scrollTo(0, 0);
  loadEl.classList.add('out'); document.body.classList.remove('locked');
  setTimeout(() => loadEl.remove(), 1200); req();
  plan(scrollY, innerHeight); run();
  if (/^#program/.test(location.hash)) setTimeout(() => goProgram((location.hash.match(/ev=(\w+)/) || [])[1]), 60); // link direct spre program
}

// ---------- linia de timp pentru coada de cadre: unde (în px de derulare) se vede fiecare cadru ----------
function timeline() { for (const _ of timelineSteps()); }
function* timelineSteps() {
  const H = innerHeight, aTop = apusSec.offsetTop, aSpan = apusSec.offsetHeight - H, jTop = jSec.offsetTop, jSpan = jSec.offsetHeight - H;
  const Y = (u) => jTop + u * jSpan, seq = {};
  seq.apus = { y0: aTop, y1: aTop + 0.86 * aSpan };   // singura secvență de cadre rămasă (Soarele și Luna se desenează live)
  yield;
  // zonele: apusul, Soarele, apoi fiecare oprire (de la începutul drumului spre ea), apoi finalul
  const zones = [{ y0: -Infinity }, { y0: jTop }];
  for (let i = 1; i < ACT.length; i++) zones.push({ y0: Y(segOf('leg', ACT[i].key).a) });
  zones.push({ y0: Y(segOf('tail').a) });
  zones.forEach((z, k) => { z.y1 = k + 1 < zones.length ? zones[k + 1].y0 : Infinity; });
  // apusul se descarcă întreg după prima derulare
  setTimeline({ seq, zones, extra: [], near: { apus: [0, 1] } });
}

// ---------- muzica: motorul se încarcă doar la primul clic ----------
const sndBtn = document.getElementById('snd');
let music = null, musicLoad = null, chapterNow = 'pamant';
try { if (localStorage.getItem('observatoriu-muzica') === '1') { sndBtn.classList.add('armed'); sndBtn.title = 'Muzica era pornită. Apasă ca să cânte din nou.'; } } catch (e) {} // revenire: browserul cere un clic ca să cânte
sndBtn.addEventListener('click', async () => {
  if (!music) { musicLoad = musicLoad || import('./music.js?v=2026111803').then((m) => m.init(sndBtn, chapterNow)); music = await musicLoad; }
  music.toggle();
});

// ---------- math ----------
function prog(sec) { const b = sec.getBoundingClientRect(), span = b.height - innerHeight; return span > 0 ? clamp(-b.top / span, 0, 1) : 0; }
function visible(sec) { const b = sec.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; }
function panels(list, p) {
  list.forEach((el) => {
    const a = +el.dataset.a, b = +el.dataset.b, f = Math.min(0.012, (b - a) / 4) || 0.01;
    let v = (p >= a && p <= b) ? Math.min(1, (p - a) / f, (b - p) / f) : 0;
    if (a <= 0.001 && p < f) v = 1;
    v = clamp(v, 0, 1);
    const dy = ((a + b) / 2 - p) / (b - a) * 60;
    if (el._v === v && el._dy === Math.round(dy)) return; el._v = v; el._dy = Math.round(dy);
    el.style.opacity = v.toFixed(3);
    el.style.translate = '0 ' + dy.toFixed(1) + 'px';
    el.style.pointerEvents = v > 0.5 ? 'auto' : 'none';
    // butoanele dintr-un panou ascuns nu primesc focus (focusul trebuie să se vadă mereu)
    if (el._f == null) el._f = !!el.querySelector('a,button,input,select');
    if (el._f && el.inert !== (v <= 0.5)) el.inert = v <= 0.5;
  });
}

const PAD = 0.009, GAP = 0.004;
function layoutPanels(W, H) { for (const _ of layoutSteps(W, H)); }
function* layoutSteps(W, H) {
  buildPath(W, H); mwBegin();
  for (let i = 0; i <= MW_N; i += 250) { mwRange(i, i + 250, W, H); yield; } // ferestrele de vizibilitate, în bucăți
  mwEnd();
  const groups = new Map();
  jPnls.forEach((el) => {
    const d = el.dataset, k = d.seg ? 'seg' : d.leg ? 'leg:' + d.leg : d.stop + ':' + (d.part || '');
    if (d.at != null) { const B = ACT.find((s) => s.key === d.stop); if (B) d.at = B.side > 0 ? 'l' : 'r'; } // textul stă în partea opusă planetei
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el);
  });
  for (const [k, list] of groups) {
    let A, B;
    if (k === 'seg') { A = 0; B = segOf('ocular').b; }
    else if (k.startsWith('leg:')) { const g = segOf('leg', k.slice(4)); A = g.a + PAD; B = g.b - PAD; }
    else if (k === 'soare:') { const g = segOf('sun'); A = g.a + PAD; B = g.b - PAD; }
    else { const V = VIS[k.slice(0, -1)]; if (!V) continue; A = V.a + PAD; B = V.b - PAD; }
    const L = (B - A - GAP * (list.length - 1)) / list.length;
    list.forEach((el, i) => {
      const a = A + i * (L + GAP), b = a + L;
      el.dataset.a = a.toFixed(4); el.dataset.b = b.toFixed(4); el._v = null;
      const tm = el.querySelector('.tm'); if (tm) tm.textContent = hm(Math.round((21 * 60 + Math.max(a, 0) * 300) / 5) * 5);
    });
  }
}

// ---------- elements ----------
const apusSec = document.getElementById('apus'), apusCv = apusSec.querySelector('canvas'), apusPnls = [...apusSec.querySelectorAll('.pnl')];
const jSec = document.getElementById('calatorie'), space = document.getElementById('space'), lens = jSec.querySelector('.lens'), ring = jSec.querySelector('.ring');
const jPnls = [...jSec.querySelectorAll('.pnl')];
const credRender = document.getElementById('cred-render'), credRenderT = document.getElementById('cred-render-t');
const CRED = {
  pamant: 'Pământul: randat din hărțile <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/">Blue Marble Next Generation</a> și Blue Marble: Clouds, NASA Earth Observatory · domeniu public',
  luna: 'Luna: randată din harta <a href="https://svs.gsfc.nasa.gov/4720">CGI Moon Kit (LROC), NASA SVS</a> · domeniu public',
  // fără WebGL se văd cadrele statice din animațiile NASA SVS
  pamant_svs: 'Pământul: animație <a href="https://svs.gsfc.nasa.gov/">NASA\'s Scientific Visualization Studio</a> · domeniu public',
  soare: 'Soarele: <a href="https://sdo.gsfc.nasa.gov/">NASA/SDO</a>, HMI și AIA 304, 9 mai 2024 · domeniu public',
  saturn: 'Saturn: harta <a href="https://doi.org/10.17909/T9G593">Hubble OPAL, NASA/ESA</a> · CC BY 4.0 · inelele: NASA Voyager și Cassini',
  uranus: 'Uranus: randat din harta <a href="https://doi.org/10.17909/T9G593">Hubble OPAL (NASA/ESA, A. Simon)</a> · CC BY 4.0',
  neptun: 'Neptun: randat din harta <a href="https://doi.org/10.17909/T9G593">Hubble OPAL (NASA/ESA, A. Simon)</a> · CC BY 4.0',
  jupiter: 'Jupiter: randat din harta <a href="https://photojournal.jpl.nasa.gov/catalog/PIA07782">Cassini PIA07782, NASA/JPL/SSI</a> · domeniu public',
  venus: 'Venus: randat din imaginile <a href="https://doi.org/10.17597/isas.darts/vco-00016">Akatsuki UVI, JAXA/ISAS</a> · CC BY 4.0',
  mercur: 'Mercur: randat din harta <a href="https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_md3_color_global_mosaic_665m">MESSENGER MDIS, NASA/JHUAPL/Carnegie</a> · domeniu public',
  marte: 'Marte: randat din harta <a href="https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m">Viking MDIM 2.1, NASA/USGS</a> · domeniu public'
};
const clockEl = document.getElementById('clock'), barEl = document.getElementById('bar');
const letters = [...document.querySelectorAll('#title .ltr')], cue = document.getElementById('cue'), titleKick = document.getElementById('titleKick');
const navEl = document.querySelector('.nav'), chapEl = document.querySelector('.chap'), chapLinks = [...chapEl.querySelectorAll('a')];
const credApus = apusSec.querySelector('.cred'), finSec = document.getElementById('final'), progSec = document.getElementById('program');
const pillNav = document.getElementById('pillNav'), pillT = document.getElementById('pillT'), pillN = document.getElementById('pillN');
const sheet = document.getElementById('sheet'), sheetBg = document.getElementById('sheetBg'), sheetList = document.getElementById('sheetList');
// creditul de lângă imagine se ascunde cât un text sau un cartonaș vizibil e la mai puțin de 24 px de el
function credGuard(el, list) {
  if (innerWidth <= 760) return;
  let near = false;
  if (el.style.opacity !== '0') {
    const r = el.getBoundingClientRect(), G = 24;
    const hit = (q) => q.width && r.left - G < q.right && r.right + G > q.left && r.top - G < q.bottom && r.bottom + G > q.top;
    near = list.some((p) => p._v > 0.3 && hit(p.getBoundingClientRect())) || (hudOn && hit(hudEl.getBoundingClientRect())) || hit(finSec.getBoundingClientRect());
  }
  if (el.classList.contains('away') !== near) el.classList.toggle('away', near);
}
const vid = document.getElementById('vid');
// ancorele cuprinsului: la primul panou al fiecărei opriri active
function placeAnchors() {
  const span = jSec.offsetHeight - innerHeight;
  jSec.querySelectorAll('.anchor').forEach((a) => {
    const p = ACT.some((s) => s.key === a.id) && jPnls.find((el) => el.dataset.stop === a.id);
    a.style.top = Math.round((p ? Math.max(0, +p.dataset.a - 0.004) : 0) * span) + 'px';
  });
}
const hm = (m) => { m = Math.round(m) % 1440; const h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; };
jSec.style.height = Math.round(TOTAL + 100) + 'vh'; // lungimea drumului vine din lista de opriri

// ---------- 2. contorul de călătorie: distanța medie de la Soare, din au ----------
const AU_KM = 149597871, AU_S = 499; // 1 au în km și în secunde-lumină
const hudEl = document.getElementById('hud'), hKm = document.getElementById('hKm'), hLight = document.getElementById('hLight'), hDest = document.getElementById('hDest'), hStop = document.getElementById('hStop');
const NSTOP = ACT.length + 1; // opririle din STOPS + finalul (aceleași ca în cuprins)
const nf1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKm = (km) => km < 1e6 ? Math.round(km).toLocaleString('ro-RO') + ' km' : km < 1e9 ? nf1.format(km / 1e6) + ' mil. km' : nf2.format(km / 1e9) + ' mld. km';
function lightStr(s) {
  if (s < 60) return (s ? nf1.format(s) : '0') + ' s';
  const t = Math.round(s), m = Math.floor(t / 60);
  if (t >= 3600) return Math.floor(t / 3600) + ' h ' + Math.round((t % 3600) / 60) + ' min'; // de la Jupiter încolo: „1 h 19 min”
  return m + ' min ' + (t % 60) + ' s';
}
let hudOn = false;
function hudUpdate(u, on) {
  if (on !== hudOn) { hudOn = on; hudEl.classList.toggle('on', on); }
  if (!on) return;
  const g = segAt(u), t = seg(u, g.a, g.b); let au = 0, dest = ACT[0];
  if (g.type === 'leg') { au = lerp(g.from ? g.from.au : 0, g.to.au, RM ? 0 : ease(t)); dest = g.to; } // mișcare redusă: fără numărătoare
  else if (g.type === 'tail') { au = g.from.au; dest = g.from; }
  else if (g.type === 'turn') dest = ACT[1] || ACT[0];
  else if (g.stop) { au = g.stop.au; dest = g.stop; } // Luna: valorile Pământului
  const a = fmtKm(au * AU_KM), b = lightStr(au * AU_S), c = dest.name, d = 'Oprirea ' + (ACT.indexOf(stopAt(u)) + 1) + ' din ' + NSTOP;
  if (hStop.textContent !== d) hStop.textContent = d;
  if (hKm.textContent !== a) hKm.textContent = a;
  if (hLight.textContent !== b) hLight.textContent = b;
  if (hDest.textContent !== c) hDest.textContent = c;
}

// ---------- 3. lupa de telescop pe globul Lunii ----------
// mărirea 3× se desenează din același glob live (WebGL), deci relieful, lumina și librația sunt exact cele de pe ecran;
// etichetele stau pe coordonatele selenografice reale (latitudine, longitudine), proiectate cu aceeași geometrie ca globul
const LOUPE = { Z: 3, R: 90 };
// r = raza zonei, în raze de disc (unde eticheta e activă)
const ZONES = [
  { lat: -43.31, lon: -11.36, r: 0.064, n: 'TYCHO', d: '85 km lățime, ~108 milioane de ani. Razele lui luminoase se întind pe până la 1.500 km.' },
  { lat: 9.62, lon: -20.08, r: 0.071, n: 'COPERNICUS', d: '93 km lățime, ~800 de milioane de ani. Se vede și cu un binoclu.' },
  { lat: 32.8, lon: -15.6, r: 0.23, n: 'MARE IMBRIUM · MAREA PLOILOR', d: 'O câmpie de lavă de ~1.120 km, într-un bazin lăsat de un impact uriaș.' },
  { lat: 28.0, lon: 17.5, r: 0.16, n: 'MARE SERENITATIS · MAREA SENINĂTĂȚII', d: '~700 km. La marginea ei de sud-est a aselenizat Apollo 17, în decembrie 1972.' },
  { lat: 0.674, lon: 23.473, r: 0.052, n: 'APOLLO 11 · MAREA LINIȘTII', d: 'Punctul auriu: aici au coborât primii oameni pe Lună, pe 20 iulie 1969.' },
  { lat: 8.5, lon: 31.4, r: 0.18, n: 'MARE TRANQUILLITATIS · MAREA LINIȘTII', d: '~870 km. Pe marginea ei de sud-vest a aselenizat Apollo 11, în 1969.' }
];
const APOLLO11 = ZONES[4];
const loupeEl = document.getElementById('loupe'), loupeCv = loupeEl.querySelector('canvas'), tagEl = document.getElementById('ltag');
let moonScr = null, ptr = null, loupeShown = false, tagShown = -1;
const lupaSeg = () => { const g = segOf('hold', 'luna'), V = VIS.luna; return V ? [Math.min(V.a, g.a), Math.max(V.b, g.b)] : [g.a, g.b]; };
// librația: o oscilație foarte mică (±1,5° în longitudine, ±1° în latitudine, ~40 s); Luna nu se rotește
const libration = (t) => (RM ? { ang: 0, inc: 0 } : { ang: 1.5 * Math.sin(t * 2 * Math.PI / 40), inc: 1.0 * Math.sin(t * 2 * Math.PI / 53 + 1) });
function onPtr(e) {
  if (e.pointerType === 'touch' && e.type === 'pointermove' && !(ptr && ptr.down)) return;
  ptr = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', down: e.type === 'pointerdown' || (ptr && ptr.down) };
  if (revealed) req();
}
addEventListener('pointermove', onPtr, { passive: true });
jSec.addEventListener('pointerdown', onPtr, { passive: true });
const ptrEnd = (e) => { if (ptr && ptr.touch) { ptr = null; req(); } };
addEventListener('pointerup', ptrEnd); addEventListener('pointercancel', ptrEnd);
document.documentElement.addEventListener('pointerleave', () => { ptr = null; req(); });
jSec.addEventListener('contextmenu', (e) => { if (loupeShown) e.preventDefault(); });
// cât lupa e activă, contorul din dreapta-jos se ascunde (lupa și eticheta ei nu stau niciodată peste el)
function loupeHide() {
  if (loupeShown) { loupeShown = false; loupeEl.classList.remove('on'); hudEl.classList.remove('lupa'); jSec.querySelector('.stage').style.cursor = ''; }
  if (tagShown !== -1) { tagShown = -1; tagEl.classList.remove('on'); }
}
function loupeUpdate(u) {
  const m = moonScr, [la, lb] = lupaSeg();
  if (u < la || u > lb || !m || !ptr || (ptr.touch && !ptr.down)) return loupeHide();
  const dx = ptr.x - m.x, dy = ptr.y - m.y;
  if (Math.hypot(dx, dy) > m.r) return loupeHide();
  const lx = ptr.x, ly = ptr.touch ? ptr.y - 120 : ptr.y;   // pe ecran tactil lentila stă deasupra degetului
  const d = Math.min(devicePixelRatio || 1, 2), S = LOUPE.R * 2 * d, Z = LOUPE.Z * d;
  if (loupeCv.width !== S) { loupeCv.width = S; loupeCv.height = S; }
  const c = loupeCv.getContext('2d');
  c.fillStyle = '#050409'; c.fillRect(0, 0, S, S);
  const cx = S / 2 - dx * Z, cy = S / 2 - dy * Z, D = 2 * m.r * Z;   // centrul și diametrul Lunii mărite, în pixelii lentilei
  let ok = G && !G.lost && G.ready('luna') && G.draw(c, 'luna', cx, cy, D, S, S, { ang: m.lib.ang, inc: m.lib.inc, dot: '#E8E2D8' });
  if (!ok) { const im = staticOf('luna'); if (im) { const s2 = D / (2 * BODIES.luna.fr); c.imageSmoothingQuality = 'high'; c.drawImage(im, cx - s2 / 2, cy - s2 / 2, s2, s2); } }
  // punctul aselenizării Apollo 11
  const ap = surfacePoint('luna', APOLLO11.lat, APOLLO11.lon, m.lib), ax = cx + ap.x * D / 2, ay = cy + ap.y * D / 2;
  if (ap.z > 0 && ax > -10 && ax < S + 10 && ay > -10 && ay < S + 10) {
    c.fillStyle = '#F2C48D'; c.beginPath(); c.arc(ax, ay, 3.2 * d, 0, 7); c.fill();
    c.strokeStyle = 'rgba(242,196,141,.7)'; c.lineWidth = 1.2 * d; c.beginPath(); c.arc(ax, ay, 8 * d, 0, 7); c.stroke();
  }
  loupeEl.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px)';
  if (!loupeShown) { loupeShown = true; loupeEl.classList.add('on'); hudEl.classList.add('lupa'); if (!ptr.touch) jSec.querySelector('.stage').style.cursor = 'none'; }
  // eticheta: zona cea mai apropiată (relativ la mărimea ei) în care se află centrul lentilei
  const qx = dx / m.r, qy = dy / m.r;
  let hit = -1, best = 1;
  ZONES.forEach((z, i) => { const p = surfacePoint('luna', z.lat, z.lon, m.lib); if (p.z <= 0) return; const q = Math.hypot(qx - p.x, qy - p.y) / z.r; if (q < best) { best = q; hit = i; } });
  if (hit !== tagShown) {
    tagShown = hit; tagEl.classList.toggle('on', hit >= 0);
    if (hit >= 0) { tagEl.firstChild.textContent = ZONES[hit].n; tagEl.lastChild.textContent = ZONES[hit].d; }
  }
  if (hit >= 0) {
    const below = ly + LOUPE.R + 14, th = tagEl.offsetHeight || 80;
    const ty = below + th < innerHeight - 8 ? below : ly - LOUPE.R - 14 - th;
    const tx = clamp(lx, 146, innerWidth - 146);
    tagEl.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px)';
  }
}

// ---------- 5. rezervarea: programul, formularul (nu trimite nimic nicăieri), lista opririlor pe telefon ----------
const glueStr = (t) => { t = t.replace(/(^|\s)([a-zăâîșțA-ZĂÂÎȘȚ0-9]{1,2}) (?=\S)/g, '$1$2 '); const k = t.trimEnd().lastIndexOf(' '); return k > 0 ? t.slice(0, k) + ' ' + t.slice(k + 1) : t; };
const form = document.getElementById('rez'), fEv = document.getElementById('f-ev'), fName = document.getElementById('f-nume'), fTel = document.getElementById('f-tel');
const okEl = document.getElementById('rezOk'), againBtn = document.getElementById('rezAgain'), progH = document.getElementById('h-prog');
const RULES = {
  ev: [fEv, (v) => v ? '' : 'Alege evenimentul la care vrei să vii.'],
  nume: [fName, (v) => v.trim().length >= 2 ? '' : 'Scrie-ți numele, ca să știm pe cine așteptăm.'],
  tel: [fTel, (v) => { const d = v.replace(/\D/g, ''); if (!v.trim()) return 'Scrie un număr de telefon.'; return /[^\d\s()+.\-]/.test(v) || d.length < 8 || d.length > 15 ? 'Numărul nu pare întreg. Scrie-l așa: 069 123 456.' : ''; }]
};
let tried = false;
function check(k) {
  const [el, rule] = RULES[k], msg = rule(el.value), err = document.getElementById('e-' + (k === 'nume' ? 'nume' : k));
  err.textContent = msg ? glueStr(msg) : '';
  if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  return !msg;
}
Object.keys(RULES).forEach((k) => {
  const el = RULES[k][0];
  el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { if (tried || el.hasAttribute('aria-invalid')) check(k); });
  el.addEventListener('blur', () => { if (tried && el.value) check(k); });
});
form.addEventListener('submit', (e) => {
  e.preventDefault(); tried = true;
  const bad = Object.keys(RULES).filter((k) => !check(k));
  if (bad.length) { RULES[bad[0]][0].focus(); return; }
  const ev = fEv.options[fEv.selectedIndex].text.split(' · ')[0];
  form.hidden = true;
  okEl.textContent = glueStr('Mulțumim, ' + fName.value.trim() + '! Locul tău la «' + ev + '» e notat. Acesta e un site demonstrativ, deci rezervarea nu e reală.');
  againBtn.hidden = false; okEl.focus(); req();
});
function showForm() {
  if (!form.hidden) return;
  form.hidden = false; okEl.textContent = ''; againBtn.hidden = true; tried = false;
  form.reset(); Object.keys(RULES).forEach((k) => { RULES[k][0].removeAttribute('aria-invalid'); document.getElementById('e-' + k).textContent = ''; });
}
againBtn.addEventListener('click', () => { showForm(); fEv.focus(); req(); });
// biletul: rândurile din program aleg seara; sumarul și totalul se actualizează
const rows = [...document.querySelectorAll('.row[data-pick]')], tkE = document.getElementById('tkE'), tkT = document.getElementById('tkT'), goBtn = document.getElementById('goBtn'), fN = document.getElementById('f-n');
function syncTicket() {
  const o = fEv.options[fEv.selectedIndex], v = fEv.value;
  rows.forEach((r) => r.setAttribute('aria-pressed', String(r.dataset.pick === v)));
  if (!v) { tkE.textContent = 'Alege o seară din program'; tkT.textContent = ''; goBtn.textContent = 'Trimite rezervarea'; notch(); return; }
  const parts = o.text.split(' · '), price = parseInt(parts[2], 10) || 0, n = parseInt(fN.value, 10) || 1;
  tkE.textContent = parts[0]; tkT.textContent = (parts[1] || '').toUpperCase() + ' · ' + n + (n === 1 ? ' PERSOANĂ' : ' PERSOANE');
  goBtn.textContent = 'Rezervă · ' + price * n + ' lei';
  notch();
}
const rzBox = document.querySelector('.rz'), tkBox = document.getElementById('tk');
function notch() { rzBox.style.setProperty('--ny', (tkBox.offsetTop + tkBox.offsetHeight) + 'px'); } // decupajele biletului stau fix pe linia punctată
addEventListener('resize', notch); if (document.fonts) document.fonts.ready.then(notch); notch();
rows.forEach((r) => r.addEventListener('click', () => {
  showForm(); fEv.value = r.dataset.pick; if (tried) check('ev'); syncTicket();
  if (innerWidth < 980) { const t = document.querySelector('.rz'); scrollTo({ top: t.getBoundingClientRect().top + scrollY - 84, behavior: RM ? 'auto' : 'smooth' }); fName.focus({ preventScroll: true }); }
}));
fEv.addEventListener('change', syncTicket); fN.addEventListener('change', syncTicket);
form.addEventListener('reset', () => setTimeout(syncTicket, 0));
// toate butoanele „Rezervă” duc la program; cele de la un eveniment îl aleg deja în formular
function goProgram(ev) {
  const known = ev && fEv.querySelector('option[value="' + ev + '"]');
  if (known) { showForm(); fEv.value = ev; if (tried) check('ev'); syncTicket(); }
  const target = known ? document.querySelector('.rz') : progSec;
  scrollTo(0, Math.max(0, target.getBoundingClientRect().top + scrollY - 84));
  try { history.replaceState(null, '', '#program'); } catch (e) {}
  (known ? (form.hidden ? okEl : fName) : progH).focus({ preventScroll: true });
  req();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#program"]'); if (!a) return;
  e.preventDefault(); closeSheet(false); goProgram(a.dataset.ev);
});
// lista opririlor (telefon): panou de jos, focusul rămâne în el, Esc sau clic în afară îl închide
sheetList.innerHTML = ACT.map((s, i) => '<li><a href="#' + s.key + '" data-sec="' + s.key + '"><span class="k">' + (i + 1) + '</span>' + s.name + '<i></i></a></li>').join('')
  + '<li><a href="#final" data-sec="final"><span class="k">' + NSTOP + '</span>Final · stele căzătoare<i></i></a></li>';
let sheetOpen = false;
const focusables = () => [...sheet.querySelectorAll('a,button')];
function openSheet() {
  sheetOpen = true; sheet.classList.add('open'); sheetBg.classList.add('open'); document.body.classList.add('sheet-open');
  pillNav.setAttribute('aria-expanded', 'true');
  (sheetList.querySelector('[aria-current]') || sheetList.querySelector('a')).focus({ preventScroll: true });
}
function closeSheet(back) {
  if (!sheetOpen) return;
  sheetOpen = false; sheet.classList.remove('open'); sheetBg.classList.remove('open'); document.body.classList.remove('sheet-open');
  pillNav.setAttribute('aria-expanded', 'false');
  if (back) pillNav.focus({ preventScroll: true });
}
pillNav.addEventListener('click', () => (sheetOpen ? closeSheet(true) : openSheet()));
sheetBg.addEventListener('click', () => closeSheet(true));
document.getElementById('sheetX').addEventListener('click', () => closeSheet(true));
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(true); return; }
  if (e.key !== 'Tab') return;
  const f = focusables(), i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});
sheetList.addEventListener('click', (e) => {
  const a = e.target.closest('a'); if (!a) return;
  e.preventDefault();
  const t = document.getElementById(a.dataset.sec);
  closeSheet(false);
  scrollTo({ top: Math.round(t.getBoundingClientRect().top + scrollY), behavior: RM ? 'auto' : 'smooth' });
  pillNav.focus({ preventScroll: true });
});

// ---------- main loop ----------
let raf = 0, qa = 0, qj = 0, dirty = true, lastKey = '', curSec = '', fv = 0;

// ---------- globurile live (WebGL): contextul se creează după prima derulare; hărțile: corpul curent → următorul → cel de după ----------
let G = null, gTried = false, spinT = 0, spinLast = 0, texIdxNow = -2;
const staticIm = {};
function globes() {
  if (gTried) return G; gTried = true;
  try { G = createGlobes(SET === 'm'); } catch (e) { console.warn('[globuri]', e); G = null; }
  if (G) G.hooks(() => { dirty = true; if (revealed) req(); });
  return G;
}
function staticOf(key) { // fără WebGL: un cadru static, clar
  let im = staticIm[key];
  if (!im) { im = staticIm[key] = new Image(); im.decoding = 'async'; im.onload = () => { dirty = true; req(); }; im.src = 'media/static/' + key + '-' + SET + '.webp?v=1'; }
  return im.complete && im.naturalWidth ? im : null;
}
// oprirea „curentă” pentru hărți: pe drum spre o planetă contează deja planeta spre care mergem
function texIdx(u) { const g = segAt(u), k = g.type === 'leg' ? g.to.key : g.type === 'tail' ? g.from.key : (g.stop || {}).key; return TEX_ORDER.indexOf(k); }
function texPlan(u) {
  if (!G || !started()) return;
  const i = u > 0 ? texIdx(u) : -1;
  if (i === texIdxNow) return; texIdxNow = i;
  G.plan(i, { jump: i >= 0 && !G.ready(TEX_ORDER[i]) });
}
onFirstMove(() => {
  const go = () => { if (globes()) { texIdxNow = -2; texPlan(qj); G.loadAllMic(); } }; // hărțile mici (~120 KB toate): rezerva pentru un salt direct
  'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300);
});
function req() { if (!raf) raf = requestAnimationFrame(frame); }
function frame() {
  raf = 0;
  const now = performance.now(), dt = spinLast ? Math.min(0.1, (now - spinLast) / 1000) : 0; spinLast = 0;
  let spinning = false;
  const H = innerHeight, W = innerWidth, k = RM ? 1 : 0.13;
  const ta = prog(apusSec), tj = prog(jSec);
  qa += (ta - qa) * k; if (Math.abs(ta - qa) < 0.0002) qa = ta;
  qj += (tj - qj) * k; if (Math.abs(tj - qj) < 0.00005) qj = tj;
  if (qa !== ta || qj !== tj) req();
  barEl.style.transform = 'scaleX(' + clamp(scrollY / (document.documentElement.scrollHeight - H), 0, 1).toFixed(4) + ')';

  // APUS
  if (visible(apusSec)) {
    const [w, h] = fit(apusCv), c = apusCv.getContext('2d', { alpha: false });
    const z = 1 + Math.max(0, (qa - 0.86) / 0.14) * 0.9, pk = pick(F.apus, Math.min(1, qa / 0.86), Math.max(w, h * 16 / 9) * z);
    const key = 'a' + qa.toFixed(4) + w + ':' + fv;
    const fx = 0.5; // cadrele sunt decupate cu Soarele la mijloc (scriptul de randare apus_foto.py, în afara site-ului): pe telefon decupajul rămâne pe el
    if (pk && key !== apusCv._k) { apusCv._k = key; cover(c, pk.a, w, h, z, 1, fx); if (pk.b) cover(c, pk.b, w, h, z, pk.k, fx); if (!apusCv._on) { apusCv._on = 1; apusCv.classList.add('on'); } } // până la primul cadru desenat se vede imaginea de sub canvas
    const kk = RM ? 0 : Math.min(1, qa / 0.3);
    letters.forEach((el, i) => { const d = (i % 2 ? 1 : -1) * (1 + i % 3); el.style.transform = 'translate(' + (d * kk * 18).toFixed(1) + 'px,' + (-kk * (40 + (i * 37) % 160)).toFixed(1) + 'px) rotate(' + (d * kk * 6).toFixed(1) + 'deg)'; el.style.opacity = (1 - kk).toFixed(3); });
    cue.style.opacity = Math.max(0, 1 - qa / 0.06).toFixed(3);
    titleKick.style.opacity = Math.max(0, 1 - kk / 0.5).toFixed(3); // dispare înaintea literelor, ca să nu stea sub textul următor
    panels(apusPnls, qa);
  } else sleep(F.apus);

  // CĂLĂTORIA
  if (!visible(jSec)) { hudUpdate(0, false); loupeUpdate(-1); Object.keys(F).forEach((n) => { if (n !== 'apus') sleep(F[n]); }); } // toate secvențele călătoriei (lista din previzualizare era de dinaintea planetelor noi)
  if (visible(jSec) && ready) {
    const u = qj;
    texPlan(u);
    // ocular
    const e = ease(seg(u, 0, segOf('ocular').b));
    const r0 = Math.min(W, H) * 0.17, r1 = Math.hypot(W, H) / 2 + 10, rad = r0 + (r1 - r0) * e;
    const cp = e >= 0.999 ? 'none' : 'circle(' + rad.toFixed(1) + 'px at 50% 50%)';
    if (lens.style.clipPath !== cp) lens.style.clipPath = cp;
    ring.style.transform = 'scale(' + (rad / 100).toFixed(3) + ')'; ring.style.opacity = (1 - e).toFixed(3);

    panels(jPnls, u);
    const key = u.toFixed(5) + ':' + W + 'x' + H;
    if (key !== lastKey || dirty) {
      lastKey = key; dirty = false;
      if (!PATH || PATH.W !== W || PATH.H !== H) { layoutPanels(W, H); placeAnchors(); }
      const [w, h] = fit(space), c = space.getContext('2d', { alpha: false });
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; // micșorare curată, fără zimți
      const dpr = w / W, cam = camera(u);
      distCheck(u, cam);
      c.fillStyle = '#050409'; c.fillRect(0, 0, w, h);
      moonScr = null;
      // Soarele (și prin ocular): desenat live din imaginea SDO; granulația și protuberanțele se mișcă lent, deci desenăm continuu
      const sunDraw = (cc, x, y, D, al) => {
        const r = G && !G.lost ? G.draw(cc, 'soare', x, y, D, w, h, { alpha: al, time: RM ? 0 : spinT, dot: '#F4B356' }) : false;
        if (r && !RM) spinning = true;
        if (!r && (!G || G.lost)) { const im = staticOf('soare'), S2 = D / (2 * BODIES.soare.fr); if (im) { cc.globalAlpha = al; cc.drawImage(im, x - S2 / 2, y - S2 / 2, S2, S2); cc.globalAlpha = 1; return true; } }
        return r;
      };
      if (cam.scene === 'sun' || cam.scene === 'turn') {
        // SOARELE: prin ocular, mic și strălucitor; apoi mare, în partea lui; apoi camera se întoarce și pornește spre exterior
        const hs = PATH.home(SUN), Rh = PATH.tgt() / 2 * (cam.g.type === 'sun' ? 1 + 0.05 * cam.t : cam.g.type === 'turn' ? 1.05 : 1);
        const R = lerp(r0 * 0.62, Rh, e) * dpr, cx = (W / 2 + hs[0] * e) * dpr, cy = (H / 2 + hs[1] * e) * dpr;
        if (cam.scene === 'sun') { stars(c, w, h, 0, 1); drawSun(c, cx, cy, R, 1, sunDraw); }
        else {
          const p = ease(cam.t), spd = RM ? 0 : Math.sin(Math.PI * cam.t);
          starsPan(c, w, h, p * 0.9, spd, 1 - ease(seg(cam.t, 0.7, 1)));
          stars(c, w, h, 0, ease(seg(cam.t, 0.7, 1)));
          drawSun(c, cx - p * (w * 0.55 + R * 1.6), cy, R, 1 - ease(seg(cam.t, 0.45, 0.9)), sunDraw);
          sunGlow(c, w, h, 0.22 * ease(seg(cam.t, 0.5, 1)));
        }
      } else {
        stars(c, w, h, cam.P[2], 1, -cam.yaw * PATH.f * dpr, -cam.pitch * PATH.f * dpr); // rotirea camerei mută cerul
        sunGlow(c, w, h, 0.22 * 14 / (14 + cam.P[2]));
        const list = BODY.map((B) => ({ B, p: project(B, cam) })).filter((o) => o.p).sort((p, q) => q.p.dist - p.p.dist);
        for (const { B, p } of list) {
          const Dpx = p.D * dpr; if (Dpx > Math.min(w, h) * 14) continue;
          const sx = p.sx * dpr, sy = p.sy * dpr, alpha = p.alpha;
          if (Dpx < 6) { // departe: un punct de lumină care crește
            if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
            c.globalAlpha = alpha * clamp(0.55 + Dpx / 4, 0, 1); c.fillStyle = B.dot; c.beginPath(); c.arc(sx, sy, Math.max(1.3 * dpr, Dpx / 2), 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
            continue;
          }
          if (sx + Dpx < 0 || sx - Dpx > w || sy + Dpx < 0 || sy - Dpx > h) continue;
          if (B.key === 'luna') {
            // Luna: rotație sincronă (mereu aceeași față spre Pământ), doar librația foarte mică; aceeași lumină ca restul
            const lib = libration(spinT);
            const r = G && !G.lost ? G.draw(c, 'luna', sx, sy, Dpx, w, h, { alpha, ang: lib.ang, inc: lib.inc, dot: B.dot }) : false;
            if (r && !RM) spinning = true;
            if (DEBUG && r && p.D >= 80) { const L = DBG.gl || (DBG.gl = {}), k = B.key + ':' + G.level; L[k] = (L[k] || 0) + 1; }
            if (!r && (!G || G.lost)) { const im = staticOf('luna'), S2 = Dpx / (2 * B.fr); if (im) { c.globalAlpha = alpha; c.drawImage(im, sx - S2 / 2, sy - S2 / 2, S2, S2); c.globalAlpha = 1; } }
            moonScr = { x: p.sx, y: p.sy, r: p.D / 2, u, lib };
            continue;
          }
          const V = VIS[B.key], pp = V ? seg(u, V.v0, V.v1) : 0;
          // globul live: rotație continuă în timp + puțin legată de derulare; fără WebGL, un cadru static
          const r = G && !G.lost ? G.draw(c, B.key, sx, sy, Dpx, w, h, { alpha, ang: angleOf(B.key, pp, spinT, RM), cloud: -(BODIES[B.key].cloudSpin || 0) * spinT, dot: B.dot }) : false;
          if (r && (!RM || r === 'anim')) spinning = true;
          if (DEBUG && r && p.D >= 80) { const L = DBG.gl || (DBG.gl = {}), k = B.key + ':' + G.level; L[k] = (L[k] || 0) + 1; } // ?debug: cu ce hartă s-a desenat un glob mare
          if (!r && (!G || G.lost)) { const im = staticOf(B.key), S = Dpx / (2 * B.fr); if (im) { c.globalAlpha = alpha; c.drawImage(im, sx - S / 2, sy - S / 2, S, S); c.globalAlpha = 1; } }
        }
        if (PATH.belt.length) drawBelt(c, cam, w, h, dpr, u);
      }
    }
    loupeUpdate(u);
    const jr = jSec.getBoundingClientRect();
    hudUpdate(u, jr.top <= 1 && jr.bottom >= H - 1 && u > 0.01);
    const st = stopAt(u).key, cr = (G && G.lost ? CRED[st + '_svs'] : '') || CRED[st] || '';
    if (credRender._k !== cr) { credRender._k = cr; credRenderT.innerHTML = cr; }
    credRender.style.opacity = cr ? 1 : 0;
    credGuard(credRender, jPnls);
    const pOn = jr.top <= 1 && jr.bottom >= H - 1 && u > 0.01;
    if (pillNav._on !== pOn) { pillNav._on = pOn; pillNav.classList.toggle('on', pOn); }
  } else if (pillNav._on) { pillNav._on = false; pillNav.classList.remove('on'); }
  if (visible(apusSec)) credGuard(credApus, apusPnls);

  // ceasul (seară fictivă: apus 19:12 → 20:52, drumul 21:00 → 01:00, fără salturi înapoi) + cuprinsul
  let clk;
  if (qj > 0) clk = 21 * 60 + qj * 300; else clk = 19 * 60 + 12 + qa * 100;
  const ct = hm(clk); if (clockEl.textContent !== ct) clockEl.textContent = ct;
  let cur = 'apus';
  if (qj > 0 || jSec.getBoundingClientRect().top <= H * 0.5) cur = stopAt(qj).key;
  if (finSec.getBoundingClientRect().top <= H * 0.5) cur = 'final';
  { const pr = progSec.getBoundingClientRect(); if (pr.top <= H * 0.5 && pr.bottom > H * 0.5) cur = 'program'; }
  { const solid = finSec.getBoundingClientRect().top < 84; if (navEl._s !== solid) { navEl._s = solid; navEl.classList.toggle('solid', solid); } }
  if (cur !== curSec) {
    curSec = cur;
    chapLinks.forEach((a) => { const on = a.dataset.sec === cur; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    chapEl.classList.toggle('off', cur === 'apus');
    const i = ACT.findIndex((s) => s.key === cur), n = i >= 0 ? i + 1 : NSTOP;
    pillT.textContent = i >= 0 ? ACT[i].name : 'Final'; pillN.textContent = n + '/' + NSTOP;
    sheetList.querySelectorAll('a').forEach((a) => { if (a.dataset.sec === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  const ms = ACT.find((s) => s.key === cur);
  chapterNow = cur === 'apus' ? 'pamant' : cur === 'final' ? ACT[ACT.length - 1].music : ms ? ms.music : 'pamant';
  if (music) music.chapter(chapterNow);
  // un glob e pe ecran: rotația merge continuu, deci desenăm și cadrul următor (nu se oprește niciodată)
  if (spinning && revealed && !document.hidden) { spinT += dt; spinLast = now; dirty = true; req(); }
}
addEventListener('scroll', () => { if (revealed) { req(); plan(scrollY, innerHeight); } }, { passive: true });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { dirty = true; apusCv._k = ''; layoutPanels(innerWidth, innerHeight); placeAnchors(); if (revealed) { timeline(); plan(scrollY, innerHeight); } req(); }, 150); });
// video-ul de la final: sursa și posterul se pun abia când finalul e aproape; pornește doar când se vede
const setVid = () => { if (!vid.src) { vid.poster = BASE + 'meteori-poster.webp'; vid.src = BASE + 'meteori.mp4'; } };
if (vid && 'IntersectionObserver' in window) {
  const near = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near.disconnect(); setVid(); } }, { rootMargin: '150% 0px' });
  near.observe(finSec);
  new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !RM) { setVid(); vid.preload = 'auto'; vid.play().catch(() => {}); } else vid.pause(); }), { threshold: 0.15 }).observe(vid);
} else if (vid) setVid();
// cerul din seara asta: sky.js (și astronomy-engine) abia când finalul e aproape
// data din titlul cardului se pune de la început (același text ca în sky.js), ca înălțimea cardului să nu se schimbe când sosește calculul
try { document.getElementById('skyDate').textContent = ('Chișinău · ' + new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Chisinau' }) + ' · ora 21:00').toLocaleUpperCase('ro-RO'); } catch (e) {}
let skyAsked = false;
const askSky = () => { if (skyAsked) return; skyAsked = true; import('./sky.js?v=2026111803').then((m) => m.loadAstronomy()).catch(() => {}); };
if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); askSky(); } }, { rootMargin: '200% 0px' }); io.observe(finSec); } else askSky();
if (DEBUG) window.__obs = { F, stats, G: () => G, moon: () => moonScr, gstats: () => G && G.stats(), spin: () => spinT, relayout: () => { layoutPanels(innerWidth, innerHeight); dirty = true; req(); }, camera, project, segAt, stopAt, SEG, BODY, VIS, DBG, path: () => PATH, vlen, vsub, toCam };
req();

// ---------- cuvinte singure pe rând ----------
(function(){
  function glue(el){
    var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null), nodes=[], n;
    while((n=w.nextNode())) nodes.push(n);
    nodes.forEach(function(t){ t.nodeValue=t.nodeValue.replace(/(^|\s)([a-zăâîșțA-ZĂÂÎȘȚ0-9]{1,2}) (?=\S)/g,'$1$2\u00A0'); });
    for(var i=nodes.length-1;i>=0;i--){ var v=nodes[i].nodeValue, k=v.trimEnd().lastIndexOf(' ');
      if(k>0){ nodes[i].nodeValue=v.slice(0,k)+'\u00A0'+v.slice(k+1); break; }
      if(v.trim()) break; }
  }
  document.querySelectorAll('h1:not([aria-label]),h2,h3,.quote,.lead,.pnl p,.pnl li,.ev p,#program p,footer p,footer li,.sky p').forEach(glue);
})();
