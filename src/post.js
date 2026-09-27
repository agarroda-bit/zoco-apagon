// Postproceso: AO (N8AO), niebla volumétrica propia (humo iluminado por focos/linterna/fogonazo),
// profundidad de campo al apuntar, bloom, tone mapping ACES, SMAA, aberración, grano y viñeta.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, VignetteEffect, NoiseEffect, ChromaticAberrationEffect,
  DepthOfFieldEffect, Effect, EffectAttribute, BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export const MAX_SPOTS = 8;
export const MAX_POINTS = 5;

function makeNoise3D(size = 32) {
  // Ruido de valor 3D suavizado (tileable) para la densidad del humo
  const n = size * size * size;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.random();
  const idx = (x, y, z) => ((z + size) % size) * size * size + ((y + size) % size) * size + ((x + size) % size);
  const out = new Uint8Array(n);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, w = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1) * (dz === 0 ? 2 : 1);
      s += raw[idx(x + dx, y + dy, z + dz)] * k; w += k;
    }
    out[idx(x, y, z)] = Math.min(255, Math.max(0, ((s / w - 0.5) * 2.6 + 0.5) * 255));
  }
  const tex = new THREE.Data3DTexture(out, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

const volFrag = /* glsl */ `
uniform vec3 uCamPos;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uTime;
uniform float uFrame;
uniform float uDensity;
uniform float uHeightFall;
uniform float uExposure;
uniform float uMaxDist;
uniform vec3 uAmbient;
uniform sampler3D uNoise;
uniform int uSpotCount;
uniform vec3 uSpotPos[${MAX_SPOTS}];
uniform vec3 uSpotDir[${MAX_SPOTS}];
uniform vec3 uSpotCol[${MAX_SPOTS}];
uniform vec2 uSpotCone[${MAX_SPOTS}];
uniform int uPtCount;
uniform vec3 uPtPos[${MAX_POINTS}];
uniform vec3 uPtCol[${MAX_POINTS}];

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float smoke(vec3 p) {
  vec3 q = p * 0.11 + vec3(uTime * 0.012, uTime * 0.004, uTime * 0.009);
  float n = texture(uNoise, q).r * 0.65 + texture(uNoise, q * 2.7 + 0.37).r * 0.35;
  float h = exp(-max(p.y, 0.0) * uHeightFall);
  return uDensity * (0.35 + 1.6 * h) * smoothstep(0.18, 0.85, n + 0.15);
}

float hg(float c) { float g = 0.35; return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) * 0.08; }

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
  vec3 rd = wp - uCamPos;
  float dist = length(rd);
  rd /= dist;
  dist = min(dist, uMaxDist);
  float stepLen = dist / float(VOL_STEPS);
  float jit = ign(gl_FragCoord.xy + vec2(uFrame * 7.13, uFrame * 3.71));
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  for (int i = 0; i < VOL_STEPS; i++) {
    float t = (float(i) + jit) * stepLen;
    vec3 p = uCamPos + rd * t;
    float d = smoke(p);
    vec3 L = uAmbient;
    for (int s = 0; s < ${MAX_SPOTS}; s++) {
      if (s >= uSpotCount) break;
      vec3 lv = p - uSpotPos[s];
      float ld2 = dot(lv, lv);
      vec3 ln = lv * inversesqrt(ld2);
      float c = dot(ln, uSpotDir[s]);
      float cone = smoothstep(uSpotCone[s].x, uSpotCone[s].y, c);
      L += uSpotCol[s] * cone * hg(dot(ln, -rd)) / (1.0 + ld2);
    }
    for (int k = 0; k < ${MAX_POINTS}; k++) {
      if (k >= uPtCount) break;
      vec3 lv = p - uPtPos[k];
      float ld2 = dot(lv, lv);
      L += uPtCol[k] * 0.08 / (0.3 + ld2);
    }
    acc += trans * L * d * stepLen;
    trans *= exp(-d * stepLen * 0.6);
  }
  outputColor = vec4((inputColor.rgb * trans + acc) * uExposure, inputColor.a);
}
`;

class VolumetricEffect extends Effect {
  constructor(steps) {
    super('VolumetricEffect', volFrag, {
      attributes: EffectAttribute.DEPTH,
      defines: new Map([['VOL_STEPS', String(steps)]]),
      uniforms: new Map([
        ['uCamPos', new THREE.Uniform(new THREE.Vector3())],
        ['uInvProj', new THREE.Uniform(new THREE.Matrix4())],
        ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uTime', new THREE.Uniform(0)],
        ['uFrame', new THREE.Uniform(0)],
        ['uDensity', new THREE.Uniform(0.05)],
        ['uHeightFall', new THREE.Uniform(0.55)],
        ['uExposure', new THREE.Uniform(1)],
        ['uMaxDist', new THREE.Uniform(45)],
        ['uAmbient', new THREE.Uniform(new THREE.Vector3(0.002, 0.002, 0.003))],
        ['uNoise', new THREE.Uniform(makeNoise3D())],
        ['uSpotCount', new THREE.Uniform(0)],
        ['uSpotPos', new THREE.Uniform(Array.from({ length: MAX_SPOTS }, () => new THREE.Vector3()))],
        ['uSpotDir', new THREE.Uniform(Array.from({ length: MAX_SPOTS }, () => new THREE.Vector3(0, -1, 0)))],
        ['uSpotCol', new THREE.Uniform(Array.from({ length: MAX_SPOTS }, () => new THREE.Vector3()))],
        ['uSpotCone', new THREE.Uniform(Array.from({ length: MAX_SPOTS }, () => new THREE.Vector2(0.9, 0.95)))],
        ['uPtCount', new THREE.Uniform(0)],
        ['uPtPos', new THREE.Uniform(Array.from({ length: MAX_POINTS }, () => new THREE.Vector3()))],
        ['uPtCol', new THREE.Uniform(Array.from({ length: MAX_POINTS }, () => new THREE.Vector3()))],
      ]),
    });
  }
}

// Efecto sencillo de exposición para la calidad baja (sin volumétrica)
class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', `uniform float uExposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(inputColor.rgb * uExposure, inputColor.a); }`,
    { uniforms: new Map([['uExposure', new THREE.Uniform(1)]]) });
  }
}

export const QUALITY = {
  low: { pr: 0.75, maxPr: 1, ao: false, vol: 0, dof: false, refl: 0, cube: false, shadows: 1, shadowSize: 1024, smaa: SMAAPreset.LOW, bloomLevels: 5, grain: false },
  medium: { pr: 1, maxPr: 1.25, ao: 'Performance', vol: 14, dof: true, refl: 0.5, cube: false, shadows: 1, shadowSize: 1024, smaa: SMAAPreset.MEDIUM, bloomLevels: 7, grain: true },
  ultra: { pr: 1.5, maxPr: 2, ao: 'Medium', vol: 26, dof: true, refl: 1, cube: true, shadows: 3, shadowSize: 2048, smaa: SMAAPreset.HIGH, bloomLevels: 8, grain: true },
};

export class Post {
  constructor(renderer, scene, camera, qName) {
    this.q = QUALITY[qName];
    this.renderer = renderer; this.camera = camera; this.scene = scene;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    if (this.q.ao) {
      this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
      this.ao.configuration.aoRadius = 1.4;
      this.ao.configuration.distanceFalloff = 1.0;
      this.ao.configuration.intensity = 2.2;
      this.ao.configuration.gammaCorrection = false;
      this.ao.configuration.halfRes = this.q.ao === 'Performance';
      this.ao.setQualityMode(this.q.ao);
      this.composer.addPass(this.ao);
    }
    if (this.q.vol) {
      this.vol = new VolumetricEffect(this.q.vol);
      this.composer.addPass(new EffectPass(camera, this.vol));
    } else {
      this.expo = new ExposureEffect();
    }
    if (this.q.dof) {
      this.dof = new DepthOfFieldEffect(camera, { focusDistance: 8, focusRange: 6, bokehScale: 0, resolutionScale: 0.5 });
      this.dofPass = new EffectPass(camera, this.dof);
      this.dofPass.enabled = false;
      this.composer.addPass(this.dofPass);
    }
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.55, luminanceSmoothing: 0.35, intensity: 1.35, radius: 0.78, levels: this.q.bloomLevels });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
    const main = [this.bloom, this.tone];
    if (this.expo) main.unshift(this.expo);
    if (!this.q.grain) main.push(this.vignette);
    this.composer.addPass(new EffectPass(camera, ...main));
    this.composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: this.q.smaa })));
    if (this.q.grain) {
      this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0007, 0.0005), radialModulation: true, modulationOffset: 0.35 });
      this.noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
      this.noise.blendMode.opacity.value = 0.32;
      this.composer.addPass(new EffectPass(camera, this.ca, this.noise, this.vignette));
    }
    this.frame = 0;
    this.aimFocus = new THREE.Vector3();
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  // lights: { spots: [{pos, dir, color(Vector3 ya multiplicado por intensidad), cosOuter, cosInner}], points: [{pos, color}] }
  update(dt, t, { exposure = 1, density = 0.05, ambient, spots = [], points = [], aim = 0, focusDist = 8 }) {
    this.frame++;
    if (this.vol) {
      const u = this.vol.uniforms;
      const cam = this.camera;
      u.get('uCamPos').value.setFromMatrixPosition(cam.matrixWorld);
      u.get('uInvProj').value.copy(cam.projectionMatrixInverse);
      u.get('uCamWorld').value.copy(cam.matrixWorld);
      u.get('uTime').value = t;
      u.get('uFrame').value = this.frame % 64;
      u.get('uDensity').value = density;
      u.get('uExposure').value = exposure;
      if (ambient) u.get('uAmbient').value.copy(ambient);
      const n = Math.min(spots.length, MAX_SPOTS);
      u.get('uSpotCount').value = n;
      for (let i = 0; i < n; i++) {
        const s = spots[i];
        u.get('uSpotPos').value[i].copy(s.pos);
        u.get('uSpotDir').value[i].copy(s.dir);
        u.get('uSpotCol').value[i].copy(s.color);
        u.get('uSpotCone').value[i].set(s.cosOuter, s.cosInner);
      }
      const m = Math.min(points.length, MAX_POINTS);
      u.get('uPtCount').value = m;
      for (let i = 0; i < m; i++) {
        u.get('uPtPos').value[i].copy(points[i].pos);
        u.get('uPtCol').value[i].copy(points[i].color);
      }
    } else if (this.expo) {
      this.expo.uniforms.get('uExposure').value = exposure;
    }
    if (this.dof) {
      this.dofPass.enabled = aim > 0.02;
      this.dof.bokehScale = aim * 3.2;
      this.dof.cocMaterial.focusDistance = focusDist;
      this.dof.cocMaterial.focusRange = Math.max(2, focusDist * 0.6);
    }
    this.composer.render(dt);
  }
}
