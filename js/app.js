// Tot ce nu ține de primul ecran: camera și desenarea călătoriei, panourile, ceasul, cuprinsul, pastila, contorul, lupa,
// programul și biletul. Se încarcă din main.js cu import(), după primul ecran. Codul e copiat din previzualizare (V10).
// Planetele și Luna ca glob se desenează live, din hărți, cu WebGL (globe.js); restul desenării e neschimbat.
import { SET, BASE, stats, onFirstMove, started } from './frames.js?v=2026112203';
import { createGlobes, angleOf, surfacePoint, BODIES, TEX_ORDER } from './globe.js?v=2026112203';
import { createIntro, introSunR, introSunEnd, introF } from './intro.js?v=2026112203';
import { astro } from './astro.js?v=2026112203';
import { computeProgram, renderProgram, today as progToday } from './program.js?v=2026112203';
import {
  RM, clamp, ease, seg, lerp, fit, cover, drawSky, skyProject, makeDust, mixO, sunGlow, drawSun, drawSunFar, drawBelt,
  STOPS, ACT, SUN, BODY, SEG, TOTAL, segOf, segAt, PATH, buildPath, camera, stopAt, project,
  DEBUG, DBG, distCheck, VIS, measureWindows, mwBegin, mwRange, mwEnd, MW_N, vlen, vsub, toCam
} from './journey.js?v=2026112203';

// ---------- pornirea: pregătim drumul în bucăți mici (între cadre), apoi dispare ecranul de încărcare ----------
let revealed = false, ready = false, startP = null;
const loadEl = document.getElementById('load');
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
    placeAnchors(); ready = true; dirty = true;
    await cssReady(); reveal();
  })();
  return startP;
}
function reveal() {
  if (revealed) return; revealed = true;
  scrollTo(0, 0);
  loadEl.classList.add('out'); document.body.classList.remove('locked');
  setTimeout(() => loadEl.remove(), 1200); req();
  introStart();
  if (/^#program/.test(location.hash)) setTimeout(() => goProgram((location.hash.match(/ev=(\w+)/) || [])[1]), 60); // link direct spre program
}

// ---------- math ----------
function prog(sec) { const b = sec.getBoundingClientRect(), span = b.height - innerHeight; return span > 0 ? clamp(-b.top / span, 0, 1) : 0; }
// o singură scenă (PROMPT-15): primele XA vh din #calatorie sunt apusul și urcarea (qa), restul e drumul (qj, ca înainte)
const XA = 470, AP = 300 / 470;   // apusul + noaptea: 300 vh · urcarea: 170 vh
function progAll() {
  const b = jSec.getBoundingClientRect(), H = innerHeight, off = -b.top, xa = XA * H / 100, js = b.height - xa - H;
  return [clamp(off / xa, 0, 1), js > 0 ? clamp((off - xa) / js, 0, 1) : 0];
}
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
    if (el.hidden) return;   // un cartonaș fără eveniment (program.js) nu ocupă loc în oprire
    const d = el.dataset, k = d.leg ? 'leg:' + d.leg : d.stop + ':' + (d.part || '');
    if (d.at != null) { const B = ACT.find((s) => s.key === d.stop); if (B) d.at = B.side > 0 ? 'l' : 'r'; } // textul stă în partea opusă planetei
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el);
  });
  for (const [k, list] of groups) {
    let A, B;
    if (k.startsWith('leg:')) { const g = segOf('leg', k.slice(4)); A = g.a + PAD; B = g.b - PAD; }
    else if (k === 'soare:') { const g = segOf('sun'); A = g.a + PAD; B = g.b - PAD; }
    else { const V = VIS[k.slice(0, -1)]; if (!V) continue; A = V.a + PAD; B = V.b - PAD; }
    const L = (B - A - GAP * (list.length - 1)) / list.length;
    list.forEach((el, i) => {
      const a = A + i * (L + GAP), b = a + L;
      el.dataset.a = a.toFixed(4); el.dataset.b = b.toFixed(4); el._v = null;
    });
  }
}

// ---------- elements ----------
const jSec = document.getElementById('calatorie'), stage = jSec.querySelector('.stage'), space = document.getElementById('space');
const apusPnls = [...stage.querySelectorAll('.pnl.ip')], jPnls = [...stage.querySelectorAll('.pnl:not(.ip)')];
const credRender = document.getElementById('cred-render'), credRenderT = document.getElementById('cred-render-t');
const CRED = {
  pamant: 'Pământul: randat din hărțile <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/">Blue Marble Next Generation</a> și Blue Marble: Clouds, NASA Earth Observatory, domeniu public',
  luna: 'Luna: randată din harta <a href="https://svs.gsfc.nasa.gov/4720">CGI Moon Kit (LROC), NASA SVS</a>, domeniu public',
  // fără WebGL se văd cadrele statice din animațiile NASA SVS
  pamant_svs: 'Pământul: animație <a href="https://svs.gsfc.nasa.gov/">NASA\'s Scientific Visualization Studio</a>, domeniu public',
  soare: 'Soarele: <a href="https://sdo.gsfc.nasa.gov/">NASA/SDO</a>, HMI și AIA 304, 9 mai 2024, domeniu public',
  saturn: 'Saturn: harta <a href="https://doi.org/10.17909/T9G593">Hubble OPAL, NASA/ESA</a>, CC BY 4.0; inelele: NASA Voyager și Cassini',
  uranus: 'Uranus: randat din harta <a href="https://doi.org/10.17909/T9G593">Hubble OPAL (NASA/ESA, A. Simon)</a>, CC BY 4.0',
  neptun: 'Neptun: randat din harta <a href="https://doi.org/10.17909/T9G593">Hubble OPAL (NASA/ESA, A. Simon)</a>, CC BY 4.0',
  jupiter: 'Jupiter: randat din harta <a href="https://photojournal.jpl.nasa.gov/catalog/PIA07782">Cassini PIA07782, NASA/JPL/SSI</a>, domeniu public',
  venus: 'Venus: randat din imaginile <a href="https://doi.org/10.17597/isas.darts/vco-00016">Akatsuki UVI, JAXA/ISAS</a>, CC BY 4.0',
  mercur: 'Mercur: randat din harta <a href="https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_md3_color_global_mosaic_665m">MESSENGER MDIS, NASA/JHUAPL/Carnegie</a>, domeniu public',
  marte: 'Marte: randat din harta <a href="https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m">Viking MDIM 2.1, NASA/USGS</a>, domeniu public'
};
const clockEl = document.getElementById('clock'), barEl = document.getElementById('bar');
const letters = [...document.querySelectorAll('#title .ltr')], cue = document.getElementById('cue'), titleKick = document.getElementById('titleKick');
const navEl = document.querySelector('.nav'), chapEl = document.querySelector('.chap'), chapLinks = [...chapEl.querySelectorAll('a')];
const credApus = document.getElementById('cred-apus'), finSec = document.getElementById('final'), progSec = document.getElementById('program');
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
  const xa = XA * innerHeight / 100, span = jSec.offsetHeight - innerHeight - xa;
  jSec.querySelectorAll('.anchor').forEach((a) => {
    if (a.id === 'apus') return;
    const p = ACT.some((s) => s.key === a.id) && jPnls.find((el) => el.dataset.stop === a.id);
    const ua = p ? Math.max(0, +p.dataset.a - 0.004) : 0;
    a.style.top = Math.round(xa + ua * span) + 'px';
    if (p) HUD_START[a.id] = ua;
  });
}
const hm = (m) => { m = Math.round(m) % 1440; const h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; };
jSec.style.height = Math.round(XA + TOTAL + 100) + 'vh'; // apusul și urcarea + lungimea drumului (din lista de opriri)

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
// PROMPT-17: căsuța se vede doar cât stăm la o oprire: de la începutul opririi (planeta s-a așezat în locul ei; la Soare,
// oprirea Soarelui) până puțin înainte de plecare (ultimele 7% din oprire). Pe drum, la întoarcere și în urcare nu se vede.
const HUD_END = 0.07;
// începutul: oprirea, sau ancora ei din cuprins dacă e puțin mai devreme (primul panou al planetei, planeta aproape așezată),
// ca după un salt din cuprins căsuța să apară imediat (placeAnchors completează HUD_START)
const HUD_START = {};
function atStop(u) {
  const g = segAt(u);
  if (g.type === 'hold' || g.type === 'sun') return u < g.b - HUD_END * (g.b - g.a);
  return g.type === 'leg' && HUD_START[g.to.key] != null && u >= HUD_START[g.to.key];
}
function hudUpdate(u, on) {
  if (on !== hudOn) { hudOn = on; hudEl.classList.toggle('on', on); }
  if (!on) return;
  const g = segAt(u), dest = g.stop || g.to || ACT[0], au = dest.au;   // valorile opririi curente (Luna: ale Pământului); pe ultimii pași ai drumului, ale opririi spre care mergem
  const a = fmtKm(au * AU_KM), b = lightStr(au * AU_S), c = dest.name, d = 'Oprirea ' + (Math.max(ACT.indexOf(dest), ACT.indexOf(stopAt(u))) + 1) + ' din ' + NSTOP;
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
  { lat: -43.31, lon: -11.36, r: 0.064, n: 'Tycho', d: '85 km lățime, ~108 milioane de ani. Razele lui luminoase se întind pe până la 1.500 km.' },
  { lat: 9.62, lon: -20.08, r: 0.071, n: 'Copernicus', d: '93 km lățime, ~800 de milioane de ani. Se vede și cu un binoclu.' },
  { lat: 32.8, lon: -15.6, r: 0.23, n: 'Mare Imbrium, Marea Ploilor', d: 'O câmpie de lavă de ~1.120 km, într-un bazin lăsat de un impact uriaș.' },
  { lat: 28.0, lon: 17.5, r: 0.16, n: 'Mare Serenitatis, Marea Seninătății', d: '~700 km. La marginea ei de sud-est a aselenizat Apollo 17, în decembrie 1972.' },
  { lat: 0.674, lon: 23.473, r: 0.052, n: 'Apollo 11, Marea Liniștii', d: 'Punctul auriu: aici au coborât primii oameni pe Lună, pe 20 iulie 1969.' },
  { lat: 8.5, lon: 31.4, r: 0.18, n: 'Mare Tranquillitatis, Marea Liniștii', d: '~870 km. Pe marginea ei de sud-vest a aselenizat Apollo 11, în 1969.' }
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
stage.addEventListener('pointerdown', onPtr, { passive: true });
const ptrEnd = (e) => { if (ptr && ptr.touch) { ptr = null; req(); } };
addEventListener('pointerup', ptrEnd); addEventListener('pointercancel', ptrEnd);
document.documentElement.addEventListener('pointerleave', () => { ptr = null; req(); });
stage.addEventListener('contextmenu', (e) => { if (loupeShown) e.preventDefault(); });
// cât lupa e activă, contorul din dreapta-jos se ascunde (lupa și eticheta ei nu stau niciodată peste el)
function loupeHide() {
  if (loupeShown) { loupeShown = false; loupeEl.classList.remove('on'); hudEl.classList.remove('lupa'); stage.style.cursor = ''; }
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
  if (!loupeShown) { loupeShown = true; loupeEl.classList.add('on'); hudEl.classList.add('lupa'); if (!ptr.touch) stage.style.cursor = 'none'; }
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
  const ev = fEv.options[fEv.selectedIndex].dataset.t;
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
const rowsAll = () => [...document.querySelectorAll('.row[data-pick]')], tkE = document.getElementById('tkE'), tkT = document.getElementById('tkT'), goBtn = document.getElementById('goBtn'), fN = document.getElementById('f-n');
function syncTicket() {
  const o = fEv.options[fEv.selectedIndex], v = fEv.value;
  rowsAll().forEach((r) => r.setAttribute('aria-pressed', String(r.dataset.pick === v)));
  if (!v) { tkE.textContent = 'Alege o seară din program'; tkT.textContent = ''; goBtn.textContent = 'Trimite rezervarea'; notch(); return; }
  const price = parseInt(o.dataset.p, 10) || 0, n = parseInt(fN.value, 10) || 1;   // datele serii stau pe opțiune (data-t, data-w, data-p)
  tkE.textContent = o.dataset.t; tkT.textContent = o.dataset.w + ', ' + n + (n === 1 ? ' persoană' : ' persoane');
  goBtn.textContent = 'Rezervă: ' + price * n + ' lei';
  notch();
}
const rzBox = document.querySelector('.rz'), tkBox = document.getElementById('tk');
function notch() { rzBox.style.setProperty('--ny', (tkBox.offsetTop + tkBox.offsetHeight) + 'px'); } // decupajele biletului stau fix pe linia punctată
addEventListener('resize', notch); if (document.fonts) document.fonts.ready.then(notch); notch();
// rândurile vin din program.js, deci clicul se prinde pe listă
document.querySelector('.evs').addEventListener('click', (e) => {
  const r = e.target.closest('.row[data-pick]'); if (!r) return;
  showForm(); fEv.value = r.dataset.pick; if (tried) check('ev'); syncTicket();
  if (innerWidth < 980) { const t = document.querySelector('.rz'); scrollTo({ top: t.getBoundingClientRect().top + scrollY - 84, behavior: RM ? 'auto' : 'smooth' }); fName.focus({ preventScroll: true }); }
});
fEv.addEventListener('change', syncTicket); fN.addEventListener('change', syncTicket);
form.addEventListener('reset', () => setTimeout(syncTicket, 0));
// toate butoanele „Rezervă” duc la program; cele de la un eveniment îl aleg deja în formular
let pendingEv = null;
function goProgram(ev) {
  const known = ev && fEv.querySelector('option[value="' + ev + '"]');
  if (ev && !known && !progDone) { pendingEv = ev; askProgram(); }   // programul încă se calculează: alegerea se face după
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
  + '<li><a href="#final" data-sec="final"><span class="k">' + NSTOP + '</span>Final<i></i></a></li>';
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
let raf = 0, qa = 0, qj = 0, dirty = true, lastKey = '', curSec = '';

// ---------- globurile live (WebGL): contextul se creează după prima derulare; hărțile: corpul curent → următorul → cel de după ----------
let G = null, gTried = false, spinT = 0, spinLast = 0, texIdxNow = -2;
const staticIm = {};
function globes() {
  if (gTried) return G; gTried = true;
  try { G = createGlobes(SET === 'm'); } catch (e) { console.warn('[globuri]', e); G = null; }
  if (G) G.hooks(() => { dirty = true; if (revealed) req(); });
  return G;
}
// intro-ul live: contextul WebGL (cel al globurilor) se creează imediat după afișare; fără WebGL sau cu mișcare redusă
// rămâne imaginea statică (aceeași ca primul cadru)
let intro = null, introT = 0;
function introStart() {
  if (RM) return;
  const go = () => {
    const g = globes(); if (!g) return;
    try { intro = createIntro(g, SET === 'm'); } catch (e) { console.warn('[intro]', e); intro = null; }
    if (intro) intro.hooks(() => req());
  };
  'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 600 }) : setTimeout(go, 100);
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
  if (intro) intro.loadGlobal(); else setTimeout(() => intro && intro.loadGlobal(), 3000);   // harta globală a luminilor: pentru urcare, nu la deschidere
  const go = () => { if (globes()) { texIdxNow = -2; texPlan(qj); G.loadAllMic(); } }; // hărțile mici (~120 KB toate): rezerva pentru un salt direct
  'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300);
});
// ---------- cerul (PROMPT-16): orientările „camerei” la Soare și legătura cu cerul din intro ----------
// La sfârșitul urcării privim cu ~100° la stânga drumului spre Mercur (oA); Soarele e acolo unde îl lasă intro-ul. Apropierea
// rotește încet camera până când Soarele ajunge în partea lui (oH); întoarcerea rotește spre începutul drumului (oL).
// Toate stelele și Soarele se proiectează cu aceeași orientare: se mișcă împreună, ca o panoramă.
let SKYO = null;
const toCamM = (o) => { const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch); return (d) => { const x1 = d[0] * cy - d[2] * sy, z1 = d[0] * sy + d[2] * cy; return [x1, d[1] * cp - z1 * sp, d[1] * sp + z1 * cp]; }; };
const fromCam = (o, c) => { const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch); const y = c[1] * cp + c[2] * sp, z1 = -c[1] * sp + c[2] * cp; return [c[0] * cy + z1 * sy, y, -c[0] * sy + z1 * cy]; };
function skySetup(W, H) {
  const mob = SET === 'm', f = intro ? intro.sunF(W, H) : introF(W, H, mob);
  const cl = camera(segOf('leg', ACT[1].key).a + 1e-6), oL = { yaw: cl.yaw, pitch: cl.pitch };
  const oA = { yaw: oL.yaw - 1.75, pitch: oL.pitch };
  const se = introSunEnd(W, H, mob), v = [(se[0] - W / 2) / f, (se[1] - H / 2) / f, 1], l = Math.hypot(...v);
  const dSun = fromCam(oA, v.map((x) => x / l));
  const hs = PATH.home(SUN), tx = W / 2 + hs[0], ty = H / 2 + hs[1], oH = { yaw: oA.yaw, pitch: oA.pitch };
  for (let i = 0; i < 30; i++) { const p = skyProject(dSun, oH, f, W, H); if (!p) break; oH.yaw += (p[0] - tx) / f * 0.9; oH.pitch += (p[1] - ty) / f * 0.9; }
  // cerul din intro: direcțiile călătoriei → lumea intro-ului, prin camera de la sfârșitul urcării (aceeași imagine la preluare)
  let Q = null;
  if (intro) {
    const B = intro.endBasis(), M = toCamM(oA), col = (e) => { const c = M(e); return [0, 1, 2].map((k) => B.Rt[k] * c[0] - B.Up[k] * c[1] + B.Fw[k] * c[2]); };
    Q = new Float32Array([...col([1, 0, 0]), ...col([0, 1, 0]), ...col([0, 0, 1])]);
  }
  SKYO = { f, oA, oH, oL, dSun, Q, W, H };
}
function skyOf(cam, u) {
  const g = cam.g;
  if (g.type === 'approach') { const R0 = intro ? intro.sunR(innerWidth, innerHeight) : introSunR(innerWidth, innerHeight, SET === 'm'), Rh = PATH.tgt() / 2, Rc = R0 * Math.pow(Rh / R0, ease(cam.t)); return mixO(SKYO.oA, SKYO.oH, ease(clamp((Rc / Rh - 0.12) / 0.6, 0, 1))); }
  if (g.type === 'sun') return SKYO.oH;
  return mixO(SKYO.oH, SKYO.oL, ease(cam.t));   // turn
}
// ---------- praful cosmic: doar în călătorie, din apropierea de Soare încolo; fără el cu mișcare redusă ----------
const DUST = RM ? null : makeDust(SET === 'm' ? 130 : 170), DUSTDBG = /[?&]debug=praf\b/.test(location.search);
let dPrevU = null, dPrevP = null;
function dustStep(c, w, h, dpr, u, cam, o) {
  if (!DUST) return;
  const g = cam.g, du = dPrevU == null ? 0 : u - dPrevU, s = du * TOTAL;   // vh de derulare pe cadru (cu semn)
  let dir = null, wgt = 0;
  if (g.type === 'approach') { dir = SKYO.dSun; wgt = 1; }
  else if (cam.P && dPrevP) { const d = [cam.P[0] - dPrevP[0], cam.P[1] - dPrevP[1], cam.P[2] - dPrevP[2]], l = Math.hypot(...d); if (l > 1e-9) { dir = d.map((x) => x / l * Math.sign(s || 1)); wgt = g.type === 'hold' ? 0.15 : 1; } }
  const jump = Math.abs(s) > 25 || (dPrevP && cam.P && Math.hypot(cam.P[0] - dPrevP[0], cam.P[1] - dPrevP[1], cam.P[2] - dPrevP[2]) > 30);
  DUST.move(dir || [0, 0, 1], dir ? s * wgt : 0, jump);
  dPrevU = u; dPrevP = cam.P ? cam.P.slice() : null;
  const md = dir && s ? dir.map((x) => x * Math.sign(s)) : null;
  DUST.draw(c, w, h, o, SKYO.f * dpr, dpr, md, DUSTDBG);
  if (DUSTDBG) {   // ?debug=praf: vectorii de mișcare ai prafului (×6) și punctul spre care zburăm
    c.save(); c.strokeStyle = '#7FE3FF'; c.lineWidth = 1.5 * dpr; c.globalAlpha = 0.9;
    for (const [x0, y0, x1, y1] of DUST.arrows) { const dx = (x1 - x0) * 6, dy = (y1 - y0) * 6; if (Math.hypot(dx, dy) < 2) continue; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + dx, y0 + dy); c.stroke(); const a = Math.atan2(dy, dx); c.beginPath(); c.moveTo(x0 + dx, y0 + dy); c.lineTo(x0 + dx - 7 * dpr * Math.cos(a - 0.4), y0 + dy - 7 * dpr * Math.sin(a - 0.4)); c.lineTo(x0 + dx - 7 * dpr * Math.cos(a + 0.4), y0 + dy - 7 * dpr * Math.sin(a + 0.4)); c.closePath(); c.fillStyle = '#7FE3FF'; c.fill(); }
    if (DUST.vp) { const [x, y] = DUST.vp; c.strokeStyle = '#FF5A5A'; c.lineWidth = 2 * dpr; c.beginPath(); c.arc(x, y, 12 * dpr, 0, 7); c.moveTo(x - 20 * dpr, y); c.lineTo(x + 20 * dpr, y); c.moveTo(x, y - 20 * dpr); c.lineTo(x, y + 20 * dpr); c.stroke(); }
    c.restore();
  }
}
function req() { if (!raf) raf = requestAnimationFrame(frame); }
function frame() {
  raf = 0;
  const now = performance.now(), dt = spinLast ? Math.min(0.1, (now - spinLast) / 1000) : 0; spinLast = 0;
  let spinning = false, introAnim = false;
  const H = innerHeight, W = innerWidth, k = RM ? 1 : 0.13;
  const [ta, tj] = progAll();
  qa += (ta - qa) * k; if (Math.abs(ta - qa) < 0.0002) qa = ta;
  qj += (tj - qj) * k; if (Math.abs(tj - qj) < 0.00005) qj = tj;
  if (qa !== ta || qj !== tj) req();
  barEl.style.transform = 'scaleX(' + clamp(scrollY / (document.documentElement.scrollHeight - H), 0, 1).toFixed(4) + ')';
  const pa = Math.min(1, qa / AP), ra = clamp((qa - AP) / (1 - AP), 0, 1);   // apusul (0..1) · urcarea (0..1)
  const inJ = qj > 0, live = !!(intro && intro.ready());
  // preluarea: în primele ~20 vh ale drumului, cadrul intro-ului se stinge peste cel al călătoriei (aceeași scenă, același canvas)
  const XJ = 0.003, kI = !live ? 0 : !inJ ? 1 : 1 - ease(clamp(qj / XJ, 0, 1));

  // textele apusului
  {
    // mișcare redusă: literele nu zboară, doar se sting (scena e aceeași până la final, titlul nu are voie să rămână)
    const kk = Math.min(1, pa / 0.3), km = RM ? 0 : kk;
    letters.forEach((el, i) => { const d = (i % 2 ? 1 : -1) * (1 + i % 3); el.style.transform = 'translate(' + (d * km * 18).toFixed(1) + 'px,' + (-km * (40 + (i * 37) % 160)).toFixed(1) + 'px) rotate(' + (d * km * 6).toFixed(1) + 'deg)'; el.style.opacity = (1 - kk).toFixed(3); });
    cue.style.opacity = Math.max(0, 1 - pa / 0.06).toFixed(3);
    titleKick.style.opacity = Math.max(0, 1 - kk / 0.5).toFixed(3); // dispare înaintea literelor, ca să nu stea sub textul următor
    panels(apusPnls, qa);
  }
  // canvasul: cu intro live se vede de la primul cadru desenat; fără el (fără WebGL, mișcare redusă), imaginea statică se
  // estompează în cadrul călătoriei spre sfârșitul urcării (aceeași scenă, fără graniță)
  const op = live && space._live ? 1 : inJ ? 1 : (ready ? ease(seg(ra, 0.55, 1)) : 0);
  if (space._op !== op) { space._op = op; space.style.opacity = op.toFixed(3); }

  // CĂLĂTORIA (și preluarea)
  if (!visible(jSec)) { hudUpdate(0, false); loupeUpdate(-1); }
  if (visible(jSec) && ready) {
    const u = qj;
    if (inJ) texPlan(u);
    const drawJ = inJ || (!live && ra > 0.5);
    const [w, h] = fit(space), c = space.getContext('2d', { alpha: false });
    if (kI > 0) {
      // intro-ul (apus, noapte, urcare): desenat continuu (Pământul „curge”); peste călătorie în timpul preluării
      if (drawJ && kI < 1) dirty = true;
      else if (live) {
        if (PATH && (!SKYO || SKYO.W !== W || SKYO.H !== H || (intro && !SKYO.Q))) skySetup(W, H);
        if (intro.draw(c, w, h, pa, introT, { a: ra, sky: SKYO && SKYO.Q })) { if (!space._live) { space._live = 1; space._op = -1; } if (!RM && !document.hidden) introAnim = true; }
      }
    }
    panels(jPnls, u);
    const key = u.toFixed(5) + ':' + W + 'x' + H;
    if (drawJ && (key !== lastKey || dirty)) {
      lastKey = key; dirty = false;
      if (!PATH || PATH.W !== W || PATH.H !== H) { layoutPanels(W, H); placeAnchors(); }
      if (!SKYO || SKYO.W !== W || SKYO.H !== H || (intro && !SKYO.Q)) skySetup(W, H);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; // micșorare curată, fără zimți
      const dpr = w / W, cam = camera(u);
      distCheck(u, cam);
      c.fillStyle = '#050409'; c.fillRect(0, 0, w, h);
      moonScr = null;
      // Soarele (și prin ocular): desenat live din imaginea SDO; granulația și protuberanțele se mișcă lent, deci desenăm continuu
      const sunDraw = (cc, x, y, D, al) => {
        const r = G && !G.lost ? G.draw(cc, 'soare', x, y, D, w, h, { alpha: al, time: RM ? 0 : spinT, ang: angleOf('soare', seg(u, segOf('sun').a, segOf('turn').b), spinT, RM), dot: '#F4B356' }) : false;
        if (r && !RM) spinning = true;
        if (!r && (!G || G.lost)) { const im = staticOf('soare'), S2 = D / (2 * BODIES.soare.fr); if (im) { cc.globalAlpha = al; cc.drawImage(im, x - S2 / 2, y - S2 / 2, S2, S2); cc.globalAlpha = 1; return true; } }
        return r;
      };
      if (cam.scene === 'sun' || cam.scene === 'turn') {
        // SOARELE, o oprire ca planetele: de departe un disc alb cu strălucire (exact cât era la sfârșitul urcării), care crește
        // și alunecă în partea lui; de aproape globul live (SDO); apoi camera trece pe lângă el și pornește spre Mercur
        const hs = PATH.home(SUN), Rh = PATH.tgt() / 2 * (cam.g.type === 'sun' ? 1 + 0.05 * cam.t : cam.g.type === 'turn' ? 1.05 : 1);
        const so = skyOf(cam, u), fS = SKYO.f * dpr;   // aceeași sferă cerească: orientarea „camerei” la Soare
        drawSky(c, w, h, so, fS, 1, SET === 'm');
        if (cam.g.type === 'approach') {
          const g = ease(cam.t), R0 = intro ? intro.sunR(W, H) : introSunR(W, H, SET === 'm');
          const Rc = R0 * Math.pow(Rh / R0, g), sp = skyProject(SKYO.dSun, so, SKYO.f, W, H) || [W / 2, H / 2];
          drawSunFar(c, sp[0] * dpr, sp[1] * dpr, Rc * dpr, R0 * dpr, Rc, sunDraw, SKYO.f * dpr);
        } else {
          const R = Rh * dpr, sp = skyProject(SKYO.dSun, so, SKYO.f, W, H);
          if (cam.scene === 'sun') { if (sp) drawSun(c, sp[0] * dpr, sp[1] * dpr, R, 1, sunDraw); }
          else {
            // întoarcerea spre Mercur: cerul și Soarele se rotesc împreună (aceeași proiecție); Soarele iese prin stânga
            if (sp) drawSun(c, sp[0] * dpr, sp[1] * dpr, R, 1 - ease(seg(cam.t, 0.55, 0.95)), sunDraw);
            sunGlow(c, w, h, 0.22 * ease(seg(cam.t, 0.5, 1)));
          }
        }
        dustStep(c, w, h, dpr, u, cam, so);
      } else {
        drawSky(c, w, h, cam, SKYO.f * dpr, 1, SET === 'm');   // stelele: doar orientarea camerei (infinit de departe)
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
        dustStep(c, w, h, dpr, u, cam, cam);
      }
    }
    if (drawJ && live && kI > 0 && kI < 1) { if (intro.draw(c, w, h, pa, introT, { a: ra, alpha: kI, sky: SKYO && SKYO.Q })) introAnim = true; }
    loupeUpdate(u);
    const jr = jSec.getBoundingClientRect();
    hudUpdate(u, jr.top <= 1 && jr.bottom >= H - 1 && atStop(u));
    const st = stopAt(u).key, cr = (G && G.lost ? CRED[st + '_svs'] : '') || CRED[st] || '';
    if (credRender._k !== cr) { credRender._k = cr; credRenderT.innerHTML = cr; }
    credRender.style.opacity = cr && inJ ? 1 : 0;
    credGuard(credRender, jPnls);
    const pOn = jr.top <= 1 && jr.bottom >= H - 1 && u > 0.01;
    if (pillNav._on !== pOn) { pillNav._on = pOn; pillNav.classList.toggle('on', pOn); }
  } else if (pillNav._on) { pillNav._on = false; pillNav.classList.remove('on'); }
  { const co = qa < 0.98 ? '' : '0'; if (credApus.style.opacity !== co) credApus.style.opacity = co; }
  if (qa < 0.98) credGuard(credApus, apusPnls);

  // ceasul (seară fictivă: apus 19:12 → 21:00, drumul 21:00 → 02:00, fără salturi) + cuprinsul
  let clk;
  if (qj > 0) clk = 21 * 60 + qj * 300; else clk = 19 * 60 + 12 + qa * 108;   // apus 19:12 → 21:00 (sfârșitul urcării), fără salt
  const ct = hm(clk); if (clockEl.textContent !== ct) clockEl.textContent = ct;
  let cur = 'apus';
  if (qj > 0) cur = stopAt(qj).key;
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
  // un glob e pe ecran: rotația merge continuu, deci desenăm și cadrul următor (nu se oprește niciodată)
  if (introAnim && revealed) { introT += dt; spinLast = now; req(); }
  if (spinning && revealed && !document.hidden) { spinT += dt; spinLast = now; dirty = true; req(); }
}
addEventListener('scroll', () => { if (revealed) req(); }, { passive: true });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { dirty = true; layoutPanels(innerWidth, innerHeight); placeAnchors(); req(); }, 150); });
// video-ul de la final: sursa și posterul se pun abia când finalul e aproape; pornește doar când se vede
const setVid = () => { if (!vid.src) { vid.poster = BASE + 'meteori-poster.webp'; vid.src = BASE + 'meteori.mp4'; } };
if (vid && 'IntersectionObserver' in window) {
  const near = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near.disconnect(); setVid(); } }, { rootMargin: '150% 0px' });
  near.observe(finSec);
  new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !RM) { setVid(); vid.preload = 'auto'; vid.play().catch(() => {}); } else vid.pause(); }), { threshold: 0.15 }).observe(vid);
} else if (vid) setVid();
// cerul din seara asta: sky.js (și astronomy-engine) abia când finalul e aproape
// data din titlul cardului se pune de la început (același text ca în sky.js), ca înălțimea cardului să nu se schimbe când sosește calculul
try { document.getElementById('skyDate').textContent = 'Chișinău, ' + new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Chisinau' }) + ', ora 21:00'; } catch (e) {}
// ---------- programul: calculat din data de azi (program.js), după prima derulare; Astronomy Engine se încarcă atunci ----------
let progP = null, progDone = false;
function askProgram() {
  if (!progP) progP = astro().then(async (A) => {
    const evs = computeProgram(A, progToday());
    const moved = renderProgram(evs); progDone = true;
    syncTicket();
    if (pendingEv) { const ev = pendingEv; pendingEv = null; goProgram(ev); }
    if (moved) { await steps(layoutSteps(innerWidth, innerHeight)); placeAnchors(); dirty = true; req(); }   // planeta serii s-a mutat la oprirea ei
    if (DEBUG) window.__prog = evs;
  }).catch((e) => {
    const l = document.querySelector('.evs'); l.removeAttribute('aria-busy');
    l.innerHTML = '<li class="nojs">Programul nu s-a putut calcula. Reîncarcă pagina.</li>';
    if (DEBUG) console.warn(e);
  });
  return progP;
}
onFirstMove(askProgram);
if (/^#program/.test(location.hash)) askProgram();
let skyAsked = false;
const askSky = () => { if (skyAsked) return; skyAsked = true; import('./sky.js?v=2026112203').then((m) => m.loadAstronomy()).catch(() => {}); };
if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); askSky(); askProgram(); } }, { rootMargin: '200% 0px' }); io.observe(finSec); } else { askSky(); askProgram(); }
if (DEBUG) window.__obs = { q: () => [qa, qj], skyAt: (u) => { const cam = camera(u); return cam.scene === 'space' ? { yaw: cam.yaw, pitch: cam.pitch, P: cam.P } : Object.assign({ P: null }, skyOf(cam, u)); }, sky: () => SKYO, skyProject, stats, intro: () => intro && intro.info(), G: () => G, moon: () => moonScr, gstats: () => G && G.stats(), spin: () => spinT, relayout: () => { layoutPanels(innerWidth, innerHeight); dirty = true; req(); }, camera, project, segAt, stopAt, SEG, BODY, VIS, DBG, path: () => PATH, vlen, vsub, toCam };
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
