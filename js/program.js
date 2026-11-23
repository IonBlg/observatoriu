// Programul: cele 5 seri se calculează în browser din data de azi (fusul Europe/Chisinau), cu Astronomy Engine.
// Aceleași date ajung în lista din #program, în opțiunile formularului (bilet) și în cartonașele din călătorie.
// Zile deschise: marți–duminică (ca în „Fișa locului”). Niciun eveniment luni și niciunul în trecut.
// Verificare: ?debug&azi=2027-03-10 (sau 2027-03-10T21:30) calculează programul ca și cum azi ar fi data aceea.

export const TZ = 'Europe/Chisinau';
const OBS = { lat: 47.0105, lon: 28.8638, h: 85 };   // Chișinău, ca în sky.js
const WINDOW = 35;                                     // ~5 săptămâni, în zile
const DAY = 864e5;

// ---------- zile civile (număr de zile de la 1970-01-01, în calendarul local) și ore la Chișinău ----------
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const LUNI3 = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
function parts(t) { const p = {}; fmt.formatToParts(t).forEach((x) => { p[x.type] = +x.value; }); p.hour %= 24; return p; }
const dayOf = (t) => { const p = parts(t); return Date.UTC(p.year, p.month - 1, p.day) / DAY; };
const ymd = (d) => { const t = new Date(d * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay() }; };
const dayYMD = (y, m, d) => Date.UTC(y, m - 1, d) / DAY;
function at(d, hh, mm = 0) {   // ziua civilă d, ora hh:mm la Chișinău → Date (cu ora de vară corectă)
  const g = d * DAY + (hh * 60 + mm) * 6e4;
  const off = (t) => { const p = parts(new Date(t)); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; };
  let t = g - off(g); t = g - off(t); return new Date(t);
}
const open = (d) => ymd(d).w !== 1;   // luni închis

// ---------- regulile ----------
// ploile de stele: maximul din calendarul IMO, https://www.imo.net/resources/calendar/ (noaptea zilei X spre X+1)
const SHOWERS = [
  { n: 'Quadrantide', m: 1, d: 3, ds: 'Până la ~80 de stele căzătoare pe oră pe un cer perfect, dar maximul ține doar câteva ore.' },
  { n: 'Lyride', m: 4, d: 22, ds: 'Până la ~18 stele căzătoare pe oră pe un cer perfect, din praful cometei Thatcher.' },
  { n: 'Eta Aquaride', m: 5, d: 5, ds: 'Praf din cometa Halley. La noi radiantul răsare târziu, deci vedem ~10 pe oră, spre dimineață.' },
  { n: 'Perseide', m: 8, d: 12, ds: 'Până la ~100 de stele căzătoare pe oră pe un cer perfect, din praful cometei Swift-Tuttle.' },
  { n: 'Orionide', m: 10, d: 21, ds: 'Până la ~20 de stele căzătoare pe oră pe un cer perfect, din praful cometei Halley.' },
  { n: 'Geminide', m: 12, d: 13, ds: 'Până la ~150 de stele căzătoare pe oră pe un cer perfect, din praful asteroidului Phaethon.' }
];
// planeta serii: un text pentru fiecare, adevărat în orice an
const PLANETS = [
  { key: 'jupiter', n: 'Jupiter', b: 'Jupiter', ds: 'La telescop se văd benzile de nori și cei patru sateliți mari, care își schimbă locul de la o seară la alta.' },
  { key: 'saturn', n: 'Saturn', b: 'Saturn', ds: 'Se văd inelele și Titan. Cât de deschise par inelele depinde de an: o dată la ~15 ani stau cu muchia spre noi.' },
  { key: 'marte', n: 'Marte', b: 'Mars', ds: 'Un disc mic, portocaliu. Când e aproape de noi, la telescop se vede și calota polară albă.' },
  { key: 'venus', n: 'Venus', b: 'Venus', ds: 'Venus are faze, ca Luna: la telescop o vezi ca semilună sau aproape rotundă, după poziția ei față de Soare.' }
];
const DIR = ['N', 'NE', 'E', 'SE', 'S', 'SV', 'V', 'NV'];

export function computeProgram(A, now) {
  const obs = new A.Observer(OBS.lat, OBS.lon, OBS.h), today = dayOf(now), last = today + WINDOW;
  const future = (d, hh, mm) => at(d, hh, mm) > now;
  const evs = [];
  const evening = new Set();   // seri ocupate de un eveniment de seară (de la 19:00)
  const add = (e) => { e.start = at(e.day, e.hh, e.mm || 0); evs.push(e); if (e.hh >= 19) evening.add(e.day); return e; };
  // seara deschisă cea mai apropiată de un moment astronomic: ziua lui, sau ±1 zi dacă e luni
  const nearOpen = (t, hh) => {
    const d = dayOf(t);
    if (open(d)) return d;
    return [d - 1, d + 1].filter(open).sort((a, b) => Math.abs(at(a, hh) - t) - Math.abs(at(b, hh) - t))[0];
  };
  // Luna plină: seara deschisă cea mai apropiată de momentul exact (după miezul nopții, deci, seara de dinainte)
  const closestOpen = (t, hh) => {
    const d = dayOf(t);
    return [d - 2, d - 1, d, d + 1, d + 2].filter(open).sort((a, b) => Math.abs(at(a, hh) - t) - Math.abs(at(b, hh) - t))[0];
  };
  const nextQuarter = (q, hh) => {   // următorul pătrar q (1 = primul, 2 = Luna plină) a cărui seară nu a trecut
    let mq = A.SearchMoonQuarter(new Date(now - 3 * DAY));
    for (let i = 0; i < 12; i++, mq = A.NextMoonQuarter(mq)) {
      if (mq.quarter !== q) continue;
      const t = mq.time.date, d = q === 2 ? closestOpen(t, hh) : nearOpen(t, hh);
      if (future(d, hh)) return { d, t };
    }
    return null;
  };
  // 1. Luna la primul pătrar, 20:00, 2 ore
  const fq = nextQuarter(1, 20);
  add({ key: 'patrar', title: 'Luna la primul pătrar', day: fq.d, hh: 20, dur: 120, price: 120, astro: fq.t,
    ds: 'Cea mai bună seară pentru cratere: la granița dintre zi și noapte, umbrele lor sunt cele mai lungi.' });
  // 2. ploaia de stele (următorul maxim), sau Luna plină dacă maximul e la peste ~5 săptămâni
  let sh = null;
  for (let k = 0; k < 2 * SHOWERS.length && !sh; k++) {
    const y = ymd(today).y + Math.floor(k / SHOWERS.length), s = SHOWERS[k % SHOWERS.length];
    let d = dayYMD(y, s.m, s.d);
    if (!open(d)) d -= 1;   // noaptea X e luni: o ținem duminică, în noaptea dinainte
    if (future(d, 23)) sh = { s, d };
  }
  if (sh && sh.d <= last) {
    const ill = A.Illumination(A.Body.Moon, at(sh.d + 1, 0)).phase_fraction, p = Math.round(ill * 100);
    const moon = 'În noaptea aceea Luna e luminată ' + p + '%.' + (ill <= 0.35 ? ' Cerul rămâne întunecat.' : ill >= 0.75 ? ' Lumina ei le ascunde pe cele slabe.' : '');
    add({ key: 'ploaia', title: 'Ploaia de stele ' + sh.s.n, day: sh.d, hh: 23, dur: 180, price: 90, night: true, ill, shower: sh.s.n, ds: sh.s.ds + ' ' + moon });
  } else {
    const fm = nextQuarter(2, 21);
    add({ key: 'plina', title: 'Luna plină la telescop', day: fm.d, hh: 21, dur: 60, price: 90, astro: fm.t,
      ds: 'Prea luminoasă pentru cratere, dar perfectă pentru mări și pentru razele lungi din jurul craterului Tycho.' });
  }
  // 3. Drumul spre Lună (copii): următoarea sâmbătă, 17:00
  let d = today; while (ymd(d).w !== 6 || !future(d, 17)) d++;
  add({ key: 'copii', title: 'Drumul spre Lună', day: d, hh: 17, dur: 45, price: 70,
    ds: 'Spectacol sub cupolă pentru copii de la 6 ani: cum au ajuns oamenii pe Lună și cum se doarme în rachetă.' });
  // 4. Planeta serii: prima seară liberă în care una dintre Jupiter, Saturn, Marte, Venus e la peste 25° la 21:00.
  //    Dacă în toată fereastra nu e niciuna (vara, când planetele răsar târziu), aceeași regulă la 22:00, apoi la 23:00.
  const best = (day, hh) => {
    const t = at(day, hh); let b = null;
    for (const P of PLANETS) {
      const eq = A.Equator(A.Body[P.b], t, obs, true, true), h = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
      if (!b || h.altitude > b.alt) b = { P, alt: h.altitude, az: h.azimuth };
    }
    return b;
  };
  let pick = null;
  for (const hh of [21, 22, 23]) {
    for (let day = today; day <= last && !pick; day++) {
      if (!open(day) || evening.has(day) || !future(day, hh)) continue;
      const b = best(day, hh);
      if (b.alt >= 25) pick = { day, hh, b };
    }
    if (pick) break;
  }
  if (pick) {
    const { P, alt, az } = pick.b, h = String(pick.hh) + ':00';
    add({ key: 'serii', title: 'Planeta serii: ' + P.n, planet: P.key, day: pick.day, hh: pick.hh, dur: 60, price: 80, alt,
      ds: P.ds + ' La ' + h + ' e la ' + Math.round(alt) + '°, spre ' + DIR[Math.round(az / 45) % 8] + '.' });
  } else {
    // nicio planetă la 25° nici la 23:00, în toate cele 5 săptămâni (de obicei iulie–august): în locul observării,
    // un spectacol sub cupolă, în prima seară liberă (fără nicio promisiune despre cerul de afară)
    let day = today; while (!open(day) || evening.has(day) || !future(day, 21)) day++;
    add({ key: 'cupola', title: 'Planetele sub cupolă', day, hh: 21, dur: 60, price: 80,
      ds: 'Zilele astea planetele stau prea jos seara pentru telescop, așa că le vedem sub cupolă, cu constelațiile serii.' });
  }
  // 5. Planeta roșie (spectacol sub cupolă): următoarea vineri sau sâmbătă cu seara liberă, 19:00
  d = today; while (!([5, 6].includes(ymd(d).w) && !evening.has(d) && future(d, 19))) d++;
  add({ key: 'marte', title: 'Planeta roșie', day: d, hh: 19, dur: 50, price: 90,
    ds: 'Spectacol sub cupolă despre roboții care explorează Marte chiar acum.' });
  evs.sort((a, b) => a.start - b.start);
  evs.forEach((e) => Object.assign(e, labels(e)));
  return evs;
}

// ---------- texte ----------
const durTxt = (m) => m === 60 ? 'o oră' : m % 60 === 0 ? m / 60 + ' ore' : m + ' de minute';
const durShort = (m) => m >= 120 ? m / 60 + ' ore' : m + ' min';
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const hm = (e) => String(e.hh).padStart(2, '0') + ':' + String(e.mm || 0).padStart(2, '0');
function labels(e) {
  const a = ymd(e.day), b = ymd(e.day + 1), z = ZILE[a.w], dm = a.d + ' ' + LUNI[a.m - 1];
  const dm2 = a.m === b.m ? a.d + ' spre ' + b.d + ' ' + LUNI[b.m - 1] : dm + ' spre ' + b.d + ' ' + LUNI[b.m - 1];
  if (e.night) return {
    card: 'Noaptea de ' + z + ', ' + dm2 + ', ' + hm(e) + '. Durează ' + durTxt(e.dur) + '.',
    when: 'Noaptea de ' + dm2 + ', ' + hm(e), num: a.d, mon: LUNI3[a.m - 1], wd: z, tm: hm(e) + ', noaptea spre ' + b.d + ', ' + durShort(e.dur)
  };
  return {
    card: cap(z) + ', ' + dm + ', ' + hm(e) + '. Durează ' + durTxt(e.dur) + '.',
    when: cap(z) + ' ' + dm + ', ' + hm(e), num: a.d, mon: LUNI3[a.m - 1], wd: z, tm: hm(e) + ', ' + durShort(e.dur)
  };
}

// ---------- „azi”: data reală sau, doar cu ?debug, cea din ?azi= ----------
export function today() {
  const q = new URLSearchParams(location.search), a = q.get('azi');
  if (q.has('debug') && a) {
    const m = a.match(/^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?$/);
    if (m) return at(dayYMD(+m[1], +m[2], +m[3]), m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  }
  return new Date();
}

// ---------- afișarea: lista, formularul, cartonașele din călătorie ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function renderProgram(evs) {
  const list = document.querySelector('.evs');
  list.innerHTML = evs.map((e) => '<li><button type="button" class="row" data-pick="' + e.key + '" aria-pressed="false">'
    + '<span class="dt"><b>' + e.num + '</b><i>' + e.mon + '</i><small>' + e.wd + '</small></span>'
    + '<span class="tx"><span class="tm">' + esc(e.tm) + '</span><span class="tt">' + esc(e.title) + '</span><span class="ds">' + esc(e.ds) + '</span></span>'
    + '<span class="pr">' + e.price + ' lei<em>Alege</em></span></button></li>').join('');
  list.removeAttribute('aria-busy');
  const sel = document.getElementById('f-ev'), keep = sel.value;
  sel.querySelectorAll('option[value]:not([value=""])').forEach((o) => o.remove());
  evs.forEach((e) => {
    const o = document.createElement('option');
    o.value = e.key; o.dataset.t = e.title; o.dataset.w = e.when; o.dataset.p = e.price;
    o.textContent = e.title + ', ' + e.when.replace(/^./, (c) => c.toLowerCase()) + ', ' + e.price + ' lei';
    sel.appendChild(o);
  });
  if (keep && sel.querySelector('option[value="' + keep + '"]')) sel.value = keep;
  // cartonașele din călătorie (Luna: primul pătrar și copiii; Marte: Planeta roșie; planeta serii la oprirea planetei ei)
  let moved = false;
  document.querySelectorAll('article.ev[data-card]').forEach((c) => {
    const e = evs.find((x) => x.key === c.dataset.card);
    if (!e) { c.hidden = true; moved = true; return; }
    c.querySelector('.ev-d').textContent = e.card;
    c.querySelector('h3').textContent = e.title;
    c.querySelector('.ev-p').textContent = e.ds;
    c.querySelector('.ev-pr').textContent = e.price + ' lei';
    if (e.planet && c.dataset.stop !== e.planet) {
      const all = [...document.querySelectorAll('#calatorie .pnl[data-stop="' + e.planet + '"]')], after = all[all.length - 1];
      c.dataset.stop = e.planet;
      if (after) after.after(c);
      moved = true;
    }
  });
  return moved;
}
