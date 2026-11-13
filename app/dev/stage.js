// Banc d'essai commun aux kits : même rendu et même lumière que l'application.
// Usage : const st = STAGE({ target: [0, 3, 0], dist: 60, theta: 0.6, phi: 1.0 }); st.scene.add(...); st.done();
// L'URL peut surcharger la caméra : ?dist=80&theta=1.2&phi=0.9&tx=0&ty=3&tz=0&fov=40
window.STAGE = function (opts) {
  const q = new URLSearchParams(location.search), num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
  const o = Object.assign({ target: [0, 0, 0], dist: 60, theta: 0.6, phi: 1.0, fov: 40, ground: '#9cc56a', groundSize: 600 }, opts || {});
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(innerWidth, innerHeight);
  LOOK.setupRenderer(renderer);
  if (!document.body) document.documentElement.appendChild(document.createElement('body'));
  document.body.style.margin = '0'; document.body.style.overflow = 'hidden'; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(num('fov', o.fov), innerWidth / innerHeight, 0.5, 8000);
  LOOK.sky(scene); const lights = LOOK.lights(scene);
  if (o.ground) { const g = new THREE.Mesh(new THREE.PlaneGeometry(o.groundSize, o.groundSize), new THREE.MeshStandardMaterial({ color: LOOK.lin(o.ground), roughness: 1 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); }
  const tx = num('tx', o.target[0]), ty = num('ty', o.target[1]), tz = num('tz', o.target[2]), dist = num('dist', o.dist), theta = num('theta', o.theta), phi = num('phi', o.phi);
  camera.position.set(tx + dist * Math.sin(phi) * Math.sin(theta), ty + dist * Math.cos(phi), tz + dist * Math.sin(phi) * Math.cos(theta)); camera.lookAt(tx, ty, tz);
  scene.fog.near = dist * 1.5 + 200; scene.fog.far = dist * 5 + 1500;
  lights.aim(tx, ty, tz, Math.max(40, dist * 0.9), theta - 0.9);
  const st = { renderer, scene, camera, lights, time: num('t', 0), render() { renderer.render(scene, camera); }, done() { st.render(); const i = renderer.info; window.STATS = { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries }; window.READY = true; } };
  return st;
};
