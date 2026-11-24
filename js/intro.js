// Intro (PROMPT-14, PROMPT-15): un apus văzut de pe orbită, randat live în WebGL2, în contextul globurilor (globe.js).
// Camera stă la 400 km deasupra Mării Chinei de Est și privește spre vest-nord-vest, spre orizont. După apus (PROMPT-15)
// urcăm: camera se ridică până la ~20.000 km, Pământul se curbează și coboară în cadru, Soarele reapare de după margine
// (roșu prin atmosferă, apoi alb), camera se întoarce spre el și pleacă; Pământul rămâne în urmă. Apoi preia călătoria (app.js).
// - Pământul: harta Blue Marble și norii (aceleași ca la globul Pământului), luminile orașelor din NASA Black Marble 2016;
// - atmosfera: împrăștiere simplă Rayleigh + Mie, cu absorbția ozonului. O tabelă mică (LUT, 192 × 512) ține lumina împrăștiată
//   și transmisia pentru fiecare direcție (înălțimea față de limb × unghiul față de Soare); se recalculează doar când
//   Soarele se mișcă. Pasul pe tot ecranul doar citește din ea, deci e ieftin;
// - Soarele: disc cu întunecare spre margine și strălucire în trei straturi; e tăiat de Pământ și se înroșește prin atmosferă;
// - stelele: aceeași sferă cerească ca în restul călătoriei (SKY din journey.js, puncte WebGL), apar după apus.
// Camera „cover”: cadrul de referință (1920 × 1080 pe calculator, 1000 × 1500 pe telefon) se decupează ca o imagine cu
// object-fit: cover, deci imaginea statică (LCP, randată de același shader) și desenul live se potrivesc la orice ecran.
import { SKY, skyCount } from './journey.js?v=2026112421';

const RAD = Math.PI / 180;
// ---------- Pământul și atmosfera (km) ----------
const R = 6371, HCAM = 400, RC = R + HCAM, RA = R + 100;
const DIP = Math.acos(R / RC);                       // cât de jos e orizontul văzut de pe orbită (~19,8°)
const dipOf = (r) => Math.acos(R / r);
const HR = 8, HM = 1.2;                              // înălțimile de scară Rayleigh și Mie
const BR = [5.802e-3, 13.558e-3, 33.1e-3], BMS = 3.996e-3, BME = 4.44e-3, BO = [0.65e-3, 1.881e-3, 0.085e-3], OZK = 1.875;
const SUNR = 0.2666 * RAD;                           // raza unghiulară a Soarelui
// ---------- locul și cadrul ----------
const GEO = { lat: 29.0, lon: 128.0, head: 283 };   // sub cameră: Marea Chinei de Est; privim spre 283° (VNV), spre Shanghai
// harta luminilor de detaliu e regională (noapte_textura.py): longitudine 102°…134°E, latitudine 18°…40°N; de sus, harta globală
const NIGHT = [102, 134, 18, 40];
export const REF = {
  d: { W: 1920, H: 1080, f: 1321, sx: 0.62, ly: 0.52, ey: 0.5 },   // FOV orizontal 72°; Soarele la 62% din lățime, limbul la 52% din înălțime
  m: { W: 1000, H: 1500, f: 680, sx: 0.50, ly: 0.34, ey: 0.68 }     // telefon (2:3): Soarele la mijloc, limbul la 34%
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
// ---------- urcarea (a = 0..1): înălțimea, Soarele care coboară mai departe (stația merge spre noapte), plecarea spre Soare ----------
const ES1 = -DIP + SUNPATH[SUNPATH.length - 1][1] * RAD, ES2 = -58 * RAD;   // Soarele ajunge adânc în spatele Pământului: de sus se vede noaptea
// 400 km → ~20.000 km (a = 1 → 0,7 exponențial), apoi mai repede, până la ~120.000 km: Pământul iese din cadru prin partea de jos
export const riseH = (a) => HCAM * Math.exp(a * Math.log(50) + 19.9 * Math.pow(Math.max(0, a - 0.7), 2));
const riseEs = (a) => ES1 + (ES2 - ES1) * smoothA(0, 0.6, a);
function smoothA(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// raza Soarelui (pixeli CSS) în cadrul intro-ului, pe un ecran W × H (pentru preluare și pentru rezerva fără WebGL)
// unde stă Soarele (pixeli CSS) la sfârșitul urcării
export const introSunEnd = (W, H, mobile) => { const F = REF[mobile ? 'm' : 'd'], s = Math.max(W / F.W, H / F.H); return [W / 2, H / 2 + (F.ey - 0.5) * F.H * s]; };
export const introF = (W, H, mobile) => { const F = REF[mobile ? 'm' : 'd']; return F.f * Math.max(W / F.W, H / F.H); };
export const introSunR = (W, H, mobile) => { const F = REF[mobile ? 'm' : 'd']; return SUNR * F.f * Math.max(W / F.W, H / F.H); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- shaderele ----------
const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const COMMON = `
const float R = ${R.toFixed(1)}, RA = ${RA.toFixed(1)}, HR = ${HR.toFixed(2)}, HM = ${HM.toFixed(2)};
uniform float RC, DIP, DA, DT, DLOW;   // raza camerei; cât de jos e limbul; tabela: -DA … DT în jurul limbului, DLOW spre nadir
const vec3 BR = vec3(${BR.map((x) => x.toExponential(4)).join(',')});
const float BMS = ${BMS.toExponential(4)}, BME = ${BME.toExponential(4)};
const vec3 BO = vec3(${BO.map((x) => x.toExponential(4)).join(',')});
const float OZK = ${OZK.toFixed(3)}, SUNR = ${SUNR.toExponential(5)}, PI = 3.14159265359;
const float VK = 0.28;
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
// rândul tabelei ↔ unghiul față de limb (d, radiani): des lângă limb (DA … DT, ~-1,5° … 2,8° de la 400 km), rar spre nadir
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
uniform vec3 uSun;             // direcția Soarelui (lume)
uniform vec3 uCam, uUpL, uLh, uXh;   // poziția camerei (lume, km) și baza locală: verticala, spre Soare pe orizontală, lateral
uniform mat3 uGeo;             // lume → coordonatele Pământului (x: 0°/0°, y: 0°/90°E, z: polul nord)
uniform vec3 uGlow;            // culoarea strălucirii (transmisia până la Soare × cât din disc se vede)
uniform vec2 uSunPx;           // poziția Soarelui pe ecran (pixeli), pentru strălucire
uniform float uExpo, uLights, uStars, uTime, uDisk, uFlat;   // uFlat: turtirea discului prin refracție, lângă limb
uniform sampler2D uLutS, uLutT, uDay, uCloud, uNight, uNightG;
uniform vec2 uNightSz;
uniform float uHasG, uShade;   // harta globală a luminilor a sosit · umbra de peste intro (ca vechiul .shade)
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
  // tabela atmosferei, în baza locală a camerei
  float vy = dot(V, uUpL), e = asin(clamp(vy, -1.0, 1.0));
  float azV = atan(dot(V, uXh), dot(V, uLh)), phi = abs(azV);
  vec2 luv = vec2(sqrt(phi / PI), vOfD(e + DIP));
  vec3 S = texture(uLutS, luv).rgb, T = texture(uLutT, luv).rgb;
  if (ENC == 1) S = S / max(1.0 - S, 1e-3);
  // marginea Pământului, netedă pe un pixel (unghiul față de nadir comparat cu raza unghiulară a Pământului)
  float a = acos(clamp(-vy, -1.0, 1.0)), aL = 1.5707963 - DIP;
  float cov = clamp((aL - a) / max(fwidth(a), 1e-6) + 0.5, 0.0, 1.0);
  vec3 col = S, sky = vec3(0.0), gnd = vec3(0.0);
  if (cov > 0.0) {
    vec3 C = uCam;
    float b = dot(C, V), dg = max(0.0, b * b - (dot(C, C) - R * R));
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
    // de sus: harta globală (aceeași scară de luminozitate); decupajul regional rămâne doar înăuntrul lui, cu trecere lină
    vec2 ed = min(nuv, 1.0 - nuv);
    float wR = uHasG > 0.5 ? smoothstep(0.015, 0.08, min(ed.x, ed.y)) : 1.0;
    if (wR < 1.0) {
      float Gn = texture(uNightG, uv).r, Gg = textureLod(uNightG, uv, 3.0).r;
      L = mix(Gn * Gn + Gg * Gg * 0.5, L, wR);
      Lg = mix(Gg, Lg, wR);
    }
    float night = smoothstep(-0.05, -0.17, mu);
    surf += vec3(1.0, 0.70, 0.40) * L * night * (1.0 - 0.85 * cl) * uLights * 0.11;
    surf += vec3(1.0, 0.78, 0.55) * Lg * Lg * cl * night * uLights * 0.02;   // norii luminați de jos, de oraș
    surf += vec3(0.00025, 0.00032, 0.0006);                                  // noaptea: nu chiar negru
    gnd = surf;
  }
  // cerul: discul Soarelui (întunecare spre margine), stelele se pun după
  // (în coordonate locale: azimut × înălțime; lângă limb, refracția turtește discul pe verticală)
  float eS = asin(clamp(dot(uSun, uUpL), -1.0, 1.0)), dEl = e - eS, dAz = azV * cos(e);
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
  m = m * uShade + vec3(8.0, 5.0, 10.0) / 255.0 * (1.0 - uShade);   // umbra de peste apus (fostul .shade, 16%)
  // stelele se desenează după acest pas (puncte, aceeași sferă cerească ca în călătorie)
  m += vec3(5.0, 4.0, 9.0) / 255.0 * (1.0 - m);             // fundalul paginii (#050409)
  m += (h2(px + fract(uTime) * 61.0) - 0.5) / 255.0;          // dither: fără trepte în degradeuri
  o = vec4(m, 1.0);
}`;

// stelele (PROMPT-16): aceeași sferă cerească ca în journey.js (SKY), proiectată cu baza camerei; ascunse de Pământ.
// uQ duce direcțiile din lumea călătoriei în lumea intro-ului (la sfârșitul urcării cerul e exact cel de la începutul drumului).
const VS_ST = `#version 300 es
in vec3 aDir; in vec2 aSA;
uniform mat3 uQ; uniform vec3 uRt, uUp, uFw, uCam; uniform float uF, uK; uniform vec2 uRes;
out float vA;
void main() {
  vec3 d = uQ * aDir; float z = dot(d, uFw);
  float b = dot(uCam, d), c = dot(uCam, uCam) - ${(R * R).toFixed(1)};
  if (z < 0.2 || (b < 0.0 && b * b > c)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  vec2 sp = vec2(dot(d, uRt), dot(d, uUp)) * uF / z;
  gl_Position = vec4(sp.x / (uRes.x * 0.5), sp.y / (uRes.y * 0.5), 0.0, 1.0);
  float sz = aSA.x; gl_PointSize = max(1.0, sz); vA = aSA.y * uK * min(1.0, sz * sz);
}`;
const FS_ST = `#version 300 es
precision mediump float;
in float vA; out vec4 o;
void main() { o = vec4(vec3(1.0, 0.945, 0.867) * vA, 1.0); }`;

// ---------- pe procesor: aceleași formule, pentru culoarea strălucirii ----------
function colDens(r, mu, H) {
  const alt = r - R, c = Math.sqrt(1.5707963 * r / H);
  if (mu >= 0) return H * Math.exp(-alt / H) * c / ((c - 1) * mu + 1);
  const r0 = r * Math.sqrt(Math.max(0, 1 - mu * mu)), d0 = Math.exp(Math.min(40, -(r0 - R) / H));
  return H * (2 * Math.sqrt(1.5707963 * r0 / H) * d0 - Math.exp(-alt / H) * c / ((c - 1) * -mu + 1));
}
// transmisia pe raza de la cameră (raza rc) spre o direcție cu înălțimea e față de orizontul local (camera e în afara atmosferei)
function viewT(e, rc) {
  const r0 = rc * Math.cos(e);   // raza punctului tangent (e < 0)
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
  const stp = (() => {
    const v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(v, VS_ST); gl.compileShader(v); gl.shaderSource(f, FS_ST); gl.compileShader(f);
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'aDir'); gl.bindAttribLocation(p, 1, 'aSA'); gl.linkProgram(p);
    return { p, f: v, U: null };
  })();
  const nStars = skyCount(mobile);
  const starVao = gl.createVertexArray(), starBuf = gl.createBuffer();
  gl.bindVertexArray(starVao); gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); gl.bufferData(gl.ARRAY_BUFFER, SKY, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
  let progOk = 0;   // 0 = încă se compilează · 1 = gata · -1 = nu pornește (rămâne imaginea statică)
  function progReady() {
    if (progOk) return progOk > 0;
    if (psc && ![lut, main, stp].every((o) => gl.getProgramParameter(o.p, psc.COMPLETION_STATUS_KHR))) return false;
    for (const o of [lut, main, stp]) {
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
  const tex = { day: null, cloud: null, night: null, glob: null };
  let nightSz = [2048, 1024];
  G.texFile('pamant-m.webp', { aniso: 16 }, (t) => { tex.day = t; ping(); });
  G.texFile('nori-m.webp', { aniso: 16, red: true }, (t) => { tex.cloud = t; ping(); });
  G.texFile('noapte-' + SET + '.webp', { aniso: 16, red: true, clamp: true }, (t, w, h) => { tex.night = t; nightSz = [w, h]; ping(); });
  // harta globală a luminilor (pentru urcare): abia la cerere (app.js o cere după prima derulare), nu la deschidere
  let globAsked = false;
  function loadGlobal() { if (globAsked) return; globAsked = true; G.texFile('noapte-glob-' + SET + '.webp', { aniso: 16, red: true }, (t) => { tex.glob = t; onReady(); }); }
  let onReady = () => {};
  function ping() { if (ready()) onReady(); else if (tex.day && tex.cloud && tex.night && progOk === 0) setTimeout(ping, 50); }
  const ready = () => !!(tex.day && tex.cloud && tex.night) && !G.lost && progReady();
  // ---------- camera: orientată o singură dată pentru cadrul de referință (Soarele la x, limbul la y) ----------
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k], vlen = (a) => Math.hypot(a[0], a[1], a[2]);
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
  // parametrii tabelei pentru camera la raza rc: limbul la -DIP, atmosfera (100 km) între limb și DT
  function lutPar(rc) {
    const dip = dipOf(rc), dt = (dip - Math.acos(RA / rc)) * 1.04, da = -0.55 * dt;
    return { rc, dip, da, dt, dlow: Math.PI / 2 - dip + da };
  }
  const setPar = (U, q) => { gl.uniform1f(U.RC, q.rc); gl.uniform1f(U.DIP, q.dip); gl.uniform1f(U.DA, q.da); gl.uniform1f(U.DT, q.dt); gl.uniform1f(U.DLOW, q.dlow); };
  let lutKey = '';
  function drawLut(Lloc, q) {
    gl.useProgram(lut.p); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, LW, LH); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.uniform2f(lut.U.uSize, LW, LH); gl.uniform3fv(lut.U.uSun, Lloc); setPar(lut.U, q);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // ---------- starea cadrului: Soarele, camera (poziție + orientare) la apus (p) și la urcare (a) ----------
  function solveCam(C, L, up, f, tx, ty, tys, w, yaw0, pitch0) {
    // yaw: Soarele la tx; pitch: amestec între „limbul la ty” și „Soarele la mijlocul ecranului” (w)
    const dip = dipOf(vlen(C));
    const lh = norm(sub(L, scale(up, dot(L, up)))), limb = norm(sub(scale(lh, Math.cos(dip)), scale(up, Math.sin(dip))));
    let yaw = yaw0, pitch = pitch0;
    for (let it = 0; it < 24; it++) {
      const B = basis(yaw, pitch), s = proj(B, L, f);
      yaw -= (s[0] - tx) / f * 0.9;
      let pl = 0, ps = 0;
      if (w < 1) { const l = proj(B, limb, f); pl = (l[1] - ty) / f; }
      if (w > 0) ps = (s[1] - tys) / f;
      pitch -= (pl * (1 - w) + ps * w) * 0.9;
    }
    return { yaw, pitch };
  }
  let camPrev = null;
  function state(kind, w, h, p, a, t) {
    const F = REF[kind], s = Math.max(w / F.W, h / F.H), f = F.f * s;
    let L, C, B, dr = drift(p, t);
    if (a <= 0) {
      const es = -DIP + sunElev(p) * RAD;
      L = dirOf(0, es); C = [0, RC, 0]; B = camFor(kind);
    } else {
      const es = riseEs(a);
      dr += (ES1 - es) * R;   // stația merge mai departe spre noapte: Pământul se rotește sub ea
      L = dirOf(0, es);
      C = [0, R + riseH(a), 0];   // urcăm drept în sus: partea dinspre noi rămâne noaptea, Pământul coboară și iese din cadru
      const up = norm(C), B0 = camFor(kind), y0 = Math.atan2(B0.Fw[0], B0.Fw[2]), p0 = Math.asin(B0.Fw[1]);
      const tx = (F.sx - 0.5) * F.W * s * (1 - smoothA(0, 0.8, a)), ty = ((F.ly + (0.74 - F.ly) * smoothA(0, 0.55, a)) - 0.5) * F.H * s;
      const prev = camPrev && camPrev.kind === kind ? camPrev : { yaw: y0, pitch: p0 };
      const tys = (F.ey - 0.5) * F.H * s;   // la sfârșit: Soarele la (mijloc, ey); pe telefon mai jos, ca Pământul să iasă din cadrul înalt
      const o = solveCam(C, L, up, f, tx, ty, tys, smoothA(0.5, 0.92, a), a < 0.02 ? y0 : prev.yaw, a < 0.02 ? p0 : prev.pitch);
      camPrev = { kind, yaw: o.yaw, pitch: o.pitch };
      B = basis(o.yaw, o.pitch);
    }
    return { F, s, f, L, C, B, dr };
  }
  /** Desenează intro-ul în contextul 2D `c` (w × h pixeli): apusul la p (0..1), urcarea la a (0..1), timpul t (secunde).
   *  o: { alpha, kind }. */
  function draw(c, w, h, p, t, o) {
    if (!ready()) return false;
    o = o || {};
    const kind = o.kind || (mobile ? 'm' : 'd'), a = o.a || 0;
    const S = state(kind, w, h, p, a, t), { f, L, C, B } = S;
    const rc = vlen(C), up = norm(C), q = lutPar(rc);
    const lh0 = sub(L, scale(up, dot(L, up))), lh = vlen(lh0) > 1e-6 ? norm(lh0) : norm(cross(up, [1, 0, 0])), xh = cross(up, lh);
    const esl = Math.asin(Math.max(-1, Math.min(1, dot(L, up))));   // înălțimea Soarelui față de orizontul local
    const Lloc = [0, Math.sin(esl), Math.cos(esl)];
    const key = rc.toFixed(3) + ':' + esl.toFixed(7);
    if (key !== lutKey) { lutKey = key; drawLut(Lloc, q); }
    G.ensureSize(w, h);
    gl.useProgram(main.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, cv.height - h, w, h);
    const U = main.U;
    setPar(U, q);
    gl.uniform4f(U.uVP, 0, cv.height - h, w, h);
    gl.uniform2f(U.uC, w / 2, h / 2); gl.uniform1f(U.uF, f);
    gl.uniform3fv(U.uRt, B.Rt); gl.uniform3fv(U.uUp, B.Up); gl.uniform3fv(U.uFw, B.Fw);
    gl.uniform3fv(U.uSun, L); gl.uniform3fv(U.uCam, C); gl.uniform3fv(U.uUpL, up); gl.uniform3fv(U.uLh, lh); gl.uniform3fv(U.uXh, xh);
    gl.uniformMatrix3fv(U.uGeo, false, geoMat(S.dr));
    // strălucirea: transmisia spre partea vizibilă a discului × fracțiunea vizibilă (segment de cerc) față de limbul tare
    const el = esl + q.dip, x = Math.max(-1, Math.min(1, -el / SUNR)), frac = (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
    const Tg = viewT(Math.max(esl, -q.dip + Math.min(SUNR, Math.max(0, el + SUNR)) * 0.5 + 2e-5), rc);
    gl.uniform3f(U.uGlow, Tg[0] * frac, Tg[1] * frac, Tg[2] * frac);
    const sp = proj(B, L, f); gl.uniform2f(U.uSunPx, w / 2 + sp[0], h / 2 + sp[1]);
    // expunerea crește după apus (ca la un aparat) și scade la loc când Soarele reapare; luminile orașelor și stelele
    const nt = smooth(0.62, 0.98, p), back = smoothA(0.62, 0.8, a);
    gl.uniform1f(U.uExpo, (2.8 + 2.2 * nt) * (1 - back) + 2.8 * back);
    gl.uniform1f(U.uLights, 0.12 + 0.88 * smooth(0.55, 0.95, p));
    gl.uniform1f(U.uStars, smooth(0.72, 1.0, p));
    gl.uniform1f(U.uShade, 0.84 + 0.16 * smoothA(0.55, 1, a));
    gl.uniform1f(U.uDisk, 42); gl.uniform1f(U.uTime, t);
    const ht = rc * Math.cos(esl) - R;   // înălțimea punctului tangent al razei spre Soare (km)
    gl.uniform1f(U.uFlat, 1 + 1.3 * Math.exp(-Math.max(0, ht) / 7));
    gl.uniform2f(U.uNightSz, nightSz[0], nightSz[1]); gl.uniform4f(U.uNightBox, NIGHT[0], NIGHT[1], NIGHT[2], NIGHT[3]);
    gl.uniform1f(U.uHasG, tex.glob ? 1 : 0);
    const bind = (u, tx, name) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(U[name], u); };
    bind(0, lutTex[0], 'uLutS'); bind(1, lutTex[1], 'uLutT'); bind(2, tex.day, 'uDay'); bind(3, tex.cloud, 'uCloud'); bind(4, tex.night, 'uNight'); bind(6, tex.glob || tex.night, 'uNightG');
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // stelele: puncte peste cadru, amestec „screen” (ca înainte), doar după apus
    const kS = smooth(0.72, 1.0, p);
    if (kS > 0 && o.sky) {
      gl.useProgram(stp.p); const V = stp.U;
      gl.uniformMatrix3fv(V.uQ, false, o.sky); gl.uniform3fv(V.uRt, B.Rt); gl.uniform3fv(V.uUp, B.Up); gl.uniform3fv(V.uFw, B.Fw); gl.uniform3fv(V.uCam, C);
      gl.uniform1f(V.uF, f); gl.uniform1f(V.uK, kS); gl.uniform2f(V.uRes, w, h);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
      gl.bindVertexArray(starVao); gl.drawArrays(gl.POINTS, 0, nStars); gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    const al = o.alpha == null ? 1 : o.alpha;
    if (al < 1) c.globalAlpha = al;
    c.drawImage(cv, 0, 0, w, h, 0, 0, w, h);
    c.globalAlpha = 1;
    return true;
  }
  /** Mărimea Soarelui (rază, pixeli) la sfârșitul urcării, pentru preluarea de către călătorie (app.js). */
  const sunR = (w, h, kind) => { const F = REF[kind || (mobile ? 'm' : 'd')]; return SUNR * F.f * Math.max(w / F.W, h / F.H); };
  /** Baza camerei la sfârșitul urcării (pentru ca cerul din intro să fie exact cel de la începutul drumului). */
  const endBasis = (kind) => { const k = kind || (mobile ? 'm' : 'd'), F = REF[k]; const S = state(k, F.W, F.H, 1, 1, 0); camPrev = null; return S.B; };
  const sunF = (w, h, kind) => { const F = REF[kind || (mobile ? 'm' : 'd')]; return F.f * Math.max(w / F.W, h / F.H); };
  return { draw, ready, loadGlobal, sunR, sunF, endBasis, hooks: (f) => { onReady = f; }, info: () => ({ float: hasF, set: SET, glob: !!tex.glob }), probe: (kind, drift) => ({ B: camFor(kind), M: geoMat(drift || 0) }) };
}
