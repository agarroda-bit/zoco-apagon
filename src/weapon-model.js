// Carabina procedural tipo AR-15/M4 para la vista en primera persona de ZOCO: APAGÓN.
// Unidades: metros. Cañón hacia -Z, +Y arriba, origen = parte alta de la empuñadura.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BORE_Y = 0.082;   // altura del eje del cañón
const RAIL_Y = 0.104;   // base del raíl picatinny
const SIGHT_Y = 0.1525; // eje óptico del punto rojo
const SIGHT_Z = -0.062; // centro del tubo del visor

const CALIDAD = {
  low: { rb: 1, bev: 1, radial: 14, curve: 4, mag: 5 },
  medium: { rb: 2, bev: 2, radial: 24, curve: 8, mag: 9 },
  high: { rb: 3, bev: 3, radial: 32, curve: 12, mag: 14 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const KEEP = ['position', 'normal', 'uv'];

// copia no indexada con solo position/normal/uv (para poder fusionar)
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
function put(list, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = prep(geo);
  _q.setFromEuler(_e.set(rx, ry, rz));
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s));
  list.push(g);
}
function putM(list, geo, m) { const g = prep(geo); g.applyMatrix4(m); list.push(g); }

function rrect(p, x0, y0, x1, y1, r) {
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r);
  p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r);
  p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}

// normales suaves en biseles pero aristas vivas (toCreasedNormals redondea a 1 cm: se trabaja en mm)
function crease(g, ang = 0.7) {
  g.scale(1000, 1000, 1000);
  const r = toCreasedNormals(g, ang);
  // tapas planas (normal ±Z en el marco de extrusión): normal de cara, sin mezclar con el bisel
  const P = r.attributes.position, N = r.attributes.normal;
  for (let t = 0; t < P.count; t += 3) {
    const z0 = P.getZ(t);
    if (Math.abs(P.getZ(t + 1) - z0) < 1e-4 && Math.abs(P.getZ(t + 2) - z0) < 1e-4) {
      const ux = P.getX(t + 1) - P.getX(t), uy = P.getY(t + 1) - P.getY(t), vx = P.getX(t + 2) - P.getX(t), vy = P.getY(t + 2) - P.getY(t);
      const sz = Math.sign(ux * vy - uy * vx) || 1;
      for (let k = 0; k < 3; k++) N.setXYZ(t + k, 0, 0, sz);
    }
  }
  r.scale(0.001, 0.001, 0.001);
  return r;
}

// UV por proyección de caja (por triángulo), 1 unidad = 1/scale m
function boxUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) { ax += n.getX(t + k); ay += n.getY(t + k); az += n.getZ(t + k); }
    ax = Math.abs(ax); ay = Math.abs(ay); az = Math.abs(az);
    for (let k = 0; k < 3; k++) {
      const i = t + k; let u, v;
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// mapa de normales de punteado (stippling) para el polímero
function stippleTexture(size = 256) {
  if (typeof document === 'undefined') return null;
  const h = new Float32Array(size * size);
  let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dots = Math.floor(size * size * 0.05);
  for (let i = 0; i < dots; i++) {
    const cx = Math.floor(rnd() * size), cy = Math.floor(rnd() * size), r = 1.2 + rnd() * 2.2, amp = 0.6 + rnd() * 0.4;
    const r2 = r * r, ri = Math.ceil(r);
    for (let y = -ri; y <= ri; y++) for (let x = -ri; x <= ri; x++) {
      const d2 = x * x + y * y; if (d2 > r2) continue;
      const o = (((cy + y) % size + size) % size) * size + (((cx + x) % size + size) % size);
      h[o] = Math.max(h[o], amp * Math.sqrt(1 - d2 / r2));
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), k = 2.0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = h[y * size + (x + size - 1) % size], hr = h[y * size + (x + 1) % size];
    const hu = h[((y + size - 1) % size) * size + x], hd = h[((y + 1) % size) * size + x];
    const nx = (hl - hr) * k, ny = (hd - hu) * k, l = Math.hypot(nx, ny, 1), o = (y * size + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}

// desgaste en aristas: donde la normal cambia rápido (fwidth) se aclara hacia metal desnudo y baja la rugosidad
function addWear(mat, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWear = { value: amount };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos;
uniform float uWear;
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // curvatura aprox. = variación de normal / variación de posición en pantalla (independiente de la distancia)
  float wCurv = length(fwidth(normal)) / max(length(fwidth(vViewPosition)), 1e-6);
  float wN1 = wNoise(vObjPos * 900.0);
  float wN2 = wNoise(vObjPos * 140.0);
  float wEdge = smoothstep(450.0, 1600.0, wCurv * (0.5 + 0.9 * wN1)) * uWear * 0.5;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.270, 0.283, 0.305), wEdge * 0.85);
  roughnessFactor = clamp(roughnessFactor * mix(0.85 + 0.3 * wN2, 0.6, wEdge), 0.05, 1.0);
  metalnessFactor = mix(metalnessFactor, 0.95, wEdge);
}`);
  };
  mat.customProgramCacheKey = () => 'desgaste' + amount;
}

function makeMaterials(envMap) {
  const steel = new THREE.MeshStandardMaterial({ name: 'acero', color: 0x1b1d20, metalness: 0.85, roughness: 0.35 });
  const alu = new THREE.MeshStandardMaterial({ name: 'aluminio', color: 0x23252a, metalness: 0.6, roughness: 0.5 });
  const poly = new THREE.MeshStandardMaterial({ name: 'polimero', color: 0x141414, metalness: 0, roughness: 0.75 });
  const tex = stippleTexture();
  if (tex) { poly.normalMap = tex; poly.normalScale.set(0.5, 0.5); }
  const dark = new THREE.MeshBasicMaterial({ name: 'hueco', color: 0x030304 }); // huecos: negro sin brillo
  const glass = new THREE.MeshStandardMaterial({ name: 'cristal', color: 0x8fb4c9, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false });
  const lens = new THREE.MeshStandardMaterial({ name: 'lenteLinterna', color: 0xc9d0d6, metalness: 0.7, roughness: 0.12, emissive: 0xffffff, emissiveIntensity: 0 });
  const dot = new THREE.MeshBasicMaterial({ name: 'puntoRojo', color: 0xff2020, toneMapped: false });
  addWear(steel, 0.85);
  addWear(alu, 1.0);
  const all = { steel, alu, poly, dark, glass, lens, dot };
  if (envMap) for (const k of ['steel', 'alu', 'poly', 'glass', 'lens']) { all[k].envMap = envMap; all[k].envMapIntensity = 1; }
  return all;
}

export function buildCarbine({ quality = 'medium', envMap = null } = {}) {
  const Q = CALIDAD[quality] || CALIDAD.medium;
  const materials = makeMaterials(envMap);
  const P = { steel: [], alu: [], poly: [], dark: [] };
  const HP = Math.PI / 2;

  const rbox = (w, h, d, r = 0.0015) => new RoundedBoxGeometry(w, h, d, Q.rb, r);
  const cyl = (r1, r2, len, seg = Q.radial) => new THREE.CylinderGeometry(r1, r2, len, seg); // eje Y
  // perfil (r, h) girado alrededor del eje; h positivo = hacia delante (-Z)
  const lathe = (pts, seg = Q.radial) => {
    const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
    g.rotateX(-HP);
    return g;
  };
  // perfil lateral (sx = hacia delante, sy = arriba) extruido en X, centrado
  const extrudeX = (shape, width, bt, bs, segs = Q.bev + 1) => {
    const depth = Math.max(width - 2 * bt, 0.0005);
    let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: segs, curveSegments: Q.curve });
    g = crease(g);
    g.translate(0, 0, -depth / 2);
    g.rotateY(HP); // (x,y,z) -> (z,y,-x)
    return g;
  };
  // sección (x, y) extruida a lo largo de Z entre z0 y z1
  const extrudeZ = (shape, z0, z1, bt, bs, segs = Q.bev + 1) => {
    const bev = bt > 0;
    const depth = Math.max(z1 - z0 - (bev ? 2 * bt : 0), 0.0002);
    let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev, bevelThickness: bt, bevelSize: bs, bevelSegments: segs, curveSegments: Q.curve });
    g = crease(g);
    g.translate(0, 0, z0 + (bev ? bt : 0));
    return g;
  };
  const setup = (m) => { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; return m; };
  const mk = (list, mat, name) => {
    const g = mergeGeometries(list, false);
    boxUV(g, 25);
    const m = setup(new THREE.Mesh(g, mat));
    m.name = name;
    return m;
  };

  // ---------- receptor superior (con ventana de expulsión real) ----------
  const up = new THREE.Shape();
  up.moveTo(0.168, 0.0585); up.lineTo(0.168, 0.1025); up.lineTo(-0.049, 0.1025); up.lineTo(-0.049, 0.0585); up.lineTo(0.168, 0.0585);
  up.holes.push(rrect(new THREE.Path(), 0.022, 0.0705, 0.078, 0.0935, 0.003));
  put(P.alu, extrudeX(up, 0.029, 0.0015, 0.0015));
  put(P.dark, new THREE.BoxGeometry(0.014, 0.030, 0.066), -0.004, 0.082, -0.050); // interior oscuro
  // tapa guardapolvo abierta + bisagra
  put(P.alu, rbox(0.0012, 0.024, 0.058, 0.0005), 0.0163, 0.0565, -0.050, 0, 0, 0.16);
  put(P.steel, cyl(0.0011, 0.0011, 0.062, 8), 0.0153, 0.0685, -0.050, HP);
  // asistente de cierre
  put(P.alu, rbox(0.009, 0.014, 0.038, 0.003), 0.0150, 0.083, 0.010);
  put(P.alu, cyl(0.0075, 0.0075, 0.036), 0.0172, 0.083, 0.012, HP);
  put(P.steel, cyl(0.0056, 0.0060, 0.012), 0.0172, 0.083, 0.035, HP);
  // deflector de vainas
  put(P.alu, rbox(0.008, 0.012, 0.016, 0.003), 0.0160, 0.0975, -0.012);

  // ---------- receptor inferior ----------
  const lo = new THREE.Shape();
  lo.moveTo(0.160, 0.0555); lo.lineTo(0.160, 0.030); lo.lineTo(0.1615, -0.034);
  lo.quadraticCurveTo(0.1615, -0.0395, 0.156, -0.0395); lo.lineTo(0.093, -0.0395);
  lo.quadraticCurveTo(0.088, -0.0395, 0.088, -0.034); lo.lineTo(0.088, -0.010);
  lo.quadraticCurveTo(0.088, -0.001, 0.078, -0.001); lo.lineTo(-0.028, -0.001);
  lo.quadraticCurveTo(-0.040, -0.001, -0.043, 0.012); lo.lineTo(-0.047, 0.030);
  lo.lineTo(-0.062, 0.048); lo.lineTo(-0.062, 0.0955); lo.lineTo(-0.045, 0.0955);
  lo.lineTo(-0.045, 0.0555); lo.lineTo(0.160, 0.0555);
  put(P.alu, extrudeX(lo, 0.027, 0.0015, 0.0012));
  put(P.alu, rbox(0.013, 0.005, 0.073, 0.0018), 0, -0.0335, -0.0515); // guardamonte
  put(P.steel, cyl(0.0055, 0.0055, 0.004), 0.0148, 0.022, -0.078, 0, 0, HP); // retén del cargador
  put(P.alu, rbox(0.003, 0.020, 0.009, 0.001), -0.0148, 0.040, -0.083); // retén del cerrojo
  for (const sx of [-1, 1]) put(P.steel, rbox(0.0025, 0.005, 0.018, 0.001), sx * 0.0150, 0.036, 0.012, 0.25); // selector
  for (const [y, z, r] of [[0.049, -0.152, 0.0028], [0.049, 0.036, 0.0028], [0.030, -0.040, 0.0022], [0.030, -0.012, 0.0022]])
    put(P.steel, cyl(r, r, 0.0295, 12), 0, y, z, 0, 0, HP); // pasadores

  // gatillo curvo
  const tr = new THREE.Shape();
  tr.absarc(0.068, -0.010, 0.032, 2.618, 3.752, false);
  tr.absarc(0.068, -0.010, 0.0275, 3.752, 2.618, true);
  put(P.steel, extrudeX(tr, 0.0048, 0.0008, 0.0005, Q.bev));

  // empuñadura de polímero
  const gr = new THREE.Shape();
  gr.moveTo(0.019, 0.002); gr.lineTo(0.017, -0.010);
  gr.quadraticCurveTo(0.011, -0.058, -0.004, -0.094);
  gr.quadraticCurveTo(-0.009, -0.104, -0.021, -0.103);
  gr.lineTo(-0.051, -0.097);
  gr.quadraticCurveTo(-0.061, -0.094, -0.058, -0.083);
  gr.quadraticCurveTo(-0.038, -0.032, -0.033, -0.006);
  gr.quadraticCurveTo(-0.031, 0.002, -0.022, 0.002); gr.lineTo(0.019, 0.002);
  put(P.poly, extrudeX(gr, 0.030, 0.0065, 0.0048, Q.bev + 2));

  // ---------- tubo del amortiguador + culata ----------
  put(P.alu, lathe([[0, -0.2418], [0.006, -0.2415], [0.0135, -0.240], [0.0145, -0.236], [0.0145, -0.066]]), 0, BORE_Y, 0);
  put(P.steel, lathe([[0.0145, -0.072], [0.0178, -0.0715], [0.0180, -0.070], [0.0180, -0.064], [0.0178, -0.0625], [0.0145, -0.062]]), 0, BORE_Y, 0);
  const st = new THREE.Shape();
  st.moveTo(-0.142, 0.1005); st.lineTo(-0.232, 0.1065);
  st.quadraticCurveTo(-0.250, 0.108, -0.254, 0.109); st.lineTo(-0.254, 0.038); st.lineTo(-0.224, 0.038);
  st.quadraticCurveTo(-0.200, 0.040, -0.186, 0.056); st.lineTo(-0.150, 0.059);
  st.quadraticCurveTo(-0.142, 0.060, -0.142, 0.064); st.lineTo(-0.142, 0.1005);
  put(P.poly, extrudeX(st, 0.034, 0.005, 0.0035, Q.bev + 2));
  put(P.poly, rbox(0.036, 0.080, 0.010, 0.003), 0, 0.0735, 0.2610); // cantonera
  put(P.steel, rbox(0.008, 0.006, 0.028, 0.0015), 0, 0.053, 0.172); // palanca de la culata

  // ---------- guardamanos octogonal M-LOK ----------
  const hg = new THREE.Shape(), hole = new THREE.Path();
  const ro = 0.0205 / Math.cos(Math.PI / 8), ri = 0.0180 / Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + i * Math.PI / 4;
    const f = i ? 'lineTo' : 'moveTo';
    hg[f](Math.cos(a) * ro, BORE_Y + Math.sin(a) * ro);
    hole[f](Math.cos(a) * ri, BORE_Y + Math.sin(a) * ri);
  }
  hg.holes.push(hole);
  put(P.alu, extrudeZ(hg, -0.470, -0.168, 0.0015, 0.0015, Q.bev + 1));
  // ranuras M-LOK (hundidas en oscuro)
  const slotGeo = new THREE.ShapeGeometry(rrect(new THREE.Shape(), -0.016, -0.0037, 0.016, 0.0037, 0.0036), 3);
  const Z = new THREE.Vector3(0, 0, 1), nV = new THREE.Vector3(), tV = new THREE.Vector3(), sm = new THREE.Matrix4();
  for (const f of [0, 1, 3, 4, 5, 6, 7]) {
    const a = f * Math.PI / 4;
    nV.set(Math.cos(a), Math.sin(a), 0); tV.set(Math.sin(a), -Math.cos(a), 0);
    for (let k = 0; k < 7; k++) {
      sm.makeBasis(Z, tV, nV).setPosition(nV.x * 0.0222, BORE_Y + nV.y * 0.0222, -0.200 - k * 0.040);
      putM(P.dark, slotGeo, sm);
    }
  }

  // ---------- cañón, bloque de gases, apagallamas ----------
  put(P.steel, lathe([[0.0098, 0.150], [0.0098, 0.400], [0.0090, 0.404], [0.0090, 0.536]]), 0, BORE_Y, 0);
  put(P.steel, cyl(0.0135, 0.0135, 0.022), 0, BORE_Y, -0.405, HP);
  put(P.steel, lathe([[0.0086, 0.533], [0.0108, 0.5345], [0.0112, 0.537], [0.0112, 0.551], [0.0108, 0.5535], [0.0062, 0.554]]), 0, BORE_Y, 0);
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + Math.PI / 6;
    put(P.steel, rbox(0.0050, 0.0040, 0.0290, 0.0008), Math.cos(a) * 0.0088, BORE_Y + Math.sin(a) * 0.0088, -0.5675, 0, 0, a - HP);
  }
  put(P.dark, cyl(0.0060, 0.0060, 0.032, 12), 0, BORE_Y, -0.568, HP);
  put(P.steel, lathe([[0.0066, 0.5790], [0.0110, 0.5792], [0.0112, 0.5805], [0.0112, 0.5870], [0.0105, 0.5885], [0.0070, 0.5885], [0.0066, 0.5875], [0.0066, 0.5790]]), 0, BORE_Y, 0);

  // ---------- raíl picatinny continuo con dientes ----------
  const rb = new THREE.Shape();
  rb.moveTo(-0.0085, RAIL_Y - 0.001); rb.lineTo(0.0085, RAIL_Y - 0.001); rb.lineTo(0.0085, RAIL_Y + 0.0012);
  rb.lineTo(0.0104, RAIL_Y + 0.0031); rb.lineTo(0.0104, RAIL_Y + 0.0038); rb.lineTo(-0.0104, RAIL_Y + 0.0038);
  rb.lineTo(-0.0104, RAIL_Y + 0.0031); rb.lineTo(-0.0085, RAIL_Y + 0.0012); rb.lineTo(-0.0085, RAIL_Y - 0.001);
  put(P.alu, extrudeZ(rb, -0.468, 0.048, 0.0004, 0.0002, 1));
  const th = new THREE.Shape();
  th.moveTo(-0.0104, RAIL_Y + 0.0036); th.lineTo(0.0104, RAIL_Y + 0.0036); th.lineTo(0.0104, RAIL_Y + 0.0050);
  th.lineTo(0.0079, RAIL_Y + 0.0081); th.lineTo(-0.0079, RAIL_Y + 0.0081); th.lineTo(-0.0104, RAIL_Y + 0.0050); th.lineTo(-0.0104, RAIL_Y + 0.0036);
  const toothGeo = extrudeZ(th, 0, 0.0052, Q.rb > 1 ? 0.0004 : 0, 0.0003, 1);
  for (let z = -0.463; z <= 0.045; z += 0.010) put(P.alu, toothGeo, 0, 0, z);

  // ---------- visor de punto rojo (tubo tipo Aimpoint) ----------
  const hs = -SIGHT_Z;
  put(P.alu, lathe([
    [0.0180, hs - 0.056], [0.0192, hs - 0.0550], [0.0194, hs - 0.050], [0.0192, hs - 0.045], [0.0172, hs - 0.043],
    [0.0172, hs + 0.040], [0.0194, hs + 0.043], [0.0197, hs + 0.046], [0.0197, hs + 0.055], [0.0190, hs + 0.0565],
    [0.0140, hs + 0.0565], [0.0136, hs + 0.055], [0.0136, hs - 0.055], [0.0140, hs - 0.056], [0.0180, hs - 0.056],
  ], Q.radial + 8), 0, SIGHT_Y, 0);
  put(P.alu, lathe([[0.0172, hs - 0.011], [0.0200, hs - 0.011], [0.0205, hs - 0.009], [0.0205, hs + 0.009], [0.0200, hs + 0.011], [0.0172, hs + 0.011]]), 0, SIGHT_Y, 0);
  put(P.alu, rbox(0.019, 0.030, 0.026, 0.002), 0, 0.1245, SIGHT_Z); // elevador
  put(P.alu, rbox(0.030, 0.010, 0.030, 0.0015), 0, 0.1075, SIGHT_Z); // mordaza del raíl
  put(P.steel, cyl(0.0055, 0.0055, 0.006, 14), -0.018, 0.1075, SIGHT_Z, 0, 0, HP); // tuerca
  put(P.steel, rbox(0.004, 0.006, 0.030, 0.0015), -0.0215, 0.1075, SIGHT_Z + 0.006); // palanca
  put(P.alu, rbox(0.018, 0.006, 0.018, 0.002), 0, SIGHT_Y + 0.0165, SIGHT_Z - 0.010); // torreta elevación
  put(P.alu, cyl(0.0085, 0.0085, 0.010, 18), 0, SIGHT_Y + 0.0205, SIGHT_Z - 0.010);
  put(P.alu, rbox(0.006, 0.018, 0.018, 0.002), 0.0165, SIGHT_Y, SIGHT_Z - 0.010); // torreta deriva (dcha)
  put(P.alu, cyl(0.0085, 0.0085, 0.010, 18), 0.0205, SIGHT_Y, SIGHT_Z - 0.010, 0, 0, HP);
  put(P.alu, cyl(0.0105, 0.0105, 0.012, 18), -0.0225, SIGHT_Y, SIGHT_Z + 0.022, 0, 0, HP); // mando de brillo (izda)
  const gl = [];
  put(gl, new THREE.CircleGeometry(0.0137, Q.radial), 0, SIGHT_Y, SIGHT_Z + 0.054); // lente trasera (+Z)
  put(gl, new THREE.CircleGeometry(0.0137, Q.radial), 0, SIGHT_Y, SIGHT_Z - 0.054, 0, Math.PI, 0); // lente delantera
  const glassMesh = mk(gl, materials.glass, 'cristales');
  glassMesh.renderOrder = 2;
  const redDot = setup(new THREE.Mesh(new THREE.CircleGeometry(0.0007, 16), materials.dot));
  redDot.name = 'punto rojo';
  redDot.position.set(0, SIGHT_Y, SIGHT_Z - 0.050);

  // ---------- miras de emergencia plegadas ----------
  put(P.alu, rbox(0.026, 0.010, 0.024, 0.0015), 0, 0.1085, 0.033);
  put(P.alu, rbox(0.022, 0.0045, 0.028, 0.0015), 0, 0.1150, 0.031, -0.06);
  put(P.steel, cyl(0.0040, 0.0040, 0.004, 12), 0.0150, 0.1090, 0.038, 0, 0, HP);
  put(P.alu, rbox(0.024, 0.010, 0.022, 0.0015), 0, 0.1085, -0.452);
  put(P.alu, rbox(0.018, 0.004, 0.030, 0.0015), 0, 0.1148, -0.444, 0.05);

  // ---------- linterna táctica a la 1:30 (lado derecho, delante) ----------
  const la = Math.PI / 4, ld = 0.041;
  const lx = Math.cos(la) * ld, ly = BORE_Y + Math.sin(la) * ld;
  put(P.alu, lathe([
    [0.0040, 0.3355], [0.0120, 0.3360], [0.0132, 0.3375], [0.0132, 0.3520], [0.0122, 0.3535], [0.0122, 0.3575],
    [0.0126, 0.3590], [0.0126, 0.4200], [0.0150, 0.4280], [0.0155, 0.4320], [0.0155, 0.4400], [0.0147, 0.4410],
    [0.0147, 0.4440], [0.0155, 0.4450], [0.0155, 0.4615], [0.0159, 0.4625], [0.0159, 0.4650], [0.0152, 0.4660],
    [0.0131, 0.4660], [0.0131, 0.4640],
  ]), lx, ly, 0);
  put(P.alu, lathe([[0.0126, 0.386], [0.0140, 0.386], [0.0143, 0.388], [0.0143, 0.402], [0.0140, 0.404], [0.0126, 0.404]]), lx, ly, 0);
  put(P.poly, cyl(0.0042, 0.0042, 0.004, 14), lx, ly, -0.3345, HP); // pulsador trasero
  put(P.alu, rbox(0.016, 0.010, 0.040, 0.002), Math.cos(la) * 0.0258, BORE_Y + Math.sin(la) * 0.0258, -0.395, 0, 0, la - HP); // montura
  const flashLens = setup(new THREE.Mesh(new THREE.CircleGeometry(0.0131, Q.radial), materials.lens));
  flashLens.name = 'lente linterna';
  flashLens.position.set(lx, ly, -0.4640);
  flashLens.rotation.y = Math.PI; // mira hacia -Z

  // ---------- piezas móviles ----------
  const chParts = [];
  put(chParts, rbox(0.044, 0.0085, 0.009, 0.0025), 0, 0, 0.0055);
  put(chParts, rbox(0.011, 0.006, 0.090, 0.0015), 0, -0.0005, -0.040);
  put(chParts, rbox(0.010, 0.0065, 0.013, 0.002), -0.024, 0.0005, 0.004);
  const chargingHandle = new THREE.Group();
  chargingHandle.name = 'palanca de carga';
  chargingHandle.position.set(0, 0.1025, 0.052);
  chargingHandle.add(mk(chParts, materials.alu, 'palanca'));

  const boltParts = [];
  put(boltParts, cyl(0.0085, 0.0085, 0.106), 0, 0, -0.013, HP); // portacerrojo
  put(boltParts, cyl(0.0062, 0.0062, 0.014), 0, 0, -0.073, HP); // cabeza
  put(boltParts, rbox(0.004, 0.0035, 0.016, 0.001), 0.0058, 0.0035, -0.072); // extractor
  for (let i = 0; i < 5; i++) put(boltParts, rbox(0.0014, 0.0045, 0.0016, 0.0005), 0.0086, 0, -0.050 + i * 0.004); // estrías
  const bolt = new THREE.Group();
  bolt.name = 'cerrojo';
  bolt.position.set(0, BORE_Y, 0);
  bolt.add(mk(boltParts, materials.steel, 'portacerrojo'));

  // cargador curvo de polímero (pivote en el brocal)
  const magParts = [];
  const R = 0.40, s0 = 0.068, Lm = 0.205, top = 0.052, hw = 0.030;
  const at = (s) => {
    if (s <= s0) return [0, top - s, 0];
    const t = (s - s0) / R;
    return [R - R * Math.cos(t), top - s0 - R * Math.sin(t), t];
  };
  const samples = [0, s0];
  for (let i = 1; i <= Q.mag; i++) samples.push(s0 + (Lm - s0) * i / Q.mag);
  const fr = [], bk = [];
  for (const s of samples) {
    const [cx, cy, t] = at(s);
    fr.push([cx + Math.cos(t) * hw, cy + Math.sin(t) * hw]);
    bk.push([cx - Math.cos(t) * hw, cy - Math.sin(t) * hw]);
  }
  const ms = new THREE.Shape();
  ms.moveTo(fr[0][0], fr[0][1]);
  for (let i = 1; i < fr.length; i++) ms.lineTo(fr[i][0], fr[i][1]);
  for (let i = bk.length - 1; i >= 0; i--) ms.lineTo(bk[i][0], bk[i][1]);
  put(magParts, extrudeX(ms, 0.023, 0.0025, 0.0018));
  {
    const [bx, by, bt] = at(Lm);
    put(magParts, rbox(0.029, 0.010, 0.070, 0.003), 0, by - Math.cos(bt) * 0.004, -(bx + Math.sin(bt) * 0.004), bt); // base
    for (const s of [0.146, 0.156, 0.166, 0.176]) {
      const [cx, cy, t] = at(s);
      for (const side of [-1, 1]) put(magParts, rbox(0.002, 0.0026, 0.050, 0.0009), side * 0.0120, cy, -cx, t); // nervios
    }
  }
  const magazine = new THREE.Group();
  magazine.name = 'cargador';
  magazine.position.set(0, -0.0395, -0.1245);
  magazine.add(mk(magParts, materials.poly, 'cargador'));

  // ---------- ensamblado ----------
  const group = new THREE.Group();
  group.name = 'carabina';
  group.add(
    mk(P.alu, materials.alu, 'aluminio'), mk(P.steel, materials.steel, 'acero'),
    mk(P.poly, materials.poly, 'polimero'), mk(P.dark, materials.dark, 'huecos'),
    glassMesh, redDot, flashLens, magazine, chargingHandle, bolt,
  );
  const muzzle = new THREE.Object3D(); muzzle.name = 'bocacha'; muzzle.position.set(0, BORE_Y, -0.5885);
  const ejectionPort = new THREE.Object3D(); ejectionPort.name = 'ventana expulsión'; ejectionPort.position.set(0.0150, BORE_Y, -0.050);
  const flashlight = new THREE.Object3D(); flashlight.name = 'linterna'; flashlight.position.set(lx, ly, -0.4665);
  group.add(muzzle, ejectionPort, flashlight);

  let tris = 0;
  group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  group.userData.triangles = tris;

  return { group, sightHeight: SIGHT_Y, muzzle, ejectionPort, flashlight, flashLens, magazine, chargingHandle, bolt, redDot, materials };
}
