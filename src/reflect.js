// Reflejo plano real del suelo (y = 0): se renderiza la escena desde una cámara espejo a un
// render target con mipmaps y los materiales del suelo lo muestrean con desenfoque según rugosidad.
import * as THREE from 'three';

export class FloorReflection {
  constructor(renderer, scale = 0.5) {
    this.renderer = renderer;
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    this.cam = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.uniforms = { tReflect: { value: this.rt.texture }, uReflMatrix: { value: this.matrix }, uReflOn: { value: scale > 0 ? 1 : 0 } };
    this.hide = []; // objetos que no se ven en el reflejo (el propio suelo, el arma)
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._la = new THREE.Vector3(); this._r = new THREE.Matrix4();
  }

  setSize(w, h) {
    if (this.scale <= 0) return;
    this.rt.setSize(Math.max(8, Math.floor(w * this.scale)), Math.max(8, Math.floor(h * this.scale)));
  }

  update(scene, camera) {
    if (this.scale <= 0) return;
    const cp = this._v.setFromMatrixPosition(camera.matrixWorld);
    if (cp.y < 0.01) return;
    this._r.extractRotation(camera.matrixWorld);
    const la = this._la.set(0, 0, -1).applyMatrix4(this._r).add(cp);
    const cam = this.cam;
    cam.position.set(cp.x, -cp.y, cp.z);
    cam.up.set(0, 1, 0).applyMatrix4(this._r);
    cam.up.y = -cam.up.y;
    cam.lookAt(this._t.set(la.x, -la.y, la.z));
    cam.near = camera.near; cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    for (const o of this.hide) o.visible = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, cam);
    for (const o of this.hide) o.visible = true;
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevShadow;
  }

  // Parchea un MeshStandardMaterial para que muestre el reflejo (strength 0..1, blur en niveles de mip)
  apply(mat, strength = 0.6, blur = 2, normalWarp = 0.03) {
    const u = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tReflect = u.tReflect;
      sh.uniforms.uReflMatrix = u.uReflMatrix;
      sh.uniforms.uReflOn = u.uReflOn;
      sh.uniforms.uReflStrength = { value: strength };
      sh.uniforms.uReflBlur = { value: blur };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;\nvarying vec3 vReflWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 zWp = modelMatrix * vec4(transformed, 1.0);\nvReflCoord = uReflMatrix * zWp;\nvReflWorld = zWp.xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tReflect;\nuniform float uReflOn, uReflStrength, uReflBlur;\nvarying vec4 vReflCoord;\nvarying vec3 vReflWorld;')
        .replace('#include <opaque_fragment>', `
        if (uReflOn > 0.5) {
          vec3 zV = normalize(cameraPosition - vReflWorld);
          float zF = 0.12 + 0.88 * pow(1.0 - clamp(zV.y, 0.0, 1.0), 4.0);
          vec2 zUv = vReflCoord.xy / vReflCoord.w + normal.xz * ${normalWarp.toFixed(3)};
          vec3 zR = textureLod(tReflect, zUv, uReflBlur + roughnessFactor * 4.0).rgb;
          outgoingLight += zR * uReflStrength * zF * (1.0 - roughnessFactor * 0.6);
        }
        #include <opaque_fragment>`);
      if (mat.userData.extraShader) mat.userData.extraShader(sh);
    };
    mat.customProgramCacheKey = () => 'refl' + strength + blur + (mat.userData.extraKey || '');
    return mat;
  }
}
