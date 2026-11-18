// Pornirea: ecranul de încărcare și primele 24 de cadre din apus. Restul site-ului (app.js, cu journey.js)
// se încarcă abia după aceea, cu import(), ca să nu stea în calea primului ecran.
import { SEQ, F, boot, hasBM, bake } from './frames.js?v=2026111803';

// stilurile complete (style.css) abia după primul cadru afișat: primul ecran folosește CSS-ul critic din <head>
requestAnimationFrame(() => setTimeout(() => {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/style.css?v=2026111803'; document.head.appendChild(l);
}, 0));

const N_BOOT = 8; // PROMPT-12: primele 8 din cele 70 de fotografii (~11% din apus; o fotografie are ~90 KB, nu ~8 KB ca un cadru video)
let stopped = false, appP = null;
{ const el = document.getElementById('nfr'); if (el) el.textContent = Object.values(SEQ).reduce((a, n) => a + n, 0).toLocaleString('ro-RO'); }
const pctEl = document.getElementById('pct'), arc = document.getElementById('arc');
function progress(p) {
  if (pctEl) pctEl.textContent = Math.round(p * 100);
  if (arc) arc.style.strokeDashoffset = (389.6 * (1 - p)).toFixed(1);
}
function missing() {
  const t = document.getElementById('ltext');
  if (t) { t.innerHTML = 'NU GĂSESC CADRELE.<br>Reîncarcă pagina.'; t.style.textAlign = 'center'; t.style.lineHeight = '1.8'; t.style.color = '#F2C48D'; }
  stopped = true;
}
function startApp() {
  if (stopped) return;
  if (!appP) appP = import('./app.js?v=2026111803').then((a) => a.start(progress));
  return appP;
}
boot(N_BOOT, (k, n) => progress(0.9 * k / n)).then(async (ok) => {
  if (ok < N_BOOT / 2) return missing();
  const im = F.apus.imgs[0]; // primul cadru decodat înainte de apariție
  if (im && hasBM && !F.apus.bm.has(0)) { try { F.apus.bm.set(0, await bake(im)); } catch (e) {} }
  startApp();
});
setTimeout(startApp, 30000);
