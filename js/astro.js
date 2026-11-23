// Astronomy Engine (MIT), încărcată o singură dată, la nevoie: o folosesc programul (program.js) și cerul din seara asta (sky.js).
let P = null;
export function astro() {
  if (!P) P = new Promise((res, rej) => {
    if (window.Astronomy) return res(window.Astronomy);
    const s = document.createElement('script');
    s.src = 'js/vendor/astronomy.browser.min.js';
    s.onload = () => (window.Astronomy ? res(window.Astronomy) : rej(new Error('Astronomy lipsă')));
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return P;
}
