// ZOCO: APAGÓN — arranque, bucle, iluminación por fases al ritmo de la música, arma y HUD.
import * as THREE from 'three';
import { buildWorld, HALL, BALL_POS, STAIR } from './world.js';
import { Post, QUALITY } from './post.js';
import { FloorReflection } from './reflect.js';
import { Input, Player } from './player.js';
import { FX, sharedPtUniforms, flashTex } from './fx.js';
import { Weapon } from './weapon.js';
import { Enemies } from './enemies.js';

import { AudioSystem } from './audio-lite.js';
const audio = new AudioSystem();

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 80);
scene.add(camera);

// Mapa de entorno: sala oscura con tiras de neón (reflejos en metal y cristal)
{
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 30), new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.BackSide }));
  env.add(room);
  const strip = (c, x, y, z, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6) })); m.position.set(x, y, z); env.add(m); };
  strip(0xff2a8a, 0, 3, -14, 10, 1.2, 0.2);
  strip(0x28e6ff, -14, 2, 0, 0.2, 0.4, 20);
  strip(0xffa040, 14, 1.5, 0, 0.2, 1.2, 14);
  strip(0xffffff, 0, 4.9, 0, 6, 0.1, 6);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.1;
}

let qName = params.get('q') || 'medium';
const reflection = new FloorReflection(renderer, QUALITY[qName].refl);
const world = buildWorld(scene, { quality: qName, reflection });
for (const m of world.floorMeshes) reflection.hide.push(m);

const input = new Input(renderer.domElement);
const player = new Player(camera, world.colliders, world.bounds);
const groundAt = (x, z, y) => player.groundAt(x, z, y);
const fx = new FX(scene, groundAt, audio);
const weapon = new Weapon({ camera, scene, audio, fx, world, quality: qName, envMap: scene.environment });
reflection.hide.push(weapon.root);
for (const src of world.lasers) for (const b of src.beams) reflection.hide.push(b.core);
const enemies = new Enemies({ scene, world, fx, audio, player, camera, quality: qName });

let post = new Post(renderer, scene, camera, qName);
let pr = Math.min(QUALITY[qName].pr, devicePixelRatio);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, pr));
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(w, h);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  reflection.setSize(db.x, db.y);
  sharedPtUniforms.uScale.value = db.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', resize);
resize();

function applyQuality(q) {
  qName = q;
  const Q = QUALITY[q];
  pr = Math.min(Q.pr, devicePixelRatio);
  reflection.scale = Q.refl; reflection.uniforms.uReflOn.value = Q.refl > 0 ? 1 : 0;
  world.lights.stage.forEach((s, i) => { s.castShadow = i < (q === 'ultra' ? 2 : 0); });
  weapon.setShadowSize(Q.shadowSize);
  post.composer.dispose();
  post = new Post(renderer, scene, camera, q);
  resize();
}

// ---------- estado de juego ----------
const G = {
  state: 'title', phase: 0, t: 0, phaseT: 0, power: 0, powerTarget: 0, cleaning: 0,
  kills: 0, shots: 0, hits: 0, startTime: 0, endTime: 0, fpsOn: false, dyn: 1,
};
window.__zoco = { G, world, player, weapon, enemies, camera, input, post: () => post, audio, setPhase: (p) => setPhase(p), fps: () => fpsShown };

const $ = (id) => document.getElementById(id);
function lockPointer() { try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* sin bloqueo */ } }
const hud = { phase: $('phase'), sub: $('sub'), ammo: $('ammo').querySelector('b'), health: $('health').querySelector('i'), dmg: $('dmg'), fps: $('fps'), cross: $('cross'), hit: $('hitmark'), obj: $('obj') };
let subT = 0, phaseTitleT = 0;
function subtitle(text, dur = 3) { hud.sub.querySelector('span').textContent = text; hud.sub.style.opacity = 1; subT = dur; }
function phaseTitle(big, small, dur = 3.5) { hud.phase.innerHTML = `${big}<small>${small}</small>`; hud.phase.style.opacity = 1; phaseTitleT = dur; }
enemies.onSay = (t) => subtitle(t, 2.6);
enemies.onKill = () => { G.kills++; };
weapon.onShot = () => { G.shots++; };
weapon.onHit = (kind) => { G.hits++; hud.hit.style.transition = 'none'; hud.hit.style.opacity = kind === 'kill' ? 1 : 0.7; requestAnimationFrame(() => { hud.hit.style.transition = 'opacity .25s'; hud.hit.style.opacity = 0; }); };
weapon.hitTargets = () => enemies.hitTargets();
weapon.onEnemyHit = (obj, point, dmg) => enemies.damage(obj, point, dmg);
weapon.onBallHit = () => { if (world.ball.alive && !world.ball.falling && G.power > 0.3) { world.ball.falling = true; audio.mirrorBallFall(world.ball.mesh.position); subtitle('¡La bola!', 1.5); } };
enemies.onPlayerHit = (dmg) => { player.damage(dmg, G.t); audio.hurt(); hud.dmg.style.opacity = 0.9; };

function setPhase(p) {
  G.phase = p; G.phaseT = 0;
  audio.setPhase(p);
  if (p === 1) { G.powerTarget = 0; phaseTitle('APAGÓN', 'Se ha ido la luz · 3 drones de seguridad'); enemies.spawnDrones(3, false); hud.obj.textContent = 'Drones: 3'; }
  if (p === 2) { audio.generator(); G.flickerT = 2.6; phaseTitle('VUELVE LA CORRIENTE', 'A medias · 5 drones'); setTimeout(() => { if (G.phase === 2) enemies.spawnDrones(5, true); }, 2600); }
  if (p === 3) { G.powerTarget = 1; phaseTitle('LOS SEGURATAS', 'Te están buscando'); enemies.spawnBouncers(5); world.doorsOpen = true; setTimeout(() => subtitle('«Con esas zapatillas no pasas.»', 3), 1800); }
  if (p === 4) { G.powerTarget = 1; audio.alarm(); phaseTitle('EL JEFE', 'Baja del techo'); enemies.spawnBoss(); }
  if (p === 5) {
    G.endTime = G.t; G.cleaning = 1; G.power = 0; G.powerTarget = 0; audio.lightsOn();
    setTimeout(showEnd, 2600);
  }
}
function showEnd() {
  G.state = 'end';
  document.exitPointerLock();
  const secs = G.endTime - G.startTime;
  const mm = Math.floor(secs / 60), ss = Math.floor(secs % 60).toString().padStart(2, '0');
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  $('end').querySelector('.st').innerHTML = `TIEMPO ${mm}:${ss} &nbsp;·&nbsp; BAJAS ${G.kills} &nbsp;·&nbsp; PRECISIÓN ${acc}%`;
  $('end').style.display = 'flex';
  $('hud').style.display = 'none';
}
$('again').onclick = () => location.reload();

function startGame(q) {
  if (q !== qName) applyQuality(q);
  audio.init && Promise.resolve(audio.init()).then(() => audio.setPhase(1)).catch(() => {});
  $('title').style.opacity = 0; setTimeout(() => ($('title').style.display = 'none'), 800);
  $('hud').style.display = 'block';
  lockPointer();
  G.state = 'play'; G.startTime = G.t;
  player.pos.copy(world.spawn.pos); player.yaw = world.spawn.yaw; player.pitch = 0;
  setPhase(1);
}
document.querySelectorAll('#title button').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.q)));
renderer.domElement.addEventListener('click', () => { if (G.state === 'play' && !input.locked) lockPointer(); });

// ---------- iluminación dirigida ----------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpC = new THREE.Color();
const volSpots = Array.from({ length: 8 }, () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Vector3(), cosOuter: 0.9, cosInner: 0.95 }));
const volPoints = Array.from({ length: 5 }, () => ({ pos: new THREE.Vector3(), color: new THREE.Vector3() }));
const palette = [0xff2a8a, 0x28e6ff, 0x8a2aff, 0xff6a00, 0x20ff80].map((c) => new THREE.Color(c));
const ambientV = new THREE.Vector3();

function lighting(dt, beat) {
  const L = world.lights;
  const t = G.t;
  // parpadeo del generador
  if (G.flickerT > 0) {
    G.flickerT -= dt;
    const on = Math.random() < 0.35 + (2.6 - G.flickerT) * 0.2;
    G.power = on ? 0.45 + Math.random() * 0.3 : 0.02;
    if (G.flickerT <= 0) { G.power = 0.65; G.powerTarget = 0.65; }
  } else G.power += (G.powerTarget - G.power) * Math.min(1, dt * 2);
  const P = G.power, kick = beat.kick || 0, cl = G.cleaning;
  const musicOn = G.phase >= 2 && G.phase < 5;
  // entorno y ambiente
  scene.environmentIntensity = 0.05 + P * 0.35 + cl * 0.9;
  L.hemi.intensity = 0.015 + P * 0.05 + cl * 5.5;
  L.hemi.color.set(cl ? 0xf4f6ff : 0x8090b0);
  // emergencia: siempre, parpadeo ocasional
  const emFlick = Math.random() < 0.01 ? 0.3 : 1;
  L.emergency.forEach((l) => (l.intensity = (3.2 * emFlick) * (1 - P * 0.4)));
  L.exitGreen.intensity = 1.1;
  // pantalla, neones, barra
  world.screenMat.uniforms.uTime.value = t; world.screenMat.uniforms.uKick.value = kick; world.screenMat.uniforms.uPower.value = cl ? 0 : P > 0.3 ? P : P * (Math.random() < 0.5 ? 1 : 0);
  const neonK = P > 0.1 ? P * (0.85 + kick * 0.3) : 0;
  world.neon.pink.color.set(0xff2a8a).multiplyScalar(6 * neonK + (cl ? 1 : 0));
  world.neon.cyan.color.set(0x28e6ff).multiplyScalar(5 * neonK + (cl ? 1 : 0));
  for (const n of world.barNeons) { n.mats[0].color.setHSL(n === world.barNeons[0] ? 0.93 : 0.09, 1, 0.5).multiplyScalar(4 * P); n.mats[1].color.setHSL(n === world.barNeons[0] ? 0.52 : 0.02, 1, 0.5).multiplyScalar(4 * P); }
  world.backlightMat.color.setScalar(1.6 * P + cl * 0.8);
  world.bottleMat.emissiveIntensity = 0.9 * P + cl * 0.3;
  world.barStripMat.color.set(0xffb060).multiplyScalar(3 * P + cl * 2);
  world.amberLens.color.set(0xffa040).multiplyScalar(8 * P + cl * 10);
  L.bar.intensity = 18 * P + cl * 40;
  L.screen.intensity = P > 0.3 ? 12 * P * (0.6 + kick) : 0;
  L.screen.color.setHSL((t * 0.03) % 1, 0.9, 0.55);
  world.workMat.color.setScalar(cl * 12);
  for (const pm of world.sidePanels) { pm.uniforms.uTime.value = t * 1.3 + 7; pm.uniforms.uKick.value = kick; pm.uniforms.uPower.value = musicOn ? P * 0.8 : 0; }
  // focos del escenario y cabezas móviles al ritmo
  const bi = Math.floor(beat.beat || 0);
  L.stage.forEach((s, i) => {
    const c = palette[(bi + i) % palette.length];
    if (cl) { s.color.set(0xf2f5ff); s.intensity = 2200; s.angle = 1.1; s.penumbra = 0.8; s.target.position.set(s.position.x, 0, s.position.z); return; }
    s.color.copy(c);
    s.intensity = musicOn ? P * (160 + kick * 900) : 0;
    s.angle = 0.28;
    const a = t * (0.4 + i * 0.13) + i * 2;
    s.target.position.set(-1 + Math.sin(a) * 6, 0, -1.5 + Math.cos(a * 1.3) * 6);
  });
  // cabezas: solo haz volumétrico (sin luz real) + lente
  world.heads.forEach((h, i) => {
    const a = t * 0.6 + h.phase + (G.phase >= 4 ? t * 0.8 : 0);
    tmpV.set(Math.sin(a) * 0.55, -1, Math.cos(a * 1.2 + i) * 0.55).normalize();
    h.dir.copy(tmpV);
    h.yoke.lookAt(tmpV2.copy(h.pos).add(tmpV));
    h.color.copy(palette[(bi + i * 2) % palette.length]);
    const on = musicOn && P > 0.3 && ((bi + i) % (G.phase >= 3 ? 1 : 2) === 0);
    h.on = on ? 0.5 + kick * 1.5 : 0;
    h.lens.material.color.copy(h.color).multiplyScalar(h.on * 6);
  });
  // láseres (el verde funciona con batería)
  world.lasers.forEach((src, li) => {
    const active = src.battery ? (G.state === 'title' || G.phase < 5) : musicOn && P > 0.4;
    const strobe = G.phase >= 3 ? (kick > 0.45 ? 1 : 0.25) : 1;
    src.beams.forEach((b, k) => {
      const n = src.beams.length;
      const spread = src.battery && G.phase <= 1 ? 0.5 : 1.1;
      const yawA = (k / (n - 1) - 0.5) * spread + Math.sin(t * (src.battery ? 0.25 : 0.7) + li) * 0.4;
      const pitch = -0.18 - 0.2 * (0.5 + 0.5 * Math.sin(t * (src.battery ? 0.33 : 1.1) + li * 1.7));
      tmpV.set(Math.sin(yawA) * Math.cos(pitch), Math.sin(pitch), Math.cos(yawA) * Math.cos(pitch));
      const hitR = world.rayRoom(src.p, tmpV);
      const len = Math.min(hitR.t, 40);
      b.core.lookAt(tmpV2.copy(src.p).add(tmpV)); b.glow.quaternion.copy(b.core.quaternion);
      b.core.scale.set(1, 1, len); b.glow.scale.set(1, 1, len);
      const vis = active && (src.battery && G.phase <= 1 ? k % 2 === 0 : true) && !(cl);
      const I = vis ? (src.battery && G.phase <= 1 ? 2.2 : 3.2) * strobe : 0;
      b.core.material.color.copy(src.color).multiplyScalar(I * 4);
      b.glow.material.opacity = vis ? 0.05 * strobe : 0;
      b.core.visible = b.glow.visible = I > 0;
    });
  });
  L.floorBounce.intensity = musicOn ? P * (6 + kick * 20) : 0;
  L.floorBounce.color.copy(palette[bi % palette.length]);

  // bola de espejos: puntos de luz girando
  const ball = world.ball;
  const dots = world.dots;
  const dotsOn = ball.alive && !ball.falling && musicOn && P > 0.4;
  if (ball.alive && !ball.falling) { ball.rot += dt * 0.35; ball.mesh.rotation.y = ball.rot; }
  if (dotsOn || dots.mesh.visible) {
    dots.mesh.visible = dotsOn;
    if (dotsOn) {
      const cs = Math.cos(ball.rot), sn = Math.sin(ball.rot);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const normals = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
      for (let i = 0; i < dots.dirs.length; i++) {
        const d0 = dots.dirs[i];
        tmpV.set(d0.x * cs - d0.z * sn, d0.y, d0.x * sn + d0.z * cs);
        const r = world.rayRoom(BALL_POS, tmpV);
        tmpV2.copy(BALL_POS).addScaledVector(tmpV, r.t - 0.02);
        const n = normals[r.axis];
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const sz = 0.05 + r.t * 0.012;
        m.compose(tmpV2, q, s.set(sz, sz, sz));
        dots.mesh.setMatrixAt(i, m);
      }
      dots.mesh.instanceMatrix.needsUpdate = true;
      dots.mat.color.setScalar(2.2 * P * (0.7 + kick * 0.6));
    }
  }
  // luz del flash de la bola (spot que la ilumina)
  // ---------- volumétrica: focos reales + cabezas + linterna + enemigos ----------
  let ns = 0;
  const addSpot = (pos, dir, color, gain, cosO, cosI) => { if (ns >= 8 || gain <= 0.001) return; const v = volSpots[ns++]; v.pos.copy(pos); v.dir.copy(dir).normalize(); v.color.set(color.r * gain, color.g * gain, color.b * gain); v.cosOuter = cosO; v.cosInner = cosI; };
  const fl = weapon.flash;
  if (weapon.lightOn) { fl.getWorldPosition(tmpV); tmpV2.set(0, 0, -1).applyQuaternion(fl.getWorldQuaternion(new THREE.Quaternion())); addSpot(tmpV, tmpV2, tmpC.setRGB(1, 0.95, 0.88), 9, Math.cos(0.36), Math.cos(0.16)); }
  for (const e of enemies.volSpots()) addSpot(e.pos, e.dir, e.color, e.gain, e.cosO, e.cosI);
  L.stage.forEach((s) => { if (s.intensity > 1 && !cl) { tmpV.copy(s.target.position).sub(s.position); addSpot(s.position, tmpV, s.color, s.intensity / 90, Math.cos(s.angle), Math.cos(s.angle * 0.5)); } });
  world.heads.forEach((h) => { if (h.on > 0) addSpot(h.pos, h.dir, h.color, h.on * 7, Math.cos(0.12), Math.cos(0.05)); });
  let np = 0;
  const addPt = (pos, col, gain) => { if (np >= 5 || gain <= 0.001) return; const v = volPoints[np++]; v.pos.copy(pos); v.color.set(col.r * gain, col.g * gain, col.b * gain); };
  if (weapon.muzzleLight.intensity > 1) addPt(weapon.muzzleLight.position, weapon.muzzleLight.color, weapon.muzzleLight.intensity * 0.12);
  if (fx.flashLight.intensity > 1) addPt(fx.flashLight.position, fx.flashLight.color, fx.flashLight.intensity * 0.05);
  for (const l of L.emergency) addPt(l.position, l.color, l.intensity * 0.4);
  addPt(L.exitGreen.position, L.exitGreen.color, 1.2);
  const vs = post.vol ? ns : 0;
  ambientV.set(0.0015, 0.0015, 0.002).addScalar(P * 0.004 + cl * 0.02);
  sharedPtUniforms.uAmb.value.set(0.03 + P * 0.25 + cl * 1.2, 0.03 + P * 0.22 + cl * 1.2, 0.04 + P * 0.25 + cl * 1.2);
  return { spots: volSpots.slice(0, vs), points: volPoints.slice(0, np), ambient: ambientV };
}

// ---------- bola que cae ----------
function updateBall(dt) {
  const b = world.ball;
  if (!b.falling || !b.alive) return;
  b.vel += 9.8 * dt;
  b.mesh.position.y -= b.vel * dt;
  b.chain.visible = false;
  const floorY = STAIR.top + 0.42;
  if (b.mesh.position.y <= floorY) {
    b.alive = false; b.mesh.visible = false;
    fx.shatter(b.mesh.position, 120, null, [2.5, 2.5, 3]);
    fx.flash(b.mesh.position, 80, 0.2, 0xffffff);
    audio.glass(b.mesh.position, true);
    subtitle('Adiós, bola.', 1.5);
  }
}

// ---------- humo de las máquinas ----------
let smokeT = 0;
function smokeMachines(dt) {
  smokeT -= dt;
  if (smokeT > 0) return;
  smokeT = 0.08;
  for (const p of world.smokeMachines) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.2, 1.2 + Math.random() * 0.8);
    if (p.x < -9) v.set(1.2 + Math.random(), 0.15, (Math.random() - 0.5) * 0.6);
    fx.smoke.spawn(p, v, { life: 5 + Math.random() * 3, size: 0.5, grow: 0.7, color: [0.55, 0.55, 0.6], alpha: 0.16, drag: 0.5, gravity: -0.04, spin: 0.3 });
  }
}

// ---------- cámara de la pantalla de inicio ----------
const titlePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(3.5, 1.7, 13.5), new THREE.Vector3(2.5, 2.1, 7), new THREE.Vector3(-1.5, 2.6, 4.5),
  new THREE.Vector3(-4.2, 3.2, 1.0), new THREE.Vector3(-3.4, 3.9, -3.2), new THREE.Vector3(-1.6, 4.1, -4.4),
]);
function titleCam(t) {
  const u = Math.min(1, (t % 48) / 44);
  const e = u * u * (3 - 2 * u);
  camera.position.copy(titlePath.getPoint(e));
  tmpV.set(0, 2.5, -12).lerp(BALL_POS, Math.min(1, e * 1.3));
  camera.lookAt(tmpV);
}

// ---------- bucle ----------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsShown = 60, dynT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  G.t += dt; G.phaseT += dt;
  const st = input.poll(dt);
  if (st.fps) { G.fpsOn = !G.fpsOn; hud.fps.style.display = G.fpsOn ? 'block' : 'none'; }
  const beat = audio.getBeat ? audio.getBeat() : { kick: 0, beat: 0 };
  
  if (G.state === 'title') {
    titleCam(G.t);
    G.power = 0;
  } else {
    if (G.state === 'play') {
      if (st.start && !input.locked) lockPointer();
      player.update(dt, st, weapon.aimK, { footstep: (run) => audio.footstep(run, world.isMetalStair(player.pos.x, player.pos.z, player.pos.y)) });
      weapon.update(dt, st, player, G.t);
      // regeneración de vida
      if (G.t - player.lastHit > 4 && player.health < 100) player.health = Math.min(100, player.health + dt * 12);
      if (player.health <= 0) {
        player.health = 100; player.pos.copy(world.spawn.pos); player.yaw = 0; hud.dmg.style.opacity = 0;
        subtitle('Te han sacado de la pista. Vuelves a entrar.', 3);
      }
    }
    enemies.update(dt, G);
    // progreso de fases
    if (G.state === 'play') {
      const alive = enemies.aliveCount();
      hud.obj.textContent = G.phase === 1 || G.phase === 2 ? `Drones: ${alive}` : G.phase === 3 ? `Seguratas: ${alive}` : G.phase === 4 ? `Jefe` : '';
      if (G.phaseT > 3 && alive === 0 && !G.pending) {
        const next = G.phase + 1;
        if (next <= 5) { G.pending = true; setTimeout(() => { G.pending = false; setPhase(next); }, next === 5 ? 200 : 1800); }
      }
    }
  }
  // puertas
  if (world.doorsOpen) for (const d of world.doors) d.pivot.rotation.y += ((d.side * 1.4) - d.pivot.rotation.y) * Math.min(1, dt * 2);

  audio.update && audio.update(dt, camera.position, camera.getWorldDirection(tmpV));
  updateBall(dt);
  smokeMachines(dt);
  const lights = lighting(dt, beat);
  fx.update(dt);
  // linterna para las partículas
  weapon.flash.getWorldPosition(sharedPtUniforms.uFlPos.value);
  sharedPtUniforms.uFlDir.value.set(0, 0, -1).applyQuaternion(weapon.flash.getWorldQuaternion(new THREE.Quaternion()));
  sharedPtUniforms.uFlOn.value = weapon.lightOn ? 1 : 0;
  sharedPtUniforms.uFlashPos.value.copy(weapon.muzzleLight.position);
  sharedPtUniforms.uFlash.value = weapon.muzzleLight.intensity * 0.05;
  // HUD
  if (G.state === 'play') {
    hud.ammo.textContent = weapon.reloading ? '··' : weapon.ammo;
    hud.health.style.width = player.health + '%';
    hud.cross.style.opacity = weapon.aimK > 0.5 ? 0 : 0.85;
    hud.dmg.style.opacity = Math.max(0, parseFloat(hud.dmg.style.opacity || 0) - dt * 1.5) + (player.health < 35 ? 0.3 : 0);
  }
  if (subT > 0) { subT -= dt; if (subT <= 0) hud.sub.style.opacity = 0; }
  if (phaseTitleT > 0) { phaseTitleT -= dt; if (phaseTitleT <= 0) hud.phase.style.opacity = 0; }
  $('click').style.display = G.state === 'play' && !input.locked ? 'block' : 'none';

  camera.updateMatrixWorld();
  reflection.update(scene, camera);
  const exposure = 1.0 + (1 - G.power) * 0.6 - G.cleaning * 0.3;
  const density = G.cleaning ? 0.012 : 0.045 + (G.phase >= 4 ? 0.015 : 0);
  post.update(dt, G.t, { exposure, density, ambient: lights.ambient, spots: lights.spots, points: lights.points, aim: weapon.aimK, focusDist: weapon.focusDist });

  // FPS y resolución dinámica
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) {
    fpsShown = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    hud.fps.textContent = `${fpsShown.toFixed(0)} FPS · ${qName} · ${db.x}×${db.y}`;
    dynT++;
    if (G.state !== 'title' && dynT > 1) {
      const Q = QUALITY[qName];
      if (fpsShown < 50 && pr > 0.5) { pr = Math.max(0.5, pr - (fpsShown < 35 ? 0.2 : 0.1)); resize(); dynT = 0; }
      else if (fpsShown > 58 && pr < Math.min(Q.maxPr, devicePixelRatio)) { pr = Math.min(Q.maxPr, pr + 0.05); resize(); dynT = 0; }
    }
  }
}
frame();
if (params.get('auto')) startGame(qName);
