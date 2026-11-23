// PROMPT-19: așezarea textelor cu fontul titlurilor (titluri, citate, intro, cartonașe).
// balance(): alege rupturile de rând doar la spațiile obișnuite (grupurile .l, cu white-space:nowrap, și spațiile fixe nu
// se rup), astfel încât: fiecare rând are cel puțin 2 cuvinte, ultimul rând nu e mai lung decât cel de deasupra (cel mult
// 5% în plus), rândurile sunt cât mai egale, fără „scară” care crește în jos, și sunt cât mai puține. Rupturile alese
// devin <br> (textul rămâne același); se refac la fiecare redimensionare și când sosesc fonturile.
// Dacă nu există nicio așezare bună la mărimea dată, textul se micșorează puțin (cel mult până la minScale).
// fitTitle(): mărimea titlului, ca cel mai lung grup .l să încapă în lățimea dată (cel mult `base`).

const wraps = (el) => { const w = getComputedStyle(el).whiteSpace; return w === 'normal' || w === 'pre-wrap' || w === 'pre-line'; };
const setFs = (el, px) => el.style.setProperty('font-size', px.toFixed(2) + 'px', 'important');

// textul original (fără <br>); dacă altcineva a schimbat textul între timp (program.js), noul text devine originalul
export function restore(el) {
  if (el.__fs0 == null) el.__fs0 = el.style.getPropertyValue('font-size');   // mărimea scrisă în HTML (citatele)
  if (el.__fs0) el.style.fontSize = el.__fs0; else el.style.removeProperty('font-size');
  if (el.__src != null && el.__set && el.textContent === el.__done) el.innerHTML = el.__src;
  else el.__src = el.innerHTML;
  el.__set = false; el.style.whiteSpace = '';
}

function measure(el) {
  // punctele de rupere: spațiile obișnuite dintr-un context care se poate rupe, cu text de o parte și de alta
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), marks = []; let n, flat = '';
  while ((n = w.nextNode())) {
    if (!n.parentElement.getClientRects().length) continue;
    const ok = wraps(n.parentElement), s = n.nodeValue;
    for (let i = 0; i < s.length; i++) { if (ok && s[i] === ' ') marks.push({ n, i, at: flat.length }); flat += s[i]; }
  }
  // unitățile dintre rupturi (fără cele goale: spații repetate, spații la capete)
  const cuts = [-1, ...marks.map((m) => m.at), flat.length];
  const units = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const t = flat.slice(cuts[k] + 1, cuts[k + 1]);
    if (!t.trim()) continue;
    units.push({ t, words: t.trim().split(/[\s ]+/).length, before: k > 0 ? marks[k - 1] : null, after: k < marks.length ? marks[k] : null });
  }
  if (!units.length) return null;
  // lățimile: totul pe un singur rând, apoi pozițiile spațiilor
  el.style.whiteSpace = 'nowrap';
  const rg = document.createRange(), box = (m) => { rg.setStart(m.n, m.i); rg.setEnd(m.n, m.i + 1); return rg.getBoundingClientRect(); };
  rg.selectNodeContents(el); const all = rg.getBoundingClientRect();
  units.forEach((u, k) => { u.l = k === 0 || !u.before ? all.left : box(u.before).right; u.r = k === units.length - 1 || !u.after ? all.right : box(u.after).left; });
  el.style.whiteSpace = '';
  return units;
}

function search(units, box, maxLines) {
  const k = units.length, total = units.reduce((s, u) => s + u.words, 0);
  const W = (a, b) => units[b].r - units[a].l, words = (a, b) => { let s = 0; for (let i = a; i <= b; i++) s += units[i].words; return s; };
  const min2 = total >= 2;
  for (let n = 1; n <= Math.min(k, maxLines); n++) {
    let bestS = Infinity, best = null;
    const ws = [], br = [];
    const done = () => {
      const M = Math.max(...ws); let s = 0;
      for (let i = 0; i < ws.length; i++) { s += (M - ws[i]) ** 2; if (i && ws[i] > ws[i - 1]) s += 3 * (ws[i] - ws[i - 1]) ** 2; }
      if (s < bestS) { bestS = s; best = br.slice(); }
    };
    const rec = (a, line) => {
      if (line === n - 1) {
        const w = W(a, k - 1); if (w > box) return; if (min2 && words(a, k - 1) < 2) return;
        if (ws.length && w > 1.05 * ws[ws.length - 1]) return;
        ws.push(w); done(); ws.pop(); return;
      }
      for (let e = a; e <= k - 1 - (n - 1 - line); e++) {
        const w = W(a, e); if (w > box) break;
        if (min2 && words(a, e) < 2) continue;
        ws.push(w); br.push(e); rec(e + 1, line + 1); ws.pop(); br.pop();
      }
    };
    rec(0, 0);
    if (best) return { n, br: best };
  }
  return null;
}

/** Așază textul el în lățimea box (px): cel mult maxLines rânduri. Întoarce numărul de rânduri (0 = n-a reușit). */
export function balance(el, box, maxLines = 8, minScale = 0.8) {
  restore(el);
  return place(el, box, maxLines, minScale, parseFloat(getComputedStyle(el).fontSize));
}
function place(el, box, maxLines, minScale, fs0) {
  for (let sc = 1; sc >= minScale - 1e-6; sc -= 0.04) {
    if (sc < 1) setFs(el, fs0 * sc);
    const units = measure(el); if (!units) return 0;
    const r = search(units, box - 0.5, maxLines);
    if (!r) continue;
    // <br> la rupturile alese (de la coadă spre început, ca pozițiile să rămână valabile)
    const ms = r.br.map((e) => units[e].after).filter(Boolean).reverse();
    for (const m of ms) { const rest = m.n.splitText(m.i); rest.nodeValue = rest.nodeValue.slice(1); rest.parentNode.insertBefore(document.createElement('br'), rest); }
    el.style.whiteSpace = 'nowrap'; el.__set = true; el.__done = el.textContent;
    return r.n;
  }
  if (fs0) setFs(el, fs0);   // nicio așezare bună: rămâne așezarea browserului (text-wrap:balance)
  return 0;
}

/** Titlul: mărimea (≤ base) la care cel mai lung grup .l încape în avail; rândurile au cel mult capEm em; apoi rupturile. */
export function fitTitle(el, avail, base, maxLines, capEm = Infinity) {
  restore(el);
  const gs = [...el.querySelectorAll('.l')], widest = () => Math.max(...(gs.length ? gs : [el]).map((g) => g.getBoundingClientRect().width));
  let fs = base; setFs(el, fs);
  for (let i = 0; i < 4; i++) { const w = widest(); if (w <= avail - 1) break; fs = fs * (avail - 1) / w * 0.997; setFs(el, fs); }
  place(el, Math.min(avail, capEm * fs), maxLines, 0.9, fs);
  return parseFloat(el.style.fontSize);
}
