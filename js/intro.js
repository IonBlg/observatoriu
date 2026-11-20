// Intro (PROMPT-14): un apus văzut de pe orbită, randat live în WebGL2, în contextul globurilor (globe.js).
// Camera stă la 400 km deasupra Mării Chinei de Est și privește spre vest-nord-vest, spre orizont.
// - Pământul: harta Blue Marble și norii (aceleași ca la globul Pământului), luminile orașelor din NASA Black Marble 2016;
// - atmosfera: împrăștiere simplă Rayleigh + Mie, cu absorbția ozonului. O tabelă mică (LUT, 192 × 512) ține lumina împrăștiată
//   și transmisia pentru fiecare direcție (înălțimea față de limb × unghiul față de Soare); se recalculează doar când
//   Soarele se mișcă. Pasul pe tot ecranul doar citește din ea, deci e ieftin;
// - Soarele: disc cu întunecare spre margine și strălucire în trei straturi; e tăiat de Pământ și se înroșește prin atmosferă;
// - stelele: aceleași ca în restul călătoriei (STARS din journey.js, desenate la fel), apar după apus.
// Camera „cover”: cadrul de referință (1920 × 1080 pe calculator, 1000 × 1500 pe telefon) se decupează ca o imagine cu
// object-fit: cover, deci imaginea statică (LCP, randată de același shader) și desenul live se potrivesc la orice ecran.
import { STARS } from './journey.js?v=2026112001';

const RAD = Math.PI / 180;
// ---------- Pământul și atmosfera (km) ----------
const R = 6371, HCAM = 400, RC = R + HCAM, RA = R + 100;
const DIP = Math.acos(R / RC);                       // cât de jos e orizontul văzut de pe orbită (~19,8°)
const HR = 8, HM = 1.2;                              // înălțimile de scară Rayleigh și Mie
const BR = [5.802e-3, 13.558e-3, 33.1e-3], BMS = 3.996e-3, BME = 4.44e-3, BO = [0.65e-3, 1.881e-3, 0.085e-3], OZK = 1.875;
const SUNR = 0.2666 * RAD;                           // raza unghiulară a Soarelui
// ---------- locul și cadrul ----------
const GEO = { lat: 29.0, lon: 128.0, head: 283 };   // sub cameră: Marea Chinei de Est; privim spre 283° (VNV), spre Shanghai
// harta luminilor e regională (noapte_textura.py): longitudine 102°…134°E, latitudine 18°…40°N
const NIGHT = [102, 134, 18, 40];
export const REF = {
  d: { W: 1920, H: 1080, f: 1321, sx: 0.62, ly: 0.52 },   // FOV orizontal 72°; Soarele la 62% din lățime, limbul la 52% din înălțime
  m: { W: 1000, H: 1500, f: 680, sx: 0.50, ly: 0.34 }     // telefon (2:3): Soarele la mijloc, limbul la 34%
};
// înălțimea Soarelui deasupra limbului (grade) după derulare: 0 % deasupra · ~60 % atinge limbul · ~75 % a apus · 100 % noapte
const SUNPATH = [[0, 6.5], [0.6, 0.45], [0.75, -0.3], [1, -4.5]];
export function sunElev(p) {
  p = Math.min(1, Math.max(0, p));
  for (let i = 1; i < SUNPATH.length; i++) {
    const [a, ea] = SUNPATH[i - 1], [b, eb] = SUNPATH[i];
    if (p <= b) { const t = (p - a) / (b - a); return ea + (eb - ea) * t; }
  }
  return SUNPATH[SUNPATH.length - 1][1];
}
// stația „curge” foarte încet spre est (Pământul se mută spre orizont): 140 km pe toată derularea + ~0,6 km/s la început, tot mai încet
export const drift = (p, t) => 140 * p + 250 * (1 - Math.exp(-t / 400));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- shaderele ----------
const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const COMMON = `
const float R = ${R.toFixed(1)}, RC = ${RC.toFixed(1)}, RA = ${RA.toFixed(1)}, HR = ${HR.toFixed(2)}, HM = ${HM.toFixed(2)};
const vec3 BR = vec3(${BR.map((x) => x.toExponential(4)).join(',')});
const float BMS = ${BMS.toExponential(4)}, BME = ${BME.toExponential(4)};
const vec3 BO = vec3(${BO.map((x) => x.toExponential(4)).join(',')});
const float OZK = ${OZK.toFixed(3)}, SUNR = ${SUNR.toExponential(5)}, PI = 3.14159265359;
const float DIP = ${DIP.toFixed(7)}, DA = ${(-1.5 * RAD).toFixed(7)}, DT = ${(2.8 * RAD).toFixed(7)}, DLOW = ${((90 - DIP / RAD - 1.5) * RAD).toFixed(7)}, VK = 0.28;
// coloana de aer (km × densitate) de la raza r spre direcția cu cos(zenit) = mu, pentru un strat exponențial cu scara H
// (aproximarea Chapman; sub orizont: identitatea cu punctul tangent)
float colDens(float r, float mu, float H) {
  float alt = r - R, c = sqrt(1.5707963 * r / H);
  if (mu >= 0.0) return H * exp(-alt / H) * c / ((c - 1.0) * mu + 1.0);
  float r0 = r * sqrt(max(0.0, 1.0 - mu * mu));
  float d0 = exp(min(40.0, -(r0 - R) / H));
  return H * (2.0 * sqrt(1.5707963 * r0 / H) * d0 - exp(-alt / H) * c / ((c - 1.0) * (-mu) + 1.0));
}
// transmisia luminii Soarelui până la raza r (umbra Pământului cu penumbră de mărimea discului)
vec3 sunT(float r, float mu) {
  float muh = -sqrt(max(0.0, 1.0 - (R * R) / (r * r)));
  float vis = smoothstep(muh - SUNR, muh + SUNR, mu);
  if (vis <= 0.0) return vec3(0.0);
  float nR = colDens(r, mu, HR), nM = colDens(r, mu, HM);
  return exp(-(BR * nR + BME * nM + BO * OZK * nR)) * vis;
}
// rândul tabelei ↔ unghiul față de limb (d, radiani): des lângă limb (-1,5° … 2,8°), rar spre nadir
float dOfV(float v) { return v >= VK ? DA + (v - VK) / (1.0 - VK) * (DT - DA) : DA - pow((VK - v) / VK, 2.0) * DLOW; }
float vOfD(float d) { return d >= DA ? VK + (d - DA) / (DT - DA) * (1.0 - VK) : VK - sqrt(clamp((DA - d) / DLOW, 0.0, 1.0)) * VK; }
`;

// tabela: pentru fiecare direcție (d = unghiul față de limb, phi = unghiul în azimut față de Soare): lumina împrăștiată și transmisia
const FS_LUT = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec3 uSun;     // direcția Soarelui (azimut 0 = +z)
layout(location = 0) out vec4 oS;
layout(location = 1) out vec4 oT;
${COMMON}
const int N = 12;      // pași pe fiecare jumătate a razei (deși lângă punctul cel mai jos)
void main() {
  vec2 q = gl_FragCoord.xy / uSize;
  float s = q.x, phi = PI * s * s, e = dOfV(q.y) - DIP;
  vec3 V = vec3(sin(phi) * cos(e), sin(e), cos(phi) * cos(e)), C = vec3(0.0, RC, 0.0);
  float b = dot(C, V), disc = b * b - (RC * RC - RA * RA);
  if (disc <= 0.0) { oS = vec4(0.0); oT = vec4(1.0); return; }
  float t0 = -b - sqrt(disc), t1 = -b + sqrt(disc);
  float dg = b * b - (RC * RC - R * R);
  if (dg > 0.0) t1 = min(t1, -b - sqrt(dg));
  float tc = clamp(-b, t0, t1);
  float mu = dot(V, uSun), mu2 = mu * mu;
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu2);
  const float g = 0.8;
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu2)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 S = vec3(0.0), Tv = vec3(1.0);
  for (int h = 0; h < 2; h++) {
    float L = h == 0 ? tc - t0 : t1 - tc;
    if (L <= 0.0) continue;
    for (int k = 0; k < N; k++) {
      float sm = (float(k) + 0.5) / float(N);
      float t = h == 0 ? tc - L * (1.0 - sm) * (1.0 - sm) : tc + L * sm * sm;
      float dt = 2.0 * L * (h == 0 ? 1.0 - sm : sm) / float(N);
      vec3 P = C + V * t; float r = length(P), alt = r - R;
      float rR = exp(-alt / HR), rM = exp(-alt / HM), rO = max(0.0, 1.0 - abs(alt - 25.0) / 15.0);
      vec3 dtau = (BR * rR + BME * rM + BO * rO) * dt;
      vec3 Tm = Tv * exp(-0.5 * dtau);
      S += Tm * sunT(r, dot(P, uSun) / r) * (BR * rR * pR + BMS * rM * pM) * dt;
      Tv *= exp(-dtau);
    }
  }
  oS = vec4(ENC == 1 ? S / (1.0 + S) : S, 1.0); oT = vec4(Tv, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform vec4 uVP;              // viewportul (x, y, w, h) în pixelii canvasului WebGL
uniform vec2 uC;               // centrul optic (pixeli, din stânga-sus)
uniform float uF;              // distanța focală (pixeli)
uniform vec3 uRt, uUp, uFw;    // baza camerei (lume: y în sus, Soarele spre +z)
uniform vec3 uSun; uniform vec2 uSunH;
uniform mat3 uGeo;             // lume → coordonatele Pământului (x: 0°/0°, y: 0°/90°E, z: polul nord)
uniform vec3 uGlow;            // culoarea strălucirii (transmisia până la Soare × cât din disc se vede)
uniform vec2 uSunPx;           // poziția Soarelui pe ecran (pixeli), pentru strălucire
uniform float uExpo, uLights, uStars, uTime, uDisk, uFlat;   // uFlat: turtirea discului prin refracție, lângă limb
uniform sampler2D uLutS, uLutT, uDay, uCloud, uNight, uStarT;
uniform vec2 uNightSz;
uniform vec4 uNightBox;        // regiunea hărții luminilor: lon0, lon1, lat0, lat1 (grade)
out vec4 o;
${COMMON}
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
vec3 lin(vec3 c) { return c * c * (0.3 + 0.7 * c); }   // sRGB → liniar (aproximare ieftină)
void main() {
  vec2 px = vec2(gl_FragCoord.x - uVP.x, uVP.y + uVP.w - gl_FragCoord.y);
  vec3 V = normalize(uFw * uF + uRt * (px.x - uC.x) - uUp * (px.y - uC.y));
  // tabela atmosferei
  float e = asin(clamp(V.y, -1.0, 1.0));
  vec2 hz = V.xz / max(length(V.xz), 1e-6);
  float phi = acos(clamp(dot(hz, uSunH), -1.0, 1.0));
  vec2 luv = vec2(sqrt(phi / PI), vOfD(e + DIP));
  vec3 S = texture(uLutS, luv).rgb, T = texture(uLutT, luv).rgb;
  if (ENC == 1) S = S / max(1.0 - S, 1e-3);
  // marginea Pământului, netedă pe un pixel (unghiul față de nadir comparat cu raza unghiulară a Pământului)
  float a = acos(clamp(-V.y, -1.0, 1.0)), aL = ${(Math.PI / 2 - DIP).toFixed(7)};
  float cov = clamp((aL - a) / max(fwidth(a), 1e-6) + 0.5, 0.0, 1.0);
  vec3 col = S, sky = vec3(0.0), gnd = vec3(0.0);
  if (cov > 0.0) {
    vec3 C = vec3(0.0, RC, 0.0);
    float b = dot(C, V), dg = max(0.0, b * b - (RC * RC - R * R));
    vec3 P = C + V * (-b - sqrt(dg)), n = normalize(P);
    vec3 g = uGeo * n;
    vec2 uv = vec2(atan(g.y, g.x) / (2.0 * PI) + 0.5, 0.5 - asin(clamp(g.z, -1.0, 1.0)) / PI);
    float mu = dot(n, uSun);
    vec4 day = texture(uDay, uv);
    float cl = texture(uCloud, uv).r;
    vec3 Ts = sunT(R + 0.01, mu);
    // ziua: albedoul (harta e deja „încețoșată”, ca globul), norii albi; amurgul: lumina cerului, albăstruie, care se stinge
    vec3 alb = mix(lin(day.rgb) * 0.9, vec3(0.62), cl * 0.92);
    vec3 amb = vec3(0.020, 0.032, 0.060) * smoothstep(-0.16, 0.04, mu);
    vec3 surf = alb * (Ts * max(mu, 0.0) * 1.15 + amb);
    // luciul Soarelui pe apă (masca de apă e în alfa), sub nori
    vec3 Hh = normalize(uSun - V);
    surf += Ts * pow(max(dot(n, Hh), 0.0), 600.0) * 6.0 * day.a * (1.0 - cl);
    // luminile orașelor: apar după apus (Soarele sub -3°…-10° în locul acela), pe sub nori; o strălucire moale în jurul lor
    vec2 nuv = vec2((degrees(atan(g.y, g.x)) - uNightBox.x) / (uNightBox.y - uNightBox.x), (uNightBox.w - degrees(asin(clamp(g.z, -1.0, 1.0)))) / (uNightBox.w - uNightBox.z));
    float Ln = texture(uNight, nuv).r, Lg = textureLod(uNight, nuv, 4.0).r;
    float L = Ln * Ln + Lg * Lg * 0.5;
    // la mărire mare (lângă cameră), un pixel al hărții se „sparge” în puncte mai mici, ca orașele adevărate
    vec2 tq = nuv * uNightSz; float mag = 1.0 / max(length(fwidth(tq)), 1e-4);
    float sp = vn(tq * 3.1) * 0.6 + vn(tq * 7.3 + 9.0) * 0.4;
    L *= mix(1.0, 0.35 + 1.3 * sp * sp, smoothstep(2.5, 6.0, mag));
    float night = smoothstep(-0.05, -0.17, mu);
    surf += vec3(1.0, 0.70, 0.40) * L * night * (1.0 - 0.85 * cl) * uLights * 0.11;
    surf += vec3(1.0, 0.78, 0.55) * Lg * Lg * cl * night * uLights * 0.02;   // norii luminați de jos, de oraș
    surf += vec3(0.00025, 0.00032, 0.0006);                                  // noaptea: nu chiar negru
    gnd = surf;
  }
  // cerul: discul Soarelui (întunecare spre margine), stelele se pun după
  // (în coordonate locale: azimut × înălțime; lângă limb, refracția turtește discul pe verticală)
  float eS = asin(uSun.y), dEl = e - eS, dAz = atan(V.x, V.z) * cos(e);
  float rr = length(vec2(dAz, dEl * uFlat)) / SUNR;
  if (rr < 1.6) {
    float pw = max(fwidth(rr), 1e-4), edge = 1.0 - smoothstep(1.0 - pw, 1.0 + pw, rr);
    float ld = 1.0 - 0.62 * (1.0 - sqrt(max(0.0, 1.0 - min(rr, 1.0) * min(rr, 1.0))));
    sky += vec3(1.0, 0.97, 0.92) * ld * edge * uDisk;
  }
  col += T * mix(sky, gnd, cov);
  // strălucirea Soarelui (bloom ieftin: trei straturi, în pixeli raportați la distanța focală, deci la fel la orice mărime)
  float dpx = length(px - uSunPx) / uF;
  col += uGlow * (1.3 * exp(-dpx / 0.0035) + 0.16 * exp(-dpx / 0.012) + 0.010 * exp(-dpx / 0.045));
  vec3 m = 1.0 - exp(-col * uExpo);
  m = pow(m, vec3(1.0 / 2.2));
  m = mix(m, m * m * (3.0 - 2.0 * m), 0.35);                 // puțin contrast: negru mai adânc, dunga mai vie
  // stelele (aceeași textură ca la călătorie), stinse de atmosferă și ascunse de Pământ
  float st = texelFetch(uStarT, ivec2(px), 0).r * uStars * (1.0 - cov) * dot(T, vec3(0.3, 0.5, 0.2));
  m += st * (1.0 - m);
  m += vec3(5.0, 4.0, 9.0) / 255.0 * (1.0 - m);             // fundalul paginii (#050409)
  m += (h2(px + fract(uTime) * 61.0) - 0.5) / 255.0;          // dither: fără trepte în degradeuri
  o = vec4(m, 1.0);
}`;

// ---------- pe procesor: aceleași formule, pentru culoarea strălucirii ----------
function colDens(r, mu, H) {
  const alt = r - R, c = Math.sqrt(1.5707963 * r / H);
  if (mu >= 0) return H * Math.exp(-alt / H) * c / ((c - 1) * mu + 1);
  const r0 = r * Math.sqrt(Math.max(0, 1 - mu * mu)), d0 = Math.exp(Math.min(40, -(r0 - R) / H));
  return H * (2 * Math.sqrt(1.5707963 * r0 / H) * d0 - Math.exp(-alt / H) * c / ((c - 1) * -mu + 1));
}
// transmisia pe raza de la cameră spre Soare (camera e în afara atmosferei): de două ori coloana de la punctul tangent
function viewT(e) {
  const r0 = RC * Math.cos(e);   // raza punctului tangent (e < 0)
  if (e >= 0 || r0 >= RA) return [1, 1, 1];
  const nR = 2 * colDens(r0, 0, HR), nM = 2 * colDens(r0, 0, HM);
  return BR.map((b, i) => Math.exp(-(b * nR + BME * nM + BO[i] * OZK * nR)));
}

export function createIntro(G, mobile) {
  const gl = G.gl, cv = G.canvas;
  if (!gl) return null;
  const SET = mobile ? 'm' : 'd';
  const hasF = !!gl.getExtension('EXT_color_buffer_float');
  // compilarea nu blochează firul principal (KHR_parallel_shader_compile): starea se verifică abia când hărțile au sosit
  const psc = gl.getExtension('KHR_parallel_shader_compile');
  const mk = (fs) => {
    const v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(v, VS); gl.compileShader(v); gl.shaderSource(f, fs); gl.compileShader(f);
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return { p, f, U: null };
  };
  const enc = '#define ENC ' + (hasF ? '0' : '1') + '\n';
  const lut = mk(FS_LUT.replace('precision highp float;', 'precision highp float;\n' + enc));
  const main = mk(FS.replace('precision highp float;', 'precision highp float;\n' + enc));
  let progOk = 0;   // 0 = încă se compilează · 1 = gata · -1 = nu pornește (rămâne imaginea statică)
  function progReady() {
    if (progOk) return progOk > 0;
    if (psc && ![lut, main].every((o) => gl.getProgramParameter(o.p, psc.COMPLETION_STATUS_KHR))) return false;
    for (const o of [lut, main]) {
      if (!gl.getProgramParameter(o.p, gl.LINK_STATUS)) { progOk = -1; console.warn('[intro] shaderul nu pornește, rămâne imaginea statică', gl.getShaderInfoLog(o.f) || gl.getProgramInfoLog(o.p)); return false; }
      o.U = {}; const n = gl.getProgramParameter(o.p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(o.p, i); o.U[a.name] = gl.getUniformLocation(o.p, a.name); }
    }
    progOk = 1; return true;
  }
  // ---------- tabela (două ținte: lumina împrăștiată și transmisia) ----------
  const LW = 192, LH = 512;
  const fmt = hasF ? [gl.RGBA16F, gl.HALF_FLOAT] : [gl.RGBA8, gl.UNSIGNED_BYTE];
  const lutTex = [0, 1].map(() => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt[0], LW, LH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lutTex[0], 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, lutTex[1], 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  const fbOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!fbOk) { console.warn('[intro] tabela atmosferei nu se poate randa, rămâne imaginea statică'); return null; }
  // fără EXT_color_buffer_float: tabela în 8 biți, cu lumina împrăștiată codată x / (1 + x)
  // ---------- hărțile: ziua și norii (2048, ca pe telefon), luminile (d: 4096) ----------
  const tex = { day: null, cloud: null, night: null };
  let nightSz = [2048, 1024];
  G.texFile('pamant-m.webp', { aniso: 16 }, (t) => { tex.day = t; ping(); });
  G.texFile('nori-m.webp', { aniso: 16, red: true }, (t) => { tex.cloud = t; ping(); });
  G.texFile('noapte-' + SET + '.webp', { aniso: 16, red: true, clamp: true }, (t, w, h) => { tex.night = t; nightSz = [w, h]; ping(); });
  let onReady = () => {};
  function ping() { if (ready()) onReady(); else if (tex.day && tex.cloud && tex.night && progOk === 0) setTimeout(ping, 50); }
  const ready = () => !!(tex.day && tex.cloud && tex.night) && !G.lost && progReady();
  // ---------- stelele: aceleași ca la începutul călătoriei (journey.js, stars() cu cz = 0), desenate o dată pe mărimea ecranului ----------
  let starTex = null, starKey = '';
  function starLayer(w, h) {
    const k = w + 'x' + h; if (k === starKey && starTex) return; starKey = k;
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const c = c2.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#FFF1DD';
    const cx = w / 2, cy = h / 2, f = Math.max(w, h) * 0.5;
    for (const s of STARS) {
      const z = s.z <= 0.02 ? s.z + 1 : s.z;
      const x = cx + s.x / z * f * 0.35, y = cy + s.y / z * f * 0.35;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const sz = (1 - z) * 1.8 + 0.4;
      c.globalAlpha = s.b * Math.min(1, (1 - z) * 1.6 + 0.2);
      c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    if (!starTex) starTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, starTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  // ---------- camera: orientată o singură dată pentru cadrul de referință (Soarele la x, limbul la y) ----------
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function basis(yaw, pitch) {
    const Fw = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const Rt = norm(cross(Fw, [0, 1, 0])), Up = cross(Rt, Fw);
    return { Fw, Rt, Up };
  }
  const proj = (B, D, f) => { const z = dot(D, B.Fw); return [f * dot(D, B.Rt) / z, -f * dot(D, B.Up) / z]; };
  const dirOf = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const camCache = {};
  function camFor(kind) {
    if (camCache[kind]) return camCache[kind];
    const F = REF[kind], tx = (F.sx - 0.5) * F.W, ty = (F.ly - 0.5) * F.H;
    let yaw = Math.atan(tx / F.f), pitch = -DIP + Math.atan(ty / F.f);
    for (let it = 0; it < 30; it++) {
      const B = basis(yaw, pitch);
      const s = proj(B, dirOf(0, -DIP + 1 * RAD), F.f);
      yaw -= (s[0] - tx) / F.f * 0.9;
      // punctul limbului din coloana Soarelui
      let az = 0; for (let k = 0; k < 8; k++) { const p0 = proj(B, dirOf(az, -DIP), F.f), p1 = proj(B, dirOf(az + 1e-4, -DIP), F.f); az -= (p0[0] - tx) / ((p1[0] - p0[0]) / 1e-4); }
      const l = proj(B, dirOf(az, -DIP), F.f);
      pitch -= (l[1] - ty) / F.f * 0.9;
    }
    return (camCache[kind] = basis(yaw, pitch));
  }
  // ---------- rotația Pământului sub cameră: lume → coordonate geografice; stația merge spre est (Pământul „curge” spre orizont) ----------
  function geoMat(drift) {
    const la = GEO.lat * RAD, lo = GEO.lon * RAD, hd = GEO.head * RAD;
    const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const east = [-Math.sin(lo), Math.cos(lo), 0], north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    const fwd = [0, 1, 2].map((i) => north[i] * Math.cos(hd) + east[i] * Math.sin(hd));
    const xw = cross(up, fwd);   // axa x a lumii
    // M · Rx(-β): punctele de pe sol se mută spre +z (spre Soare, spre orizont)
    const b = -drift / R, cb = Math.cos(b), sb = Math.sin(b);
    // coloanele lui M: x → xw, y → up, z → fwd ; Rx(b): y' = y cos − z sin, z' = y sin + z cos
    const col1 = [0, 1, 2].map((i) => up[i] * cb + fwd[i] * sb), col2 = [0, 1, 2].map((i) => -up[i] * sb + fwd[i] * cb);
    return [xw[0], xw[1], xw[2], col1[0], col1[1], col1[2], col2[0], col2[1], col2[2]];   // column-major
  }
  let lutEl = null;
  function drawLut(L) {
    gl.useProgram(lut.p); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, LW, LH); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.uniform2f(lut.U.uSize, LW, LH); gl.uniform3fv(lut.U.uSun, L);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** Desenează intro-ul în contextul 2D `c` (w × h pixeli), la derularea p (0..1) și timpul t (secunde). */
  function draw(c, w, h, p, t, kind) {
    if (!ready()) return false;
    kind = kind || (mobile ? 'm' : 'd');
    const F = REF[kind], s = Math.max(w / F.W, h / F.H), f = F.f * s, B = camFor(kind);
    const el = sunElev(p) * RAD, es = -DIP + el;
    const L = dirOf(0, es);
    if (lutEl !== es) { lutEl = es; drawLut(L); }
    starLayer(w, h);
    G.ensureSize(w, h);
    gl.useProgram(main.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, cv.height - h, w, h);
    const U = main.U;
    gl.uniform4f(U.uVP, 0, cv.height - h, w, h);
    gl.uniform2f(U.uC, w / 2, h / 2); gl.uniform1f(U.uF, f);
    gl.uniform3fv(U.uRt, B.Rt); gl.uniform3fv(U.uUp, B.Up); gl.uniform3fv(U.uFw, B.Fw);
    gl.uniform3fv(U.uSun, L); gl.uniform2f(U.uSunH, 0, 1);
    gl.uniformMatrix3fv(U.uGeo, false, geoMat(drift(p, t)));
    // strălucirea: transmisia spre partea vizibilă a discului × fracțiunea vizibilă (segment de cerc)
    const x = Math.max(-1, Math.min(1, -el / SUNR)), frac = (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
    const Tg = viewT(Math.max(es, -DIP + Math.min(SUNR, Math.max(0, el + SUNR)) * 0.5 + 2e-5));
    const gk = frac * 1.0;
    gl.uniform3f(U.uGlow, Tg[0] * gk, Tg[1] * gk, Tg[2] * gk);
    const sp = proj(B, L, f); gl.uniform2f(U.uSunPx, w / 2 + sp[0], h / 2 + sp[1]);
    // expunerea crește după apus (ca la un aparat), luminile orașelor și stelele apar
    const nt = smooth(0.62, 0.98, p);
    gl.uniform1f(U.uExpo, 2.8 + 2.2 * nt);
    gl.uniform1f(U.uLights, 0.12 + 0.88 * smooth(0.55, 0.95, p));
    gl.uniform1f(U.uStars, smooth(0.72, 1.0, p));
    gl.uniform1f(U.uDisk, 42); gl.uniform1f(U.uTime, t);
    const ht = RC * Math.cos(es) - R;   // înălțimea punctului tangent al razei spre Soare (km)
    gl.uniform1f(U.uFlat, 1 + 1.3 * Math.exp(-Math.max(0, ht) / 7));
    gl.uniform2f(U.uNightSz, nightSz[0], nightSz[1]); gl.uniform4f(U.uNightBox, NIGHT[0], NIGHT[1], NIGHT[2], NIGHT[3]);
    const bind = (u, tx, name) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(U[name], u); };
    bind(0, lutTex[0], 'uLutS'); bind(1, lutTex[1], 'uLutT'); bind(2, tex.day, 'uDay'); bind(3, tex.cloud, 'uCloud'); bind(4, tex.night, 'uNight'); bind(5, starTex, 'uStarT');
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    c.drawImage(cv, 0, 0, w, h, 0, 0, w, h);
    return true;
  }
  return { draw, ready, hooks: (f) => { onReady = f; }, info: () => ({ float: hasF, set: SET }), probe: (kind, drift) => ({ B: camFor(kind), M: geoMat(drift || 0) }) };
}
