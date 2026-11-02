import * as T from 'three';
import { HOUSES, inBuilding, inPond, onIsland, pathDistance, random } from './layout';

const C = { wood: '#725039', edge: '#523e2b', plaster: '#e1d3b3', grass: '#81915a', dirt: '#ac8051', stone: '#ada58d' };
const LEAVES = ['#839357', '#96a361', '#a4ab6b', '#728454', '#8a9c7a', '#6e845e'];

/** Thousands of cubes share one geometry and a handful of instanced draw calls. */
export class Scenery {
  readonly root = new T.Group();
  private batches = new Map<string, T.Matrix4[]>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private cube = new T.BoxGeometry(1, 1, 1);
  private grain = this.surfaceGrain();
  private dummy = new T.Object3D();
  private rng = random(28714);
  readonly water: T.Mesh<T.BufferGeometry, T.ShaderMaterial>;

  constructor() {
    this.ground();
    for (const h of HOUSES) this.house(h);
    this.nature();
    this.furniture();
    this.turtle();
    this.flush();
    this.water = this.makeWater();
    this.root.add(this.water);
  }

  private material(color: string): T.MeshStandardMaterial {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new T.MeshStandardMaterial({
        color,
        map: this.grain,
        roughness: 0.94,
        metalness: 0,
        bumpMap: this.grain,
        bumpScale: 0.022,
      });
      this.materials.set(color, mat);
    }
    return mat;
  }

  private surfaceGrain() {
    const rng = random(182);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#e3e3e3';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8500; i++) {
      const v = Math.floor(155 + rng() * 100);
      g.fillStyle = `rgba(${v},${v},${v},.25)`;
      g.fillRect(rng() * 128, rng() * 128, 1 + rng() * 3, 1 + rng() * 3);
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    return texture;
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, rx = 0, ry = 0, rz = 0) {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(w, h, d);
    this.dummy.rotation.set(rx, ry, rz);
    this.dummy.updateMatrix();
    if (!this.batches.has(color)) this.batches.set(color, []);
    this.batches.get(color)!.push(this.dummy.matrix.clone());
  }

  private flush() {
    for (const [color, transforms] of this.batches) {
      const mesh = new T.InstancedMesh(this.cube, this.material(color), transforms.length);
      transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
    this.batches.clear();
  }

  private ground() {
    const rng = this.rng;
    const grass = ['#7c8d56', '#7e8f57', '#7a8b54', '#7f9059', '#798a52', '#7c8d55'];
    const dirt = ['#b18b5c', '#b38d5e', '#af8858', '#b48e60'];
    for (let z = -16; z <= 16; z++)
      for (let x = -20; x <= 20; x++) {
        if (!onIsland(x, z) || inPond(x, z)) continue;
        const road = pathDistance(x, z) < 1.3 + rng() * 0.3;
        const shade = road ? dirt[Math.floor(rng() * dirt.length)]! : grass[Math.floor(rng() * grass.length)]!;
        this.box(x, -0.43, z, 1, 1.04, 1, shade);
        // The irregular ochre banks show two strata rather than a flat green disk.
        if (
          [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ].some(([dx, dz]) => !onIsland(x + dx!, z + dz!) || inPond(x + dx!, z + dz!))
        ) {
          this.box(x, -0.86, z, 1.015, 0.34, 1.015, rng() > 0.5 ? '#90714e' : '#a18357');
          this.box(x, -0.18, z, 1.025, 0.25, 1.025, '#9e966a');
          if (rng() > 0.4) this.box(x, 0.07, z, 0.9, 0.12, 0.9, shade);
        }
      }
    // Individual worn paving stones down the village's central lane.
    for (let z = -5; z < 11; z += 0.95)
      for (let col = 0; col < 2; col++) {
        if (rng() < 0.12) continue;
        this.box(
          -1.45 + col * 0.91,
          0.135,
          z,
          0.84,
          0.085,
          0.86,
          rng() > 0.5 ? '#bdb69b' : '#aaa88f',
          0,
          (rng() - 0.5) * 0.08,
        );
      }
    this.groundSurface();
  }

  private groundSurface() {
    // A single continuous soil texture hides the cell grid. Geometry follows
    // the same coastline and pond mask as navigation, while paths stay soft.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 824;
    const g = canvas.getContext('2d')!,
      rng = random(712);
    const pixels = g.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const noise = Math.sin(x * 0.017 + Math.sin(y * 0.012) * 3) * Math.sin(y * 0.021) * 9 + (rng() - 0.5) * 26;
        const i = (y * canvas.width + x) * 4;
        pixels.data[i] = 117 + noise;
        pixels.data[i + 1] = 136 + noise;
        pixels.data[i + 2] = 78 + noise * 0.7;
        pixels.data[i + 3] = 255;
      }
    g.putImageData(pixels, 0, 0);
    const px = (x: number) => ((x + 20.5) / 41) * canvas.width;
    const py = (z: number) => ((z + 16.5) / 33) * canvas.height;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const width of [3.6, 2.8, 2.1]) {
      g.strokeStyle = width > 3 ? '#a38e5688' : width > 2.5 ? '#b69a65aa' : '#b49a6be0';
      g.lineWidth = (width / 41) * canvas.width;
      g.beginPath();
      for (const [ax, az, bx, bz] of [
        [-1, -6, -1, 12],
        [-11, -3.5, 7.5, -3.5],
        [-11, 4.5, 2, 4.5],
        [-10, 12, -1, 12],
        [-7, 0, -1, 0],
        [0, 1, 5, 1],
      ]) {
        g.moveTo(px(ax!), py(az!));
        g.lineTo(px(bx!), py(bz!));
      }
      g.stroke();
    }
    for (let i = 0; i < 60000; i++) {
      g.fillStyle = i % 2 ? '#ede1b20c' : '#3c4f2910';
      g.fillRect(rng() * canvas.width, rng() * canvas.height, 1 + rng() * 3, 1 + rng() * 2);
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const positions: number[] = [],
      uv: number[] = [];
    for (let z = -16; z <= 16; z++)
      for (let x = -20; x <= 20; x++) {
        if (!onIsland(x, z) || inPond(x, z)) continue;
        for (const [dx, dz] of [
          [-0.5, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
          [-0.5, -0.5],
          [0.5, 0.5],
          [0.5, -0.5],
        ]) {
          positions.push(x + dx!, 0.102, z + dz!);
          uv.push((x + dx! + 20.5) / 41, 1 - (z + dz! + 16.5) / 33);
        }
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const surface = new T.Mesh(geometry, new T.MeshStandardMaterial({ map: texture, roughness: 1 }));
    surface.receiveShadow = true;
    this.root.add(surface);
  }

  private house(house: (typeof HOUSES)[number]) {
    const { x, z, width: w, depth: d, roof } = house;
    const eave = 2.85,
      peak = 4.35;
    this.box(x, 1.45, z, w, 2.8, d, C.plaster);
    this.box(x, 0.26, z, w + 0.2, 0.36, d + 0.2, '#a49a83');
    this.box(x, 0.5, z, w + 0.15, 0.15, d + 0.15, C.wood);
    for (const dx of [-w / 2, 0, w / 2]) {
      for (const dz of [-d / 2 - 0.025, d / 2 + 0.025]) this.box(x + dx, 1.7, z + dz, 0.15, 2.45, 0.17, C.wood);
    }
    for (const side of [-1, 1]) {
      this.box(x, eave - 0.1, z + side * (d / 2 + 0.08), w + 0.2, 0.18, 0.18, C.wood);
      this.box(x + (side * w) / 2, 1.7, z, 0.16, 0.15, d, C.wood);
      this.box(
        x + (side * w) / 2,
        1.7,
        z,
        0.17,
        Math.hypot(d * 0.8, 1.6),
        0.12,
        C.wood,
        side * Math.atan2(d * 0.8, 1.6),
      );
      // Gable infill is a real triangular prism, not a conical cartoon roof.
      const tri = new T.Shape();
      tri.moveTo(-w / 2, 0);
      tri.lineTo(w / 2, 0);
      tri.lineTo(0, peak - eave);
      tri.closePath();
      const mesh = new T.Mesh(
        new T.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false }),
        this.material(C.plaster),
      );
      mesh.position.set(x, eave, z + (side * d) / 2 - 0.06);
      mesh.castShadow = true;
      this.root.add(mesh);
      const slope = Math.atan2(peak - eave, w / 2 + 0.3);
      const length = Math.hypot(w / 2 + 0.3, peak - eave);
      // Overlapping tiles make the roof readable at a grazing angle.
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 10; col++) {
          const t = (row + 0.5) / 7;
          const xx = x + side * (w / 2 + 0.3) * t;
          const yy = peak - (peak - eave) * t;
          const zz = z - d / 2 - 0.28 + ((col + 0.5) * (d + 0.56)) / 10;
          const shade = new T.Color(roof).multiplyScalar(0.92 + ((row * 3 + col) % 5) * 0.035).getStyle();
          this.box(xx, yy, zz, length / 7 + 0.075, 0.105, (d + 0.56) / 10 - 0.018, shade, 0, 0, -side * slope);
        }
    }
    this.box(x, peak + 0.04, z, 0.2, 0.17, d + 0.8, C.edge);
    const front = z + d / 2;
    this.box(x, 1.22, front + 0.07, 0.9, 1.72, 0.14, C.edge);
    for (let i = 0; i < 5; i++) this.box(x - 0.37 + i * 0.18, 1.15, front + 0.16, 0.15, 1.5, 0.06, '#98714b');
    this.box(x + 0.28, 1.2, front + 0.22, 0.08, 0.08, 0.08, '#c8ae65');
    for (const dx of [-w * 0.3, w * 0.3]) {
      this.box(x + dx, 1.85, front + 0.09, 0.94, 1.02, 0.18, C.wood);
      this.box(x + dx, 1.85, front + 0.2, 0.75, 0.8, 0.05, '#667e78');
      this.box(x + dx, 1.85, front + 0.25, 0.055, 0.82, 0.03, '#c4b999');
      this.box(x + dx, 1.85, front + 0.25, 0.78, 0.055, 0.03, '#c4b999');
      this.box(x + dx, 1.28, front + 0.3, 1.06, 0.14, 0.5, C.wood);
      this.flower(x + dx + 0.2, 1.5, front + 0.3, '#c18974');
    }
    // Chimney, awning, striped fabric and supporting timber poles.
    this.box(x + w * 0.25, 3.9, z - 0.7, 0.45, 1.35, 0.55, '#9c8c78');
    this.box(x + w * 0.25, 4.6, z - 0.7, 0.62, 0.16, 0.7, '#766e5c');
    for (let i = 0; i < 10; i++)
      this.box(
        x - w / 2 + ((i + 0.5) * w) / 10,
        2.45,
        front + 0.75,
        w / 10 - 0.01,
        0.09,
        1.5,
        i % 2 ? '#e7d9b7' : house.kind === 'chief' ? '#77867b' : '#ae7861',
        0.23,
      );
    for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) this.box(x + dx, 1.2, front + 1.35, 0.12, 2.3, 0.12, C.wood);
    this.box(x, 0.95, front + 1.1, w * 0.65, 0.14, 0.55, '#a37f53');
    this.sign(x + w / 2 - 0.15, front + 2.05, house.label);
    this.crate(x - w / 2 - 0.35, z + 1.3);
  }

  private tree(x: number, z: number, scale: number) {
    const rng = this.rng;
    this.box(x, scale * 1.25, z, 0.45 * scale, 2.5 * scale, 0.5 * scale, '#87663e');
    this.box(x + scale * 0.4, scale * 2.1, z, 0.25 * scale, 1.5 * scale, 0.27 * scale, '#80613c', 0, 0, -0.65);
    // Layered, chunky canopies; shared geometry, varied silhouette and sage tones.
    for (let layer = 0; layer < 3; layer++) {
      const wide = (1.5 - layer * 0.36) * scale;
      for (let j = 0; j < 7; j++) {
        const angle = j * 2.39996 + layer;
        const rr = wide * (0.45 + rng() * 0.25);
        const size = (0.75 + rng() * 0.45) * scale;
        this.box(
          x + Math.cos(angle) * rr,
          (2.1 + layer * 0.62 + rng() * 0.15) * scale,
          z + Math.sin(angle) * rr,
          size * 1.25,
          size * 0.8,
          size,
          LEAVES[Math.floor(rng() * LEAVES.length)]!,
        );
      }
    }
  }

  private nature() {
    const rng = this.rng;
    // The perimeter forms an irregular woodland, leaving working areas readable.
    for (let i = 0; i < 105; i++) {
      const angle = i * 2.399963;
      const r = 0.81 + rng() * 0.13;
      const x = Math.cos(angle) * 18 * r,
        z = Math.sin(angle) * 14.3 * r;
      if (!onIsland(x, z) || inPond(x, z) || inBuilding(x, z, 1.3) || pathDistance(x, z) < 2.1) continue;
      this.tree(x, z, 0.7 + rng() * 0.6);
    }
    this.tree(3.5, -9, 0.85);
    this.tree(13, -1, 0.95);
    this.tree(3, 10.5, 0.75);
    // Instanced low grass, weeds and flowers: no imported/private game assets.
    for (let i = 0; i < 9500; i++) {
      const x = (rng() - 0.5) * 38,
        z = (rng() - 0.5) * 29;
      if (!onIsland(x, z) || inPond(x, z) || inBuilding(x, z, 0.6) || pathDistance(x, z) < 1.65) continue;
      const ht = 0.12 + rng() * 0.22;
      this.box(x, 0.12 + ht / 2, z, 0.035, ht, 0.13, rng() > 0.4 ? '#6b804b' : '#a0a36b', 0.18, rng() * Math.PI);
      if (i % 25 === 0) this.flower(x, 0.17, z, i % 2 ? '#d5c6a2' : '#be8e81');
    }
    for (let i = 0; i < 24; i++) {
      const a = rng() * Math.PI * 2,
        r = Math.sqrt(rng()) * 0.8;
      const x = 8.5 + Math.cos(a) * 4.5 * r,
        z = 6.2 + Math.sin(a) * 3 * r;
      const leaf = new T.Mesh(
        new T.CircleGeometry(0.18 + rng() * 0.18, 8, 0.2, Math.PI * 1.85),
        this.material('#8eaa6a'),
      );
      leaf.rotation.x = -Math.PI / 2;
      leaf.rotation.z = a;
      leaf.position.set(x, -0.13, z);
      this.root.add(leaf);
      if (i % 4 === 0) this.flower(x, -0.1, z, '#e2d7c0');
    }
    // Bushes, small rocks and berry patches.
    for (let i = 0; i < 70; i++) {
      const x = (rng() - 0.5) * 33,
        z = (rng() - 0.5) * 24;
      if (!onIsland(x, z) || inPond(x, z) || inBuilding(x, z, 1) || pathDistance(x, z) < 2) continue;
      const sz = 0.25 + rng() * 0.45;
      this.box(x, 0.1 + sz * 0.4, z, sz, sz * 0.7, sz * 0.8, i % 3 ? '#8e9962' : '#a6a28d', 0, rng() * 2);
      if (i % 3) this.box(x + 0.12, 0.3 + sz * 0.4, z, sz * 0.7, sz * 0.5, sz * 0.7, '#7e8a55');
    }
  }

  private flower(x: number, y: number, z: number, color: string) {
    this.box(x, y + 0.11, z, 0.045, 0.22, 0.045, '#6d8450');
    this.box(x, y + 0.25, z, 0.21, 0.09, 0.12, color);
    this.box(x, y + 0.25, z, 0.12, 0.09, 0.21, color);
  }

  private crate(x: number, z: number) {
    this.box(x, 0.43, z, 0.7, 0.67, 0.7, '#a98452');
    for (const y of [0.2, 0.65]) this.box(x, y, z, 0.74, 0.07, 0.74, '#715539');
    this.box(x, 0.8, z, 0.73, 0.07, 0.73, '#bc9a67');
  }

  private sign(x: number, z: number, label: string) {
    this.box(x, 0.8, z, 0.13, 1.55, 0.15, C.wood);
    this.box(x, 1.45, z, 2.15, 0.67, 0.14, '#a17d4d');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 152;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#d8bf8d';
    g.fillRect(0, 0, 512, 152);
    g.strokeStyle = '#967349';
    g.lineWidth = 10;
    g.strokeRect(4, 4, 504, 144);
    g.fillStyle = '#463b26';
    g.font = 'bold 43px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 256, 79, 470);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(new T.PlaneGeometry(2.05, 0.6), new T.MeshStandardMaterial({ map: texture, roughness: 1 }));
    mesh.position.set(x, 1.45, z + 0.08);
    this.root.add(mesh);
  }

  private furniture() {
    // Bridge with individual planks and timber piles, facing the small pond.
    for (let i = 0; i < 9; i++) this.box(4.6 + i * 0.25, 0.16, 5.5, 0.22, 0.12, 1.5, i % 2 ? '#aa8655' : '#b28f61');
    for (const x of [4.7, 6.4]) for (const z of [4.8, 6.2]) this.box(x, 0.1, z, 0.12, 0.9, 0.12, C.wood);
    // Benches, worktables, garden plots and noticeboard.
    for (const [x, z] of [
      [1, 5.5],
      [2, -1],
      [-5, 8.5],
    ]) {
      this.box(x!, 0.62, z!, 1.75, 0.16, 0.52, '#aa8857');
      this.box(x!, 1.03, z! - 0.32, 1.75, 0.55, 0.12, '#ad8d5e');
      for (const dx of [-0.6, 0.6]) this.box(x! + dx, 0.34, z!, 0.14, 0.65, 0.45, C.wood);
    }
    for (const [x, z] of [
      [-5.5, 10],
      [9.5, -3],
      [-14, 2],
    ]) {
      this.box(x!, 0.92, z!, 1.7, 0.15, 0.9, '#b18e5e');
      for (const dx of [-0.65, 0.65])
        for (const dz of [-0.3, 0.3]) this.box(x! + dx, 0.48, z! + dz, 0.12, 0.9, 0.12, C.wood);
      this.box(x!, 1.05, z!, 0.4, 0.1, 0.35, '#e3d7b9');
    }
    for (let row = 0; row < 3; row++) {
      const x = 12,
        z = -5 + row * 1.4;
      this.box(x, 0.2, z, 2.1, 0.2, 1.05, '#775b3e');
      for (let i = 0; i < 5; i++) {
        this.box(x - 0.8 + i * 0.4, 0.36, z, 0.25, 0.25, 0.42, '#7b8e52');
        this.box(x - 0.8 + i * 0.4, 0.5, z, 0.23, 0.1, 0.23, row % 2 ? '#cebb7f' : '#a76e55');
      }
    }
    for (const x of [-6, -3.5]) this.box(x, 1, 1, 0.14, 1.95, 0.14, C.wood);
    this.box(-4.75, 1.6, 1, 2.75, 1.55, 0.15, '#aa8a59');
    for (const [x, y] of [
      [-5.3, 1.8],
      [-4.3, 1.8],
      [-5, 1.25],
    ])
      this.box(x!, y!, 1.1, 0.7, 0.48, 0.02, '#e2d2a9', 0, 0, -0.05);
    // Lanterns are emissive, without a costly point light per prop.
    for (const [x, z] of [
      [-3, -4],
      [0, 8],
      [6, 1],
      [-7, 5],
      [3, -5],
    ]) {
      this.box(x!, 1.1, z!, 0.1, 2.05, 0.1, C.wood);
      this.box(x! + 0.2, 2.1, z!, 0.5, 0.09, 0.12, C.wood);
      this.box(x! + 0.36, 1.9, z!, 0.25, 0.35, 0.25, '#d9b56f');
      this.box(x! + 0.36, 2.1, z!, 0.35, 0.1, 0.35, '#655438');
    }
  }

  private turtle() {
    // Original, deliberately simple world shell. The working village stays on
    // the central island; zooming out reveals the lagoon and wooded turtle.
    const rng = random(52);
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const x = Math.cos(a) * 60,
        z = Math.sin(a) * 48;
      const h = 3.5 + rng() * 1.5;
      this.box(x, -h / 2 - 0.35, z, 3.1, h, 2.4, i % 2 ? '#8c7852' : '#9f895b', 0, -a);
      this.box(x, -0.18, z, 3.2, 0.42, 3.6, i % 3 ? '#819460' : '#92a16e', 0, -a);
      if (i % 3 === 0 && a > Math.PI * 1.05) this.tree(x, z, 1.2 + rng() * 0.5);
    }
    this.box(0, -5.3, 0, 72, 3, 57, '#87724b');
    // A rectilinear head and symmetrical flippers, with the same matte palette.
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const x = end * 40,
          z = side * 41;
        this.box(x, -4.4, z, 24, 3, 20, '#8c8159', 0, side * end * 0.45);
        for (let i = 0; i < 12; i++) {
          const xx = x + (rng() - 0.5) * 20,
            zz = z + (rng() - 0.5) * 13;
          this.box(xx, -2.8, zz, 4, 0.4, 3, i % 2 ? '#7b8e57' : '#939467');
        }
        this.tree(x, z, 0.9);
      }
    this.box(63, -3.3, 0, 22, 5.2, 15, '#96936a');
    this.box(75, -2.8, 0, 14, 6.4, 17, '#8c8f64');
    for (const side of [-1, 1]) {
      this.box(77, -1.5, side * 8.55, 3.2, 2.7, 0.12, '#e2dab9');
      this.box(77.6, -1.4, side * 8.64, 1.7, 1.7, 0.08, '#332f29');
    }
    this.tree(73, 0, 1.1);
    this.box(-65, -3.6, 0, 16, 2.6, 8, '#899061');
    // Soft clouds underneath; the water is clipped to the shell, not an ocean.
    const sphere = new T.SphereGeometry(1, 12, 8);
    const cloud = new T.MeshStandardMaterial({ color: '#ece8d7', roughness: 1 });
    for (let i = 0; i < 42; i++) {
      const a = i * 2.39996,
        r = 68 + rng() * 30;
      const puff = new T.Mesh(sphere, cloud);
      puff.position.set(Math.cos(a) * r, -18 - rng() * 5, Math.sin(a) * r);
      puff.scale.set(13 + rng() * 9, 4 + rng() * 4, 9 + rng() * 6);
      this.root.add(puff);
    }
  }

  private makeWater() {
    const mat = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, night: { value: 0 } },
      vertexShader: `varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
      fragmentShader: `varying vec3 vWorld; uniform float time; uniform float night;
        void main(){ vec2 p=vWorld.xz; if(length(p/vec2(60.,48.))>1.) discard; float a=sin(p.x*2.6+p.y*1.4+time*.6); float b=sin(p.x*1.1-p.y*3.7-time*.4);
        float r=pow(max(0.,sin(p.x*4.7+p.y*3.+sin(p.y*1.8+time)*.35+time*.5)),48.) * pow(max(0., sin(p.x*1.8-p.y*3.3+time*.2)),6.);
        float broad=sin(p.x*.18+p.y*.15)*.5+.5;
        vec3 deep=mix(vec3(.035,.24,.25),vec3(.06,.34,.33),broad);
        vec3 color=deep+(a*b)*.009+r*.05;
        color=mix(color,color*vec3(.28,.4,.64),night*.8);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const mesh = new T.Mesh(new T.PlaneGeometry(350, 350), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.19;
    return mesh;
  }
}
