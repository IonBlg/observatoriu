// Pornirea: ecranul de încărcare așteaptă doar imaginea statică a apusului (LCP, randată de shaderul intro-ului).
// Restul site-ului (app.js, cu journey.js, globe.js și intro.js) se încarcă abia după aceea, cu import(), ca să nu stea
// în calea primului ecran. WebGL pornește după ce pagina se afișează și preia imaginea fără salt (același cadru la 0%).

// stilurile complete (style.css) abia după primul cadru afișat: primul ecran folosește CSS-ul critic din <head>
requestAnimationFrame(() => setTimeout(() => {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/style.css?v=2026112203'; document.head.appendChild(l);
}, 0));

let appP = null;
const pctEl = document.getElementById('pct'), arc = document.getElementById('arc');
function progress(p) {
  if (pctEl) pctEl.textContent = Math.round(p * 100);
  if (arc) arc.style.strokeDashoffset = (389.6 * (1 - p)).toFixed(1);
}
function startApp() {
  if (!appP) appP = import('./app.js?v=2026112203').then((a) => a.start(progress));
  return appP;
}
const lcp = document.querySelector('#apus .lcp');
progress(0.3);
// app.js (și modulele lui) abia după primul cadru afișat, ca să nu intre în drumul critic al primei afișări
const go = () => { progress(0.9); requestAnimationFrame(() => setTimeout(startApp, 0)); };
if (!lcp || (lcp.complete && lcp.naturalWidth)) go();
else { lcp.addEventListener('load', go, { once: true }); lcp.addEventListener('error', go, { once: true }); }
setTimeout(startApp, 8000);
