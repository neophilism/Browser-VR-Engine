type Vec = [number, number, number];
interface Geometry { positions: number[]; normals: number[]; indices: number[]; }
interface Accessor { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[]; }
interface Node { name: string; mesh?: number; skin?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: Record<string, unknown>; }
interface Primitive { attributes: Record<string, number>; indices: number; material: number; targets?: Record<string, number>[]; }

/** A deliberately small fixture writer, not a product format converter. */
class GltfWriter {
  private binary: number[] = [];
  readonly views: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
  readonly accessors: Accessor[] = [];
  readonly nodes: Node[] = [];
  readonly meshes: { name: string; primitives: Primitive[]; weights?: number[] }[] = [];
  readonly materials: { name: string; pbrMetallicRoughness: { baseColorFactor: number[]; metallicFactor: number; roughnessFactor: number }; doubleSided?: boolean }[] = [];
  readonly skins: { joints: number[]; inverseBindMatrices: number; skeleton: number }[] = [];
  readonly animations: { name: string; samplers: { input: number; output: number; interpolation: string }[]; channels: { sampler: number; target: { node: number; path: string } }[] }[] = [];
  accessor(values: number[], size: number, type: string, componentType = 5126, bounds = false, target?: number): number {
    while (this.binary.length % 4) this.binary.push(0);
    const bytes = new Uint8Array(values.length * (componentType === 5126 ? 4 : 2));
    const view = new DataView(bytes.buffer);
    values.forEach((value, i) => componentType === 5126 ? view.setFloat32(i * 4, value, true) : view.setUint16(i * 2, value, true));
    const accessor: Accessor = { bufferView: this.views.length, componentType, count: values.length / size, type };
    this.views.push({ buffer: 0, byteOffset: this.binary.length, byteLength: bytes.length, ...(target === undefined ? {} : { target }) });
    for (const value of bytes) this.binary.push(value);
    if (bounds) {
      accessor.min = Array.from({ length: size }, (_, axis) => Math.min(...values.filter((_, i) => i % size === axis)));
      accessor.max = Array.from({ length: size }, (_, axis) => Math.max(...values.filter((_, i) => i % size === axis)));
    }
    this.accessors.push(accessor);
    return this.accessors.length - 1;
  }
  material(name: string, color: number[]): number {
    this.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 0.75 } });
    return this.materials.length - 1;
  }
  mesh(name: string, geometry: Geometry, material: number): number {
    this.meshes.push({ name, primitives: [{ attributes: {
      POSITION: this.accessor(geometry.positions, 3, 'VEC3', 5126, true, 34962),
      NORMAL: this.accessor(geometry.normals, 3, 'VEC3', 5126, false, 34962)
    }, indices: this.accessor(geometry.indices, 1, 'SCALAR', 5123, false, 34963), material }] });
    return this.meshes.length - 1;
  }
  bytes(roots: number[]): Uint8Array {
    const binary = new Uint8Array(this.binary);
    let text = '';
    for (let start = 0; start < binary.length; start += 4096) text += String.fromCharCode(...binary.subarray(start, start + 4096));
    return new TextEncoder().encode(JSON.stringify({
      asset: { version: '2.0', generator: '@browser-vr-engine/qualification-fixtures 0.1.0', copyright: 'Original synthetic fixture, neophilism. UNLICENSED.' },
      scene: 0, scenes: [{ nodes: roots }], nodes: this.nodes, meshes: this.meshes, materials: this.materials,
      buffers: [{ uri: `data:application/octet-stream;base64,${btoa(text)}`, byteLength: binary.length }],
      bufferViews: this.views, accessors: this.accessors,
      ...(this.skins.length ? { skins: this.skins } : {}),
      ...(this.animations.length ? { animations: this.animations } : {})
    }) + '\n');
  }
}

export function boxGeometry(): Geometry {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const faces: { n: Vec; corners: Vec[] }[] = [
    { n: [1, 0, 0], corners: [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]] },
    { n: [-1, 0, 0], corners: [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]] },
    { n: [0, 1, 0], corners: [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]] },
    { n: [0, -1, 0], corners: [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]] },
    { n: [0, 0, 1], corners: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
    { n: [0, 0, -1], corners: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] }
  ];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const corner of face.corners) { positions.push(...corner); normals.push(...face.n); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}
export interface ArchitecturalPart { id: string; center: Vec; size: Vec; rotation?: [number, number, number, number]; }
export function courtyardParts(): ArchitecturalPart[] {
  const parts: ArchitecturalPart[] = [
    { id: 'floor', center: [0, -.1, 0], size: [24, .2, 24] },
    { id: 'wall-west', center: [-12, 2, 0], size: [.3, 4, 24] },
    { id: 'wall-east', center: [12, 2, 0], size: [.3, 4, 24] },
    { id: 'wall-north', center: [0, 2, -12], size: [24, 4, .3] },
    { id: 'door-left', center: [-6.3, 2, 12], size: [11.4, 4, .3] },
    { id: 'door-right', center: [6.3, 2, 12], size: [11.4, 4, .3] },
    { id: 'door-lintel', center: [0, 3.1, 12], size: [1.2, 1.8, .3] },
    { id: 'arch-left', center: [-1.75, 1, 0], size: [.5, 2, .6] },
    { id: 'arch-right', center: [1.75, 1, 0], size: [.5, 2, .6] },
    { id: 'thin-barrier', center: [6, .75, 3], size: [4, 1.5, .05] }
  ];
  // A segmented masonry arch has actual open space, not a solid bounding box.
  for (let i = 0; i < 12; i++) {
    const angle = (i + .5) * Math.PI / 12;
    parts.push({ id: `arch-segment-${i}`, center: [Math.cos(angle) * 1.75, 2 + Math.sin(angle) * 1.75, 0], size: [.5, .49, .6], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] });
  }
  for (const x of [-8, 8]) for (const z of [-8, -4, 4, 8]) parts.push({ id: `column-${x}-${z}`, center: [x, 2, z], size: [.5, 4, .5] });
  for (let i = 0; i < 5; i++) parts.push({ id: `step-${i}`, center: [3, .09 * (i + 1), 7 - i * .5], size: [2, .18 * (i + 1), .5] });
  const slope = Math.atan(.9 / 4);
  parts.push({ id: 'ramp', center: [-4, .45, 6], size: [2, .1, Math.hypot(4, .9)], rotation: [Math.sin(slope / 2), 0, 0, Math.cos(slope / 2)] });
  return parts;
}
export function generateCourtyard(): Uint8Array {
  const writer = new GltfWriter();
  const mesh = writer.mesh('stone-unit', boxGeometry(), writer.material('warm-stone', [.76, .72, .61, 1]));
  for (const part of courtyardParts()) writer.nodes.push({ name: part.id, mesh, translation: part.center, scale: part.size, ...(part.rotation ? { rotation: part.rotation } : {}), extras: { fixturePartId: part.id } });
  return writer.bytes(writer.nodes.map((_, index) => index));
}
export function generateProp(): Uint8Array {
  const writer = new GltfWriter();
  const material = writer.material('blue-original-prop', [.15, .4, .9, 1]);
  const mesh = writer.mesh('unit-cube', boxGeometry(), material);
  writer.nodes.push({ name: 'asymmetric-statue', children: [1, 2, 3] });
  writer.nodes.push({ name: 'base', mesh, translation: [0, -.35, 0], scale: [.6, .3, .6] });
  writer.nodes.push({ name: 'body', mesh, translation: [0, .05, 0], scale: [.3, .5, .3] });
  writer.nodes.push({ name: 'arm', mesh, translation: [.25, .3, 0], scale: [.7, .15, .15] });
  return writer.bytes([0]);
}
export function generateCoordinateLab(): Uint8Array {
  const writer = new GltfWriter();
  const colors = [[1, .15, .15, 1], [.1, .9, .2, 1], [.15, .3, 1, 1]];
  for (let axis = 0; axis < 3; axis++) {
    const mesh = writer.mesh(`axis-${axis}`, boxGeometry(), writer.material(`axis-color-${axis}`, colors[axis]!));
    const translation: Vec = [0, 0, 0], scale: Vec = [.1, .1, .1];
    translation[axis] = .5; scale[axis] = 1;
    writer.nodes.push({ name: ['positive-X', 'positive-Y', 'positive-Z'][axis]!, mesh, translation, scale });
  }
  return writer.bytes([0, 1, 2]);
}
export function generateCreature(): Uint8Array {
  const writer = new GltfWriter();
  const cube = boxGeometry();
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], joints: number[] = [], weights: number[] = [];
  const pieces = [
    { offset: [0, 0, 0], size: [.35, .25, .7], joint: 1 },
    { offset: [.65, 0, 0], size: [1, .06, .4], joint: 2 },
    { offset: [-.65, 0, 0], size: [1, .06, .4], joint: 3 },
    { offset: [0, 0, -.45], size: [.25, .06, .4], joint: 4 }
  ];
  for (const piece of pieces) {
    const base = positions.length / 3;
    for (let i = 0; i < cube.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) positions.push(cube.positions[i + a]! * piece.size[a]! + piece.offset[a]!);
      joints.push(piece.joint, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    normals.push(...cube.normals); indices.push(...cube.indices.map(index => index + base));
  }
  const mesh = writer.mesh('synthetic-five-joint-bird', { positions, normals, indices }, writer.material('bird-gold', [.9, .55, .1, 1]));
  const primitive = writer.meshes[mesh]!.primitives[0]!;
  primitive.attributes.JOINTS_0 = writer.accessor(joints, 4, 'VEC4', 5123, false, 34962);
  primitive.attributes.WEIGHTS_0 = writer.accessor(weights, 4, 'VEC4', 5126, false, 34962);
  primitive.targets = [{ POSITION: writer.accessor(positions.map((_, index) => index % 3 === 1 ? .025 : 0), 3, 'VEC3', 5126, true, 34962) }];
  writer.meshes[mesh]!.weights = [0];
  writer.nodes.push({ name: 'bird', mesh, skin: 0, children: [1] });
  writer.nodes.push({ name: 'root', children: [2] });
  writer.nodes.push({ name: 'body', children: [3, 4, 5] });
  writer.nodes.push({ name: 'wing-right', translation: [.15, 0, 0] });
  writer.nodes.push({ name: 'wing-left', translation: [-.15, 0, 0] });
  writer.nodes.push({ name: 'tail', translation: [0, 0, -.35], extras: { attachmentSocket: 'tail-tip' } });
  const inverseBinds: number[] = [];
  for (const translation of [[0, 0, 0], [0, 0, 0], [.15, 0, 0], [-.15, 0, 0], [0, 0, -.35]]) inverseBinds.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -translation[0]!, -translation[1]!, -translation[2]!, 1);
  writer.skins.push({ joints: [1, 2, 3, 4, 5], inverseBindMatrices: writer.accessor(inverseBinds, 16, 'MAT4'), skeleton: 1 });
  for (const [name, amplitude] of [['flap', .7], ['glide', .08]] as const) {
    const times = writer.accessor([0, .25, .5, .75, 1], 1, 'SCALAR', 5126, true);
    const animation: typeof writer.animations[number] = { name, samplers: [], channels: [] };
    for (const [node, sign] of [[3, 1], [4, -1]]) {
      const rotations: number[] = [];
      for (const factor of [0, 1, 0, -1, 0]) { const angle = amplitude * factor * sign!; rotations.push(0, 0, Math.sin(angle / 2), Math.cos(angle / 2)); }
      animation.samplers.push({ input: times, output: writer.accessor(rotations, 4, 'VEC4'), interpolation: 'LINEAR' });
      animation.channels.push({ sampler: animation.samplers.length - 1, target: { node: node!, path: 'rotation' } });
    }
    writer.animations.push(animation);
  }
  return writer.bytes([0]);
}
