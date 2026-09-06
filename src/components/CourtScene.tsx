import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface Props { phase: string; rallyStartedAt: number | null; serverTeam: number; courtId: number }
export default function CourtScene(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [failed, setFailed] = useState(false);
  useEffect(() => { latest.current = props; }, [props]);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#203d2c');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#263f2e');
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 150);
    camera.position.set(17, 24, 31);
    camera.lookAt(0, 0, 0);
    const ambient = new THREE.HemisphereLight('#fff9e7', '#476546', 2.4);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff9e7', 3.2);
    sun.position.set(-14, 28, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
    sun.shadow.normalBias = 0.025; sun.shadow.bias = -0.0001;
    scene.add(sun);
    const meshes: THREE.Mesh[] = [];
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: string, roughness = 0.92) => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness }));
      return materials.get(color)!;
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = h > 0.2;
      scene.add(mesh); meshes.push(mesh); return mesh;
    };
    box(38, 0.5, 44, 0, -0.35, 0, '#234d31');
    box(19, 0.1, 34, 0, -0.02, 0, '#658347');
    // Alternating mown stripes and subtle deterministic grass speckling.
    for (let i = 0; i < 16; i++) box(18.8, 0.018, 2.1, 0, 0.04, -15.75 + i * 2.1, i % 2 ? '#728d4c' : '#627f42');
    const grassCanvas = document.createElement('canvas'); grassCanvas.width = 256; grassCanvas.height = 256;
    const ctx = grassCanvas.getContext('2d')!;
    let seed = 317;
    for (let i = 0; i < 16000; i++) {
      seed = (seed * 16807) % 2147483647; const x = seed % 256;
      seed = (seed * 16807) % 2147483647; const y = seed % 256;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,200,.11)' : 'rgba(0,30,0,.09)'; ctx.fillRect(x, y, 1, 3);
    }
    const texture = new THREE.CanvasTexture(grassCanvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 9);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 33.6), new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = 0.06; scene.add(grass);
    const lineColor = '#f4f2dd';
    // Regulation doubles boundaries, singles sidelines, service boxes.
    [-5.485, 5.485, -4.115, 4.115].forEach(x => box(0.07, 0.025, 23.77, x, 0.075, 0, lineColor));
    [-11.885, 11.885].forEach(z => box(10.97, 0.025, 0.07, 0, 0.075, z, lineColor));
    [-6.4, 6.4].forEach(z => box(8.23, 0.025, 0.07, 0, 0.075, z, lineColor));
    box(0.07, 0.025, 12.8, 0, 0.075, 0, lineColor);
    [-11.6, 11.6].forEach(z => box(0.07, 0.025, 0.3, 0, 0.075, z, lineColor));
    // Net mesh, tape, and posts.
    [-6.4, 6.4].forEach(x => box(0.12, 1.15, 0.12, x, 0.57, 0, '#ededdf'));
    box(12.8, 0.065, 0.055, 0, 1.1, 0, '#f6f4e7');
    for (let i = 0; i <= 85; i++) box(0.014, 0.99, 0.012, -6.35 + i * 0.149, 0.56, 0, '#293c30');
    for (let i = 0; i <= 9; i++) box(12.7, 0.014, 0.012, 0, 0.12 + i * 0.105, 0, '#293c30');
    // Low original grandstands. The court remains the visual focus.
    box(24, 1.9, 0.4, 0, 0.8, -17.5, '#173c2b');
    box(0.4, 1.9, 36, -11, 0.8, 0, '#173c2b');
    box(0.4, 1.9, 36, 11, 0.8, 0, '#173c2b');
    for (let row = 0; row < 3; row++) {
      box(27, 0.7, 1.1, 0, 0.7 + row * 0.68, -18.2 - row * 1.1, '#52614e');
      for (let seat = 0; seat < 29; seat++) {
        const x = -12.8 + seat * 0.9;
        box(0.56, 0.22, 0.55, x, 1.15 + row * 0.68, -18.2 - row * 1.1, '#254d37');
        if ((seat * 3 + row) % 4 !== 0) {
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.25, 3, 5), mat(['#d9d6c3', '#82999b', '#c2bda6', '#7c8e75'][(seat + row) % 4]));
          body.position.set(x, 1.55 + row * 0.68, -18.25 - row * 1.1); scene.add(body); meshes.push(body);
        }
      }
    }
    // Trees beyond the back fence frame the grass-court setting.
    for (let i = 0; i < 12; i++) {
      const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + i % 3 * 0.2, 1), mat(i % 2 ? '#244d32' : '#315d39'));
      tree.position.set(-20 + i * 3.7, 4.6, -24 - i % 2 * 2); scene.add(tree); meshes.push(tree);
    }
    const players: { group: THREE.Group; arm: THREE.Group; legs: THREE.Mesh[]; base: THREE.Vector3 }[] = [];
    const bases = [[-2.8, 12.3], [2.5, 4.6], [2.8, -12.3], [-2.5, -4.6]];
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const skin = mat(i % 2 ? '#ac7c59' : '#deb58d');
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 9), mat('#f4f3e9'));
      body.position.y = 1.02; body.castShadow = true; group.add(body); meshes.push(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); head.position.y = 1.62; head.castShadow = true; group.add(head); meshes.push(head);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#fffff5'));
      cap.position.y = 1.67; group.add(cap); meshes.push(cap);
      const legs: THREE.Mesh[] = [];
      [-0.14, 0.14].forEach(x => {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.46, 3, 7), skin); leg.position.set(x, 0.4, 0); leg.castShadow = true; group.add(leg); legs.push(leg); meshes.push(leg);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.36), mat('#efefe5')); shoe.position.set(x, 0.08, 0.08); group.add(shoe); meshes.push(shoe);
      });
      const arm = new THREE.Group(); arm.position.set(0.33, 1.24, 0); arm.rotation.z = -0.32; group.add(arm);
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.49, 3, 7), skin); forearm.position.y = -0.25; arm.add(forearm); meshes.push(forearm);
      const racket = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.028, 5, 18), mat('#dde38f'));
      racket.scale.y = 1.3; racket.position.set(0, -0.91, 0); arm.add(racket); meshes.push(racket);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 5), mat('#283f30')); handle.position.y = -0.58; arm.add(handle); meshes.push(handle);
      const base = new THREE.Vector3(bases[i][0], 0.12, bases[i][1]); group.position.copy(base); group.rotation.y = i < 2 ? Math.PI : 0;
      scene.add(group); players.push({ group, arm, legs, base });
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#e3f16d')); ball.castShadow = true; scene.add(ball); meshes.push(ball);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let dirty = true;
    let lastSignature = '';
    let previousMoving = false;
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; dirty = true;
      // Widen framing for narrower devices without cropping court baselines.
      camera.position.set(16, camera.aspect < 1.1 ? 31 : 24, camera.aspect < 1.1 ? 38 : 31);
      camera.lookAt(0, 0, -0.5); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const render = () => {
      const p = latest.current;
      const elapsed = p.rallyStartedAt ? (Date.now() - p.rallyStartedAt) / 1000 : 0;
      const rally = p.phase === 'playing' && elapsed > 0 && elapsed < 4.2 && !reduced.matches;
      const signature = [p.phase, p.rallyStartedAt, p.serverTeam, p.courtId].join(':');
      if (!rally && !previousMoving && !dirty && signature === lastSignature) { frame = requestAnimationFrame(render); return; }
      previousMoving = rally; lastSignature = signature; dirty = false;
      players.forEach((player, i) => {
        if (p.phase === 'complete') {
          player.group.position.set((i % 2 ? 1 : -1) * 1.3, 0.12, i < 2 ? 1.2 : -1.2);
        } else if (p.phase === 'changeover') {
          player.group.position.set(i < 2 ? -8 : 8, 0.12, (i % 2 ? 1 : -1) * 3);
        } else {
          player.group.position.copy(player.base);
          if (rally) {
            player.group.position.x += Math.sin(elapsed * 4 + i * 2) * (i % 2 ? 0.45 : 1.2);
            player.legs.forEach((leg, j) => { leg.rotation.x = Math.sin(elapsed * 12 + j * Math.PI) * 0.3; });
          } else player.legs.forEach(leg => { leg.rotation.x = 0; });
        }
        player.arm.rotation.x = rally ? Math.sin(elapsed * 7 + i * 2) * 1.05 : -0.15;
      });
      ball.visible = rally;
      if (rally) {
        const progress = elapsed * 1.65;
        ball.position.set(Math.sin(progress * Math.PI) * 3.1, 0.4 + Math.abs(Math.sin(progress * Math.PI)) * 3.5, Math.cos(progress * Math.PI) * 11.4);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      meshes.forEach(mesh => mesh.geometry.dispose());
      materials.forEach(material => material.dispose());
      grass.geometry.dispose(); (grass.material as THREE.Material).dispose(); texture.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <div ref={root} className="court-canvas" role="img" aria-label={'Scripted 3D grass court ' + props.courtId + '. ' + (props.rallyStartedAt ? 'Rally in progress.' : 'Players waiting.')}>
    {failed && <div className="scene-fallback"><div className="flat-court"><span/><span/></div><p>Court visualization unavailable. Scoring is ready.</p></div>}
  </div>;
}
