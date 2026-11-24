// Cerul din seara asta (Chișinău, ora 21:00), cu astronomy-engine. Se încarcă după ecranul de încărcare.
import { astro } from './astro.js?v=2026112421';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// ---------- calcule astronomice: astronomy-engine, încărcată local după ecranul de încărcare ----------
const AU = 149597870.7, C_KM_S = 299792.458;
let AST = null;
export function loadAstronomy() {
  astro().then((A) => { AST = A; try { runSky(); } catch (e) { skyFail(); } }).catch(skyFail);
}
// ---------- 1. cerul din seara asta (Chișinău, ora 21:00) ----------
const TZ = 'Europe/Chisinau';
function tzParts(d) { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d).forEach((x) => { p[x.type] = +x.value; }); return p; }
function tzOffset(d) { const p = tzParts(d); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000; }
function chisinauAt(hour) { // ora dată, în ziua de azi, la Chișinău
  const p = tzParts(new Date()), g = Date.UTC(p.year, p.month - 1, p.day, hour, 0, 0);
  let t = g - tzOffset(new Date(g)); t = g - tzOffset(new Date(t)); return new Date(t);
}
function phaseName(deg) {
  if (deg < 10 || deg >= 350) return 'Lună nouă'; if (deg < 80) return 'Lună în creștere'; if (deg < 100) return 'Primul pătrar';
  if (deg < 170) return 'Aproape plină'; if (deg < 190) return 'Lună plină'; if (deg < 260) return 'Lună în descreștere';
  if (deg < 280) return 'Ultimul pătrar'; return 'Semilună în descreștere';
}
function drawPhase(deg) {
  const c = document.getElementById('phaseCv').getContext('2d'), R = 72, cx = 84, cy = 84; c.clearRect(0, 0, 168, 168);
  const k = Math.cos(deg * Math.PI / 180); // 1 = nouă, -1 = plină
  c.fillStyle = '#1A1720'; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
  const waxing = deg < 180, lit = '#EDE3D3', dark = '#1A1720';
  c.fillStyle = lit; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !waxing); c.closePath(); c.fill();
  c.fillStyle = k > 0 ? dark : lit; c.beginPath(); c.ellipse(cx, cy, Math.abs(k) * R + 0.5, R, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(243,233,220,.25)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
}
function skyFail() {
  document.getElementById('phaseName').textContent = 'Cerul nu s-a putut calcula';
  document.getElementById('phaseInfo').textContent = 'Reîncarcă pagina ca să vezi faza Lunii și planetele de diseară.';
}
function runSky() {
  const A = AST, obs = new A.Observer(47.0105, 28.8638, 85), t = chisinauAt(21);
  document.getElementById('skyDate').textContent = 'Chișinău, ' + t.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }) + ', ora 21:00';
  const deg = A.MoonPhase(t), ill = A.Illumination(A.Body.Moon, t).phase_fraction;
  document.getElementById('phaseName').textContent = phaseName(deg); drawPhase(deg);
  const rise = A.SearchRiseSet(A.Body.Moon, obs, +1, chisinauAt(0), 1);
  const hm2 = (d) => d.date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  document.getElementById('phaseInfo').textContent = Math.round(ill * 100) + '% luminată, ' + (rise ? 'răsare la ' + hm2(rise) : 'azi nu răsare');
  const list = [['Luna', A.Body.Moon], ['Mercur', A.Body.Mercury], ['Venus', A.Body.Venus], ['Marte', A.Body.Mars], ['Jupiter', A.Body.Jupiter], ['Saturn', A.Body.Saturn]];
  document.getElementById('planetRows').innerHTML = list.map(([n, b]) => {
    const eq = A.Equator(b, t, obs, true, true), h = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
    const alt = h.altitude, up = alt > 5, w = up ? clamp(alt / 90 * 100, 0, 100) : 0; // sub 5° nu se vede practic (clădiri, ceață)
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SV', 'V', 'NV'][Math.round(h.azimuth / 45) % 8];
    return '<div class="row"><span>' + n + '</span><div class="alt" aria-hidden="true"><i style="width:' + w.toFixed(0) + '%"></i></div><span class="pill' + (up ? ' ok' : '') + '">' + (up ? 'vizibil, ' + dir + ', ' + alt.toFixed(0) + '°' : 'sub orizont') + '</span></div>';
  }).join('');
}
