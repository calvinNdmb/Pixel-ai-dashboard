import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Activity, SessionInfo } from '../../../shared/types';
import { hashString } from '../../../shared/util';
import { villageAppearance } from './appearance';
import { route, workSpot, type Point } from './layout';
import { Scenery } from './scenery';

export interface VillageSnapshot {
  sessions: SessionInfo[];
  selectedId: string | null;
  paused: boolean;
  night: boolean;
  overview: boolean;
  panelOpen: boolean;
  reducedMotion: boolean;
}

export interface Projection {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}
interface Actor {
  root: T.Group;
  arms: T.Group[];
  legs: T.Group[];
  ring: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
  activity: Activity;
  path: Point[];
  seed: number;
  phase: number;
  appearance: string;
}

export class VillageScene {
  private scene = new T.Scene();
  private renderer: T.WebGLRenderer;
  private camera = new T.OrthographicCamera(-30, 30, 20, -20, 0.1, 450);
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private scenery: Scenery;
  private actors = new Map<string, Actor>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private geometry = new T.BoxGeometry(1, 1, 1);
  private ray = new T.Raycaster();
  private project = new T.Vector3();
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private lastDraw = 0;
  private lastProjection = 0;
  private lastSignature = '';
  private width = 1;
  private height = 1;
  private mobile = false;
  private overview: boolean | null = null;
  private panelOpen: boolean | null = null;
  private sun = new T.DirectionalLight('#ffecd0', 3.1);
  private ambient = new T.HemisphereLight('#d5e4db', '#9e7952', 2.4);
  private down = { x: 0, y: 0 };
  private disposed = false;
  private visibility = () => {
    this.previous = 0;
  };
  private contextLost = (e: Event) => {
    e.preventDefault();
    this.options.onFailure('Le contexte 3D a été interrompu.');
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private options: {
      snapshot(): VillageSnapshot;
      onSelect(id: string): void;
      onProject(points: Projection[]): void;
      onReady(): void;
      onFailure(reason: string): void;
    },
  ) {
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power' });
    if (!context) throw new Error('WebGL2 indisponible');
    this.renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 720 ? 1.35 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    // Buildings, foliage and sun are fixed. Cache their shadow map instead of
    // rendering thousands of static cubes again for every animation frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.background = new T.Color('#b8d1d1');
    this.scene.fog = new T.Fog('#b8d1d1', 100, 250);
    this.scene.add(this.ambient);
    this.sun.position.set(-18, 36, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    Object.assign(this.sun.shadow.camera, { left: -27, right: 27, top: 25, bottom: -25, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.scenery = new Scenery();
    this.scenery.root.updateMatrixWorld(true);
    this.scenery.root.traverse((obj) => {
      obj.matrixAutoUpdate = false;
    });
    this.scene.add(this.scenery.root);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 3;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = Math.PI / 2.45;
    this.controls.mouseButtons = { LEFT: T.MOUSE.PAN, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.ROTATE };
    this.controls.touches = { ONE: T.TOUCH.PAN, TWO: T.TOUCH.DOLLY_ROTATE };
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement!);
    this.resize();
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.tick);
  }

  private resize() {
    const bounds = this.canvas.parentElement!.getBoundingClientRect();
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    const mobile = this.width <= 720;
    if (mobile !== this.mobile) {
      this.mobile = mobile;
      this.overview = null;
    }
    this.renderer.setSize(this.width, this.height, false);
    this.projection();
  }

  private projection() {
    const aspect = this.width / this.height;
    const half = this.overview ? Math.max(46, 83 / aspect) : this.mobile ? 22 : 19;
    // Leave room for the open panel without turning the scene into a smaller
    // canvas. The same camera adapts to a portrait phone and a desktop screen.
    const shiftX = !this.mobile && this.panelOpen ? 3.9 : 0;
    const shiftY = this.mobile && this.panelOpen ? -5.5 : 0;
    this.camera.left = -half * aspect + shiftX;
    this.camera.right = half * aspect + shiftX;
    this.camera.top = half + shiftY;
    this.camera.bottom = -half + shiftY;
    this.camera.updateProjectionMatrix();
  }

  private resetCamera(overview: boolean) {
    this.controls.target.set(-1, 0, 0);
    this.camera.position.set(overview ? 80 : 30, overview ? 110 : 40, overview ? 100 : 38);
    this.camera.zoom = 1;
    this.controls.update();
    this.projection();
  }

  private mat(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.92 }));
    return this.materials.get(color)!;
  }

  private part(parent: T.Group, color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    const part = new T.Mesh(this.geometry, this.mat(color));
    part.position.set(x, y, z);
    part.scale.set(w, h, d);
    part.castShadow = false;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  private createActor(s: SessionInfo): Actor {
    const p = villageAppearance(s),
      root = new T.Group();
    root.userData.sessionId = s.id;
    const head = new T.Group();
    head.position.y = 1.35;
    root.add(head);
    this.part(head, p.skin, 0, 0, 0, 0.65, 0.63, 0.56);
    this.part(head, p.hair, 0, 0.31, -0.02, 0.71, 0.19, 0.65);
    this.part(head, p.hair, 0, 0.06, -0.26, 0.69, 0.45, 0.17);
    this.part(head, p.hair, -0.26, 0.18, 0.13, 0.17, 0.27, 0.36);
    for (const x of [-0.15, 0.15]) {
      this.part(head, '#3f3b31', x, 0.02, 0.292, 0.065, 0.09, 0.018);
      this.part(head, '#efe4cd', x, 0.045, 0.304, 0.024, 0.032, 0.01);
    }
    this.part(head, '#bc8866', 0.01, -0.13, 0.32, 0.09, 0.07, 0.08);
    if (p.hat) {
      this.part(head, '#c7ae72', 0, 0.4, 0.02, 0.94, 0.09, 0.87);
      this.part(head, '#bfa165', 0, 0.51, -0.01, 0.65, 0.2, 0.6);
      this.part(head, '#84784f', 0, 0.44, 0, 0.67, 0.07, 0.62);
    }
    this.part(root, p.coat, 0, 0.78, 0, 0.52, 0.56, 0.37);
    this.part(root, '#ded4b4', 0, 1.02, 0.19, 0.14, 0.12, 0.03);
    this.part(root, '#8d7952', 0, 0.59, 0.2, 0.5, 0.07, 0.03);
    const arms: T.Group[] = [],
      legs: T.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * 0.36, 1, 0);
      root.add(arm);
      arms.push(arm);
      this.part(arm, p.coat, 0, -0.16, 0, 0.18, 0.34, 0.23);
      this.part(arm, p.skin, 0, -0.39, 0, 0.18, 0.18, 0.22);
      const leg = new T.Group();
      leg.position.set(side * 0.14, 0.51, 0);
      root.add(leg);
      legs.push(leg);
      this.part(leg, p.trousers, 0, -0.15, 0, 0.22, 0.3, 0.25);
      this.part(leg, p.boots, 0, -0.34, 0.055, 0.25, 0.13, 0.36);
    }
    const ring = new T.Mesh(
      new T.RingGeometry(0.5, 0.59, 32),
      new T.MeshBasicMaterial({
        color: '#f0dc99',
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    root.add(ring);
    const shadow = new T.Mesh(
      new T.CircleGeometry(0.4, 12),
      new T.MeshBasicMaterial({ color: '#353921', transparent: true, opacity: 0.17, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    root.add(shadow);
    const point = workSpot(s.activity, s.seed ^ hashString(s.id));
    root.position.set(point.x, 0.19, point.z);
    this.scene.add(root);
    return {
      root,
      arms,
      legs,
      ring,
      activity: s.activity,
      path: [],
      seed: s.seed,
      phase: (hashString(s.id) % 100) / 10,
      appearance: JSON.stringify(p),
    };
  }

  private removeActor(actor: Actor) {
    this.scene.remove(actor.root);
    actor.ring.geometry.dispose();
    actor.ring.material.dispose();
    for (const child of actor.root.children)
      if (child instanceof T.Mesh && child.geometry instanceof T.CircleGeometry) {
        child.geometry.dispose();
        child.material.dispose();
      }
  }

  private sync(snap: VillageSnapshot) {
    const active = snap.sessions.filter((s) => s.status !== 'ended');
    const ids = new Set(active.map((s) => s.id));
    for (const [id, actor] of this.actors)
      if (!ids.has(id)) {
        this.removeActor(actor);
        this.actors.delete(id);
      }
    for (const s of active) {
      let actor = this.actors.get(s.id);
      if (actor && actor.appearance !== JSON.stringify(villageAppearance(s))) {
        this.removeActor(actor);
        this.actors.delete(s.id);
        actor = undefined;
      }
      if (!actor) {
        actor = this.createActor(s);
        this.actors.set(s.id, actor);
      }
      if (actor.activity !== s.activity) {
        actor.activity = s.activity;
        actor.path = route(
          { x: actor.root.position.x, z: actor.root.position.z },
          workSpot(s.activity, s.seed ^ hashString(s.id)),
        );
      }
      actor.ring.visible = s.id === snap.selectedId || s.status === 'waiting' || s.status === 'error';
      actor.ring.material.color.set(s.status === 'error' ? '#c96e57' : s.status === 'waiting' ? '#e6bd6a' : '#f0dc99');
    }
  }

  private animateActor(actor: Actor, dt: number, reduced: boolean) {
    const next = actor.path[0];
    let walking = false;
    if (next && !reduced) {
      const pos = actor.root.position;
      const dx = next.x - pos.x,
        dz = next.z - pos.z,
        dist = Math.hypot(dx, dz);
      const step = dt * 2.1;
      actor.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= step) {
        pos.x = next.x;
        pos.z = next.z;
        actor.path.shift();
      } else {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
      }
      walking = true;
    } else if (next && reduced) {
      const end = actor.path.at(-1)!;
      actor.root.position.set(end.x, 0.19, end.z);
      actor.path = [];
    }
    const swing = reduced ? 0 : Math.sin(this.elapsed * (walking ? 9 : 2.3) + actor.phase) * (walking ? 0.55 : 0.035);
    actor.legs.forEach((leg, i) => {
      leg.rotation.x = walking ? swing * (i ? 1 : -1) : 0;
    });
    actor.arms.forEach((arm, i) => {
      arm.rotation.x = swing * (i ? -1 : 1);
    });
    actor.root.position.y = 0.19 + (walking ? Math.abs(swing) * 0.08 : 0);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (document.hidden) {
      this.previous = 0;
      return;
    }
    // 30 fps on small screens, 45 on desktop; no unbounded rendering on laptops.
    if (now - this.lastDraw < 1000 / (this.mobile ? 30 : 45)) return;
    const dt = this.previous ? Math.min((now - this.previous) / 1000, 0.08) : 0;
    this.previous = now;
    this.lastDraw = now;
    const snap = this.options.snapshot();
    this.sync(snap);
    if (snap.overview !== this.overview) {
      this.overview = snap.overview;
      this.resetCamera(snap.overview);
    }
    if (snap.panelOpen !== this.panelOpen) {
      this.panelOpen = snap.panelOpen;
      this.projection();
    }
    if (!snap.paused) {
      this.elapsed += dt;
      for (const actor of this.actors.values()) this.animateActor(actor, dt, snap.reducedMotion);
    }
    this.scenery.water.material.uniforms.time!.value = snap.reducedMotion ? 0 : this.elapsed;
    this.scenery.water.material.uniforms.night!.value = snap.night ? 1 : 0;
    this.sun.intensity = snap.night ? 0.55 : 3.1;
    this.ambient.intensity = snap.night ? 1.1 : 2.4;
    const sky = snap.night ? '#253d52' : '#b8d1d1';
    (this.scene.background as T.Color).set(sky);
    (this.scene.fog as T.Fog).color.set(sky);
    const moved = this.controls.update();
    const signature =
      `${snap.selectedId}/${snap.night}/${snap.overview}/${snap.panelOpen}/${snap.paused}/${this.width}/${this.height}/` +
      snap.sessions.map((s) => `${s.id}:${s.updatedAt}:${s.status}:${s.activity}`).join(',');
    const changed = signature !== this.lastSignature;
    this.lastSignature = signature;
    if (moved || changed || (!snap.paused && !snap.reducedMotion)) this.renderer.render(this.scene, this.camera);
    if (now - this.lastProjection > 60) {
      this.lastProjection = now;
      this.options.onProject(
        [...this.actors].map(([id, actor]) => {
          this.project.copy(actor.root.position);
          this.project.y += 2.05;
          this.project.project(this.camera);
          return {
            id,
            x: ((this.project.x + 1) * this.width) / 2,
            y: ((1 - this.project.y) * this.height) / 2,
            visible:
              !snap.overview &&
              Math.abs(this.project.x) < 0.96 &&
              Math.abs(this.project.y) < 0.87 &&
              this.project.z < 1,
          };
        }),
      );
    }
    this.options.onReady();
  };

  private pointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };
  private pointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - bounds.left) / this.width) * 2 - 1,
        (-(e.clientY - bounds.top) / this.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.ray.intersectObjects(
      [...this.actors.values()].map((a) => a.root),
      true,
    )[0];
    if (hit) {
      let obj: T.Object3D | null = hit.object;
      while (obj && !obj.userData.sessionId) obj = obj.parent;
      if (obj?.userData.sessionId) this.options.onSelect(String(obj.userData.sessionId));
    }
  };

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    document.removeEventListener('visibilitychange', this.visibility);
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>();
    this.scene.traverse((obj) => {
      if (!(obj instanceof T.Mesh)) return;
      geometries.add(obj.geometry);
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        materials.add(mat);
        for (const val of Object.values(mat)) if (val instanceof T.Texture) textures.add(val);
      }
      if (obj instanceof T.InstancedMesh) obj.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.scene.clear();
    this.actors.clear();
  }
}
