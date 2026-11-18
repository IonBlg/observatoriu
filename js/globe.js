// Globurile randate live (WebGL2): fiecare corp are o singură hartă echirectangulară (media/tex/), înfășurată pe o sferă
// de un shader, în timp real. Un singur context WebGL, într-un canvas care nu e în pagină: pentru fiecare corp vizibil se
// desenează sfera într-un dreptunghi de mărimea ei reală de pe ecran (partea vizibilă), apoi canvasul 2D al călătoriei îl
// compune cu drawImage exact unde stătea înainte cadrul (camera, ordinea, stelele și textele rămân neschimbate).
// Lumina, culorile, atmosfera și inelele sunt aceleași ca în scriptul de randare planeta.py (cadrele aprobate, în afara site-ului), portate în GLSL.
// Fără WebGL2: un cadru static, clar (media/static/). Hărțile: scriptul de randare texturi.py (în afara site-ului).

const RAD = Math.PI / 180;
// ---------- corpurile (valorile din planeta.py; spin = grade pe secundă, rotația continuă; rot = cât se rotește cu derularea) ----------
// inclinare = latitudinea din care privim · axa = rotirea axei în planul imaginii (+ = polul nord spre dreapta) · fr = raza discului în dreptunghi
const A = (r, g, b, p) => [r, g, b, p];
export const BODIES = {
  // Soarele (PROMPT-11): o singură imagine SDO (HMI 4096², 9 mai 2024) ca textură a discului + inelul AIA 304 (protuberanțele, cu alfa);
  // fr = raza discului în dreptunghi (protuberanțele ajung la 1,5 raze). Fără rotație vizibilă (o rotație durează ~27 de zile).
  soare:   { tex: 'soare',   fr: 1 / 3,  sun: true, clouds: 'soare-p', lum: 1 },
  mercur:  { tex: 'mercur',  fr: 0.45,   inc: 8,     axa: 0,     fe: 0,      lon: 20,  rot: 60,   spin: 1.6,  minn: 0.62, atm: null, lum: 1 },
  venus:   { tex: 'venus',   fr: 0.45,   inc: 6,     axa: 2.6,   fe: 0,      lon: 0,   rot: -55,  spin: -1.1, minn: 0.52, atm: A(1.0, 0.95, 0.84, 0.30), halo: [1.0, 0.92, 0.78, 0.035, 0.55], lum: 1 },
  pamant:  { tex: 'pamant',  fr: 0.4215, inc: 12,    axa: 14,    fe: 0,      lon: 25,  rot: 90,   spin: 4.0,  minn: 0.86, atm: A(0.50, 0.72, 1.0, 0.34), halo: [0.45, 0.66, 1.0, 0.03, 0.5], lum: 1, clouds: 'nori', cloudSpin: 0.7 },
  // Luna: rotație sincronă, arată Pământului mereu aceeași față (lon 0 = centrul feței vizibile); doar o librație mică (app.js).
  // Lumina: aceeași ca la celelalte corpuri (Soarele în spatele camerei, stânga-sus).
  luna:    { tex: 'luna',    fr: 0.5,    inc: 0,     axa: 0,     fe: 0,      lon: 0,   rot: 0,    spin: 0,    minn: 0.5,  atm: null, lum: 1.05 },
  marte:   { tex: 'marte',   fr: 0.45,   inc: 12,    axa: 0,     fe: 0,      lon: 62,  rot: 120,  spin: 3.9,  minn: 0.78, atm: A(1.0, 0.62, 0.52, 0.22), halo: [1.0, 0.70, 0.58, 0.012, 0.22], lum: 1 },
  jupiter: { tex: 'jupiter', fr: 0.45,   inc: 3,     axa: 3.1,   fe: 0.0649, lon: -60, rot: 120,  spin: 9.6,  minn: 0.85, atm: A(0.95, 0.90, 0.85, 0.08), lum: 1 },
  saturn:  { tex: 'saturn',  fr: 0.205,  inc: 26.7,  axa: -6,    fe: 0.098,  lon: 0,   rot: 100,  spin: 8.8,  minn: 0.88, atm: null, lum: 0.97, rings: 'inele' },
  uranus:  { tex: 'uranus',  fr: 0.235,  inc: 30,    axa: -82.2, fe: 0.0229, lon: 0,   rot: -80,  spin: -5.6, minn: 0.80, atm: A(0.80, 0.92, 0.98, 0.10), lum: 0.93, thin: true },
  neptun:  { tex: 'neptun',  fr: 0.45,   inc: -18,   axa: 22,    fe: 0.0171, lon: 0,   rot: 100,  spin: 6.0,  minn: 0.80, atm: A(0.75, 0.85, 1.0, 0.10), lum: 0.88 }
};
export const TEX_ORDER = ['soare', 'mercur', 'venus', 'pamant', 'luna', 'marte', 'jupiter', 'saturn', 'uranus', 'neptun'];
const LIGHT = (() => { const v = [-0.36, 0.30, 0.88], n = Math.hypot(...v); return v.map((x) => x / n); })();
const INEL_R0 = 1.10, INEL_R1 = 2.33;   // texturile inelelor (texturi.py)
// inelele lui Uranus (Elliot & Nicholson): raza (km) și lățimea (km)
const URANUS_RINGS = [[41837, 2], [42234, 2], [42571, 2], [44718, 8], [45661, 8], [47176, 2], [47627, 3], [48300, 5], [51149, 58]];

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec4 uVP;          // viewportul (x, y, w, h) în pixelii canvasului WebGL
uniform vec2 uC;           // centrul discului, în pixelii dreptunghiului (din stânga-sus)
uniform float uR;          // raza discului, în pixeli
uniform vec2 uAx;          // cos / sin ale axei în planul imaginii
uniform vec2 uRoll;        // cos / sin ale rotirii camerei (Luna, la plonjare)
uniform float uL0, uFe, uLon, uMinn, uLum, uDist, uTerm, uCap;
uniform vec3 uLight;
uniform vec4 uAtm;         // atmosfera: culoare + putere
uniform vec4 uHalo; uniform float uHaloW;
uniform sampler2D uT0, uT1, uCl0, uCl1, uRing;
uniform float uMix;        // 0 = doar uT0, 1 = doar uT1 (trecerea de la harta mică la cea mare)
uniform float uHas;        // 0 = nicio hartă încă: disc colorat
uniform vec3 uFlat;
uniform float uClouds, uCloudLon, uSpec, uRings, uThin, uThinPx;
uniform vec2 uThinR[9];
uniform float uMode, uTime;   // uMode 1 = Soarele
out vec4 o;
const float PI = 3.14159265358979;

vec4 tex2(sampler2D a, sampler2D b, vec2 uv, vec2 dx, vec2 dy) {
  vec4 c0 = textureGrad(a, uv, dx, dy);
  if (uMix <= 0.0) return c0;
  return mix(c0, textureGrad(b, uv, dx, dy), uMix);
}
// coordonatele hărții, cu derivate fără salt la cusătura de 180°
void uvGrad(float lon, float lat, out vec2 uv, out vec2 dx, out vec2 dy) {
  float u = fract(lon / (2.0 * PI)), u2 = fract(u + 0.5);
  uv = vec2(u, clamp((PI * 0.5 - lat) / PI, 0.0, 1.0));
  vec2 du = vec2(dFdx(u), dFdy(u)), du2 = vec2(dFdx(u2), dFdy(u2));
  if (dot(du2, du2) < dot(du, du)) du = du2;
  dx = vec2(du.x, dFdx(uv.y)); dy = vec2(du.y, dFdy(uv.y));
}
float ringTau(float r) {
  float t = (r - ${INEL_R0.toFixed(2)}) / ${(INEL_R1 - INEL_R0).toFixed(2)};
  if (t <= 0.0 || t >= 1.0) return 0.0;
  float a = texture(uRing, vec2(t, 0.5)).a;
  return -log(max(1.0 - a, 1e-4));
}
// zgomot de valoare 3D (granulația Soarelui, care „fierbe” lent)
float h3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Soarele: discul din textura HMI (întunecarea spre margine e în imagine), granulație fină animată, protuberanțele AIA 304
// cu o pulsație foarte lentă. Coordonatele: q în raze de disc, y în jos (ca rândurile texturii).
void sun(vec2 px) {
  vec2 q = (px - uC) / uR; float r = length(q);
  vec2 du = 0.5 + q * ${(0.488).toFixed(3)}, pu = 0.5 + q * (0.5 / 1.5);
  vec2 ddx = dFdx(du), ddy = dFdy(du), pdx = dFdx(pu), pdy = dFdy(pu);
  vec4 res = vec4(0.0);
  if (uClouds > 0.5 && r > 0.97 && r < 1.5) {
    vec4 p = tex2(uCl0, uCl1, pu, pdx, pdy);
    float ang = atan(q.y, q.x);
    float a = p.a * (0.84 + 0.16 * sin(uTime * 0.42 + ang * 3.0 + r * 7.0));   // pulsație lentă (~15 s), diferită de-a lungul marginii
    res = vec4(p.rgb * a, a);
  }
  if (r < 1.0 + 1.5 / uR) {
    vec3 col = uHas > 0.5 ? tex2(uT0, uT1, du, ddx, ddy).rgb : uFlat * (1.0 - 0.3 * r * r);
    // granulația: celule de ~3 pixeli pe ecran (cel mult ~700 pe rază, cât granulele reale), evoluează lent, fără pâlpâire
    float k = min(700.0, uR / 3.0);
    vec3 P = vec3(q * k, uTime * 0.22);
    float g = vn(P) * 0.65 + vn(P * vec3(2.03, 2.03, 1.3) + 17.0) * 0.35;
    col *= 1.0 + 0.045 * (g - 0.5) * (1.0 - 0.5 * r * r);
    float alpha = clamp((1.0 - r) * uR / 1.6 + 0.5, 0.0, 1.0);   // margine netedă pe ~1,6 pixeli
    res = vec4(clamp(col, 0.0, 1.0) * alpha, alpha) + res * (1.0 - alpha);
  }
  // marginea trece lin în coroană: o strălucire caldă, de culoarea marginii, care scade în câțiva pixeli (~1,5% din rază)
  if (r > 0.995) {
    float w = max(2.5, uR * 0.015), hh = exp(-max(r - 1.0, 0.0) * uR / w) * 0.6 * clamp((r - 0.995) * uR, 0.0, 1.0);
    res = res + vec4(vec3(0.80, 0.38, 0.11) * hh, hh) * (1.0 - res.a);
  }
  o = res;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x - uVP.x, uVP.y + uVP.w - gl_FragCoord.y);
  if (uMode > 0.5) { sun(px); return; }
  vec2 q = (px - uC) / uR; q.y = -q.y;
  q = vec2(q.x * uRoll.x + q.y * uRoll.y, -q.x * uRoll.y + q.y * uRoll.x);
  float X = q.x, Y = q.y, ca = uAx.x, sa = uAx.y;
  float fe = uFe * cos(uL0) * cos(uL0);
  float XA = X * ca - Y * sa, YA = (X * sa + Y * ca) / (1.0 - fe);
  float r = length(vec2(XA, YA));
  vec4 out_ = vec4(0.0);          // culoare premultiplicată
  float Zfull = 0.0;
  bool inside = r < 1.0 + 1.5 / uR;
  if (inside) {
    float s = r > 0.99999 ? 0.99999 / r : 1.0;
    float Xa = XA * s, Ya = YA * s, Z;
    if (uDist > 0.0) {           // perspectivă (Luna, ca în video): raza privirii lovește sfera
      float k = 1.0 / sqrt(uDist * uDist - 1.0);
      vec3 D = normalize(vec3(Xa * k, Ya * k, -1.0)), C = vec3(0.0, 0.0, uDist);
      float b = dot(C, D), disc = max(b * b - (uDist * uDist - 1.0), 0.0);
      vec3 P = C + D * (-b - sqrt(disc));
      Xa = P.x; Ya = P.y; Z = P.z;
    } else Z = sqrt(max(0.0, 1.0 - Xa * Xa - Ya * Ya));
    Zfull = Z;
    float Xs = Xa * ca + Ya * sa, Ys = -Xa * sa + Ya * ca;
    float cL = cos(uL0), sL = sin(uL0);
    float lat = asin(clamp(Ya * cL + Z * sL, -1.0, 1.0));
    float dlon = atan(Xa, Z * cL - Ya * sL);
    float mu = Xs * uLight.x + Ys * uLight.y + Z * uLight.z;
    float shade = pow(clamp(mu, 0.0, 1.0), uMinn) * pow(max(Z, 1e-3), uMinn - 1.0);
    shade = min(shade, uCap) * 1.08;   // Luna: plafon mai jos, marginea luminată nu se arde
    float term = clamp((mu + uTerm / 3.0) / uTerm, 0.0, 1.0);   // terminator moale (Luna: mai net, ca în video)
    float light = (0.045 + shade * term) * uLum;
    // umbra inelelor pe planetă: raza spre Soare taie planul inelelor
    if (uRings > 0.5) {
      vec3 n = vec3(0.0, cL, sL);
      vec3 Lr = vec3(uLight.x * ca - uLight.y * sa, uLight.x * sa + uLight.y * ca, uLight.z);
      vec3 S = vec3(Xa, Ya, Z); float Ln = dot(Lr, n);
      float t = abs(Ln) > 1e-6 ? -dot(S, n) / Ln : -1.0;
      float tr = t > 0.0 ? exp(-ringTau(length(S + t * Lr)) / max(abs(Ln), 0.05)) : 1.0;
      light *= 0.12 + 0.88 * tr;
    }
    vec2 uv, dx, dy; uvGrad(uLon + dlon + PI, lat, uv, dx, dy);
    vec3 col;
    if (uHas > 0.5) {
      vec4 t0 = tex2(uT0, uT1, uv, dx, dy);
      col = t0.rgb;
      if (uClouds > 0.5) {
        vec2 uc, cdx, cdy; uvGrad(uLon + uCloudLon + dlon + PI, lat, uc, cdx, cdy);
        float cl = tex2(uCl0, uCl1, uc, cdx, cdy).r;
        // reflexia Soarelui pe ape (masca de apă = alfa), discretă, sub nori
        vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
        float sp = pow(max(dot(vec3(Xs, Ys, Z), H), 0.0), 70.0) * t0.a * (1.0 - cl) * uSpec * term;
        col = mix(col, vec3(0.97, 0.98, 1.0), cl) * light + vec3(1.0, 0.96, 0.88) * sp;
      } else col *= light;
    } else col = uFlat * light;
    if (uAtm.a > 0.0) {
      float edge = pow(clamp(1.0 - Z, 0.0, 1.0), 6.0);
      float Xi = XA * ca + YA * sa, Yi = -XA * sa + YA * ca;
      float lit = clamp((Xi * uLight.x + Yi * uLight.y) / max(min(r, 0.99999), 1e-3) * 0.5 + 0.55, 0.0, 1.0);
      float a = edge * lit * uAtm.a;
      col = col * (1.0 - a) + uAtm.rgb * a * uLum;
    }
    float alpha = clamp(uR - r * uR + 0.5, 0.0, 1.0);
    out_ = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
  }
  // halou (ceața de deasupra norilor / atmosfera subțire): chiar în afara discului, sub planetă
  if (uHalo.a > 0.0) {
    float rr = length(vec2(X, Y));
    float k = rr > 1.0 ? pow(clamp(1.0 - (rr - 1.0) / uHaloW, 0.0, 1.0), 2.0) : 0.0;
    float lit = clamp((X * uLight.x + Y * uLight.y) / max(rr, 1e-3) * 0.6 + 0.6, 0.0, 1.0);
    float a = k * lit * uHalo.a;
    out_ = out_ + vec4(uHalo.rgb * a, a) * (1.0 - out_.a);
  }
  float Xa2 = X * ca - Y * sa, Ya2 = X * sa + Y * ca;
  float cL = cos(uL0), sL = sin(uL0);
  // inelele lui Uranus: linii fine, întunecate peste disc, abia luminate în afara lui
  if (uThin > 0.5 && abs(sL) > 1e-3) {
    float zr = -(Ya2 * cL) / sL;
    float rk = length(vec3(Xa2, Ya2, zr)) * 25559.0;
    float cov = 0.0;
    for (int i = 0; i < 9; i++) {
      float half_ = max(uThinR[i].y * 0.5, uThinPx * 0.35);
      cov = max(cov, clamp(1.0 - abs(rk - uThinR[i].x) / (half_ + uThinPx * 0.5), 0.0, 1.0) * pow(min(1.0, uThinR[i].y / (2.0 * half_)), 0.3));
    }
    bool ondisk = X * X + Y * Y < 1.0;
    if (ondisk && zr > Zfull) { float Ad = cov * 0.55; out_.rgb = out_.rgb * (1.0 - Ad) + vec3(0.10, 0.10, 0.11) * Ad * out_.a; }
    if (!ondisk) { float Ao = cov * 0.30; out_ = vec4(0.55, 0.60, 0.62, 1.0) * Ao + out_ * (1.0 - Ao); }
  }
  // inelele lui Saturn: unde raza privirii taie planul inelelor; α = 1 − e^(−τ/μ); umbra planetei pe inele
  if (uRings > 0.5 && abs(sL) > 1e-3) {
    float zr = -(Ya2 * cL) / sL;
    vec3 P = vec3(Xa2, Ya2, zr); float rr = length(P);
    float t = (rr - ${INEL_R0.toFixed(2)}) / ${(INEL_R1 - INEL_R0).toFixed(2)};
    if (t > 0.0 && t < 1.0) {
      vec4 rg = texture(uRing, vec2(t, 0.5));
      float tau = -log(max(1.0 - rg.a, 1e-4));
      float av = 1.0 - exp(-tau / abs(sL));
      vec3 Lr = vec3(uLight.x * ca - uLight.y * sa, uLight.x * sa + uLight.y * ca, uLight.z);
      float pl = dot(P, Lr), dsc = pl * pl - (rr * rr - 1.0);
      float w = max(0.02, 2.0 * fwidth(dsc));          // margine netedă: cel puțin un pixel
      float sh = pl < 0.0 ? smoothstep(-w * 0.5, w * 0.5, dsc) : 0.0;
      vec3 col = rg.rgb * (1.0 - 0.93 * sh);
      bool ondisk = Xa2 * Xa2 + (Ya2 / (1.0 - fe_(0.0))) * (Ya2 / (1.0 - fe_(0.0))) < 1.0;
      if (!ondisk || zr > Zfull) out_ = vec4(col * av, av) + out_ * (1.0 - av);   // în fața planetei: peste ea
      else out_ = out_ + vec4(col * av, av) * (1.0 - out_.a);                     // în spate: doar în marginea netedă a discului
    }
  }
  o = out_;
}`.replace(/fe_\(0\.0\)/g, '(uFe * cos(uL0) * cos(uL0))');

// ---------- contextul ----------
export function createGlobes(mobile) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  let gl = null;
  try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) {}
  if (!gl) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  let prog;
  try {
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('[globuri] shaderul nu pornește, folosesc imaginile statice', e); return null; }
  gl.useProgram(prog);
  const U = {}; const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(prog, i), nm = a.name.replace(/\[0\]$/, ''); U[nm] = gl.getUniformLocation(prog, a.name); }
  ['uT0', 'uT1', 'uCl0', 'uCl1', 'uRing'].forEach((s, i) => U[s] && gl.uniform1i(U[s], i));
  if (U.uThinR) gl.uniform2fv(U.uThinR, URANUS_RINGS.flat());
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAniso = aniso ? Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let lost = false;
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; console.warn('[globuri] contextul WebGL s-a pierdut: imaginile statice'); });
  const empty = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, empty);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  // ---------- hărțile: descărcare cu priorități, decodare în afara firului principal, încărcare pe GPU în fâșii ----------
  const SET = mobile ? 'm' : 'd', V = 2;   // 2: Soarele (PROMPT-11)
  const T = {};   // corp -> { big: harta mare, mic: harta mică (st: 0 nimic · 1 se descarcă · 2 gata · 3 eliberată în timp ce se descărca), shown }
  const slot = (name) => T[name] || (T[name] = { big: { st: 0 }, mic: { st: 0 }, shown: 0 });
  const uploads = [];
  let pumping = false, onReady = () => {};
  function pump() {
    pumping = false; if (lost) return;
    const t0 = performance.now();
    while (uploads.length && performance.now() - t0 < 5) {
      const j = uploads[0];
      gl.bindTexture(gl.TEXTURE_2D, j.tex);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, j.y);
      const h = Math.min(j.strip, j.h - j.y);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, j.y, j.w, h, gl.RGBA, gl.UNSIGNED_BYTE, j.bm);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      j.y += h;
      if (j.y >= j.h) { uploads.shift(); gl.generateMipmap(gl.TEXTURE_2D); j.bm.close && j.bm.close(); j.done(); }
    }
    if (uploads.length) { pumping = true; requestAnimationFrame(pump); }
  }
  function makeTex(bm, wrapS, done) {
    const w = bm.width, h = bm.height, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (maxAniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    // fâșii de ~4 MB: nicio încărcare lungă pe firul principal
    uploads.push({ tex, bm, w, h, y: 0, strip: Math.max(16, Math.floor(1048576 / w)), done: () => done(tex) });
    if (!pumping) { pumping = true; requestAnimationFrame(pump); }
    return tex;
  }
  const queue = []; let active = 0;
  const MAXQ = 2;
  function want(file, level, pri, cb) { queue.push({ file, level, pri, cb }); queue.sort((a, b) => a.pri - b.pri); next(); }
  function next() {
    while (active < MAXQ && queue.length) {
      const j = queue.shift(); active++;
      const url = 'media/tex/' + j.file + '?v=' + V;
      fetch(url, { priority: j.pri < 2 ? 'high' : 'low' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        .then((bm) => { if (bm.width > maxTex) throw new Error('prea mare'); j.cb(bm); })
        .catch((e) => { console.warn('[globuri] harta ' + j.file + ': ' + e.message); j.cb(null); })
        .finally(() => { active--; next(); });
    }
  }
  function loadLevel(name, level, pri) {
    const s = slot(name), L = s[level];
    if (L.st) return;
    L.st = 1;
    const B = BODIES[name], files = [B.tex + '-' + (level === 'big' ? SET : 'mic') + '.webp'];
    if (B.clouds) files.push(B.clouds + '-' + (level === 'big' ? SET : 'mic') + '.webp');
    let left = files.length; const got = [];
    files.forEach((f, k) => want(f, level, pri + k * 0.01, (bm) => {
      if (!bm) { got[k] = null; if (--left === 0) fin(); return; }
      makeTex(bm, gl.REPEAT, (tex) => { got[k] = tex; if (--left === 0) fin(); });
    }));
    function fin() {
      if (L.st === 3) { got.forEach((t) => t && gl.deleteTexture(t)); L.st = 0; return; }   // eliberată între timp
      if (!got[0]) { L.st = 0; L.fail = (L.fail || 0) + 1; return; }
      L.tex = got[0]; L.cl = got[1] || null; L.st = 2; L.at = performance.now(); onReady(name, level);
    }
  }
  function free(name, level) {
    const s = T[name]; if (!s) return; const L = s[level];
    if (L.st === 2) { gl.deleteTexture(L.tex); if (L.cl) gl.deleteTexture(L.cl); L.tex = L.cl = null; L.st = 0; }
    else if (L.st === 1) L.st = 3;
  }
  // inelele lui Saturn: o singură textură mică (PNG, alfa real)
  let ringTex = null, ringAsked = false;
  function loadRings() {
    if (ringAsked) return; ringAsked = true;
    want('inele.png', 'big', 1.5, (bm) => { if (!bm) { ringAsked = false; return; } ringTex = makeTex(bm, gl.CLAMP_TO_EDGE, () => onReady('saturn', 'rings')); });
  }

  // ---------- desenarea unui corp ----------
  // canvasul WebGL are o singură mărime: cât ecranul (fiecare redimensionare oprește GPU-ul zeci de ms)
  // (doar crește: lupa Lunii desenează în același canvas un dreptunghi mai mic, fără să-l redimensioneze)
  function ensureSize(w, h) {
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
  }
  let level = '';
  const flatCol = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
  /** Desenează corpul `name` în contextul 2D `c`: discul cu centrul (cx, cy) și diametrul D (pixeli ai canvasului),
   *  în dreptunghiul pătrat de latură S = D / (2 fr) (ca fostele cadre), tăiat la ecranul w × h.
   *  o: { alpha, ang (grade), cloud (grade), roll (radiani), dot (culoarea de rezervă), copies: [[scară, alfa], ...] }. Întoarce true dacă a desenat. */
  function draw(c, name, cx, cy, D, w, h, o) {
    if (lost) return false;
    const B = BODIES[name], S = D / (2 * B.fr);
    let x0 = Math.floor(cx - S / 2), y0 = Math.floor(cy - S / 2), x1 = Math.ceil(cx + S / 2), y1 = Math.ceil(cy + S / 2);
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
    const rw = x1 - x0, rh = y1 - y0; if (rw <= 0 || rh <= 0) return false;
    ensureSize(w, h);
    const s = slot(name), big = s.big, mic = s.mic;
    // harta: cea mare dacă a sosit (trecere lină de la cea mică, ≤ 0,3 s), altfel cea mică, altfel un disc colorat
    let t0 = null, t1 = null, c0 = null, c1 = null, mixv = 0, has = 1, anim = false;
    level = big.st === 2 ? 'mare' : mic.st === 2 ? 'mica' : 'disc';
    if (big.st === 2) {
      const k = mic.st === 2 && s.shown === 1 ? Math.min(1, (performance.now() - big.at) / 300) : 1;
      if (k < 1) { t0 = mic.tex; c0 = mic.cl; t1 = big.tex; c1 = big.cl; mixv = k; anim = true; } else { t0 = big.tex; c0 = big.cl; s.shown = 2; }
    } else if (mic.st === 2) { t0 = mic.tex; c0 = mic.cl; if (s.shown < 1) s.shown = 1; }
    else has = 0;
    gl.viewport(0, cv.height - rh, rw, rh);
    gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(U.uVP, 0, cv.height - rh, rw, rh);
    gl.uniform2f(U.uC, cx - x0, cy - y0);
    gl.uniform1f(U.uR, D / 2);
    gl.uniform2f(U.uAx, Math.cos((B.axa || 0) * RAD), Math.sin((B.axa || 0) * RAD));
    const rl = o.roll || 0; gl.uniform2f(U.uRoll, Math.cos(rl), Math.sin(rl));
    gl.uniform1f(U.uMode, B.sun ? 1 : 0); gl.uniform1f(U.uTime, o.time || 0);
    gl.uniform1f(U.uL0, (o.inc != null ? o.inc : B.inc || 0) * RAD); gl.uniform1f(U.uFe, B.fe || 0); gl.uniform1f(U.uMinn, B.minn || 1); gl.uniform1f(U.uLum, B.lum);
    gl.uniform1f(U.uDist, B.dist || 0); gl.uniform1f(U.uTerm, B.term || 0.18); gl.uniform1f(U.uCap, B.cap || 1.25);
    gl.uniform1f(U.uLon, (o.ang || 0) * RAD);
    gl.uniform3fv(U.uLight, B.light ? (() => { const v = B.light, n = Math.hypot(...v); return v.map((x) => x / n); })() : LIGHT);
    gl.uniform4fv(U.uAtm, B.atm || [0, 0, 0, 0]);
    gl.uniform4fv(U.uHalo, B.halo ? [B.halo[0], B.halo[1], B.halo[2], B.halo[4]] : [0, 0, 0, 0]); gl.uniform1f(U.uHaloW, B.halo ? B.halo[3] : 1);
    gl.uniform1f(U.uMix, mixv); gl.uniform1f(U.uHas, has); gl.uniform3fv(U.uFlat, flatCol(o.dot || '#888888'));
    gl.uniform1f(U.uClouds, has && c0 ? 1 : 0); gl.uniform1f(U.uCloudLon, (o.cloud || 0) * RAD); gl.uniform1f(U.uSpec, 0.32);
    gl.uniform1f(U.uRings, B.rings && ringTex ? 1 : 0);
    gl.uniform1f(U.uThin, B.thin ? 1 : 0); gl.uniform1f(U.uThinPx, 25559 / (D / 2));
    const bind = (u, t) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t || empty); };
    bind(0, t0); bind(1, t1 || t0); bind(2, c0); bind(3, c1 || c0); bind(4, ringTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // compunerea în canvasul 2D, exact unde stătea cadrul (și copiile mărite ale estompării de mișcare, la Lună)
    const a = o.alpha == null ? 1 : o.alpha;
    c.globalAlpha = a; c.drawImage(cv, 0, 0, rw, rh, x0, y0, rw, rh); c.globalAlpha = 1;
    if (o.each) o.each(1, 1);
    if (o.copies) for (const [g, al] of o.copies) {
      const X = w / 2 + (x0 - w / 2) * g, Y = h / 2 + (y0 - h / 2) * g;
      c.globalAlpha = al; c.drawImage(cv, 0, 0, rw, rh, X, Y, rw * g, rh * g); c.globalAlpha = 1;
      if (o.each) o.each(g, al);
    }
    return anim ? 'anim' : true;
  }

  // ---------- planificarea: corpul curent → următorul → cel de după; cele mai departe de 2 opriri se eliberează ----------
  let micAsked = false;
  function loadAllMic() { if (micAsked) return; micAsked = true; TEX_ORDER.forEach((nm, i) => loadLevel(nm, 'mic', 5 + i * 0.1)); }
  function plan(idx, opts) {   // idx = poziția opririi curente în TEX_ORDER (-1 = înainte de Mercur)
    const near = idx < 0 ? TEX_ORDER.slice(0, 2) : TEX_ORDER.slice(idx, idx + 3);
    near.forEach((nm, k) => {
      const s = slot(nm);
      if (s.big.st === 0 && (s.big.fail || 0) < 3) {
        // salt direct la un corp fără hartă mare: întâi cea mică (o clipă), apoi cea mare
        if (k === 0 && opts && opts.jump && s.mic.st === 0) loadLevel(nm, 'mic', 0);
        loadLevel(nm, 'big', 1 + k);
      }
      if (nm === 'saturn') loadRings();
    });
    // înapoi: corpul de dinainte rămâne (sau se descarcă, după cele din față), ca la derularea în sus să nu apară harta mică
    if (idx > 0) { const pv = TEX_ORDER[idx - 1], ps = slot(pv); if (ps.big.st === 0 && (ps.big.fail || 0) < 3) loadLevel(pv, 'big', 4); }
    TEX_ORDER.forEach((nm, i) => { if (idx >= 0 && (i < idx - 1 || i > idx + 2)) free(nm, 'big'); });
  }
  function ready(name) { const s = T[name]; return !!(s && (s.big.st === 2 || s.mic.st === 2)); }
  function stats() { const o = {}; for (const k in T) o[k] = { mare: ['-', 'se descarcă', 'gata', 'eliberată'][T[k].big.st], mica: ['-', 'se descarcă', 'gata', ''][T[k].mic.st] }; return { set: SET, aniso: maxAniso, uploads: uploads.length, coada: queue.length, harti: o }; }
  return { draw, plan, loadAllMic, ready, stats, hooks: (f) => { onReady = f; }, get lost() { return lost; }, get level() { return level; }, canvas: cv };
}

// ---------- un punct de pe suprafață (latitudine, longitudine, grade) → poziția pe disc, în raze (x spre dreapta, y în jos; z > 0 = fața văzută)
// aceeași geometrie ca în shader (fără turtire și fără perspectivă): etichetele lupei stau exact pe relieful desenat
export function surfacePoint(name, lat, lon, o) {
  const B = BODIES[name], L0 = (o && o.inc != null ? o.inc : B.inc || 0) * RAD, a = (B.axa || 0) * RAD;
  const f = lat * RAD, dl = lon * RAD - ((o && o.ang) || 0) * RAD, cL = Math.cos(L0), sL = Math.sin(L0);
  const Xa = Math.cos(f) * Math.sin(dl), Ya = Math.sin(f) * cL - Math.cos(f) * Math.cos(dl) * sL, Z = Math.sin(f) * sL + Math.cos(f) * Math.cos(dl) * cL;
  const X = Xa * Math.cos(a) + Ya * Math.sin(a), Y = -Xa * Math.sin(a) + Ya * Math.cos(a);
  return { x: X, y: -Y, z: Z };
}

// ---------- unghiul de rotație: continuu în timp (nu se oprește niciodată) + puțin legat de derulare ----------
export function angleOf(name, p, t, rm) {
  const B = BODIES[name];
  if (rm) return B.lon;
  return B.lon - B.rot * p - B.spin * t;
}
