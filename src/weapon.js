// Comportamiento de la carabina: balanceo, respiración, retroceso con muelle, recarga, apuntar,
// linterna táctica con sombras, fogonazo que ilumina la sala, casquillos, trazadoras e impactos.
import * as THREE from 'three';
import { buildCarbine } from './weapon-model.js';
import { flashTex } from './fx.js';

const HIP = new THREE.Vector3(0.125, -0.19, -0.47);
const RPM = 750;

export class Weapon {
  constructor({ camera, scene, audio, fx, world, quality, envMap }) {
    this.camera = camera; this.scene = scene; this.audio = audio; this.fx = fx; this.world = world;
    this.m = buildCarbine({ quality: quality === 'ultra' ? 'high' : quality, envMap });
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot); this.pivot.add(this.m.group);
    camera.add(this.root);
    this.m.group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 0; } });
    this.ADS = new THREE.Vector3(0, -this.m.sightHeight, -0.26);
    // linterna táctica (sombras suaves)
    this.flash = this.m.flashlight;
    this.spot = new THREE.SpotLight(0xfff2e0, 0, 45, 0.46, 0.6, 2);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.1; this.spot.shadow.camera.far = 40;
    this.spot.shadow.bias = -0.0004; this.spot.shadow.normalBias = 0.025;
    const cookie = document.createElement('canvas'); cookie.width = cookie.height = 256;
    const g = cookie.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.22, '#fff6e8'); gr.addColorStop(0.3, '#a89c8c'); gr.addColorStop(0.42, '#d8ccb8'); gr.addColorStop(0.7, '#5a5048'); gr.addColorStop(1, '#000000');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    this.spot.map = new THREE.CanvasTexture(cookie); this.spot.map.colorSpace = THREE.SRGBColorSpace;
    this.flash.add(this.spot);
    this.spot.position.set(0, 0, -0.01);
    this.spot.target.position.set(0, 0, -5);
    this.flash.add(this.spot.target);
    this.lightOn = true;
    // luz del fogonazo
    this.muzzleLight = new THREE.PointLight(0xffa860, 0, 0, 2);
    scene.add(this.muzzleLight);
    // fogonazo: estrella frontal + dos planos cruzados
    const fm = new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(1, 0.8, 0.55).multiplyScalar(9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flashGroup = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.34), fm); s1.rotation.x = Math.PI / 2; s1.position.z = -0.14; s1.rotation.z = 0;
    const s2 = s1.clone(); s2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    s1.geometry = new THREE.PlaneGeometry(0.1, 0.34);
    this.flashGroup.add(front, s1, s2);
    this.flashGroup.visible = false;
    this.m.muzzle.add(this.flashGroup);
    for (const c of this.flashGroup.children) c.frustumCulled = false;
    // estado
    this.ammo = 30; this.reloading = false; this.reloadT = 0; this.cool = 0; this.flashT = 0;
    this.aimK = 0; this.focusDist = 8;
    this.recoil = new THREE.Vector3(); this.recoilV = new THREE.Vector3(); // x: pitch, y: back, z: roll
    this.sway = new THREE.Vector2(); this.tuck = 0; this.runK = 0;
    this.boltT = 0;
    this.magBase = this.m.magazine.position.clone(); this.magRot = this.m.magazine.rotation.clone();
    this.chBase = this.m.chargingHandle.position.clone(); this.boltBase = this.m.bolt.position.clone();
    this.ray = new THREE.Raycaster(); this.ray.far = 80;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.frame = 0;
    this.onShot = null; this.onHit = null; this.hitTargets = () => []; this.onEnemyHit = null; this.onBallHit = null;
    this.m.redDot.material.color.setRGB(6, 0.35, 0.3); this.m.redDot.material.depthTest = false; this.m.redDot.renderOrder = 10; this.m.redDot.scale.multiplyScalar(1.5);
    this.setLight(true);
  }

  setShadowSize(n) { this.spot.shadow.mapSize.set(n, n); if (this.spot.shadow.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; } }

  setLight(on) {
    this.lightOn = on;
    this.spot.intensity = on ? 260 : 0;
    this.m.flashLens.material.emissiveIntensity = on ? 6 : 0;
    this.m.flashLens.material.emissive && this.m.flashLens.material.emissive.set(0xfff4e0);
  }

  // distancia a la caja más cercana delante de la cámara (para meter el arma contra la pared)
  wallDist() {
    const o = this.camera.getWorldPosition(this._v), d = this.camera.getWorldDirection(this._d);
    let best = 5;
    const b = this.world.bounds;
    const cand = [[d.x > 0 ? (b.maxX - o.x) / d.x : d.x < 0 ? (b.minX - o.x) / d.x : 9], [d.z > 0 ? (b.maxZ - o.z) / d.z : d.z < 0 ? (b.minZ - o.z) / d.z : 9]];
    for (const [t] of cand) if (t > 0 && t < best) best = t;
    for (const c of this.world.colliders) {
      let tmin = 0, tmax = best;
      for (const ax of ['x', 'y', 'z']) {
        const inv = 1 / (d[ax] || 1e-9);
        let t0 = (c.min[ax] - o[ax]) * inv, t1 = (c.max[ax] - o[ax]) * inv;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
        if (tmax < tmin) break;
      }
      if (tmax >= tmin && tmin > 0 && tmin < best) best = tmin;
    }
    return best;
  }

  fire(player, t) {
    this.ammo--; this.cool = 60 / RPM;
    this.onShot && this.onShot();
    this.audio.shot();
    // retroceso
    this.recoilV.x += 0.9 + Math.random() * 0.4; this.recoilV.y += 1.6; this.recoilV.z += (Math.random() - 0.5) * 1.2;
    player.pitch += (0.011 + Math.random() * 0.006) * (1 - this.aimK * 0.4);
    player.yaw += (Math.random() - 0.5) * 0.008;
    this.boltT = 0.06;
    // fogonazo + luz
    this.flashT = 0.05;
    this.flashGroup.visible = true;
    this.flashGroup.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.6; this.flashGroup.scale.set(s, s, 0.8 + Math.random() * 0.5);
    this.m.muzzle.getWorldPosition(this.muzzleLight.position);
    this.muzzleLight.intensity = 90;
    this.muzzleLight.color.setHSL(0.07 + Math.random() * 0.03, 1, 0.6);
    // disparo (raycast desde el centro de la cámara)
    const spread = (0.014 * (1 - this.aimK) + 0.0015) * (1 + player.moveAmount * 1.5);
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    this.ray.set(origin, dir);
    const targets = this.hitTargets();
    const hits = this.ray.intersectObjects([...this.world.hit, ...targets], false);
    const mz = this.m.muzzle.getWorldPosition(new THREE.Vector3());
    let end = origin.clone().addScaledVector(dir, 60);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.bottles) {
        const bd = this.world.bottles.data[h.instanceId];
        if (!bd || !bd.alive) continue;
        bd.alive = false;
        const m4 = new THREE.Matrix4().makeScale(0, 0, 0); o.setMatrixAt(h.instanceId, m4); o.instanceMatrix.needsUpdate = true;
        const lc = bd.color.clone().multiplyScalar(2.5);
        this.fx.shatter(h.point, 28, null, [lc.r + 0.4, lc.g + 0.4, lc.b + 0.4]);
        this.audio.glass(h.point, false);
        this.onHit && this.onHit('glass');
        end = h.point; break;
      }
      end = h.point;
      const n = h.face ? h.face.normal.clone().transformDirection(o.matrixWorld) : dir.clone().negate();
      if (o.userData.mirrorBall) { this.onBallHit && this.onBallHit(); this.fx.impact(h.point, n, 'metal'); this.audio.impact(h.point, 'glass'); break; }
      if (o.userData.enemy) { this.onEnemyHit && this.onEnemyHit(o, h.point, 1); this.fx.impact(h.point, n, o.userData.enemy.kind === 'drone' || o.userData.enemy.kind === 'boss' ? 'metal' : 'body'); break; }
      const mat = o.userData.mat || 'concrete';
      this.fx.impact(h.point, n, mat);
      this.audio.impact(h.point, mat);
      // rebote de chispas extra en metal
      break;
    }
    this.fx.tracer(mz, end);
    this.fx.muzzleSmoke(mz, dir);
    // casquillo desde la ventana de expulsión
    const ep = this.m.ejectionPort.getWorldPosition(new THREE.Vector3());
    const q = this.camera.getWorldQuaternion(this._q);
    const v = new THREE.Vector3(1.8 + Math.random(), 1.4 + Math.random() * 0.8, 0.4 + Math.random() * 0.4).applyQuaternion(q);
    this.fx.casing(ep, v, q);
  }

  update(dt, st, player, t) {
    this.frame++;
    if (st.light) { this.setLight(!this.lightOn); this.audio.flashlight(); }
    const wantAim = !!st.aim && !this.reloading && !player.running;
    this.aimK += ((wantAim ? 1 : 0) - this.aimK) * Math.min(1, dt * 12);
    this.runK += ((player.running ? 1 : 0) - this.runK) * Math.min(1, dt * 8);
    this.camera.fov = 72 - this.aimK * 22;
    this.camera.updateProjectionMatrix();
    // recarga
    if ((st.reload && this.ammo < 30 && !this.reloading) || (this.ammo <= 0 && st.fire && !this.reloading && this.cool <= -0.25)) {
      this.reloading = true; this.reloadT = 0; this.rs = 0;
    }
    if (this.reloading) {
      this.reloadT += dt;
      const r = this.reloadT;
      if (r > 0.25 && this.rs === 0) { this.audio.reload('out'); this.rs = 1; }
      if (r > 1.15 && this.rs === 1) { this.audio.reload('in'); this.rs = 2; }
      if (r > 1.55 && this.rs === 2) { this.audio.reload('bolt'); this.rs = 3; this.ammo = 30; }
      if (r > 2.1) this.reloading = false;
    }
    this.cool -= dt;
    if (st.fire && !this.reloading && this.runK < 0.3) {
      if (this.ammo > 0 && this.cool <= 0) this.fire(player, t);
      else if (this.ammo <= 0 && this.cool <= 0) { this.audio.dryFire(); this.cool = 0.3; }
    }
    if (window.__holdFlash) { this.muzzleLight.intensity = 90; this.m.muzzle.getWorldPosition(this.muzzleLight.position); this.flashGroup.visible = true; this.flashT = 1; }
    // fogonazo
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashGroup.visible = false; }
    this.muzzleLight.intensity *= Math.exp(-dt * 38);
    if (this.muzzleLight.intensity < 0.5) this.muzzleLight.intensity = 0;
    // muelle del retroceso
    const k = 170, c = 16;
    this.recoilV.addScaledVector(this.recoil, -k * dt).multiplyScalar(Math.exp(-c * dt));
    this.recoil.addScaledVector(this.recoilV, dt);
    // balanceo por ratón
    this.sway.x += ((-(st.lookX || 0) * 1.4) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += ((-(st.lookY || 0) * 1.4) - this.sway.y) * Math.min(1, dt * 10);
    // pared
    if (this.frame % 3 === 0) { const d = this.wallDist(); this.tuckTarget = THREE.MathUtils.clamp((1.0 - d) / 0.6, 0, 1); }
    this.tuck += ((this.tuckTarget || 0) - this.tuck) * Math.min(1, dt * 10);
    // posición
    const aim = this.aimK, mv = player.moveAmount * (1 - aim * 0.8), ph = player.bobPhase;
    const breath = Math.sin(t * 1.7) * 0.0025 * (1 - aim * 0.7);
    const pos = this.root.position.copy(HIP).lerp(this.ADS, aim);
    pos.x += Math.sin(ph) * 0.013 * mv + this.sway.x * 0.02;
    pos.y += -Math.abs(Math.cos(ph)) * 0.011 * mv + breath + this.sway.y * 0.02 - this.runK * 0.04 - player.landKick * 0.03;
    pos.z += this.recoil.y * 0.028 * (1 - aim * 0.4) + this.tuck * 0.18;
    this.root.rotation.set(
      this.recoil.x * 0.045 * (1 - aim * 0.5) + this.sway.y * 0.35 + this.tuck * 0.9 + this.runK * -0.25 + breath * 2 + 0.035 * (1 - aim),
      this.sway.x * 0.35 + this.runK * 0.55 + Math.sin(ph) * 0.01 * mv + 0.045 * (1 - aim),
      this.recoil.z * 0.03 + this.runK * 0.35 + Math.sin(ph) * 0.015 * mv,
    );
    // animación de recarga
    const m = this.m;
    if (this.reloading) {
      const r = this.reloadT;
      const tilt = Math.min(1, r / 0.3) * (r < 1.8 ? 1 : Math.max(0, 1 - (r - 1.8) / 0.3));
      this.pivot.rotation.set(-0.15 * tilt, 0.25 * tilt, 0.55 * tilt);
      this.pivot.position.set(0, -0.03 * tilt, 0.02 * tilt);
      let drop = 0;
      if (r > 0.25 && r < 1.15) drop = Math.min(1, (r - 0.25) / 0.25) * (r < 0.8 ? 1 : 1 - (r - 0.8) / 0.35);
      m.magazine.position.set(this.magBase.x, this.magBase.y - drop * 0.28, this.magBase.z + drop * 0.02);
      m.magazine.rotation.set(this.magRot.x + drop * 0.3, this.magRot.y, this.magRot.z);
      const pull = r > 1.4 && r < 1.75 ? Math.sin(((r - 1.4) / 0.35) * Math.PI) : 0;
      m.chargingHandle.position.set(this.chBase.x, this.chBase.y, this.chBase.z + pull * 0.085);
    } else {
      this.pivot.rotation.set(0, 0, 0); this.pivot.position.set(0, 0, 0);
      m.magazine.position.copy(this.magBase); m.magazine.rotation.copy(this.magRot);
      m.chargingHandle.position.copy(this.chBase);
    }
    this.boltT -= dt;
    m.bolt.position.set(this.boltBase.x, this.boltBase.y, this.boltBase.z + (this.boltT > 0 ? 0.028 : 0));
    m.redDot.visible = aim > 0.3;
    // enfoque (DOF) al apuntar
    if (aim > 0.02 && this.frame % 4 === 0) {
      const o = this.camera.getWorldPosition(this._v), d = this.camera.getWorldDirection(this._d);
      this.ray.set(o, d);
      const h = this.ray.intersectObjects(this.world.hit, false)[0];
      this.focusDist = h ? Math.max(1, h.distance) : 20;
    }
  }
}
