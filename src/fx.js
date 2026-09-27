// Efectos: partículas (chispas, polvo, humo, líquido, fuego), marcas de impacto, casquillos,
// cristales, trazadoras y destellos de luz. Todo con pools para no crear objetos por disparo.
import * as THREE from 'three';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const softTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const smokeTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 40; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.4, y = s / 2 + (Math.random() - 0.5) * s * 0.4, r = s * (0.12 + Math.random() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
});
export const holeTex = canvasTex(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  const c = s / 2;
  let gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.18, 'rgba(10,8,6,0.9)'); gr.addColorStop(0.3, 'rgba(40,36,32,0.6)'); gr.addColorStop(0.62, 'rgba(60,55,50,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,18,16,0.7)'; g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2; let r = s * 0.1; g.beginPath(); g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    let aa = a; while (r < s * 0.45) { r += 4 + Math.random() * 6; aa += (Math.random() - 0.5) * 0.5; g.lineTo(c + Math.cos(aa) * r, c + Math.sin(aa) * r); }
    g.stroke();
  }
});
export const flashTex = canvasTex(128, (g, s) => {
  const c = s / 2;
  g.translate(c, c);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
    const l = s * (0.3 + Math.random() * 0.2);
    const gr = g.createLinearGradient(0, 0, l, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -s * 0.035); g.lineTo(l, 0); g.lineTo(0, s * 0.035); g.fill();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s * 0.2, 0, Math.PI * 2); g.fill();
});

const ptVert = /* glsl */ `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
uniform float uScale; uniform vec3 uAmb; uniform vec3 uFlPos; uniform vec3 uFlDir; uniform float uFlOn; uniform vec3 uFlashPos; uniform float uFlash; uniform float uLit;
varying vec3 vColor; varying float vAlpha; varying float vRot;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  vec3 c = aColor;
  if (uLit > 0.5) {
    vec3 lv = wp.xyz - uFlPos; float ld = length(lv);
    float cone = smoothstep(0.86, 0.97, dot(lv / ld, uFlDir)) * uFlOn / (1.0 + ld * ld * 0.08);
    vec3 fv = wp.xyz - uFlashPos; float fl = uFlash / (1.0 + dot(fv, fv) * 0.5);
    c = aColor * (uAmb + vec3(cone * 2.2) + vec3(1.0, 0.7, 0.4) * fl);
  }
  vColor = c; vAlpha = aAlpha; vRot = aRot;
}`;
const ptFrag = /* glsl */ `
uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha; varying float vRot;
void main() {
  vec2 p = gl_PointCoord - 0.5; float s = sin(vRot), c = cos(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(uTex, p);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.003) discard;
}`;

export const sharedPtUniforms = {
  uScale: { value: 500 }, uAmb: { value: new THREE.Vector3(0.05, 0.05, 0.06) },
  uFlPos: { value: new THREE.Vector3() }, uFlDir: { value: new THREE.Vector3(0, 0, -1) }, uFlOn: { value: 1 },
  uFlashPos: { value: new THREE.Vector3() }, uFlash: { value: 0 },
};

class Particles {
  constructor(max, { additive = false, tex = softTex, lit = false } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.rot = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.spin = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...sharedPtUniforms, uTex: { value: tex }, uLit: { value: lit ? 1 : 0 } },
      vertexShader: ptVert, fragmentShader: ptFrag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.next = 0; this.alive = 0;
  }
  spawn(p, v, { life = 1, size = 0.1, grow = 0, color = [1, 1, 1], alpha = 1, drag = 0, gravity = 0, spin = 0 } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.alpha[i] = alpha; this.a0[i] = alpha;
    this.drag[i] = drag; this.grav[i] = gravity; this.rot[i] = Math.random() * 6.28; this.spin[i] = spin * (Math.random() - 0.5);
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      this.alpha[i] = this.a0[i] * (k < 0.7 ? k / 0.7 : 1) * (this.maxLife[i] - this.life[i] < 0.05 ? (this.maxLife[i] - this.life[i]) / 0.05 : 1);
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha', 'aRot']) this.geo.attributes[n].needsUpdate = true;
  }
}

// Segmentos de línea aditivos para chispas y trazadoras
class Streaks {
  constructor(max) {
    this.max = max;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max); this.c = new Float32Array(max * 3);
    this.len = new Float32Array(max);
    this.arr = new Float32Array(max * 6); this.carr = new Float32Array(max * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.arr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.carr, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false; this.lines.renderOrder = 4;
    this.next = 0;
  }
  spawn(p, v, life, color, len = 0.04) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.p.set([p.x, p.y, p.z], i * 3); this.v.set([v.x, v.y, v.z], i * 3); this.life[i] = life; this.ml[i] = life; this.c.set(color, i * 3); this.len[i] = len;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const o = i * 6;
      if (this.life[i] <= 0) { this.arr.fill(0, o, o + 6); this.carr.fill(0, o, o + 6); continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.ml[i]);
      this.v[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.p[i * 3 + a] += this.v[i * 3 + a] * dt;
      if (this.p[i * 3 + 1] < 0.01) { this.p[i * 3 + 1] = 0.01; this.v[i * 3 + 1] *= -0.4; this.v[i * 3] *= 0.6; this.v[i * 3 + 2] *= 0.6; }
      for (let a = 0; a < 3; a++) {
        this.arr[o + a] = this.p[i * 3 + a];
        this.arr[o + 3 + a] = this.p[i * 3 + a] - this.v[i * 3 + a] * this.len[i];
        this.carr[o + a] = this.c[i * 3 + a] * k; this.carr[o + 3 + a] = this.c[i * 3 + a] * k * 0.2;
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, groundAt, audio) {
    this.scene = scene; this.groundAt = groundAt; this.audio = audio;
    this.glow = new Particles(900, { additive: true });
    this.smoke = new Particles(500, { tex: smokeTex, lit: true });
    this.streaks = new Streaks(500);
    scene.add(this.glow.points, this.smoke.points, this.streaks.lines);
    // marcas de impacto
    this.maxHoles = 220;
    const holeMat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9, metalness: 0 });
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), holeMat, this.maxHoles);
    this.holes.count = 0; this.holes.frustumCulled = false; this.holes.renderOrder = 1; this.holeNext = 0;
    scene.add(this.holes);
    // casquillos
    this.maxCas = 40;
    const casGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.045, 10); casGeo.rotateZ(Math.PI / 2);
    this.casMat = new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 1, roughness: 0.28 });
    this.cas = new THREE.InstancedMesh(casGeo, this.casMat, this.maxCas);
    this.cas.frustumCulled = false; this.cas.castShadow = false;
    this.casData = Array.from({ length: this.maxCas }, () => ({ p: new THREE.Vector3(0, -10, 0), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), t: 99, bounces: 0 }));
    this.casNext = 0;
    scene.add(this.cas);
    // cristales (quedan en el suelo)
    this.maxShards = 260;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.03, 0.005, 0.008, 0.008, 0.02, -0.01], 3));
    sg.computeVertexNormals();
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0xcfe8e0, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.75, side: THREE.DoubleSide, emissive: 0x223333, emissiveIntensity: 0.3 });
    this.shards = new THREE.InstancedMesh(sg, this.shardMat, this.maxShards);
    this.shards.frustumCulled = false; this.shards.count = 0;
    this.shardData = []; this.shardNext = 0;
    scene.add(this.shards);
    // trazadoras
    this.tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.4).multiplyScalar(6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const tg = new THREE.CylinderGeometry(0.004, 0.004, 1, 5, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.5);
    this.tracers = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(tg, this.tracerMat.clone()); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, t: 0 }; });
    this.tracerNext = 0;
    // destello de luz genérico (explosiones, impactos grandes)
    this.flashLight = new THREE.PointLight(0xffaa66, 0, 0, 2);
    scene.add(this.flashLight);
    this.flashT = 0; this.flashI = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }

  hole(point, normal, size = 0.09) {
    const i = this.holeNext; this.holeNext = (this.holeNext + 1) % this.maxHoles;
    this._q.setFromUnitVectors(this._z, normal);
    const rq = new THREE.Quaternion().setFromAxisAngle(this._z, Math.random() * 6.28);
    this._q.multiply(rq);
    const s = size * (0.8 + Math.random() * 0.5);
    this._m.compose(this._v.copy(point).addScaledVector(normal, 0.004), this._q, this._s.set(s, s, s));
    this.holes.setMatrixAt(i, this._m);
    this.holes.count = Math.max(this.holes.count, i + 1);
    this.holes.instanceMatrix.needsUpdate = true;
  }

  impact(point, normal, material = 'concrete') {
    const n = normal;
    if (material !== 'body' && material !== 'glass') this.hole(point, n, material === 'metal' ? 0.06 : 0.09);
    const sparks = material === 'metal' ? 14 : material === 'concrete' ? 6 : 2;
    for (let i = 0; i < sparks; i++) {
      const v = new THREE.Vector3().copy(n).multiplyScalar(2 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5));
      this.streaks.spawn(point, v, 0.25 + Math.random() * 0.4, [4, 2.2, 0.8], 0.025);
    }
    this.glow.spawn(point, new THREE.Vector3(), { life: 0.07, size: 0.35, color: [3, 2, 1.2], alpha: 1 });
    const dustCol = material === 'wood' ? [0.5, 0.36, 0.24] : material === 'body' ? [0.15, 0.15, 0.17] : [0.62, 0.6, 0.58];
    for (let i = 0; i < (material === 'body' ? 3 : 6); i++) {
      const v = new THREE.Vector3().copy(n).multiplyScalar(0.6 + Math.random() * 1.4).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)));
      this.smoke.spawn(point, v, { life: 1.2 + Math.random() * 1.5, size: 0.12 + Math.random() * 0.1, grow: 0.35, color: dustCol, alpha: 0.55, drag: 2.5, gravity: -0.05, spin: 1 });
    }
    // escombros pequeños
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3().copy(n).multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      this.smoke.spawn(point, v, { life: 0.8, size: 0.018, color: dustCol, alpha: 1, gravity: 9.8 });
    }
  }

  muzzleSmoke(p, dir) {
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3().copy(dir).multiplyScalar(0.6 + Math.random() * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3));
      this.smoke.spawn(p, v, { life: 1.4 + Math.random(), size: 0.05, grow: 0.28, color: [0.75, 0.75, 0.78], alpha: 0.35, drag: 2.2, gravity: -0.12, spin: 1.5 });
    }
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3().copy(dir).multiplyScalar(4 + Math.random() * 6).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
      this.streaks.spawn(p, v, 0.08 + Math.random() * 0.1, [5, 2.5, 0.6], 0.012);
    }
  }

  tracer(from, to) {
    const tr = this.tracers[this.tracerNext]; this.tracerNext = (this.tracerNext + 1) % this.tracers.length;
    const d = to.distanceTo(from);
    tr.m.position.copy(from); tr.m.lookAt(to); tr.m.scale.set(1, 1, d);
    tr.m.visible = true; tr.t = 0.05; tr.m.material.opacity = 0.9;
  }

  casing(p, v, q) {
    const i = this.casNext; this.casNext = (this.casNext + 1) % this.maxCas;
    const c = this.casData[i];
    c.p.copy(p); c.v.copy(v); c.q.copy(q); c.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 20 + Math.random() * 20); c.t = 0; c.bounces = 0;
  }

  shatter(p, count = 30, color = null, liquid = null) {
    for (let k = 0; k < count; k++) {
      const i = this.shardNext; this.shardNext = (this.shardNext + 1) % this.maxShards;
      this.shardData[i] = {
        p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.1)),
        v: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        w: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        s: 0.6 + Math.random() * 1.4, rest: false,
      };
      this.shards.count = Math.max(this.shards.count, i + 1);
    }
    for (let k = 0; k < 10; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      this.glow.spawn(p, v, { life: 0.25 + Math.random() * 0.3, size: 0.03, color: [2.5, 2.8, 3], alpha: 1, gravity: 9 });
    }
    if (liquid) {
      for (let k = 0; k < 40; k++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 3.2, (Math.random() - 0.5) * 3.5);
        this.glow.spawn(p, v, { life: 0.5 + Math.random() * 0.6, size: 0.02 + Math.random() * 0.03, color: liquid, alpha: 0.9, gravity: 9.8, drag: 0.5 });
      }
    }
  }

  explosion(p, size = 0.5) {
    this.flash(p, 400 * (0.4 + size), 0.35 + size * 0.3, 0xff9a50);
    const n = Math.floor(30 + size * 60);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.3), (Math.random() - 0.5)).normalize().multiplyScalar((1 + Math.random() * 4) * (0.6 + size));
      this.glow.spawn(p, v, { life: 0.3 + Math.random() * 0.5, size: (0.25 + Math.random() * 0.4) * (0.6 + size), grow: 1.2, color: [4, 1.6 + Math.random(), 0.35], alpha: 0.8, drag: 3 });
    }
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).multiplyScalar(2 + Math.random() * 3);
      this.smoke.spawn(p, v, { life: 2.5 + Math.random() * 2, size: 0.4 * (0.6 + size), grow: 0.9, color: [0.22, 0.21, 0.2], alpha: 0.55, drag: 1.8, gravity: -0.25, spin: 0.8 });
    }
    for (let i = 0; i < 30; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12);
      this.streaks.spawn(p, v, 0.5 + Math.random() * 0.8, [5, 2.4, 0.7], 0.03);
    }
  }

  flash(p, intensity, dur, color = 0xffaa66) {
    this.flashLight.position.copy(p);
    this.flashLight.color.set(color);
    this.flashI = intensity; this.flashT = dur; this.flashDur = dur;
  }

  update(dt) {
    this.glow.update(dt); this.smoke.update(dt); this.streaks.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.intensity = this.flashI * Math.max(0, this.flashT / this.flashDur) ** 2;
    } else this.flashLight.intensity = 0;
    for (const tr of this.tracers) {
      if (!tr.m.visible) continue;
      tr.t -= dt; tr.m.material.opacity = Math.max(0, tr.t / 0.05) * 0.9;
      if (tr.t <= 0) tr.m.visible = false;
    }
    // casquillos con rebotes
    const m = this._m, s = this._s.set(1, 1, 1), dq = this._q;
    for (let i = 0; i < this.maxCas; i++) {
      const c = this.casData[i];
      if (c.t > 6) { m.makeScale(0, 0, 0); this.cas.setMatrixAt(i, m); continue; }
      c.t += dt;
      if (c.bounces < 4) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        const g = this.groundAt(c.p.x, c.p.z, c.p.y + 0.3) + 0.005;
        if (c.p.y < g) {
          c.p.y = g;
          if (Math.abs(c.v.y) > 0.4) {
            if (this.audio && c.bounces < 2) this.audio.casing(c.p);
            c.v.y = -c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); c.bounces++;
          } else { c.v.set(0, 0, 0); c.bounces = 4; }
        }
        dq.setFromEuler(new THREE.Euler(c.w.x * dt, c.w.y * dt, c.w.z * dt));
        c.q.multiply(dq);
      }
      m.compose(c.p, c.q, s);
      this.cas.setMatrixAt(i, m);
    }
    this.cas.instanceMatrix.needsUpdate = true;
    // cristales
    let any = false;
    for (let i = 0; i < this.shardData.length; i++) {
      const d = this.shardData[i];
      if (!d || d.rest) continue;
      any = true;
      d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
      const g = this.groundAt(d.p.x, d.p.z, d.p.y + 0.2) + 0.003;
      if (d.p.y < g) { d.p.y = g; if (Math.abs(d.v.y) > 0.6) { d.v.y *= -0.25; d.v.x *= 0.4; d.v.z *= 0.4; } else { d.rest = true; d.q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6)); } }
      if (!d.rest) d.q.multiply(dq.setFromEuler(new THREE.Euler(d.w.x * dt, d.w.y * dt, d.w.z * dt)));
      m.compose(d.p, d.q, s.set(d.s, d.s, d.s));
      this.shards.setMatrixAt(i, m);
    }
    if (any) this.shards.instanceMatrix.needsUpdate = true;
  }
}
