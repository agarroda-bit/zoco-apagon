// La sala: réplica libre de la sala grande de la Salamandra (Zoco). Nave de 30 × 22 m.
// Ejes: Z negativo = escenario (fondo), Z positivo = entrada. X positivo = barra (derecha).
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const TL = new THREE.TextureLoader();
export const HALL = { minX: -11, maxX: 11, minZ: -15, maxZ: 15, H: 7.5 };
export const STAIR = { x0: -2.75, x1: 0.75, cz: -1.5, top: 2.7, rise: 0.225, tread: 0.3, platD: 3 };
export const BALL_POS = new THREE.Vector3(-1, 4.55, -1.5);

function tex(name, kind, rx = 1, ry = 1) {
  const t = TL.load(`${BASE}tex/${name}_${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pbr(name, rx, ry, p = {}) {
  return new THREE.MeshStandardMaterial({ map: tex(name, 'diff', rx, ry), normalMap: tex(name, 'nor', rx, ry), roughnessMap: tex(name, 'rough', rx, ry), ...p });
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// UV en metros para cajas (las texturas no se estiran)
function boxGeo(w, h, d, s = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
  }
  return g;
}

// ---------- texturas procedurales ----------
const heraklith = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#1d160f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, l = 5 + Math.random() * 16;
    const v = Math.random();
    g.strokeStyle = v < 0.5 ? '#3a2c1d' : v < 0.85 ? '#4d3b27' : '#6a5337';
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.fillStyle = '#050403'; g.fillRect(0, 0, w, 5); g.fillRect(0, 0, 5, h);
});
const diamondPlate = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, w, h);
  const n = 8, s = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = i * s + s / 2, cy = j * s + s / 2, rot = (i + j) % 2 ? Math.PI / 4 : -Math.PI / 4;
    g.save(); g.translate(cx, cy); g.rotate(rot);
    const gr = g.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
    gr.addColorStop(0, '#5c5c5c'); gr.addColorStop(0.5, '#e0e0e0'); gr.addColorStop(1, '#6a6a6a');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, s * 0.36, s * 0.09, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
}, false);
const scratchRough = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '200,200,200'},${0.2 + Math.random() * 0.4})`;
    g.lineWidth = Math.random() * 1.5 + 0.3;
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI * 2, l = 10 + Math.random() * 60;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}, false);

function exitSignTex() {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#0a8a3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eafff0'; g.font = 'bold 44px Arial'; g.textBaseline = 'middle'; g.fillText('SALIDA', 92, h / 2 + 2);
    // pictograma de persona corriendo
    g.strokeStyle = '#eafff0'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.arc(52, 22, 8, 0, 7); g.fillStyle = '#eafff0'; g.fill();
    g.beginPath(); g.moveTo(48, 34); g.lineTo(40, 58); g.lineTo(26, 78); g.moveTo(40, 58); g.lineTo(58, 70); g.lineTo(62, 86);
    g.moveTo(47, 38); g.lineTo(30, 46); g.moveTo(47, 38); g.lineTo(64, 48); g.stroke();
  });
}
function posterTex() {
  return canvasTex(320, 460, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#15110a'); bg.addColorStop(1, '#040302');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const gold = g.createLinearGradient(0, 0, w, h); gold.addColorStop(0, '#f7df8f'); gold.addColorStop(0.5, '#c79a2e'); gold.addColorStop(1, '#fff0b8');
    g.strokeStyle = gold; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.arc(w / 2, 170, 82, 0, Math.PI * 2); g.lineWidth = 10; g.stroke();
    g.beginPath(); g.arc(w / 2, 170, 66, 0, Math.PI * 2); g.lineWidth = 2; g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 56, 170 + Math.sin(a) * 56); g.lineTo(w / 2 + Math.cos(a) * 64, 170 + Math.sin(a) * 64); g.lineWidth = 4; g.stroke(); }
    g.lineCap = 'round'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, 170); g.lineTo(w / 2, 122); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 170); g.lineTo(w / 2 + 38, 186); g.stroke();
    g.fillStyle = gold; g.fillRect(w / 2 - 22, 60, 44, 26); g.fillRect(w / 2 - 22, 254, 44, 26);
    g.textAlign = 'center'; g.font = 'bold 50px Georgia'; g.fillText('GOLDEN', w / 2, 340);
    g.font = 'bold 44px Georgia'; g.fillText('OCLOCK', w / 2, 388);
    g.font = '15px Arial'; g.fillStyle = '#b89a55'; g.fillText('RELOJES · PAGO CONTRA REEMBOLSO', w / 2, 425);
  });
}
function screenMaterial() {
  // Pantalla LED 5,5 × 2,5 con visuales procedurales y rejilla de píxeles
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uKick: { value: 0 }, uPower: { value: 0 }, uMode: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uKick, uPower, uMode; varying vec2 vUv;
      void main(){
        vec2 px = vec2(176.0, 80.0); vec2 cell = fract(vUv * px); vec2 q = (floor(vUv * px) + 0.5) / px;
        vec2 p = (q - 0.5) * vec2(2.2, 1.0);
        float r = length(p), a = atan(p.y, p.x);
        float rings = sin(12.0 / (r + 0.15) - uTime * 3.0 - uKick * 2.0);
        float spokes = sin(a * 8.0 + uTime * 0.7);
        vec3 c1 = vec3(1.0, 0.1, 0.55), c2 = vec3(0.1, 0.8, 1.0);
        vec3 col = mix(c1, c2, 0.5 + 0.5 * sin(uTime * 0.3 + r * 3.0)) * smoothstep(0.2, 1.0, rings * spokes + 0.4);
        col += vec3(1.0, 0.9, 0.95) * uKick * smoothstep(0.35, 0.0, abs(r - 0.25 - uKick * 0.3)) * 1.5;
        float mask = smoothstep(0.0, 0.15, cell.x) * smoothstep(1.0, 0.85, cell.x) * smoothstep(0.0, 0.15, cell.y) * smoothstep(1.0, 0.85, cell.y);
        vec3 off = vec3(0.012, 0.012, 0.014);
        gl_FragColor = vec4(off + col * mask * (0.6 + uKick * 1.4) * 2.2 * uPower, 1.0);
      }`,
  });
}

// ---------- neón ----------
function tubeFromPoints(pts, r = 0.035, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)), closed, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), r, 8, closed);
}
function arcPts(cx, cy, rx, ry, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
function neonZoco() {
  // Letrero inventado: Z con rayo, O partidas, C abierta, subrayado cian
  const g = new THREE.Group();
  const pink = new THREE.MeshBasicMaterial({ color: 0xff2a8a });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x28e6ff });
  const add = (geo, m) => { const mesh = new THREE.Mesh(geo, m); g.add(mesh); return mesh; };
  add(tubeFromPoints([[-3.0, 0.7], [-1.95, 0.7], [-2.55, 0.05], [-2.2, 0.05], [-3.0, -0.7], [-1.9, -0.7]]), pink);
  add(tubeFromPoints(arcPts(-0.95, 0, 0.62, 0.72, 0.5, Math.PI * 2 + 0.38, 44)), pink);
  add(tubeFromPoints(arcPts(0.55, 0, 0.62, 0.72, 0.6, Math.PI * 2 - 0.6, 40)), pink);
  add(tubeFromPoints(arcPts(2.1, 0, 0.62, 0.72, -0.9, Math.PI * 2 - 1.05, 44)), pink);
  add(tubeFromPoints([[-3.1, -1.05], [-1.0, -1.18], [1.2, -1.02], [3.0, -1.2]], 0.028), cyan);
  add(tubeFromPoints(arcPts(2.1, 0, 0.18, 0.18, 0, Math.PI * 2, 16), 0.022, true), cyan);
  // placa trasera
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.9), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6, metalness: 0.3 }));
  back.position.z = -0.06; back.position.y = -0.15; g.add(back);
  return { group: g, pink, cyan };
}
function neonRound(kind) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: kind === 0 ? 0xff3fa0 : 0xffa020 });
  const m2 = new THREE.MeshBasicMaterial({ color: kind === 0 ? 0x30e0ff : 0xff4020 });
  g.add(new THREE.Mesh(tubeFromPoints(arcPts(0, 0, 0.55, 0.55, 0, Math.PI * 2, 32), 0.025, true), m));
  if (kind === 0) {
    g.add(new THREE.Mesh(tubeFromPoints([[-0.28, 0.25], [0.28, 0.25], [0, -0.05], [-0.28, 0.25]], 0.02), m2));
    g.add(new THREE.Mesh(tubeFromPoints([[0, -0.05], [0, -0.28]], 0.02), m2));
    g.add(new THREE.Mesh(tubeFromPoints([[-0.15, -0.3], [0.15, -0.3]], 0.02), m2));
  } else {
    g.add(new THREE.Mesh(tubeFromPoints([[0.08, 0.36], [-0.14, 0.02], [0.06, 0.02], [-0.1, -0.36]], 0.022), m2));
  }
  return { group: g, mats: [m, m2] };
}

// ---------- construcción ----------
export function buildWorld(scene, { quality = 'medium', reflection = null } = {}) {
  const W = { colliders: [], hit: [], lights: {}, update: null };
  const root = new THREE.Group(); scene.add(root);
  const col = (minx, miny, minz, maxx, maxy, maxz, tag) => { const b = new THREE.Box3(new THREE.Vector3(minx, miny, minz), new THREE.Vector3(maxx, maxy, maxz)); b.tag = tag; W.colliders.push(b); return b; };
  const addMesh = (geo, mat, x, y, z, { hit = 'concrete', cast = false, receive = true, parent = root } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m);
    if (hit) { m.userData.mat = hit; W.hit.push(m); }
    return m;
  };
  const box = (w, h, d, mat, x, y, z, o = {}) => {
    const m = addMesh(boxGeo(w, h, d, o.uvScale || 1), mat, x, y, z, o);
    if (o.collide !== false) col(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, o.tag);
    return m;
  };

  // materiales
  const M = {};
  M.resin = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.1, metalness: 0.0, normalMap: tex('brushed_concrete', 'nor', 5, 5), normalScale: new THREE.Vector2(0.15, 0.15), roughnessMap: tex('concrete_floor_worn_001', 'rough', 6, 6) });
  M.entryFloor = pbr('rubber_tiles', 6, 4, { color: 0x3a3a3a, roughness: 0.6 });
  M.wall = pbr('painted_concrete', 1, 1, { color: 0x2b2b2e });
  M.black = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.85 });
  M.ceil = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.95 });
  M.acoustic = new THREE.MeshStandardMaterial({ map: heraklith, bumpMap: heraklith, bumpScale: 2.5, roughness: 0.95, color: 0x8a8078 });
  M.metal = pbr('metal_plate', 1, 1, { color: 0x1d1d1f, metalness: 0.85 });
  M.stairMetal = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.9, roughness: 0.5, roughnessMap: scratchRough });
  M.plate = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.92, roughness: 0.38, bumpMap: diamondPlate, bumpScale: 3, roughnessMap: scratchRough });
  M.truss = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 1, roughness: 0.32 });
  M.wood = pbr('dark_wooden_planks', 1, 1, { color: 0x5a4a3c });
  M.stageTop = pbr('black_painted_planks', 1, 1, { color: 0x555555 });
  M.column = pbr('painted_concrete', 1, 1, { color: 0x1a1a1c });
  M.barTop = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.06, metalness: 0.2 });
  M.barrel = pbr('metal_plate', 1, 1, { color: 0x151517, metalness: 0.9 });
  M.speaker = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.7, metalness: 0.2 });
  M.grille = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55, metalness: 0.7 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.12 });
  M.cloth = pbr('fabric_leather_02', 2, 2, { color: 0x222222 });
  W.materials = M;
  if (reflection) {
    reflection.apply(M.resin, 0.95, 0.4, 0.02);
    reflection.apply(M.entryFloor, 0.35, 2.2, 0.05);
    reflection.apply(M.barTop, 0.0, 1, 0.0);
  }

  const { minX, maxX, minZ, maxZ, H } = HALL;
  // suelo: resina en pista y sala, goma en la entrada
  const floor = addMesh(new THREE.PlaneGeometry(22, 22.5).rotateX(-Math.PI / 2), M.resin, 0, 0, -3.75, { hit: 'concrete' });
  const entry = addMesh(new THREE.PlaneGeometry(22, 7.5).rotateX(-Math.PI / 2), M.entryFloor, 0, 0, 11.25, { hit: 'concrete' });
  W.floorMeshes = [floor, entry];
  // techo alto (pista + escenario), techo bajo (entrada y barra)
  addMesh(new THREE.PlaneGeometry(18, 22.5).rotateX(Math.PI / 2), M.ceil, -2, H, -3.75, { hit: 'concrete' });
  const lowCeilMat = M.acoustic;
  const lc1 = addMesh(new THREE.PlaneGeometry(22, 7.5).rotateX(Math.PI / 2), lowCeilMat, 0, 4, 11.25, { hit: 'wood' });
  const lc2 = addMesh(new THREE.PlaneGeometry(4, 22.5).rotateX(Math.PI / 2), lowCeilMat, 9, 4, -3.75, { hit: 'wood' });
  lc1.material = lowCeilMat.clone(); lc1.material.map = heraklith.clone(); lc1.material.map.repeat.set(22 / 1.2, 7.5 / 0.6); lc1.material.bumpMap = lc1.material.map;
  lc2.material = lowCeilMat.clone(); lc2.material.map = heraklith.clone(); lc2.material.map.repeat.set(4 / 1.2, 22.5 / 0.6); lc2.material.bumpMap = lc2.material.map;
  // faldones del techo bajo (de 4 a 7,5 m)
  box(18, H - 4, 0.3, M.black, -2, 4 + (H - 4) / 2, 7.5, { collide: false });
  box(0.3, H - 4, 22.5, M.black, 7, 4 + (H - 4) / 2, -3.75, { collide: false });
  // paredes
  const wallMat = (rx, ry) => { const m = M.wall.clone(); for (const k of ['map', 'normalMap', 'roughnessMap']) { m[k] = M.wall[k].clone(); m[k].repeat.set(rx, ry); } return m; };
  const acousticWall = M.acoustic.clone(); acousticWall.map = heraklith.clone(); acousticWall.map.repeat.set(30 / 1.2, H / 0.6); acousticWall.bumpMap = acousticWall.map; acousticWall.color.set(0x6a625c);
  addMesh(new THREE.PlaneGeometry(30, H).rotateY(Math.PI / 2), acousticWall, minX, H / 2, 0, { hit: 'wood' });
  addMesh(new THREE.PlaneGeometry(30, H).rotateY(-Math.PI / 2), wallMat(8, 2), maxX, H / 2, 0, { hit: 'concrete' });
  addMesh(new THREE.PlaneGeometry(22, H), wallMat(6, 2), 0, H / 2, minZ, { hit: 'concrete' });
  addMesh(new THREE.PlaneGeometry(22, H).rotateY(Math.PI), wallMat(6, 2), 0, H / 2, maxZ, { hit: 'concrete' });

  // ---------- ENTRADA (z 7.5..15) ----------
  box(9, 4, 0.3, M.wall, -6.5, 2, 7.5, { tag: 'wall' }); // pared del guardarropa hacia la pista
  for (const x of [-1.5, 2.5]) box(0.5, 4, 0.5, M.column, x, 2, 7.5, { tag: 'column' });
  // guardarropa: mostrador + percheros con abrigos
  box(4.6, 1.1, 0.6, M.wood, -8.4, 0.55, 10.2, { tag: 'counter' });
  box(4.8, 0.05, 0.75, M.barTop, -8.4, 1.125, 10.2, { collide: false });
  const coatMat = [0x1a1a22, 0x2a1d18, 0x121212, 0x2c2c30, 0x3a1a1a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  for (let i = 0; i < 14; i++) {
    const m = addMesh(boxGeo(0.45, 0.9 + Math.random() * 0.2, 0.12), coatMat[i % 5], -10.4 + i * 0.3, 1.25, 12.2 + (Math.random() - 0.5) * 0.1, { hit: 'body' });
    m.rotation.y = (Math.random() - 0.5) * 0.3;
  }
  box(4.8, 0.04, 0.04, M.chrome, -8.4, 1.75, 12.2, { collide: false, hit: 'metal' });
  // puerta principal (doble hoja)
  const doorMat = M.metal.clone(); doorMat.color.set(0x222326);
  W.doors = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(2.5 + s * 1.5, 0, maxZ - 0.05); root.add(pivot);
    const leaf = addMesh(boxGeo(1.48, 2.6, 0.08), doorMat, -s * 0.74, 1.3, 0, { parent: pivot, hit: 'metal' });
    addMesh(boxGeo(0.04, 0.5, 0.06), M.chrome, -s * 1.3, 1.1, -0.08, { parent: pivot, hit: 'metal' });
    W.doors.push({ pivot, side: s, leaf });
  }
  box(3.4, 0.25, 0.2, M.metal, 2.5, 2.72, maxZ - 0.1, { collide: false, hit: 'metal' });
  // carteles de salida
  const exitMat = new THREE.MeshBasicMaterial({ map: exitSignTex(), color: 0xffffff });
  W.exitMat = exitMat;
  const exits = [[2.5, 3.1, maxZ - 0.12, Math.PI], [-9.5, 2.6, 7.34, Math.PI], [-6, 3.2, minZ + 0.12, 0], [10.2, 3.2, 14.88, Math.PI]];
  for (const [x, y, z, ry] of exits) {
    const m = addMesh(boxGeo(0.7, 0.26, 0.06), [M.black, M.black, M.black, M.black, exitMat, exitMat], x, y, z, { hit: 'glass' });
    m.rotation.y = ry;
  }
  // póster GOLDEN OCLOCK (pared izquierda, cerca de la entrada)
  const poster = addMesh(new THREE.PlaneGeometry(0.62, 0.9), new THREE.MeshStandardMaterial({ map: posterTex(), roughness: 0.4 }), minX + 0.03, 1.75, 5.2, { hit: 'wood' });
  poster.rotation.y = Math.PI / 2;

  // ---------- ESCENARIO (z -15..-9.5, x -4..4, 0.9 m) ----------
  box(8, 0.9, 5.5, M.stageTop, 0, 0.45, -12.25, { tag: 'stage' });
  addMesh(boxGeo(8.02, 0.88, 0.02), M.cloth, 0, 0.44, -9.49, { hit: 'wood' });
  // escalerilla con barandilla (esquina del lado de la barra)
  for (let i = 1; i <= 3; i++) box(1, 0.225 * i, 0.28 * (4 - i), M.plate, 3.5, 0.1125 * i, -9.5 + 0.14 * (4 - i), { hit: 'metal', tag: 'steps' });
  box(0.05, 1, 0.05, M.stairMetal, 4.02, 0.5 + 0.5, -8.7, { hit: 'metal' });
  box(0.05, 0.05, 1.1, M.stairMetal, 4.02, 1.3, -9.1, { collide: false, hit: 'metal' }).rotation.x = 0.55;
  // pantalla LED 5,5 × 2,5
  const scr = screenMaterial(); W.screenMat = scr;
  addMesh(boxGeo(5.8, 2.8, 0.2), M.speaker, 0, 0.9 + 0.6 + 1.25, minZ + 0.15, { hit: 'metal' });
  addMesh(new THREE.PlaneGeometry(5.5, 2.5), scr, 0, 0.9 + 0.6 + 1.25, minZ + 0.26, { hit: 'glass' });
  // neón ZOCO encima de la pantalla
  const zoco = neonZoco(); zoco.group.position.set(0, 5.9, minZ + 0.3); zoco.group.scale.setScalar(0.72); root.add(zoco.group);
  W.neon = zoco;
  // mesa de DJ de truss
  const trussMat = M.truss;
  const trussBox = (w, h, d, x, y, z, parent = root) => {
    // truss cuadrado: 4 cordones + celosía
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const r = 0.022, L = Math.max(w, h, d), axis = w === L ? 'x' : h === L ? 'y' : 'z';
    const s = Math.min(w, h, d) / 2 - r;
    const cyl = new THREE.CylinderGeometry(r, r, L, 8);
    const lat = new THREE.CylinderGeometry(0.009, 0.009, s * 2 * 1.414, 5);
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const c = new THREE.Mesh(cyl, trussMat);
      if (axis === 'x') { c.rotation.z = Math.PI / 2; c.position.set(0, a * s, b * s); }
      else if (axis === 'z') { c.rotation.x = Math.PI / 2; c.position.set(a * s, b * s, 0); }
      else c.position.set(a * s, 0, b * s);
      g.add(c); c.userData.mat = 'metal'; W.hit.push(c);
    }
    const n = Math.floor(L / (s * 2));
    for (let i = 0; i < n; i++) {
      const t = -L / 2 + (i + 0.5) * (L / n);
      for (const f of [-1, 1]) {
        const l = new THREE.Mesh(lat, trussMat);
        if (axis === 'x') { l.position.set(t, 0, f * s); l.rotation.z = (i % 2 ? 1 : -1) * Math.PI / 4; }
        else if (axis === 'z') { l.position.set(f * s, 0, t); l.rotation.x = (i % 2 ? 1 : -1) * Math.PI / 4; }
        else { l.position.set(f * s, t, 0); l.rotation.x = (i % 2 ? 1 : -1) * Math.PI / 4; }
        g.add(l);
      }
    }
    return g;
  };
  trussBox(3.2, 0.3, 0.3, 0, 0.9 + 1.0, -10.6);
  trussBox(3.2, 0.3, 0.3, 0, 0.9 + 0.15, -10.6);
  for (const x of [-1.45, 1.45]) trussBox(0.3, 1.0, 0.3, x, 0.9 + 0.55, -10.6);
  col(-1.6, 0.9, -10.75, 1.6, 2.05, -10.45, 'djtable');
  box(3.3, 0.05, 0.7, M.speaker, 0, 2.08, -10.6, { collide: false, hit: 'wood' });
  for (const x of [-1, 0, 1]) addMesh(boxGeo(0.34, 0.08, 0.42), M.grille, x, 2.14, -10.6, { hit: 'metal' });
  // torres de truss verticales a los lados del escenario, con focos
  for (const x of [-4.3, 4.3]) { trussBox(0.3, 6.5, 0.3, x, 3.25, -9.8); col(x - 0.15, 0, -9.95, x + 0.15, 6.5, -9.65, 'truss'); }
  // paneles LED verticales a los lados
  W.sidePanels = [];
  for (const x of [-5.4, 5.4]) {
    box(1.2, 4, 0.25, M.speaker, x, 2, -13.5, { hit: 'metal' });
    const pm = screenMaterial();
    addMesh(new THREE.PlaneGeometry(1.1, 3.9), pm, x, 2, -13.37, { hit: 'glass' });
    W.sidePanels.push(pm);
  }
  // line arrays colgados y subwoofers en el suelo
  for (const x of [-6.2, 6.2]) {
    for (let i = 0; i < 6; i++) {
      const m = addMesh(boxGeo(1.1, 0.32, 0.7), M.speaker, x, 6.3 - i * 0.34, -9.6, { hit: 'metal' });
      m.rotation.x = -0.04 * i;
    }
    for (let k = 0; k < 2; k++) {
      box(1.3, 0.85, 0.9, M.speaker, x, 0.425 + k * 0.86, -8.7, { hit: 'wood', tag: 'sub' });
      addMesh(new THREE.CircleGeometry(0.33, 28), M.grille, x, 0.425 + k * 0.86, -8.24, { hit: 'metal' });
    }
  }

  // ---------- BARRA (lado derecho) ----------
  const bar = { x0: 8.3, x1: 9.1, z0: -9, z1: 9 };
  box(0.8, 1.05, 18, M.wood, (bar.x0 + bar.x1) / 2, 0.525, 0, { tag: 'bar', hit: 'wood', uvScale: 1.2 });
  box(1.05, 0.06, 18.1, M.barTop, (bar.x0 + bar.x1) / 2 - 0.1, 1.08, 0, { collide: false, hit: 'wood' });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  W.barStripMat = stripMat;
  addMesh(boxGeo(0.02, 0.025, 18), stripMat, bar.x0 - 0.36, 1.05, 0, { hit: null });
  // columnas cuadradas oscuras entre barra y pista
  for (const z of [-7, -1.5, 4, 9.5]) box(0.55, 4, 0.55, M.column, 7.25, 2, z, { tag: 'column' });
  // contrabarra, estanterías retroiluminadas
  box(0.6, 0.95, 16, M.speaker, 10.65, 0.475, 0, { tag: 'backbar', hit: 'wood' });
  const backlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
  W.backlightMat = backlight;
  const blTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff3a8a'); gr.addColorStop(0.5, '#ffb050'); gr.addColorStop(1, '#ff6a20'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  backlight.map = blTex;
  addMesh(new THREE.PlaneGeometry(14, 1.5).rotateY(-Math.PI / 2), backlight, 10.97, 1.85, 0, { hit: 'glass' });
  const shelfYs = [1.2, 1.7, 2.2];
  for (const y of shelfYs) addMesh(boxGeo(0.28, 0.03, 14), new THREE.MeshStandardMaterial({ color: 0x99aabb, transparent: true, opacity: 0.4, roughness: 0.05 }), 10.82, y, 0, { hit: 'glass' });
  // botellas (instanciadas)
  const prof = [[0, 0], [0.036, 0], [0.038, 0.01], [0.038, 0.19], [0.03, 0.22], [0.013, 0.25], [0.012, 0.3], [0.014, 0.305], [0, 0.305]].map((p) => new THREE.Vector2(p[0], p[1]));
  const bGeo = new THREE.LatheGeometry(prof, 12);
  const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, emissive: 0xffffff, emissiveIntensity: 1 });
  bMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor * vColor * 0.9;\n#endif'); };
  const bottleCols = [0x2f8a3a, 0xc07a20, 0xdde6ee, 0x3050c0, 0x8a1f2a, 0xd8b050];
  const nB = quality === 'low' ? 60 : 108;
  const bottles = new THREE.InstancedMesh(bGeo, bMat, nB);
  W.bottleMat = bMat;
  bottles.userData.mat = 'glass'; bottles.userData.bottles = true;
  const bData = [];
  const mm = new THREE.Matrix4(), cc = new THREE.Color();
  for (let i = 0; i < nB; i++) {
    const shelf = i % 3, k = Math.floor(i / 3), per = Math.ceil(nB / 3);
    const z = -6.6 + (k / per) * 13.2 + (Math.random() - 0.5) * 0.05;
    const p = new THREE.Vector3(10.82 + (Math.random() - 0.5) * 0.08, shelfYs[shelf] + 0.015, z);
    const s = 0.85 + Math.random() * 0.35;
    mm.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, s, 1));
    bottles.setMatrixAt(i, mm);
    const c = bottleCols[Math.floor(Math.random() * bottleCols.length)];
    bottles.setColorAt(i, cc.set(c));
    bData.push({ p, alive: true, color: new THREE.Color(c) });
  }
  root.add(bottles); W.hit.push(bottles);
  W.bottles = { mesh: bottles, data: bData };
  // grifos de cerveza y torres de vasos
  for (let i = 0; i < 4; i++) {
    const z = -1.2 + i * 0.8;
    addMesh(new THREE.CylinderGeometry(0.03, 0.035, 0.45, 12), M.chrome, 8.9, 1.33, z, { hit: 'metal' });
    addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8).rotateZ(Math.PI / 2), M.chrome, 8.82, 1.5, z, { hit: 'metal' });
  }
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.05, transparent: true, opacity: 0.35, metalness: 0.1 });
  for (const z of [-5, 5.5]) for (let lvl = 0; lvl < 5; lvl++) for (let j = 0; j < 5 - lvl; j++) {
    addMesh(new THREE.CylinderGeometry(0.04, 0.032, 0.12, 12, 1, true), glassMat, 10.6 + (j - (4 - lvl) / 2) * 0.09 * 0, 1.01 + lvl * 0.12, z + (j - (4 - lvl) / 2) * 0.09, { hit: 'glass' });
  }
  // rótulos redondos de neón inventados
  W.barNeons = [];
  for (const [i, z] of [[0, -3.5], [1, 3.5]]) {
    const n = neonRound(i); n.group.position.set(10.95, 3.2, z); n.group.rotation.y = -Math.PI / 2; root.add(n.group); W.barNeons.push(n);
  }
  // truss con focos ámbar sobre la barra
  trussBox(0.25, 0.25, 18, 8.7, 3.7, 0);
  W.amberSpots = [];
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  W.amberLens = lensMat;
  for (let i = 0; i < 7; i++) {
    const z = -7.5 + i * 2.5;
    const can = addMesh(new THREE.CylinderGeometry(0.09, 0.11, 0.25, 12), M.speaker, 8.7, 3.45, z, { hit: 'metal' });
    addMesh(new THREE.CircleGeometry(0.085, 16).rotateX(Math.PI / 2), lensMat, 8.7, 3.32, z, { hit: null });
    W.amberSpots.push(new THREE.Vector3(8.7, 3.3, z));
  }

  // ---------- LADO IZQUIERDO: focos de pared ----------
  for (const z of [-8, -1, 6]) addMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 10).rotateZ(Math.PI / 2), M.speaker, minX + 0.15, 3.6, z, { hit: 'metal' });

  // ---------- bidones metálicos (mesas altas / cobertura) ----------
  const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 20);
  const ribGeo = new THREE.TorusGeometry(0.305, 0.015, 6, 24).rotateX(Math.PI / 2);
  const barrels = [[-9.8, -6.5], [-9.8, -1.5], [-9.8, 3.5], [-6.5, 5.9], [5.9, -6.2], [6.1, 0.8], [5.9, 5.6], [0.8, 10.5], [-3.5, 11.8]];
  for (const [x, z] of barrels) {
    addMesh(barrelGeo, M.barrel, x, 0.5, z, { hit: 'metal' });
    for (const y of [0.33, 0.66]) addMesh(ribGeo, M.barrel, x, y, z, { hit: null });
    addMesh(new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2), M.barTop, x, 1.001, z, { hit: 'metal' });
    col(x - 0.3, 0, z - 0.3, x + 0.3, 1.0, z + 0.3, 'barrel');
  }

  // ---------- ESCALERA-PLATAFORMA CENTRAL ----------
  const S = STAIR;
  const sw = S.x1 - S.x0, scx = (S.x0 + S.x1) / 2;
  const nSteps = Math.round(S.top / S.rise); // 12
  const run = nSteps * S.tread;
  const pz0 = S.cz - S.platD / 2, pz1 = S.cz + S.platD / 2;
  W.stair = { ...S, pz0, pz1, run, nSteps };
  // plataforma superior (chapa lagrimada)
  const platMat = M.plate.clone(); platMat.bumpMap = diamondPlate.clone(); platMat.bumpMap.repeat.set(sw * 2, S.platD * 2);
  const stepMat = M.plate.clone(); stepMat.bumpMap = diamondPlate.clone(); stepMat.bumpMap.repeat.set(sw * 2, 0.6);
  addMesh(boxGeo(sw, 0.08, S.platD), platMat, scx, S.top - 0.04, S.cz, { hit: 'metal', cast: true });
  col(S.x0, S.top - 0.08, pz0, S.x1, S.top, pz1, 'stair');
  for (let i = 1; i < nSteps; i++) {
    const h = i * S.rise;
    for (const dir of [1, -1]) {
      // dir 1: tramo hacia la entrada (z+), dir -1: hacia el escenario (z-)
      const edge = dir > 0 ? pz1 : pz0;
      const zc = edge + dir * (run - i * S.tread + S.tread / 2) ;
      addMesh(boxGeo(sw, 0.05, S.tread + 0.02), stepMat, scx, h - 0.025, zc, { hit: 'metal', cast: true });
      col(S.x0, h - 0.06, zc - S.tread / 2, S.x1, h, zc + S.tread / 2, 'stair');
      // barandillas: colisión lateral por escalón
      for (const x of [S.x0, S.x1]) col(x - 0.04, h, zc - S.tread / 2, x + 0.04, h + 1.0, zc + S.tread / 2, 'rail');
    }
  }
  for (const x of [S.x0, S.x1]) col(x - 0.04, S.top, pz0, x + 0.04, S.top + 1.0, pz1, 'rail');
  // zancas (vigas inclinadas) y barandillas de tubo
  const stringerGeo = new THREE.BoxGeometry(0.08, 0.28, Math.hypot(run, S.top) + 0.1);
  const railGeo = new THREE.CylinderGeometry(0.024, 0.024, Math.hypot(run, S.top) + 0.2, 10);
  const ang = Math.atan2(S.top, run);
  for (const dir of [1, -1]) {
    const edge = dir > 0 ? pz1 : pz0;
    const mz = edge + dir * run / 2;
    for (const x of [S.x0 - 0.02, S.x1 + 0.02]) {
      const st = addMesh(stringerGeo, M.stairMetal, x, S.top / 2 - 0.12, mz, { hit: 'metal', cast: true });
      st.rotation.x = dir * ang;
      const rl = addMesh(railGeo, M.stairMetal, x, S.top / 2 + 1.0, mz, { hit: 'metal' });
      rl.rotation.x = Math.PI / 2 + dir * ang;
      // balaustres
      for (let k = 1; k < 6; k++) {
        const t = k / 6, zz = edge + dir * run * (1 - t), yy = S.top * t;
        addMesh(new THREE.CylinderGeometry(0.016, 0.016, 1.0, 8), M.stairMetal, x, yy + 0.5, zz, { hit: 'metal' });
      }
    }
  }
  // barandillas de la plataforma
  for (const x of [S.x0 - 0.02, S.x1 + 0.02]) {
    addMesh(new THREE.CylinderGeometry(0.024, 0.024, S.platD, 10).rotateX(Math.PI / 2), M.stairMetal, x, S.top + 1.0, S.cz, { hit: 'metal' });
    addMesh(new THREE.CylinderGeometry(0.018, 0.018, S.platD, 8).rotateX(Math.PI / 2), M.stairMetal, x, S.top + 0.5, S.cz, { hit: 'metal' });
    for (const z of [pz0, S.cz, pz1]) addMesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), M.stairMetal, x, S.top + 0.5, z, { hit: 'metal' });
  }
  // estructura hueca de perfiles: pilares y cruces de San Andrés bajo la plataforma
  const post = (x, z, h) => { addMesh(new THREE.BoxGeometry(0.1, h, 0.1), M.stairMetal, x, h / 2, z, { hit: 'metal', cast: true }); col(x - 0.05, 0, z - 0.05, x + 0.05, h, z + 0.05, 'post'); };
  for (const x of [S.x0 + 0.05, S.x1 - 0.05]) for (const z of [pz0, pz1]) post(x, z, S.top - 0.08);
  for (const x of [S.x0 + 0.05, S.x1 - 0.05]) for (const dir of [1, -1]) post(x, (dir > 0 ? pz1 : pz0) + dir * run * 0.5, S.top * 0.5 - 0.06);
  const diagL = Math.hypot(S.platD, S.top - 0.2);
  for (const x of [S.x0 + 0.05, S.x1 - 0.05]) for (const s of [1, -1]) {
    const d = addMesh(new THREE.BoxGeometry(0.06, diagL, 0.06), M.stairMetal, x, (S.top - 0.1) / 2, S.cz, { hit: 'metal' });
    d.rotation.x = s * Math.atan2(S.platD, S.top - 0.2);
  }
  for (const z of [pz0, pz1]) addMesh(new THREE.BoxGeometry(sw, 0.12, 0.1), M.stairMetal, scx, S.top - 0.14, z, { hit: 'metal' });

  // ---------- TECHO DE LA PISTA: parrilla de truss ----------
  const gx0 = -8, gx1 = 6, gz0 = -8.5, gz1 = 5.5, gy = 6.4;
  for (let i = 0; i < 4; i++) {
    const x = gx0 + (i * (gx1 - gx0)) / 3, z = gz0 + (i * (gz1 - gz0)) / 3;
    trussBox(0.3, 0.3, gz1 - gz0, x, gy, (gz0 + gz1) / 2);
    trussBox(gx1 - gx0, 0.3, 0.3, (gx0 + gx1) / 2, gy, z);
  }
  // cabezas móviles y PAR colgados
  W.heads = [];
  const headMat = M.speaker;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if ((i + j) % 2) continue;
    const x = gx0 + (i * (gx1 - gx0)) / 3, z = gz0 + (j * (gz1 - gz0)) / 3;
    const yoke = new THREE.Group(); yoke.position.set(x, gy - 0.35, z); root.add(yoke);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.34, 14), headMat); body.rotation.x = Math.PI / 2; yoke.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })); lens.position.z = 0.18; yoke.add(lens);
    W.heads.push({ yoke, lens, pos: new THREE.Vector3(x, gy - 0.35, z), dir: new THREE.Vector3(0, -1, 0), color: new THREE.Color(), phase: Math.random() * 6 });
  }
  // altavoces redondos y rejillas en el techo oscuro
  for (let i = 0; i < 6; i++) addMesh(new THREE.CircleGeometry(0.3, 20).rotateX(Math.PI / 2), M.grille, -8 + i * 2.8, H - 0.01, 3 - (i % 2) * 9, { hit: 'metal' });
  // luces de trabajo del techo (para «CERRAMOS»)
  const workMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  W.workMat = workMat;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) addMesh(new THREE.BoxGeometry(1.4, 0.06, 0.25), workMat, -7 + i * 5, H - 0.05, -11 + j * 7, { hit: null });
  for (let i = 0; i < 4; i++) addMesh(new THREE.BoxGeometry(1.2, 0.05, 0.2), workMat, -7 + i * 4.5, 3.97, 11, { hit: null });

  // ---------- bola de espejos ----------
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.07, flatShading: true, envMapIntensity: 1.5 });
  const ball = addMesh(new THREE.SphereGeometry(0.42, 40, 22), ballMat, BALL_POS.x, BALL_POS.y, BALL_POS.z, { hit: 'glass' });
  ball.userData.mirrorBall = true;
  const chain = addMesh(new THREE.CylinderGeometry(0.01, 0.01, H - BALL_POS.y - 0.4, 6), M.chrome, BALL_POS.x, (H + BALL_POS.y + 0.4) / 2, BALL_POS.z, { hit: null });
  W.ball = { mesh: ball, chain, alive: true, falling: false, vel: 0, rot: 0 };
  // puntos de luz de la bola en paredes/suelo/techo
  const nDots = quality === 'low' ? 120 : quality === 'ultra' ? 420 : 260;
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }) });
  const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dotMat, nDots);
  dots.frustumCulled = false; dots.renderOrder = 2; root.add(dots);
  const dotDirs = [];
  for (let i = 0; i < nDots; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.62, Math.random() - 0.5).normalize(); dotDirs.push(v); }
  W.dots = { mesh: dots, dirs: dotDirs, mat: dotMat };

  // ---------- máquinas de humo ----------
  W.smokeMachines = [new THREE.Vector3(-3.2, 0.95, -9.3), new THREE.Vector3(3.2, 0.95, -9.3), new THREE.Vector3(-9.5, 0.2, -4)];
  for (const p of W.smokeMachines) addMesh(boxGeo(0.5, 0.3, 0.35), M.metal, p.x, p.y - 0.1, p.z + 0.1, { hit: 'metal' });

  // ---------- luces ----------
  const L = W.lights;
  L.hemi = new THREE.HemisphereLight(0x8090b0, 0x201818, 0.0);
  scene.add(L.hemi);
  L.emergency = [];
  for (const p of [[2.5, 3.6, 13.6], [9.6, 3.7, -9.5], [-10.4, 5.2, -12]]) {
    const l = new THREE.PointLight(0xdfe8ff, 3.5, 0, 2); l.position.set(...p); scene.add(l); L.emergency.push(l);
    addMesh(boxGeo(0.34, 0.1, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeef4ff).multiplyScalar(3) }), p[0], p[1] + 0.08, p[2] + (p[2] > 0 ? 0.0 : 0), { hit: null });
  }
  L.exitGreen = new THREE.PointLight(0x20ff60, 0.9, 0, 2); L.exitGreen.position.set(2.5, 2.9, maxZ - 0.5); scene.add(L.exitGreen);
  L.stage = [];
  const stageShadow = quality === 'ultra' ? 2 : 0;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SpotLight(0xffffff, 0, 0, 0.32, 0.5, 1.6);
    s.position.set(-5 + i * 4.5, gy - 0.4, -4 + (i % 2) * 3);
    s.target.position.set(s.position.x, 0, s.position.z);
    scene.add(s, s.target);
    if (i < stageShadow) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03; }
    L.stage.push(s);
  }
  L.screen = new THREE.PointLight(0xff40a0, 0, 0, 1.6); L.screen.position.set(0, 3.4, minZ + 2.5); scene.add(L.screen);
  L.bar = new THREE.PointLight(0xffa050, 0, 0, 1.8); L.bar.position.set(9.6, 3.0, 0); scene.add(L.bar);
  L.floorBounce = new THREE.PointLight(0xff60c0, 0, 0, 1.5); L.floorBounce.position.set(-1, 5.5, -1.5); scene.add(L.floorBounce);

  // ---------- láseres ----------
  const laserGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true); laserGeo.rotateX(Math.PI / 2); laserGeo.translate(0, 0, 0.5);
  const glowGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true); glowGeo.rotateX(Math.PI / 2); glowGeo.translate(0, 0, 0.5);
  W.lasers = [];
  const laserSrc = [
    { p: new THREE.Vector3(4.3, 6.2, -9.8), col: 0x20ff40, battery: true },
    { p: new THREE.Vector3(-4.3, 6.2, -9.8), col: 0xff2040 },
    { p: new THREE.Vector3(0, 2.25, -10.6), col: 0x30a0ff },
  ];
  for (const src of laserSrc) {
    const beams = [];
    for (let k = 0; k < 7; k++) {
      const core = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: src.col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: src.col, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.position.copy(src.p); glow.position.copy(src.p); core.frustumCulled = glow.frustumCulled = false;
      root.add(core, glow);
      beams.push({ core, glow });
    }
    W.lasers.push({ ...src, beams, color: new THREE.Color(src.col) });
  }

  // coberturas y puntos de patrulla
  W.coverSpots = [];
  for (const b of W.colliders) {
    if (!['column', 'barrel', 'sub', 'post', 'counter', 'bar'].includes(b.tag)) continue;
    const c = b.getCenter(new THREE.Vector3()); const s = b.getSize(new THREE.Vector3());
    if (b.tag === 'bar') { for (const z of [-6, -2, 2, 6]) W.coverSpots.push({ p: new THREE.Vector3(b.min.x - 0.6, 0, z), box: b }); continue; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) W.coverSpots.push({ p: new THREE.Vector3(c.x + dx * (s.x / 2 + 0.55), 0, c.z + dz * (s.z / 2 + 0.55)), box: b });
  }
  // bajo la escalera
  for (const [x, z] of [[scx, S.cz], [scx - 1, S.cz - 0.8], [scx + 1, S.cz + 0.8]]) W.coverSpots.push({ p: new THREE.Vector3(x, 0, z), box: null, under: true });
  W.coverSpots = W.coverSpots.filter((c) => c.p.x > minX + 0.5 && c.p.x < 8 && c.p.z > -9.3 && c.p.z < 14.5);
  W.patrol = [];
  for (let i = 0; i < 16; i++) W.patrol.push(new THREE.Vector3(-8 + Math.random() * 14, 3.2 + Math.random() * 2.4, -8.5 + Math.random() * 14));
  for (const z of [-6, -3, 0, 3, 6]) W.patrol.push(new THREE.Vector3(6.6, 2.4 + Math.random(), z));

  // ---------- helpers ----------
  W.bounds = { minX, maxX, minZ, maxZ };
  W.spawn = { pos: new THREE.Vector3(2.5, 0, 12.8), yaw: 0 };
  W.doorOutside = new THREE.Vector3(2.5, 0, maxZ + 1.5);
  W.doorInside = new THREE.Vector3(2.5, 0, 12.5);
  W.isMetalStair = (x, z, y) => x > S.x0 - 0.1 && x < S.x1 + 0.1 && z > pz0 - run - 0.1 && z < pz1 + run + 0.1 && y > 0.1;
  // distancia de un rayo al interior de la nave (para láseres y puntos de la bola)
  W.rayRoom = (o, d) => {
    let t = 1e9;
    const ex = [[d.x, minX, maxX, o.x], [d.y, 0, H, o.y], [d.z, minZ, maxZ, o.z]];
    let axis = 0;
    ex.forEach(([dd, lo, hi, oo], a) => { if (Math.abs(dd) < 1e-6) return; const tt = ((dd > 0 ? hi : lo) - oo) / dd; if (tt < t) { t = tt; axis = a; } });
    return { t, axis };
  };
  return W;
}
