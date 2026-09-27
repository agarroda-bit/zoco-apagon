// Enemigos: drones de seguridad (ojo rojo + láser visible en el humo), seguratas (Soldier.glb
// retexturizado en traje negro, gafas y pinganillo, con linterna) y el dron jefe.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { STAIR } from './world.js';

const LINES = ['«Con esas zapatillas no pasas.»', '«Hoy no entras.»', '«¿Vas con alguien de la lista?»', '«Esta noche está completo.»', '«Eh, tú, fuera de la pista.»', '«Aquí dentro mando yo.»', '«Ni con invitación.»'];

export class Enemies {
  constructor({ scene, world, fx, audio, player, camera, quality }) {
    Object.assign(this, { scene, world, fx, audio, player, camera, quality });
    this.list = [];
    this.bolts = [];
    this.onSay = null; this.onKill = null; this.onPlayerHit = null;
    this.ray = new THREE.Raycaster();
    this.id = 0;
    // pool de focos reales para linternas de seguratas / jefe
    this.spotPool = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(0xe8f0ff, 0, 30, 0.33, 0.5, 2);
      scene.add(s, s.target); this.spotPool.push(s);
    }
    // geometrías de dron
    this.droneMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.85, roughness: 0.35 });
    this.droneMat2 = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.9, roughness: 0.25 });
    this.rotorMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.35, depthWrite: false });
    const bg = new THREE.CylinderGeometry(0.004, 0.004, 1, 5, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, 0.5);
    this.beamGeo = bg;
    const glow = new THREE.CylinderGeometry(0.03, 0.03, 1, 8, 1, true); glow.rotateX(Math.PI / 2); glow.translate(0, 0, 0.5);
    this.beamGlowGeo = glow;
    this.boltGeo = new THREE.CapsuleGeometry(0.035, 0.5, 4, 8); this.boltGeo.rotateX(Math.PI / 2);
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0.05).multiplyScalar(14) });
    // Soldier.glb para los seguratas
    this.gltf = null;
    new GLTFLoader().load(import.meta.env.BASE_URL + 'models/Soldier.glb', (g) => { this.gltf = g; }, undefined, () => { this.gltf = null; });
    this.suitTex = null;
  }

  aliveCount() { return this.list.filter((e) => e.alive && !e.pending).length + this.list.filter((e) => e.pending).length; }
  hitTargets() { return this.list.filter((e) => e.alive).flatMap((e) => e.hitboxes); }

  // ---------------- drones ----------------
  makeDrone(big = false) {
    const s = big ? 3.4 : 1;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 24, 16), this.droneMat); body.scale.y = 0.62; g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21 * s, 0.025 * s, 8, 28), this.droneMat2); ring.rotation.x = Math.PI / 2; g.add(ring);
    const rotors = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.025 * s, 0.04 * s), this.droneMat2);
      arm.position.set(Math.cos(a) * 0.26 * s, 0.02 * s, Math.sin(a) * 0.26 * s); arm.rotation.y = -a; g.add(arm);
      const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.14 * s, 20), this.rotorMat); rotor.rotation.x = -Math.PI / 2;
      rotor.position.set(Math.cos(a) * 0.42 * s, 0.05 * s, Math.sin(a) * 0.42 * s); g.add(rotor); rotors.push(rotor);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.05 * s, 10), this.droneMat); motor.position.copy(rotor.position); motor.position.y -= 0.02 * s; g.add(motor);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.03).multiplyScalar(10) });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 16, 12), eyeMat);
    eye.position.set(0, -0.03 * s, 0.17 * s); g.add(eye);
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.06 * s, 0.012 * s, 8, 20), this.droneMat2); lensRing.position.copy(eye.position); lensRing.position.z += 0.01; g.add(lensRing);
    // haz láser
    const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.05).multiplyScalar(5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const beamGlow = new THREE.Mesh(this.beamGlowGeo, new THREE.MeshBasicMaterial({ color: 0xff1010, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.frustumCulled = beamGlow.frustumCulled = false;
    this.scene.add(beam, beamGlow);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.34 * s, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(hit);
    if (big) {
      // jefe: carcasa extra y focos propios
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s * 0.4, 0.62 * s * 0.4, 0.3 * s * 0.4, 8), this.droneMat2); shell.position.y = 0.12 * s; g.add(shell);
      for (const x of [-1, 1]) { const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 12), this.droneMat); lamp.position.set(x * 0.45, -0.25, 0.3); g.add(lamp); }
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return { g, eye, eyeMat, beam, beamGlow, rotors, hit };
  }

  spawnDrones(n, lit) {
    for (let i = 0; i < n; i++) {
      const d = this.makeDrone(false);
      const p = this.world.patrol[Math.floor(Math.random() * this.world.patrol.length)].clone();
      d.g.position.copy(p).add(new THREE.Vector3(0, 1.5, 0));
      this.scene.add(d.g);
      const e = { kind: 'drone', ...d, alive: true, hp: lit ? 3 : 2, pos: d.g.position, target: p, t: Math.random() * 10, id: this.id++, aimDir: new THREE.Vector3(0, -0.5, 1).normalize(), lock: 0, fireT: 1.5 + Math.random() * 2, dead: 0 };
      e.hitboxes = [d.hit, ...d.g.children.filter((c) => c.isMesh && c !== d.hit)];
      for (const h of e.hitboxes) h.userData.enemy = e;
      this.audio.droneStart(e.id, e.pos, false);
      this.list.push(e);
    }
  }

  spawnBoss() {
    const d = this.makeDrone(true);
    d.g.position.set(-1, 11, -1.5);
    this.scene.add(d.g);
    const e = { kind: 'boss', ...d, alive: true, hp: 45, maxHp: 45, pos: d.g.position, target: new THREE.Vector3(-1, 5.6, -1.5), t: 0, id: this.id++, aimDir: new THREE.Vector3(0, -1, 0.3).normalize(), lock: 0, fireT: 3, burst: 0, dead: 0, descending: true };
    e.hitboxes = [d.hit, ...d.g.children.filter((c) => c.isMesh && c !== d.hit)];
    for (const h of e.hitboxes) h.userData.enemy = e;
    this.audio.droneStart(e.id, e.pos, true);
    this.list.push(e);
  }

  // ---------------- seguratas ----------------
  spawnBouncers(n) {
    for (let i = 0; i < n; i++) {
      const e = { kind: 'bouncer', pending: true, alive: false, delay: 0.8 + i * 1.3, id: this.id++, hitboxes: [] };
      this.list.push(e);
    }
  }

  makeBouncer(e) {
    const W = this.world;
    let g, mixer = null, actions = {};
    if (this.gltf) {
      g = skClone(this.gltf.scene);
      g.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.frustumCulled = false;
          const m = o.material.clone();
          m.color = new THREE.Color(0x3a3a3e); m.roughness = 0.55; m.metalness = 0.05;
          o.material = m;
        }
      });
      g.scale.set(1.12, 1.1, 1.18);
      mixer = new THREE.AnimationMixer(g);
      for (const clip of this.gltf.animations) actions[clip.name] = mixer.clipAction(clip);
      const head = g.getObjectByName('mixamorigHead');
      if (head) {
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(17, 4.5, 3), new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.9, roughness: 0.08 }));
        glasses.position.set(0, 9.5, 9.5); head.add(glasses);
        const ear = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.5, 6, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }));
        ear.position.set(-8.5, 7, 1); ear.rotation.y = Math.PI / 2; head.add(ear);
      }
      const hand = g.getObjectByName('mixamorigRightHand');
      if (hand) {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 20), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.4 }));
        gun.position.set(0, 10, 6); hand.add(gun); e.gunObj = gun;
      }
      const lhand = g.getObjectByName('mixamorigLeftHand');
      e.torchObj = lhand || g;
    } else {
      // de respaldo: por piezas
      g = new THREE.Group();
      const suit = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.34), suit); b.position.y = 1.3; g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a22 })); h.position.y = 1.85; g.add(h);
      for (const x of [-0.14, 0.14]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.22), suit); l.position.set(x, 0.45, 0); g.add(l); }
      e.torchObj = g;
    }
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.95;
    const holder = new THREE.Group(); holder.add(g); holder.add(hit);
    this.scene.add(holder);
    if (actions.Walk) { actions.Walk.play(); }
    Object.assign(e, {
      g: holder, model: g, mixer, actions, hit, hitboxes: [hit], alive: true, pending: false, hp: 5,
      pos: holder.position, yaw: Math.PI, state: 'enter', t: 0, fireT: 2 + Math.random() * 2, cover: null, peek: 0,
      say: 4 + Math.random() * 6, fall: 0, torchDir: new THREE.Vector3(0, -0.2, -1),
    });
    hit.userData.enemy = e;
    holder.position.copy(W.doorOutside).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, 0));
    e.target = W.doorInside.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, -Math.random() * 2));
  }

  damage(obj, point, dmg) {
    const e = obj.userData.enemy;
    if (!e || !e.alive) return;
    e.hp -= dmg;
    e.hurtT = 0.12;
    if (e.kind === 'bouncer' && e.state !== 'dead') { e.alert = true; }
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    e.alive = false;
    this.onKill && this.onKill(e);
    if (e.kind === 'drone' || e.kind === 'boss') {
      this.fx.explosion(e.pos.clone(), e.kind === 'boss' ? 1 : 0.35);
      this.audio.explosion(e.pos, e.kind === 'boss' ? 1 : 0.35);
      this.audio.droneStop(e.id);
      e.beam.visible = e.beamGlow.visible = false;
      e.eyeMat.color.setRGB(0.05, 0, 0);
      e.dead = 0.001; e.vy = 0;
    } else {
      e.state = 'dead'; e.fall = 0.001;
      if (e.mixer) e.mixer.stopAllAction();
      if (e.spot) { e.spot.intensity = 0; e.spot = null; }
    }
  }

  losTo(from, to) {
    const d = to.clone().sub(from); const L = d.length(); d.divideScalar(L);
    for (const c of this.world.colliders) {
      if (c.tag === 'rail') continue;
      let tmin = 0, tmax = L;
      let ok = true;
      for (const ax of ['x', 'y', 'z']) {
        const inv = 1 / (d[ax] || 1e-9);
        let t0 = (c.min[ax] - from[ax]) * inv, t1 = (c.max[ax] - from[ax]) * inv;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
        if (tmax < tmin) { ok = false; break; }
      }
      if (ok && tmin > 0.05 && tmin < L - 0.3) return false;
    }
    return true;
  }

  shootAt(from, target, spread, speed = 22, dmg = 8) {
    const dir = target.clone().sub(from).normalize();
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize();
    const m = new THREE.Mesh(this.boltGeo, this.boltMat); m.position.copy(from); m.lookAt(from.clone().add(dir)); m.frustumCulled = false;
    this.scene.add(m);
    this.bolts.push({ m, v: dir.multiplyScalar(speed), life: 3, dmg });
  }

  volSpots() {
    const out = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.kind === 'drone' || e.kind === 'boss') out.push({ pos: e.eye.getWorldPosition(new THREE.Vector3()), dir: e.aimDir, color: new THREE.Color(1, 0.1, 0.08), gain: e.kind === 'boss' ? 3 : 1.4, cosO: Math.cos(0.05), cosI: Math.cos(0.02) });
      if (e.spot && e.spot.intensity > 0) out.push({ pos: e.spot.position, dir: e.spot.target.position.clone().sub(e.spot.position), color: e.spot.color, gain: e.kind === 'boss' ? 6 : 4, cosO: Math.cos(e.spot.angle), cosI: Math.cos(e.spot.angle * 0.5) });
    }
    return out.slice(0, 4);
  }

  update(dt, G) {
    const P = this.player;
    const eyeP = this.camera.getWorldPosition(new THREE.Vector3());
    // asignar focos reales a los más cercanos con linterna
    const lit = this.list.filter((e) => e.alive && (e.kind === 'bouncer' || e.kind === 'boss')).sort((a, b) => a.pos.distanceToSquared(eyeP) - b.pos.distanceToSquared(eyeP));
    this.spotPool.forEach((s, i) => { const e = lit[i]; if (!e) { s.intensity = 0; return; } e.spot = s; });
    for (const e of this.list) if (e.spot && !lit.slice(0, 2).includes(e)) e.spot = null;

    for (const e of this.list) {
      if (e.pending) { e.delay -= dt; if (e.delay <= 0) this.makeBouncer(e); continue; }
      if (e.kind === 'drone' || e.kind === 'boss') this.updateDrone(e, dt, eyeP, G);
      else this.updateBouncer(e, dt, eyeP, G);
    }
    // proyectiles
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const prev = b.m.position.clone();
      b.m.position.addScaledVector(b.v, dt);
      const hitP = b.m.position.distanceTo(eyeP.clone().setY(eyeP.y - 0.25)) < 0.5;
      const outside = b.m.position.y < 0 || b.m.position.y > 7.6 || !this.losTo(prev, b.m.position.clone().addScaledVector(b.v, 0.01));
      if (hitP) { this.onPlayerHit && this.onPlayerHit(b.dmg); }
      if (hitP || outside || b.life <= 0) {
        if (outside) this.fx.impact(b.m.position.clone(), b.v.clone().normalize().negate(), 'metal');
        this.scene.remove(b.m); this.bolts.splice(i, 1);
      }
    }
  }

  updateDrone(e, dt, eyeP, G) {
    const boss = e.kind === 'boss';
    for (const r of e.rotors) r.rotation.z += dt * 40;
    if (!e.alive) {
      if (e.dead > 0) {
        e.vy -= 9.8 * dt; e.pos.y += e.vy * dt; e.g.rotation.x += dt * 3; e.g.rotation.z += dt * 2;
        if (e.pos.y < (boss ? 0.8 : 0.25)) { e.pos.y = boss ? 0.8 : 0.25; if (e.dead < 5) { this.fx.impact(e.pos.clone(), new THREE.Vector3(0, 1, 0), 'metal'); this.audio.impact(e.pos, 'metal'); } e.dead = 99; e.g.rotation.set(0.3, e.g.rotation.y, 2.6); }
        else e.dead += dt;
      }
      return;
    }
    e.t += dt;
    if (boss && e.descending) {
      e.pos.y += (e.target.y - e.pos.y) * Math.min(1, dt * 0.5);
      if (Math.abs(e.pos.y - e.target.y) < 0.3) e.descending = false;
    }
    // patrulla
    if (!e.descending && (e.pos.distanceTo(e.target) < 0.8 || e.t % 9 < dt)) {
      if (boss) e.target.set(-1 + (Math.random() - 0.5) * 10, 4.5 + Math.random() * 1.2, -1.5 + (Math.random() - 0.5) * 10);
      else e.target.copy(this.world.patrol[Math.floor(Math.random() * this.world.patrol.length)]);
    }
    const toT = e.target.clone().sub(e.pos);
    const sp = boss ? 1.6 : 2.2;
    if (toT.length() > 0.1) e.pos.addScaledVector(toT.normalize(), Math.min(sp * dt, e.pos.distanceTo(e.target)));
    e.pos.y += Math.sin(e.t * 2 + e.id) * 0.004;
    // buscar al jugador con el láser
    const toP = eyeP.clone().sub(e.pos); const dist = toP.length(); toP.divideScalar(dist);
    const sees = dist < 22 && this.losTo(e.pos, eyeP);
    const inBeam = e.aimDir.dot(toP) > (boss ? 0.8 : 0.93);
    const litByPlayer = G.phase >= 2 || this.player.moveAmount > 0.6 || dist < 7;
    if (sees && (inBeam || e.lock > 0 || dist < 6 || boss) && litByPlayer) e.lock = Math.min(2, e.lock + dt);
    else e.lock = Math.max(0, e.lock - dt * 0.5);
    let wantDir;
    if (e.lock > 0.2) wantDir = toP;
    else { const a = e.t * 0.7 + e.id; wantDir = new THREE.Vector3(Math.sin(a) * 0.8, -0.75 + Math.sin(e.t * 0.5) * 0.25, Math.cos(a) * 0.8).normalize(); }
    e.aimDir.lerp(wantDir, Math.min(1, dt * (e.lock > 0.2 ? 3 : 1.2))).normalize();
    e.g.lookAt(e.pos.clone().add(new THREE.Vector3(e.aimDir.x, 0, e.aimDir.z)));
    // haz láser hasta la pared
    const ep = e.eye.getWorldPosition(new THREE.Vector3());
    const r = this.world.rayRoom(ep, e.aimDir);
    let len = Math.min(r.t, 30);
    if (e.lock > 0.2 && sees) len = Math.min(len, dist);
    e.beam.position.copy(ep); e.beamGlow.position.copy(ep);
    e.beam.lookAt(ep.clone().add(e.aimDir)); e.beamGlow.quaternion.copy(e.beam.quaternion);
    e.beam.scale.set(boss ? 3 : 1, boss ? 3 : 1, len); e.beamGlow.scale.set(boss ? 3 : 1, boss ? 3 : 1, len);
    const flick = e.hurtT > 0 ? 0.3 : 1;
    e.beam.material.color.setRGB(1, 0.05, 0.05).multiplyScalar((e.lock > 0.2 ? 9 : 4) * flick);
    e.eyeMat.color.setRGB(1, 0.05, 0.03).multiplyScalar(e.lock > 0.2 ? 18 : 9);
    e.hurtT = (e.hurtT || 0) - dt;
    // disparo
    e.fireT -= dt;
    if (e.lock > 0.7 && sees && e.fireT <= 0) {
      if (boss) {
        e.burst = (e.burst || 0) + 1;
        this.shootAt(ep, eyeP.clone().setY(eyeP.y - 0.2), 0.08, 20, 9);
        this.audio.droneShot(ep);
        e.fireT = e.burst % 6 === 0 ? 2.2 : 0.16;
      } else {
        this.shootAt(ep, eyeP.clone().setY(eyeP.y - 0.2), 0.05, 18, 7);
        this.audio.droneShot(ep);
        e.fireT = 1.4 + Math.random();
      }
    }
    if (boss && e.spot) {
      e.spot.intensity = 260; e.spot.angle = 0.3; e.spot.color.set(0xffffff);
      e.spot.position.copy(e.pos).add(new THREE.Vector3(0, -0.4, 0));
      e.spot.target.position.copy(e.pos).addScaledVector(e.aimDir, 8);
    }
    this.audio.droneUpdate(e.id, e.pos, e.lock > 0.2 ? 1 : 0.5);
  }

  updateBouncer(e, dt, eyeP, G) {
    if (e.state === 'dead') {
      if (e.fall > 0 && e.fall < 1) {
        e.fall = Math.min(1, e.fall + dt * 1.6);
        const k = e.fall * e.fall;
        e.model.rotation.x = -k * Math.PI / 2 * 0.98;
        e.model.position.y = Math.sin(e.fall * Math.PI) * 0.15;
        if (e.fall >= 1) { this.audio.impact(e.pos, 'body'); this.fx.impact(e.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, 1, 0), 'body'); }
      }
      return;
    }
    e.t += dt;
    if (e.mixer) e.mixer.update(dt);
    const W = this.world;
    const head = e.pos.clone().setY(e.pos.y + 1.6);
    const sees = head.distanceTo(eyeP) < 26 && this.losTo(head, eyeP);
    if (sees) { e.alert = true; e.lastSeen = eyeP.clone(); }
    // frases
    e.say -= dt;
    if (e.say <= 0 && e.alert) { e.say = 7 + Math.random() * 8; this.onSay && this.onSay(LINES[Math.floor(Math.random() * LINES.length)]); }
    // decidir destino
    if (e.state === 'enter' && e.pos.distanceTo(e.target) < 0.6) e.state = 'hunt';
    if (e.state !== 'enter') {
      e.coverT = (e.coverT || 0) - dt;
      if (e.coverT <= 0) {
        e.coverT = 5 + Math.random() * 4;
        // cobertura: un punto con la línea al jugador bloqueada, cerca de mí y del jugador
        let best = null, bestS = 1e9;
        for (const c of W.coverSpots) {
          const d1 = c.p.distanceTo(e.pos), d2 = c.p.distanceTo(this.player.pos);
          if (d2 < 4 || d2 > 16) continue;
          const taken = this.list.some((o) => o !== e && o.alive && o.cover === c);
          if (taken) continue;
          const blocked = !this.losTo(c.p.clone().setY(1.2), eyeP);
          const s = d1 + (blocked ? 0 : 8) + Math.random() * 2;
          if (s < bestS) { bestS = s; best = c; }
        }
        if (best) { e.cover = best; e.target = best.p.clone(); e.state = 'cover'; }
        else if (e.lastSeen) { e.target = e.lastSeen.clone().setY(0); e.state = 'hunt'; }
        // a veces sube a por ti a la escalera
        if (this.player.pos.y > 1.5 && Math.random() < 0.4) { e.target = new THREE.Vector3((STAIR.x0 + STAIR.x1) / 2, 0, W.stair.pz1 + W.stair.run + 0.5); e.state = 'hunt'; e.climb = true; }
      }
    }
    // asomarse desde la cobertura
    let goal = e.target;
    if (e.state === 'cover' && e.pos.distanceTo(e.target) < 0.6) {
      e.peek -= dt;
      if (e.peek < -2.2) e.peek = 1.6;
      if (e.peek > 0 && !sees) {
        const side = new THREE.Vector3().subVectors(this.player.pos, e.pos).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(e.id % 2 ? 0.9 : -0.9);
        goal = e.target.clone().add(side);
      }
    }
    if (e.climb && e.pos.distanceTo(e.target) < 0.8) { e.target = new THREE.Vector3((STAIR.x0 + STAIR.x1) / 2, 0, STAIR.cz); e.climb = false; }
    // mover (con deslizamiento contra cajas)
    const to = new THREE.Vector3(goal.x - e.pos.x, 0, goal.z - e.pos.z);
    const dist = to.length();
    const moving = dist > 0.35;
    const speed = e.state === 'enter' ? 1.6 : sees && e.state === 'hunt' ? 1.3 : 2.6;
    if (moving) {
      to.normalize();
      const np = e.pos.clone().addScaledVector(to, speed * dt);
      const saveP = this.player.colliders;
      // reutilizar la colisión del jugador
      const pl = this.player;
      pl.collide(np, e.pos.y, 1.8);
      if (np.distanceTo(e.pos) < speed * dt * 0.3) { np.addScaledVector(new THREE.Vector3(-to.z, 0, to.x), speed * dt * (e.id % 2 ? 1 : -1)); pl.collide(np, e.pos.y, 1.8); }
      const gy = pl.groundAt(np.x, np.z, e.pos.y);
      np.y = e.pos.y + Math.max(-0.3, Math.min(0.3, gy - e.pos.y));
      e.pos.copy(np);
      void saveP;
    }
    // mirar
    const look = sees ? new THREE.Vector3(eyeP.x - e.pos.x, 0, eyeP.z - e.pos.z) : to.lengthSq() > 0 ? to.clone() : new THREE.Vector3(0, 0, -1);
    const wantYaw = Math.atan2(look.x, look.z);
    let dy = wantYaw - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += dy * Math.min(1, dt * 6);
    e.g.rotation.y = e.yaw;
    // animaciones
    if (e.actions.Walk) {
      const run = moving && speed > 2;
      const want = !moving ? 'Idle' : run ? 'Run' : 'Walk';
      if (e.cur !== want && e.actions[want]) { const prev = e.actions[e.cur]; const nx = e.actions[want]; nx.reset().play(); if (prev) prev.crossFadeTo(nx, 0.25, false); e.cur = want; }
    }
    // linterna
    const tp = e.pos.clone().add(new THREE.Vector3(Math.sin(e.yaw) * 0.35 + Math.cos(e.yaw) * 0.25, 1.35, Math.cos(e.yaw) * 0.35 - Math.sin(e.yaw) * 0.25));
    const aimP = sees ? eyeP.clone() : e.pos.clone().add(new THREE.Vector3(Math.sin(e.yaw + Math.sin(e.t * 1.3) * 0.5) * 6, 0.2, Math.cos(e.yaw + Math.sin(e.t * 1.3) * 0.5) * 6));
    e.torchDir.lerp(aimP.clone().sub(tp).normalize(), Math.min(1, dt * 4));
    if (e.spot) {
      e.spot.intensity = 140; e.spot.angle = 0.3; e.spot.color.set(0xe8f0ff);
      e.spot.position.copy(tp); e.spot.target.position.copy(tp).addScaledVector(e.torchDir, 6);
    }
    // disparar
    e.fireT -= dt;
    if (sees && e.fireT <= 0 && e.state !== 'enter' && (!moving || e.peek > 0 || e.state === 'hunt')) {
      e.fireT = 0.9 + Math.random() * 1.2;
      const gp = e.gunObj ? e.gunObj.getWorldPosition(new THREE.Vector3()) : tp;
      const moveK = this.player.moveAmount;
      const d = gp.distanceTo(eyeP);
      const hitChance = Math.max(0.12, 0.6 - d * 0.025 - moveK * 0.2 - this.player.crouchK * 0.15);
      this.audio.enemyShot(gp);
      this.fx.flash(gp, 40, 0.06, 0xffc080);
      this.fx.glow.spawn(gp, new THREE.Vector3(), { life: 0.05, size: 0.35, color: [4, 2.8, 1.4], alpha: 1 });
      if (Math.random() < hitChance) { this.onPlayerHit && this.onPlayerHit(9); this.fx.tracer(gp, eyeP.clone().add(new THREE.Vector3(0.3, -0.3, 0))); }
      else { const miss = eyeP.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2)); this.fx.tracer(gp, miss); }
    }
  }
}
