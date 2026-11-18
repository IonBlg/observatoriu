// Melodia Observatorului (compusă în cod, fără fișiere audio). Se încarcă doar la primul clic pe „Muzică”.
export function init(btn, chapter0) {
  const P = {
    soare:  { tr: 10, cut: 3800, arp: [4, -1, -1, 2, -1, 3, -1, -1], dens: .7, bell: 'sine', bass: 0, bpm: 54 }, // luminoasă, fără bas, clopoței rari
    pamant: { tr: 0,  cut: 1500, arp: [0, 2, 1, 3, 2, 1, 3, 4], dens: 1,   bell: 'triangle', bass: 1,   bpm: 60 },
    luna:   { tr: 5,  cut: 2600, arp: [3, -1, 2, -1, 4, -1, 1, -1], dens: .55, bell: 'sine', bass: 0, bpm: 52 },
    marte:  { tr: -4, cut: 700,  arp: [0, -1, 1, -1, 0, 2, -1, 1], dens: .8,  bell: 'triangle', bass: 1.3, bpm: 50 },
    mercur: { tr: 7,  cut: 3600, arp: [0, 1, 2, 3, 4, 3, 2, 1], dens: 1,   bell: 'sine', bass: .6,  bpm: 72 },
    venus:  { tr: 3,  cut: 1900, arp: [2, -1, 3, -1, 1, -1, 4, -1], dens: .65, bell: 'sine', bass: 0, bpm: 56, fb: .45 },     // caldă, învăluită, fără bas
    jupiter:{ tr: -7, cut: 1250, arp: [0, 2, 1, 3, 0, 2, 4, 3], dens: .9, bell: 'triangle', bass: 1.7, bpm: 62, fb: .32 }, // amplă, bas puternic
    saturn: { tr: -2, cut: 2300, arp: [4, -1, -1, -1, 2, -1, -1, -1], dens: .9, bell: 'sine', bass: .5, bpm: 48, fb: .62 }, // solemnă, clopoței rari, ecou lung
    uranus: { tr: 12, cut: 4300, arp: [4, -1, -1, 3, -1, -1, -1, -1], dens: .55, bell: 'sine', bass: 0, bpm: 46, fb: .45 },  // rece, sus, rară
    neptun: { tr: 9,  cut: 2200, arp: [3, -1, -1, -1, -1, 1, -1, -1], dens: .45, bell: 'sine', bass: 0, bpm: 40, fb: .5, vol: .7 } // cea mai liniștită
  };
  // Re minor: Dm9 – B♭maj7 – Fmaj7 – C6 (note MIDI)
  const CH = [[50, 57, 60, 64, 65], [46, 53, 57, 62, 65], [41, 53, 57, 60, 64], [48, 55, 57, 60, 64]];
  const VOL = 0.42, KEY = 'observatoriu-muzica';
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let ac = null, nodes = null, cur = 'pamant', want = 'pamant', timer = null, nextT = 0, step = 0, on = false, offTimer = 0;
  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const out = ac.createGain(); out.gain.value = 0;
    // reverberație: impuls generat (zgomot care se stinge în 4 s)
    const len = ac.sampleRate * 4, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const rev = ac.createConvolver(); rev.buffer = ir; const wet = ac.createGain(); wet.gain.value = .55;
    const dry = ac.createGain(); dry.gain.value = .7;
    const padF = ac.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 1500; padF.Q.value = .7;
    const dl = ac.createDelay(3); dl.delayTime.value = .75; const fb = ac.createGain(); fb.gain.value = .38; const dlf = ac.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2200;
    dl.connect(dlf); dlf.connect(fb); fb.connect(dl);
    const bus = ac.createGain();
    padF.connect(bus); dl.connect(bus);
    bus.connect(dry); bus.connect(rev); rev.connect(wet); dry.connect(out); wet.connect(out);
    out.connect(ac.destination);
    nodes = { out, padF, dl, bus, fb };
  }
  function note(f, t, dur, type, vol, dest, att, rel) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0, t + dur, rel);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + rel * 6);
    return o;
  }
  function glide(p, t, tc) { nodes.padF.frequency.setTargetAtTime(P[p].cut, t, tc); nodes.dl.delayTime.setTargetAtTime(60 / P[p].bpm * .75, t, tc / 2); nodes.fb.gain.setTargetAtTime(P[p].fb || .38, t, tc); }
  function schedule() {
    while (nextT < ac.currentTime + 0.4) {
      const inBar = step % 8;
      if (inBar === 0 && want !== cur) { cur = want; glide(cur, nextT, 1.2); } // capitol nou: pe acordul următor
      const s = P[cur], beat = 60 / s.bpm, eighth = beat / 2;
      const bar = Math.floor(step / 8) % 4, chord = CH[bar].map((m) => m + s.tr);
      if (inBar === 0) { // acord nou: pad + bas
        chord.slice(0, 4).forEach((m) => { [-.07, .07].forEach((dt) => note(mtof(m) * (1 + dt / 100), nextT, beat * 4 - .2, 'sawtooth', .018 * (s.vol || 1), nodes.padF, 1.6, .9)); });
        if (s.bass) note(mtof(chord[0] - 12), nextT, beat * 3.6, 'sine', .16 * s.bass, nodes.bus, .3, .6);
      }
      const idx = s.arp[inBar];
      if (idx >= 0 && Math.random() < s.dens) { // clopoței (o octavă mai sus) + ecou
        const f = mtof(chord[idx % chord.length] + 12 + (inBar === 7 && cur === 'mercur' ? 12 : 0));
        const g = ac.createGain(); g.gain.value = 1; g.connect(nodes.bus); g.connect(nodes.dl);
        note(f, nextT, .05, s.bell, .07 * (s.vol || 1), g, .005, .45); note(f * 2, nextT, .03, 'sine', .018 * (s.vol || 1), g, .003, .25);
      }
      nextT += eighth; step++;
    }
  }
  function setPlanet(p) { if (!P[p]) p = 'pamant'; want = p; if (!timer) cur = p; }
  function startMusic() { if (timer) return; nextT = ac.currentTime + .1; step = 0; timer = setInterval(schedule, 100); schedule(); }
  function stopMusic() { clearInterval(timer); timer = null; }
  async function play() {
    clearTimeout(offTimer);
    if (!ac) build();
    if (ac.state === 'suspended') await ac.resume();
    if (!on) return; // oprită între timp
    if (!timer) { cur = want; glide(cur, ac.currentTime, 0.01); }
    startMusic();
    nodes.out.gain.cancelScheduledValues(ac.currentTime);
    nodes.out.gain.setTargetAtTime(VOL, ac.currentTime, .6);
  }
  function fadeOut(then) { // estompare de ~1,5 s
    if (!ac) return;
    nodes.out.gain.cancelScheduledValues(ac.currentTime);
    nodes.out.gain.setTargetAtTime(0, ac.currentTime, .35);
    clearTimeout(offTimer);
    offTimer = setTimeout(() => { stopMusic(); ac.suspend().catch(() => {}); if (then) then(); }, 1600);
  }
  function show() {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.remove('armed'); btn.removeAttribute('title');
  }
  function save() { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} }
  function toggle() { // clicul pe „Muzică” (îl primește main.js)
    on = !on; show(); save();
    if (on) play(); else fadeOut();
  }
  document.addEventListener('visibilitychange', () => {
    if (!on || !ac) return;
    if (document.hidden) { clearTimeout(offTimer); stopMusic(); nodes.out.gain.cancelScheduledValues(ac.currentTime); nodes.out.gain.setValueAtTime(0, ac.currentTime); ac.suspend().catch(() => {}); }
    else play();
  });
  setPlanet(chapter0);
  return { chapter: setPlanet, toggle, state: () => ({ on, playing: !!timer, cur, want, ctx: ac && ac.state }) };
}
