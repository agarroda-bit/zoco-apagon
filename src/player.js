// Jugador: entrada (teclado/ratón/mando PS con Gamepad API) y controlador en primera persona
// con cilindro contra cajas (AABB). Las cajas bajas (< STEP) se pueden subir.
import * as THREE from 'three';

const STEP = 0.42;
const RADIUS = 0.34;

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.fire = false; this.aim = false;
    this.pressed = new Set(); // flancos de subida de este frame
    this.locked = false;
    this.pad = null; this.padPrev = [];
    this.sens = 0.0022;
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aim = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.aim = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) { this.fire = false; this.aim = false; }
    });
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.aim = false; });
  }

  // Lee el mando (mapeo estándar de PlayStation) y devuelve el estado combinado
  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    const st = {
      mx: 0, mz: 0, lookX: this.mouseDX * this.sens, lookY: this.mouseDY * this.sens,
      run: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crouch: this.keys.has('KeyC') || this.keys.has('ControlLeft'),
      jump: this.pressed.has('Space'),
      reload: this.pressed.has('KeyR'),
      light: this.pressed.has('KeyT'),
      fps: this.pressed.has('KeyF'),
      fire: this.fire, aim: this.aim, padActive: false,
    };
    this.mouseDX = 0; this.mouseDY = 0;
    if (this.keys.has('KeyW')) st.mz += 1;
    if (this.keys.has('KeyS')) st.mz -= 1;
    if (this.keys.has('KeyD')) st.mx += 1;
    if (this.keys.has('KeyA')) st.mx -= 1;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
      const b = (i) => (pad.buttons[i] ? pad.buttons[i].value > 0.4 || pad.buttons[i].pressed : false);
      const edge = (i) => b(i) && !this.padPrev[i];
      const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0), rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
      if (lx || ly || rx || ry || pad.buttons.some((x) => x.pressed)) st.padActive = true;
      st.mx += lx; st.mz -= ly;
      const aimK = b(6) ? 0.55 : 1;
      st.lookX += Math.sign(rx) * rx * rx * 3.2 * dt * aimK;
      st.lookY += Math.sign(ry) * ry * ry * 2.4 * dt * aimK;
      st.fire = st.fire || b(7);
      st.aim = st.aim || b(6);
      st.run = st.run || b(10);
      st.crouch = st.crouch || b(1);
      st.jump = st.jump || edge(0);
      st.reload = st.reload || edge(2);
      st.light = st.light || edge(4);
      st.start = edge(9);
      this.padPrev = pad.buttons.map((x) => x.pressed || x.value > 0.4);
    }
    const l = Math.hypot(st.mx, st.mz);
    if (l > 1) { st.mx /= l; st.mz /= l; }
    this.pressed.clear();
    return st;
  }
}

export class Player {
  constructor(camera, colliders, bounds) {
    this.camera = camera;
    this.colliders = colliders; // [{min:Vector3,max:Vector3}]
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.pos = new THREE.Vector3(0, 0, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.68; this.crouchK = 0;
    this.onGround = true;
    this.health = 100; this.lastHit = -99;
    this.moveAmount = 0; this.bobPhase = 0; this.running = false;
    this.landKick = 0;
    this.enabled = true;
    this.stepDist = 0;
  }

  groundAt(x, z, feetY) {
    let g = 0;
    for (const c of this.colliders) {
      if (c.max.y > feetY + STEP) continue;
      if (x + RADIUS * 0.6 < c.min.x || x - RADIUS * 0.6 > c.max.x || z + RADIUS * 0.6 < c.min.z || z - RADIUS * 0.6 > c.max.z) continue;
      if (c.max.y > g) g = c.max.y;
    }
    return g;
  }

  collide(p, feetY, height) {
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (c.max.y <= feetY + STEP || c.min.y >= feetY + height) continue;
        const cx = Math.max(c.min.x, Math.min(p.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS;
          } else {
            // dentro de la caja: sacar por el lado más cercano
            const ex = [p.x - c.min.x, c.max.x - p.x, p.z - c.min.z, c.max.z - p.z];
            const m = Math.min(...ex);
            if (m === ex[0]) p.x = c.min.x - RADIUS; else if (m === ex[1]) p.x = c.max.x + RADIUS;
            else if (m === ex[2]) p.z = c.min.z - RADIUS; else p.z = c.max.z + RADIUS;
          }
        }
      }
      const b = this.bounds;
      p.x = Math.max(b.minX + RADIUS, Math.min(b.maxX - RADIUS, p.x));
      p.z = Math.max(b.minZ + RADIUS, Math.min(b.maxZ - RADIUS, p.z));
    }
  }

  update(dt, st, aimK = 0, audio = null) {
    if (!this.enabled) { st = { mx: 0, mz: 0, lookX: 0, lookY: 0 }; }
    const aimSens = 1 - aimK * 0.45;
    this.yaw -= (st.lookX || 0) * aimSens;
    this.pitch -= (st.lookY || 0) * aimSens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    const crouch = !!st.crouch;
    this.crouchK += ((crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 10);
    this.running = !!st.run && st.mz > 0.3 && !crouch && aimK < 0.5;
    const speed = crouch ? 2.0 : this.running ? 6.4 : aimK > 0.5 ? 2.6 : 4.1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (st.mx || 0) * cos - (st.mz || 0) * sin;
    const wz = -(st.mx || 0) * sin - (st.mz || 0) * cos;
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * accel);
    if (st.jump && this.onGround && !crouch) { this.vel.y = 4.6; this.onGround = false; }
    this.vel.y -= 13 * dt;
    const p = this.pos;
    const np = new THREE.Vector3(p.x + this.vel.x * dt, p.y, p.z + this.vel.z * dt);
    const height = 1.8 - this.crouchK * 0.6;
    this.collide(np, p.y, height);
    const g = this.groundAt(np.x, np.z, p.y);
    np.y = p.y + this.vel.y * dt;
    if (np.y <= g) {
      if (!this.onGround && this.vel.y < -3) this.landKick = Math.min(1, -this.vel.y / 9);
      np.y = g; this.vel.y = 0; this.onGround = true;
    } else if (np.y > g + 0.05) this.onGround = false;
    // subir escalones suaves
    if (this.onGround && g > p.y) np.y = Math.min(g, p.y + dt * 4 + 0.05);
    const moved = Math.hypot(np.x - p.x, np.z - p.z);
    p.copy(np);
    this.moveAmount = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4.1);
    if (this.onGround) this.bobPhase += moved * (this.running ? 1.9 : 2.2);
    this.stepDist += moved;
    if (audio && this.onGround && this.stepDist > (this.running ? 1.9 : 1.55)) { this.stepDist = 0; audio.footstep(this.running); }
    this.landKick *= Math.exp(-dt * 7);
    const eye = this.eye - this.crouchK * 0.55 - this.landKick * 0.12;
    this.camera.position.set(p.x, p.y + eye, p.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  damage(n, t) {
    this.health = Math.max(0, this.health - n);
    this.lastHit = t;
  }
}

export { RADIUS as PLAYER_RADIUS };
