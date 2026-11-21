// Muzica Observatorului (PROMPT-16): „Planetele” de Holst și câteva piese înrudite, din înregistrări cu licență liberă
// (sursele și licențele: subsolul paginii și README). Câte un fragment de 70–105 s pe capitol (media/audio/), făcut să se
// repete fără cusătură (_lucru/randare/muzica.py). Se încarcă doar după clicul pe „Muzică”: la deschidere, 0 KB audio.
// - Web Audio: buclă fără pauză (AudioBufferSourceNode.loop), estompare încrucișată de ~2,5 s între piese;
// - capitolul se schimbă la mijlocul drumului dintre opriri (stopAt din journey.js); o schimbare se aplică abia după 0,6 s
//   (la derulare rapidă înainte-înapoi peste o graniță nu se schimbă de mai multe ori);
// - fiecare piesă se reia de unde a rămas;
// - se descarcă întâi piesa curentă, apoi vecinele (următoarea, cea de dinainte); cel mult 3 piese decodate în memorie.
const ORDER = ['intro', 'soare', 'mercur', 'venus', 'pamant', 'luna', 'marte', 'jupiter', 'saturn', 'uranus', 'neptun'];
export const TITLE = {
  intro: 'Holst — Neptun', soare: 'Grieg — Dimineața', mercur: 'Holst — Mercur', venus: 'Holst — Venus', pamant: 'Satie — Gymnopédie nr. 1',
  luna: 'Debussy — Clair de lune', marte: 'Holst — Marte', jupiter: 'Holst — Jupiter', saturn: 'Holst — Saturn', uranus: 'Holst — Uranus', neptun: 'Holst — Neptun'
};
const FADE = 2.5, VOL = 0.85, KEY = 'observatoriu-muzica', V = 1;

/** btn: butonul „Muzică” · chapter0: capitolul curent · ac: AudioContext creat chiar în clic (iOS) · o: { onTitle, onSwitch } */
export function init(btn, chapter0, ac, o) {
  o = o || {};
  const ext = (() => { try { const a = document.createElement('audio'); return a.canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'm4a'; } catch (e) { return 'm4a'; } })();
  const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  const T = {};   // capitol → { buf, p (descărcarea), pos (secunde), src, g, t0 }
  let on = false, cur = null, want = ORDER.includes(chapter0) ? chapter0 : 'intro', timer = 0, offTimer = 0;
  const slot = (k) => T[k] || (T[k] = { buf: null, p: null, pos: 0, src: null, g: null, t0: 0 });
  // decodeAudioData: forma cu callback merge și în Safari mai vechi
  const decode = (ab) => new Promise((res, rej) => { const r = ac.decodeAudioData(ab, res, rej); if (r && r.then) r.then(res, rej); });
  function load(k) {
    const s = slot(k);
    if (s.buf) return Promise.resolve(s.buf);
    if (!s.p) s.p = fetch('media/audio/' + k + '.' + ext + '?v=' + V).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(decode).then((b) => { s.buf = b; return b; }).catch((e) => { s.p = null; console.warn('[muzică] ' + k + ': ' + e.message); return null; });
    return s.p;
  }
  function start(k) {
    const s = slot(k); if (!s.buf || s.src) return;
    const src = ac.createBufferSource(), g = ac.createGain(), now = ac.currentTime;
    src.buffer = s.buf; src.loop = true; src.connect(g); g.connect(master);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + FADE);
    const off = s.pos % s.buf.duration;
    src.start(now, off); s.src = src; s.g = g; s.t0 = now - off;
  }
  function stop(k) {
    const s = T[k]; if (!s || !s.src) return;
    const now = ac.currentTime, src = s.src, g = s.g;
    s.pos = (now - s.t0) % s.buf.duration;   // de aici se reia
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + FADE);
    src.stop(now + FADE + 0.05); s.src = null; s.g = null;
  }
  function neighbours(k) { const i = ORDER.indexOf(k); return [ORDER[i + 1], ORDER[i - 1]].filter(Boolean); }
  function tidy() {   // în memorie: piesa curentă și vecinele ei (plus cea care încă se stinge)
    const keep = new Set([cur, ...neighbours(cur)]);
    for (const k in T) if (!keep.has(k) && !T[k].src) { T[k].buf = null; T[k].p = null; }
  }
  function switchTo(k) {
    if (k === cur) return;
    if (cur) stop(cur);
    cur = k;
    if (o.onSwitch) o.onSwitch(k);
    if (o.onTitle) o.onTitle(TITLE[k] || '');
    load(k).then(() => { if (on && cur === k) start(k); neighbours(k).reduce((p, n) => p.then(() => load(n)), Promise.resolve()); });
    tidy();
  }
  function chapter(k) {   // app.js o cheamă la fiecare cadru: întârzierea pornește doar când capitolul chiar se schimbă
    if (!ORDER.includes(k) || k === want) return;
    want = k;
    if (!on) return;
    clearTimeout(timer); timer = 0;
    if (k !== cur) timer = setTimeout(() => { timer = 0; if (on && want !== cur) switchTo(want); }, 600);
  }
  async function play() {
    clearTimeout(offTimer);
    try { if (ac.state !== 'running') await ac.resume(); } catch (e) {}
    if (!on) return;
    const now = ac.currentTime;
    master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(VOL, now + 0.8);
    if (cur !== want) switchTo(want); else if (cur && !T[cur].src) load(cur).then(() => { if (on && cur) start(cur); });
  }
  function pause() {   // estompare ~1,2 s, apoi contextul se oprește
    const now = ac.currentTime;
    master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + 1.2);
    clearTimeout(offTimer);
    offTimer = setTimeout(() => { if (cur) { stop(cur); cur = null; } ac.suspend().catch(() => {}); }, 1300);
  }
  function show() { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.classList.remove('armed'); btn.removeAttribute('title'); }
  function save() { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} }
  function toggle() { on = !on; show(); save(); if (on) play(); else pause(); }
  document.addEventListener('visibilitychange', () => {   // fila ascunsă: muzica se oprește; la întoarcere continuă
    if (!on) return;
    if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {});
  });
  // ?debug: înregistrează ce se aude (pentru verificare), câteva secunde, ca WebM
  function record(sec) {
    return new Promise((res) => {
      const dst = ac.createMediaStreamDestination(); master.connect(dst);
      const mr = new MediaRecorder(dst.stream), parts = [];
      mr.ondataavailable = (e) => parts.push(e.data); mr.onstop = () => { master.disconnect(dst); res(new Blob(parts, { type: 'audio/webm' })); };
      mr.start(); setTimeout(() => mr.stop(), sec * 1000);
    });
  }
  return { chapter, toggle, record, state: () => ({ on, cur, want, ext, ctx: ac.state, loaded: Object.keys(T).filter((k) => T[k].buf) }) };
}
