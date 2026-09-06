import * as THREE from 'three';

const up = new THREE.Vector3(0, 1, 0);
export function createPlayer(index: number) {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: ['#ce9978', '#925d43', '#e0b394', '#704936'][index], roughness: 0.72 });
  const white = new THREE.MeshStandardMaterial({ color: '#f6f4eb', roughness: 0.88 });
  const trim = new THREE.MeshStandardMaterial({ color: index < 2 ? '#1c493e' : '#73849b', roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: ['#382a21', '#191a18', '#79503a', '#211b18'][index], roughness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#dedfcd', roughness: 1 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = root) => {
    const object = new THREE.Mesh(geometry, material); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  };
  const ellipsoid = (r: number, scale: number[], position: number[], material: THREE.Material, parent: THREE.Object3D = root) => {
    const object = mesh(new THREE.SphereGeometry(r, 16, 12), material, parent);
    object.scale.set(scale[0], scale[1], scale[2]); object.position.set(position[0], position[1], position[2]); return object;
  };
  const torso = new THREE.Group(); root.add(torso);
  const shirt = mesh(new THREE.LatheGeometry([[0.18, 0.92], [0.23, 1.02], [0.22, 1.18], [0.29, 1.4], [0.27, 1.47], [0.11, 1.5]].map(p => new THREE.Vector2(...p as [number, number])), 20), white, torso);
  shirt.scale.z = 0.64;
  ellipsoid(0.12, [0.9, 1.3, 0.8], [0, 1.51, 0], skin, torso);
  const head = new THREE.Group(); head.position.y = 1.72; torso.add(head);
  ellipsoid(0.16, [0.86, 1.15, 0.92], [0, 0, 0], skin, head);
  const hairMesh = mesh(new THREE.SphereGeometry(0.166, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, head); hairMesh.position.y = 0.03;
  ellipsoid(0.04, [0.65, 0.85, 1], [0, -0.01, 0.145], skin, head);
  for (const side of [-1, 1]) {
    ellipsoid(0.04, [0.5, 1, 0.7], [side * 0.143, 0, 0], skin, head);
    ellipsoid(0.014, [1, 0.65, 0.45], [side * 0.058, 0.035, 0.135], hair, head);
  }
  const collar = mesh(new THREE.TorusGeometry(0.105, 0.022, 6, 20), trim, torso); collar.rotation.x = Math.PI / 2; collar.position.y = 1.5;
  const shorts = ellipsoid(0.25, [1, 0.72, 0.66], [0, 0.92, 0], white);
  const belt = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.035, 16), trim); belt.position.y = 1.01; belt.scale.z = 0.67;
  const limbs = Array.from({ length: 8 }, (_, i) => mesh(new THREE.CylinderGeometry(i < 4 ? 0.085 : 0.055, i < 4 ? 0.065 : 0.045, 1, 10), skin));
  const joints = Array.from({ length: 4 }, (_, i) => ellipsoid(i < 2 ? 0.077 : 0.054, [1, 1, 1], [0, 0, 0], skin));
  const shoes = [-1, 1].map(side => {
    const shoe = new THREE.Group(); root.add(shoe);
    ellipsoid(0.12, [0.8, 0.65, 1.65], [0, 0.07, 0.07], white, shoe);
    const sole = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.35), rubber, shoe); sole.position.set(0, 0.025, 0.055);
    const stripe = mesh(new THREE.BoxGeometry(0.205, 0.025, 0.15), trim, shoe); stripe.position.set(0, 0.09, 0.07);
    shoe.position.x = side * 0.2; return shoe;
  });
  const sleeves = [-1, 1].map(() => mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 12), white));
  const racket = new THREE.Group(); root.add(racket);
  const frame = mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 32), trim, racket); frame.scale.y = 1.3;
  const handle = mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.32, 10), rubber, racket); handle.position.y = -0.42;
  const throat = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), trim, racket); throat.position.y = -0.26;
  const strings: number[] = [];
  for (let i = -5; i <= 5; i++) {
    const x = i * 0.034, h = Math.sqrt(0.22 ** 2 - x ** 2) * 1.3;
    strings.push(x, -h, 0, x, h, 0);
    const y = i * 0.044, w = Math.sqrt(0.22 ** 2 - (y / 1.3) ** 2);
    strings.push(-w, y, 0, w, y, 0);
  }
  racket.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(strings, 3)), new THREE.LineBasicMaterial({ color: '#c3cbb2', transparent: true, opacity: 0.65 })));
  const segment = (object: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) => {
    object.position.copy(from).add(to).multiplyScalar(0.5); object.scale.y = from.distanceTo(to); object.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
  };
  // ponytail: a local articulated rig keeps the demo offline; replace the mesh with authored character assets for close-up realism.
  const pose = (time: number, speed: number, swing: number, contact: THREE.Vector3 | null, serve: number, rest = false, handshake = false) => {
    const stride = Math.sin(time * 12) * Math.min(speed * 0.11, 0.42);
    const crouch = rest ? 0.28 : 0.055 + Math.abs(stride) * 0.1;
    torso.position.y = -crouch; torso.rotation.y = swing * 0.45; torso.rotation.x = speed * 0.018;
    shorts.position.y = 0.92 - crouch; belt.position.y = 1.01 - crouch;
    head.rotation.y = -swing * 0.2;
    for (let j = 0; j < 2; j++) {
      const side = j ? 1 : -1, step = stride * side;
      const foot = new THREE.Vector3(side * (0.19 + Math.min(speed, 1) * 0.045), Math.max(0, step) * 0.22, step);
      shoes[j].position.copy(foot);
      const hip = new THREE.Vector3(side * 0.14, 0.94 - crouch, 0);
      const knee = new THREE.Vector3(side * 0.18, 0.51 - crouch * 0.5, 0.12 + step * 0.45);
      segment(limbs[j * 2], hip, knee); segment(limbs[j * 2 + 1], knee, foot.clone().add(new THREE.Vector3(0, 0.12, 0)));
      joints[j].position.copy(knee);
    }
    const center = contact ?? new THREE.Vector3(0.68 + swing * 0.25, 1.06 + serve * 1.04 + Math.max(0, swing) * 0.18, 0.32 + swing * 0.65);
    racket.position.copy(center); racket.rotation.set(0, -swing * 0.7, THREE.MathUtils.lerp(-Math.PI / 2 + swing * 0.2, -0.15, serve));
    racket.updateMatrix();
    const hand = new THREE.Vector3(0, -0.57, 0).applyMatrix4(racket.matrix);
    for (let j = 0; j < 2; j++) {
      const side = j ? 1 : -1;
      const shoulder = new THREE.Vector3(side * 0.25, 1.39 - crouch, 0);
      const target = j ? hand : new THREE.Vector3(-0.37, handshake ? 1.1 : 0.94 + serve * 0.96, handshake ? 0.72 : 0.25 - swing * 0.2);
      const elbow = shoulder.clone().lerp(target, 0.5); elbow.x += side * 0.16; elbow.z -= 0.1;
      segment(limbs[4 + j * 2], shoulder, elbow); segment(limbs[5 + j * 2], elbow, target);
      joints[2 + j].position.copy(elbow);
      sleeves[j].position.copy(shoulder).lerp(elbow, 0.25); sleeves[j].quaternion.copy(limbs[4 + j * 2].quaternion);
    }
  };
  return { root, pose, trim };
}
