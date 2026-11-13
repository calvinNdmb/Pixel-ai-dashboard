// L'habit commun : rendu, lumière, ciel, matériaux teintés. Partagé par l'application et les bancs d'essai des kits.
(function () {
  const LOOK = (window.LOOK = {});
  LOOK.lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  LOOK.SKY = '#cfe2ec'; // brume d'horizon, fin d'après-midi
  LOOK.SUN = '#ffe3bd';

  LOOK.setupRenderer = function (renderer) {
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  };

  // Soleil chaud et bas, ciel bleu en contre-jour. `aim` recentre la lumière et ses ombres sur ce qu'on regarde.
  LOOK.lights = function (scene, shadowSize) {
    const hemi = new THREE.HemisphereLight(LOOK.lin('#cfe4ff'), LOOK.lin('#8f7a5e'), 0.62);
    const sun = new THREE.DirectionalLight(LOOK.lin(LOOK.SUN), 1.85);
    sun.castShadow = true; sun.shadow.mapSize.set(shadowSize || 2048, shadowSize || 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
    scene.add(hemi); scene.add(sun); scene.add(sun.target);
    return {
      hemi, sun, elevation: 0.68,
      aim(x, y, z, radius, azimuth) {
        const el = this.elevation, D = Math.max(400, radius * 2.2), az = azimuth == null ? -0.9 : azimuth;
        sun.position.set(x + D * Math.cos(el) * Math.sin(az), y + D * Math.sin(el), z + D * Math.cos(el) * Math.cos(az));
        sun.target.position.set(x, y, z); sun.target.updateMatrixWorld();
        Object.assign(sun.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: 1, far: D * 2 + radius * 2 });
        sun.shadow.camera.updateProjectionMatrix();
      },
    };
  };

  // Ciel : un grand dôme, brume pâle à l'horizon et bleu plus franc au zénith. Le brouillard se mélange après
  // l'encodage des couleurs : on lui donne donc la couleur d'écran telle quelle, et le dôme échappe au tone mapping.
  LOOK.ZENITH = '#8dbbe2';
  LOOK.sky = function (scene, far) {
    const R = far || 6000, geo = new THREE.SphereGeometry(R, 24, 16), p = geo.attributes.position, col = new Float32Array(p.count * 3), hz = LOOK.lin(LOOK.SKY), top = LOOK.lin(LOOK.ZENITH), c = new THREE.Color();
    const paint = (h, t) => { for (let i = 0; i < p.count; i++) { c.copy(h).lerp(t, Math.pow(Math.max(0, Math.min(1, p.getY(i) / R)), 0.6)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } if (geo.attributes.color) geo.attributes.color.needsUpdate = true; };
    paint(hz, top); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    dome.renderOrder = -10; dome.frustumCulled = false; dome.userData.paint = paint; scene.add(dome);
    scene.fog = new THREE.Fog(new THREE.Color(LOOK.SKY), 400, 2400);
    return dome;
  };

  // Ambiances : de la lumière fraîche de midi (0) au soleil couchant (1). 0.45 est l'habit par défaut des bancs d'essai.
  const MOODS = [
    { at: 0, name: 'Midi clair', sun: '#fff8f0', sunI: 1.95, el: 1.02, sky: '#d2e4ff', ground: '#8c8474', hemiI: 0.72, horizon: '#d2e4ee', zenith: '#78b0e6', exposure: 0.95 },
    { at: 0.45, name: 'Après-midi', sun: '#ffe3bd', sunI: 1.85, el: 0.68, sky: '#cfe4ff', ground: '#8f7a5e', hemiI: 0.62, horizon: '#cfe2ec', zenith: '#8dbbe2', exposure: 0.98 },
    { at: 0.8, name: 'Heure dorée', sun: '#ffb968', sunI: 2.3, el: 0.52, sky: '#f4d6ae', ground: '#8a6640', hemiI: 0.56, horizon: '#f3dcb8', zenith: '#a9bfd6', exposure: 1.04 },
    { at: 1, name: 'Soleil couchant', sun: '#ff9644', sunI: 2.5, el: 0.4, sky: '#f4c494', ground: '#875a34', hemiI: 0.5, horizon: '#f6cc98', zenith: '#b6b8c8', exposure: 1.07 },
  ];
  LOOK.mood = function (w) {
    w = Math.max(0, Math.min(1, w)); let i = 0; while (i < MOODS.length - 2 && w > MOODS[i + 1].at) i++;
    const a = MOODS[i], b = MOODS[i + 1], t = (w - a.at) / (b.at - a.at), mix = (k) => a[k] + (b[k] - a[k]) * t, col = (k) => LOOK.lin(a[k]).lerp(LOOK.lin(b[k]), t);
    return { name: (t < 0.5 ? a : b).name, sun: col('sun'), sunI: mix('sunI'), el: mix('el'), sky: col('sky'), ground: col('ground'), hemiI: mix('hemiI'), horizon: col('horizon'), zenith: col('zenith'), exposure: mix('exposure') };
  };
  // Applique une ambiance à une scène déjà montée : { renderer, scene, lights, dome }. Renvoie l'ambiance (couleurs linéaires).
  LOOK.applyMood = function (o, w) {
    const m = LOOK.mood(w);
    o.lights.sun.color.copy(m.sun); o.lights.sun.intensity = m.sunI; o.lights.elevation = m.el;
    o.lights.hemi.color.copy(m.sky); o.lights.hemi.groundColor.copy(m.ground); o.lights.hemi.intensity = m.hemiI;
    o.renderer.toneMappingExposure = m.exposure;
    o.dome.userData.paint(m.horizon, m.zenith);
    const screen = m.horizon.clone().convertLinearToSRGB(); o.scene.fog.color.copy(screen); if (o.scene.background && o.scene.background.isColor) o.scene.background.copy(screen);
    return m;
  };

  // Matériau « teinte masquée » : la couleur d'exemplaire (instanceColor) ou de sommet ne teinte que les texels
  // dont l'alpha vaut 1 dans la texture. Un alpha de 0.5 marque les détails à ne pas teinter (vitres, pierre, peau).
  LOOK.tintMaterial = function (params) {
    const m = new THREE.MeshStandardMaterial(params);
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', ['float tintMask = 1.0;', '#ifdef USE_MAP', '  vec4 texelColor = texture2D( map, vUv );', '  texelColor = mapTexelToLinear( texelColor );', '  tintMask = step( 0.75, texelColor.a );', '  diffuseColor.rgb *= texelColor.rgb;', '#endif'].join('\n'))
        .replace('#include <color_fragment>', ['#ifdef USE_COLOR', '  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor, tintMask );', '#endif'].join('\n'));
    };
    return m;
  };

  // À appeler après avoir peint un détail opaque : met son alpha à 0.5 pour qu'il échappe à la teinte.
  // `shape` est soit un rectangle [x, y, w, h], soit une fonction qui trace un chemin (ctx.beginPath … ) à remplir.
  LOOK.untint = function (ctx, shape) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.5)';
    if (typeof shape === 'function') { shape(ctx); ctx.fill(); } else ctx.fillRect(shape[0], shape[1], shape[2], shape[3]);
    ctx.restore();
  };

  // Texture dessinée sur un canvas. `draw(ctx, taille)` peint ; couleur en sRGB, répétée par défaut.
  LOOK.canvasTexture = function (size, draw, opts) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return Object.assign(t, opts || {});
  };
})();
