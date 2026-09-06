import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Match, Team } from '../demo/types';
import { receiverName, serverName, serverTeam } from '../demo/score';
import { ballAt, makeRally, RALLY_WINNERS, RESET_SECONDS } from '../demo/rallies';
import { createPlayer } from './CourtPlayer';

interface Props { match: Match; rallyStartedAt: number | null; rallyIndex: number; rallyWinner?: Team; courtId: number; stale: boolean; changeoverEndsAt: number | null }
const ease = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export default function CourtScene(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio <= 1.5, powerPreference: 'high-performance' }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#526e66'); scene.fog = new THREE.Fog('#526e66', 55, 105);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 150);
    scene.add(new THREE.HemisphereLight('#eaf3ff', '#4b5232', 1.4));
    const sun = new THREE.DirectionalLight('#fff0cf', 2.7); sun.position.set(-18, 30, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 25, bottom: -25, near: 1, far: 75 }); sun.shadow.normalBias = 0.035; scene.add(sun);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: string) => { if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 })); return materials.get(color)!; };
    const box = (size: [number, number, number], at: [number, number, number], color: string) => {
      const object = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color)); object.position.set(...at); object.receiveShadow = true; object.castShadow = size[1] > 0.2; scene.add(object); return object;
    };
    box([70, 0.3, 85], [0, -0.23, 0], '#254635');
    box([21, 0.12, 36], [0, -0.07, 0], '#587340');
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#638749'; ctx.fillRect(0, 0, 768, 1024);
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#64874a' : '#72934f'; ctx.fillRect(0, i * 64, 768, 64); }
    let seed = 1703;
    const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 95000; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(24,48,18,.12)' : 'rgba(238,222,134,.13)'; ctx.fillRect(random() * 768, random() * 1024, 0.6 + random(), 1 + random() * 3);
    }
    for (const z of [0.15, 0.85]) {
      for (let i = 0; i < 4500; i++) {
        const x = 0.25 + random() * 0.5, y = z + (random() + random() - 1) * 0.04;
        ctx.fillStyle = 'rgba(173,151,98,.12)'; ctx.fillRect(x * 768, y * 1024, 2 + random() * 3, 2);
      }
    }
    const grassTexture = new THREE.CanvasTexture(canvas); grassTexture.colorSpace = THREE.SRGBColorSpace; grassTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(20, 34), new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
    const white = '#f4f0df';
    for (const x of [-5.485, 5.485, -4.115, 4.115]) box([0.055, 0.012, 23.77], [x, 0.015, 0], white);
    for (const z of [-11.885, 11.885]) { box([10.97, 0.012, 0.07], [0, 0.015, z], white); box([0.055, 0.013, 0.15], [0, 0.016, z - Math.sign(z) * 0.1], white); }
    for (const z of [-6.4, 6.4]) box([8.23, 0.012, 0.055], [0, 0.015, z], white);
    box([0.055, 0.012, 12.8], [0, 0.015, 0], white);
    const netTop = (x: number) => 0.914 + 0.156 * (x / 6.4) ** 2;
    const netLines: number[] = [];
    for (let x = -6.4; x <= 6.4; x += 0.1) netLines.push(x, 0.06, 0, x, netTop(x), 0);
    for (let y = 0.07; y < 0.91; y += 0.09) netLines.push(-6.4, y, 0, 6.4, y, 0);
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(netLines, 3)), new THREE.LineBasicMaterial({ color: '#1a2924', transparent: true, opacity: 0.32 })));
    const tape = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => { const x = -6.4 + i * 12.8 / 24; return new THREE.Vector3(x, netTop(x), 0); })), 48, 0.027, 6, false), mat(white)); tape.castShadow = true; scene.add(tape);
    for (const x of [-6.4, 6.4]) box([0.12, 1.14, 0.12], [x, 0.57, 0], '#e1e5d6');
    box([0.04, 0.91, 0.05], [0, 0.455, 0], white);
    for (const side of [-1, 1]) {
      box([0.16, 2.2, 36], [side * 11.2, 1.05, 0], '#1b392e');
      for (let z = -17; z <= 17; z += 3.4) box([0.07, 3.4, 0.07], [side * 11.3, 1.7, z], '#526257');
      for (const z of [-3, 3]) {
        box([0.65, 0.12, 2.1], [side * 8.7, 0.48, z], '#e1ded0');
        box([0.09, 0.7, 2.1], [side * 9, 0.72, z], '#e1ded0');
        for (const offset of [-0.75, 0.75]) box([0.45, 0.46, 0.09], [side * 8.7, 0.23, z + offset], '#304a3a');
        const bag = box([0.42, 0.27, 0.8], [side * 8.2, 0.135, z + 1.3], '#d8d4bb'); bag.rotation.y = 0.25;
      }
    }
    box([24, 2.2, 0.2], [0, 1, -17.9], '#19392b');
    const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 128;
    const signCtx = signCanvas.getContext('2d')!; signCtx.fillStyle = '#19392b'; signCtx.fillRect(0, 0, 1024, 128); signCtx.fillStyle = '#e2e5ce'; signCtx.font = '500 38px Arial'; signCtx.textAlign = 'center'; signCtx.fillText('C O U R T O S     /     G R A S S   S E R I E S', 512, 76);
    const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), new THREE.MeshBasicMaterial({ map: signTexture })); sign.position.set(0, 1.1, -17.77); scene.add(sign);
    for (let row = 0; row < 4; row++) {
      box([28, 0.55, 1.1], [0, 0.6 + row * 0.55, -19 - row * 1.1], '#7b8373');
      for (let seat = 0; seat < 32; seat++) {
        const x = -13.2 + seat * 0.85, y = 1 + row * 0.55, z = -19 - row * 1.1;
        box([0.55, 0.1, 0.5], [x, y, z], '#264c3b');
        if ((row + seat * 3) % 5 === 0) continue;
        const spectator = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.27, 3, 6), mat(['#e6ddc8', '#92a2a1', '#717d84', '#b7ac94'][(row + seat) % 4])); spectator.position.set(x, y + 0.3, z); scene.add(spectator);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(seat % 2 ? '#c89670' : '#8d664e')); head.position.set(x, y + 0.62, z); scene.add(head);
      }
    }
    for (let i = 0; i < 16; i++) {
      const x = -30 + i * 4, z = -28 - random() * 4;
      box([0.3, 4, 0.3], [x, 2, z], '#514735');
      for (let branch = 0; branch < 7; branch++) {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + random() * 0.7, 1), mat(['#30533a', '#3f6543', '#486b42'][branch % 3]));
        leaves.position.set(x + (random() - 0.5) * 3, 3.7 + random() * 2.3, z + (random() - 0.5) * 2); scene.add(leaves);
      }
    }
    // Static scenery shares draw calls; only the four players need independent transforms.
    for (const material of materials.values()) {
      const objects = scene.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh && object.material === material);
      if (objects.length < 2) continue;
      const parts = objects.map(object => { object.updateMatrix(); return object.geometry.clone().applyMatrix4(object.matrix); });
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      if (!geometry) continue;
      objects.forEach(object => { scene.remove(object); object.geometry.dispose(); });
      const merged = new THREE.Mesh(geometry, material); merged.castShadow = true; merged.receiveShadow = true; scene.add(merged);
    }
    const players = Array.from({ length: 4 }, (_, i) => createPlayer(i)); players.forEach(p => scene.add(p.root));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), new THREE.MeshStandardMaterial({ color: '#dfff38', emissive: '#9aa80c', emissiveIntensity: 0.2, roughness: 0.9 })); ball.castShadow = true; scene.add(ball);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#172812', transparent: true, opacity: 0.35, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const bounce = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.18, 32), new THREE.MeshBasicMaterial({ color: '#e5e4b7', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); bounce.rotation.x = -Math.PI / 2; scene.add(bounce);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, previousTime = performance.now(), phaseAt = Date.now(), oldPhase = '', oldMatch = '', lastRally = '', lastPaint = 0;
    let rally = makeRally(0, 0, 2, false, 0);
    let bases = players.map(() => new THREE.Vector3());
    let transitionFrom = players.map(p => p.root.position.clone());
    const cameraBase = new THREE.Vector3();
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight; if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height;
      const direction = new THREE.Vector3(10, 19, 29).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
      const vertical = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      let distance = 0;
      for (const x of [-7, 7]) for (const z of [-14, 14]) {
        const corner = new THREE.Vector3(x, 0, z);
        distance = Math.max(distance, Math.abs(corner.dot(right)) / (tangent * camera.aspect) + corner.dot(direction), Math.abs(corner.dot(vertical)) / tangent + corner.dot(direction));
      }
      cameraBase.copy(direction).multiplyScalar(distance * 1.15);
      camera.position.copy(cameraBase); camera.lookAt(0, 0, -0.6); camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
    let visible = true;
    const render = () => {
      if (document.hidden || !visible) { frame = 0; return; }
      frame = requestAnimationFrame(render);
      const p = latest.current, now = Date.now(), tick = performance.now();
      const moving = p.rallyStartedAt || now - phaseAt < 4500 || p.match.phase === 'changeover';
      if (tick - lastPaint < (moving && !reduced.matches ? 1000 / 60 : 1000 / 15)) return;
      lastPaint = tick;
      const dt = Math.min((tick - previousTime) / 1000, 0.1); previousTime = tick;
      const phase = p.match.phase, roster = [p.match.teams[0][0], p.match.teams[0][1], p.match.teams[1][0], p.match.teams[1][1]];
      const server = Math.max(0, roster.indexOf(serverName(p.match))), receiver = Math.max(0, roster.indexOf(receiverName(p.match)));
      const signature = [p.match.id, p.rallyStartedAt, p.rallyIndex, server, receiver].join(':');
      if (signature !== lastRally) {
        const ad = p.match.receiverSide === 'ad' || (!p.match.receiverSide && p.match.score.points.reduce((a, b) => a + b, 0) % 2 === 1);
        const winner = p.rallyWinner ?? (p.match.id === 'M101' ? RALLY_WINNERS[Math.max(0, p.rallyIndex)] ?? 0 : (p.rallyIndex % 2 ? 1 : 0));
        rally = makeRally(Math.max(0, p.rallyIndex), server, receiver, ad, winner, p.match.format === 'Singles');
        const near = serverTeam(p.match) === 0 ? 1 : -1, lane = ad ? 1 : -1;
        bases = players.map((_, i) => new THREE.Vector3(i < 2 ? 2.5 : -2.5, 0.02, i < 2 ? 4 : -4));
        bases[server].set(lane * near * 1.7 + near * 0.55, 0.02, near * 12.9);
        bases[receiver].set(-lane * near * 3.1 - near * 0.55, 0.02, -near * 11.25);
        bases[server ^ 1].x = -lane * near * 2.5; bases[receiver ^ 1].x = lane * near * 2.5;
        lastRally = signature;
      }
      if (phase !== oldPhase || p.match.id !== oldMatch) {
        transitionFrom = players.map(player => player.root.position.clone()); phaseAt = now;
        if (!oldPhase) transitionFrom = bases.map(base => base.clone());
        if (phase === 'warmup') transitionFrom = players.map((_, i) => new THREE.Vector3(9.6, 0.02, 13 + i * 0.8));
        oldPhase = phase; oldMatch = p.match.id;
      }
      const life = (now - phaseAt) / 1000;
      const time = p.rallyStartedAt ? (now - p.rallyStartedAt) / 1000 : 0;
      const active = !!p.rallyStartedAt && phase === 'playing' && !p.stale;
      const animationTime = reduced.matches ? rally.end + RESET_SECONDS : time;
      players.forEach((player, i) => {
        player.root.visible = Boolean(roster[i]);
        const target = bases[i].clone(), near = i < 2 ? 1 : -1;
        let contact: THREE.Vector3 | null = null, swing = 0, serving = 0;
        if (active && animationTime < rally.end + RESET_SECONDS) {
          const hits = rally.contacts.filter(c => c.player === i);
          for (const hit of hits) {
            const strength = ease((animationTime - (hit.at - 0.95)) / 0.75) * (1 - ease((animationTime - hit.at - 0.22) / 0.9));
            const hitBase = new THREE.Vector3(hit.position[0] + near * 0.65, 0.02, hit.position[2] + near * 0.5);
            target.lerp(hitBase, strength);
            const distance = animationTime - hit.at;
            if (Math.abs(distance) < 0.5) {
              const blend = ease((distance + 0.5) / 0.25) * (1 - ease((distance - 0.1) / 0.4));
              swing = Math.sin(distance * Math.PI / 0.65) * (1 - Math.abs(distance)); serving = hit === rally.contacts[0] ? blend : 0;
              const world = new THREE.Vector3(...hit.position); world.x += near * distance * 1.7; world.z -= near * Math.sin(distance * 5) * 0.8;
              contact = world.sub(target); contact.x *= -near; contact.z *= -near;
              contact.lerpVectors(new THREE.Vector3(0.68, 1.06, 0.32), contact.clone(), blend);
            }
          }
          if (!hits.length) target.x += Math.sin(animationTime * 1.5 + i) * 0.35;
        }
        if (phase === 'complete') target.set(i % 2 ? 1.2 : -1.2, 0.02, near * 0.7);
        if (phase === 'changeover') {
          target.set(near * -8.6, 0.02, i % 2 ? 3 : -3);
          if (p.changeoverEndsAt && p.changeoverEndsAt - now < 10000) target.lerp(bases[i], ease((10000 - (p.changeoverEndsAt - now)) / 9000));
        }
        if (phase === 'dispute' && life > 0.1) return;
        if (phase !== 'playing') target.lerpVectors(transitionFrom[i], target.clone(), reduced.matches ? 1 : ease(life / (phase === 'warmup' ? 4 : 2.2)));
        const previous = player.root.position.clone(); player.root.position.copy(target);
        const speed = reduced.matches ? 0 : Math.min(4, previous.distanceTo(target) / Math.max(dt, 0.001));
        player.root.rotation.y = near > 0 ? Math.PI : 0;
        if ((phase === 'warmup' && life < 3.5) || (phase === 'complete' && life < 1.8)) {
          const delta = target.clone().sub(previous); if (delta.length() > 0.001) player.root.rotation.y = Math.atan2(delta.x, delta.z);
        }
        player.trim.color.set(p.match.id === 'M103' ? (i < 2 ? '#825c41' : '#40567e') : i < 2 ? '#1c493e' : '#73849b');
        player.pose(reduced.matches ? 0 : tick / 1000, speed, swing, contact, serving, phase === 'changeover', phase === 'complete' && life > 1.8);
      });
      ball.visible = active && animationTime <= rally.end && !reduced.matches;
      if (ball.visible) { ball.position.set(...ballAt(rally, animationTime)); ball.rotation.x = animationTime * 18; }
      shadow.visible = ball.visible; shadow.position.set(ball.position.x, 0.025, ball.position.z); shadow.scale.setScalar(1 + ball.position.y * 0.2);
      bounce.visible = ball.visible && ball.position.y < 0.2; bounce.position.set(ball.position.x, 0.028, ball.position.z);
      camera.position.copy(cameraBase);
      if (phase === 'complete' && !reduced.matches) camera.position.multiplyScalar(1 - ease(life / 3) * 0.12);
      camera.lookAt(0, 0.2, -0.6); renderer.render(scene, camera);
    };
    const resume = () => { if (!document.hidden && visible && !frame) render(); };
    const visibilityObserver = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) resume();
    }) : null;
    visibilityObserver?.observe(container);
    document.addEventListener('visibilitychange', resume);
    render();
    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect(); visibilityObserver?.disconnect();
      document.removeEventListener('visibilitychange', resume);
      const geometries = new Set<THREE.BufferGeometry>(), disposableMaterials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) disposableMaterials.add(material); } });
      geometries.forEach(g => g.dispose()); disposableMaterials.forEach(m => m.dispose()); grassTexture.dispose(); signTexture.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <div ref={root} className="court-canvas" role="img" aria-label={`3D tennis view on Court ${props.courtId}. ${props.stale ? 'Last received court state.' : props.match.phase}.`}>
    {failed && <div className="scene-fallback"><div className="flat-court"><span/><span/></div><p>Court visualization unavailable. Scoring is ready.</p></div>}
  </div>;
}
