import * as THREE from "three";
import type { TrackId } from "@f1-kart/shared";

export const TRACK_ROAD_HALF_WIDTH = 16.6;
export const TRACK_CURB_OUTER_WIDTH = 19;
export const TRACK_WALL_HALF_WIDTH = 21.2;

const TRACK_SEGMENTS = 720;

// Clockwise trace of the official 14-turn Hungaroring diagram. The reference
// coordinates intentionally keep the long pit straight, the T1/T2 hairpins,
// the T6/T7 chicane and the closing T13/T14 double-right sequence in proportion.
const HUNGARORING_REFERENCE: Array<[number, number, number]> = [
  [613, 0, 680], [613, 1, 400], [613, 4, 130], [635, 5, 75], [680, 5, 90], [720, 4, 160], [748, 2, 260], [748, 0, 420],
  [765, -1, 485], [810, -1, 500], [840, 0, 470], [865, 2, 400], [880, 4, 340], [960, 6, 315], [1100, 8, 290], [1250, 10, 265],
  [1325, 11, 265], [1360, 13, 220], [1410, 15, 150], [1490, 16, 115], [1540, 16, 140], [1550, 15, 230], [1535, 13, 340], [1535, 12, 410],
  [1505, 11, 430], [1470, 11, 420], [1430, 10, 455], [1390, 8, 520], [1375, 7, 565], [1395, 6, 620], [1430, 5, 690], [1420, 4, 735],
  [1370, 3, 765], [1290, 2, 800], [1250, 2, 820], [1235, 1, 860], [1225, 0, 930], [1180, -1, 965], [1050, -1, 955], [900, 0, 940],
  [820, 1, 930], [785, 2, 900], [790, 3, 825], [800, 4, 755], [775, 5, 700], [735, 5, 700], [710, 4, 745], [710, 3, 835],
  [685, 2, 920], [650, 1, 945], [620, 0, 920], [612, 0, 850]
];

export function createTrackCurve(trackId: TrackId): THREE.CatmullRomCurve3 {
  let points: Array<[number, number, number]>;
  let tension = 0.42;
  if (trackId === "velocity") {
    points = [
      [-74, 0, -25], [-48, 0, -70], [8, 0, -82], [66, 0, -62], [88, 0, -12], [75, 0, 43], [25, 0, 70], [-25, 0, 65], [-70, 0, 35]
    ];
    tension = 0.35;
  } else if (trackId === "hungaroring") {
    const scale = 2.1;
    points = HUNGARORING_REFERENCE.map(([x, y, z]) => [(x - 1080) * scale, y, (z - 520) * scale]);
    tension = 0.5;
  } else {
    points = [
      [-220, 0, -49], [-165, 2, -115], [-129, 5, -242], [22, 8, -307], [148, 10, -209], [169, 8, -94], [250, 4, -33],
      [357, 2, 80], [283, 4, 196], [101, 8, 190], [-11, 7, 160], [-142, 4, 201], [-320, 1, 177], [-342, 0, 46]
    ];
  }
  return new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, "catmullrom", tension);
}

function makeRibbon(curve: THREE.CatmullRomCurve3, halfWidth: number, segments: number, yOffset: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const left = point.clone().addScaledVector(normal, halfWidth);
    const right = point.clone().addScaledVector(normal, -halfWidth);
    positions.push(left.x, left.y + yOffset, left.z, right.x, right.y + yOffset, right.z);
    uvs.push(0, t * 52, 1, t * 52);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSideBand(curve: THREE.CatmullRomCurve3, innerWidth: number, outerWidth: number, side: -1 | 1, segments: number, yOffset: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const inner = point.clone().addScaledVector(normal, side * innerWidth);
    const outer = point.clone().addScaledVector(normal, side * outerWidth);
    positions.push(inner.x, inner.y + yOffset, inner.z, outer.x, outer.y + yOffset, outer.z);
    uvs.push(0, t * 64, 1, t * 64);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function checkerTexture(colorA: string, colorB: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 512;
  const context = canvas.getContext("2d")!;
  for (let y = 0; y < 16; y += 1) {
    context.fillStyle = y % 2 ? colorA : colorB;
    context.fillRect(0, y * 32, 64, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function signTexture(text: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 160;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#060a10"; context.fillRect(0, 0, 512, 160);
  context.fillStyle = accent; context.fillRect(0, 0, 512, 12); context.fillRect(0, 148, 512, 12);
  context.fillStyle = "#f8fbff"; context.font = "900 62px Arial"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 256, 83);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function trackFrame(curve: THREE.CatmullRomCurve3, t: number): { point: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; heading: number } {
  const normalized = ((t % 1) + 1) % 1;
  const point = curve.getPointAt(normalized);
  const tangent = curve.getTangentAt(normalized).normalize();
  return { point, tangent, normal: new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(), heading: Math.atan2(tangent.x, tangent.z) };
}

function addRumbleStrips(group: THREE.Group, curve: THREE.CatmullRomCurve3, accent: string): void {
  const count = Math.max(210, Math.ceil(curve.getLength() / 3.5));
  const length = curve.getLength() / count * 0.76;
  const geometry = new THREE.BoxGeometry(TRACK_CURB_OUTER_WIDTH - TRACK_ROAD_HALF_WIDTH - 0.12, 0.11, length);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  const blocks = new THREE.InstancedMesh(geometry, material, count * 2);
  const dummy = new THREE.Object3D();
  const white = new THREE.Color(0xf5f6f7);
  const color = new THREE.Color(accent);
  for (let index = 0; index < count; index += 1) {
    const frame = trackFrame(curve, index / count);
    for (const side of [-1, 1] as const) {
      const instance = index * 2 + (side === 1 ? 1 : 0);
      dummy.position.copy(frame.point).addScaledVector(frame.normal, side * (TRACK_ROAD_HALF_WIDTH + TRACK_CURB_OUTER_WIDTH) * 0.5);
      dummy.position.y += 0.2;
      dummy.rotation.set(0, frame.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      blocks.setMatrixAt(instance, dummy.matrix);
      blocks.setColorAt(instance, index % 2 ? white : color);
    }
  }
  blocks.castShadow = true; blocks.receiveShadow = true; blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  group.add(blocks);
}

function addBarriers(group: THREE.Group, curve: THREE.CatmullRomCurve3): void {
  const count = Math.max(260, Math.ceil(curve.getLength() / 2.9));
  const segmentLength = curve.getLength() / count * 1.06;
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.62, metalness: 0.16 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xd8e0e7, roughness: 0.3, metalness: 0.78 });
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 1.35, segmentLength), concreteMaterial, count * 2);
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.3, segmentLength), railMaterial, count * 2);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const frame = trackFrame(curve, index / count);
    for (const side of [-1, 1] as const) {
      const instance = index * 2 + (side === 1 ? 1 : 0);
      dummy.position.copy(frame.point).addScaledVector(frame.normal, side * TRACK_WALL_HALF_WIDTH); dummy.position.y += 0.72;
      dummy.rotation.set(0, frame.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); wall.setMatrixAt(instance, dummy.matrix);
      dummy.position.y += 0.83; dummy.updateMatrix(); rail.setMatrixAt(instance, dummy.matrix);
    }
  }
  wall.castShadow = true; wall.receiveShadow = true; rail.castShadow = true;
  group.add(wall, rail);

  const postCount = Math.max(140, Math.ceil(curve.getLength() / 5.2));
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.9, 0.18), railMaterial, postCount * 2);
  for (let index = 0; index < postCount; index += 1) {
    const frame = trackFrame(curve, index / postCount);
    for (const side of [-1, 1] as const) {
      const instance = index * 2 + (side === 1 ? 1 : 0);
      dummy.position.copy(frame.point).addScaledVector(frame.normal, side * TRACK_WALL_HALF_WIDTH); dummy.position.y += 2.35;
      dummy.rotation.set(0, frame.heading, 0); dummy.updateMatrix(); posts.setMatrixAt(instance, dummy.matrix);
    }
  }
  posts.castShadow = true; group.add(posts);
}

function addStartArea(group: THREE.Group, curve: THREE.CatmullRomCurve3, trackId: TrackId): void {
  const start = trackFrame(curve, 0);
  const gantry = new THREE.Group();
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x111720, metalness: 0.82, roughness: 0.28 });
  for (const x of [-(TRACK_WALL_HALF_WIDTH + 0.6), TRACK_WALL_HALF_WIDTH + 0.6]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.72, 8.2, 0.72), poleMaterial); pole.position.set(x, 4, 0); pole.castShadow = true; gantry.add(pole);
  }
  const headerEmissive = trackId === "velocity" ? 0x00654d : trackId === "hungaroring" ? 0x6c101b : 0x52126c;
  const headerMaterial = new THREE.MeshStandardMaterial({ color: 0x05080e, emissive: headerEmissive, emissiveIntensity: 1.5, metalness: 0.35 });
  const header = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WALL_HALF_WIDTH * 2 + 2, 2.1, 0.85), headerMaterial); header.position.y = 7; header.castShadow = true; gantry.add(header);
  for (let index = 0; index < 5; index += 1) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xef3048, toneMapped: false }));
    light.position.set((index - 2) * 1.15, 7, -0.48); gantry.add(light);
  }
  gantry.position.copy(start.point); gantry.rotation.y = start.heading; group.add(gantry);

  const gridMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f5f6 });
  for (let index = 0; index < 16; index += 1) {
    const frame = trackFrame(curve, 1 - index * 0.0062);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.025, 0.34), gridMaterial);
    mark.position.copy(frame.point).addScaledVector(frame.normal, index % 2 ? 5.2 : -5.2); mark.position.y += 0.19; mark.rotation.y = frame.heading; group.add(mark);
  }
}

function addTrackFurniture(group: THREE.Group, curve: THREE.CatmullRomCurve3, trackId: TrackId): void {
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x27313c, metalness: 0.72, roughness: 0.32 });
  const lampColor = trackId === "velocity" ? 0xe8fff8 : trackId === "hungaroring" ? 0xfff2d0 : 0xd876ff;
  const lampMaterial = new THREE.MeshBasicMaterial({ color: lampColor, toneMapped: false });
  const count = trackId === "velocity" ? 34 : trackId === "hungaroring" ? 28 : 46;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.15, 7.5, 7), poleMaterial, count);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.24, 0.34), lampMaterial, count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const frame = trackFrame(curve, index / count + 0.008);
    const side = index % 2 ? 1 : -1;
    dummy.position.copy(frame.point).addScaledVector(frame.normal, side * (TRACK_WALL_HALF_WIDTH + 2.3)); dummy.position.y += 3.8;
    dummy.rotation.set(0, frame.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); poles.setMatrixAt(index, dummy.matrix);
    dummy.position.y += 3.65; dummy.updateMatrix(); lamps.setMatrixAt(index, dummy.matrix);
  }
  poles.castShadow = true; group.add(poles, lamps);

  const labels = trackId === "velocity"
    ? ["VELOCITY", "GATE.IO", "DRS", "FORMULA KART"]
    : trackId === "hungaroring"
      ? ["HUNGARORING", "HUNGARIAN GP", "BUDAPEST", "DRS"]
      : ["FANTASIA", "GATE.IO", "NEON GP", "DRS"];
  const accent = trackId === "velocity" ? "#21d7ad" : trackId === "hungaroring" ? "#e83b46" : "#cb53ff";
  labels.forEach((label, index) => {
    const t = [0.12, 0.36, 0.62, 0.84][index]!;
    const frame = trackFrame(curve, t);
    const side = index % 2 ? 1 : -1;
    const inward = frame.normal.clone().multiplyScalar(-side);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({ map: signTexture(label, accent), toneMapped: false }));
    board.position.copy(frame.point).addScaledVector(frame.normal, side * (TRACK_WALL_HALF_WIDTH + 0.4)); board.position.y += 3.1;
    board.rotation.y = Math.atan2(inward.x, inward.z); group.add(board);
  });
}

function addVelocityDetails(group: THREE.Group, curve: THREE.CatmullRomCurve3): void {
  const dummy = new THREE.Object3D();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3a24, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x1d6b3c, roughness: 0.92 });
  const treeCount = 105;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.45, 4.2, 7), trunkMaterial, treeCount);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.5, 7.5, 8), leafMaterial, treeCount);
  for (let index = 0; index < treeCount; index += 1) {
    const frame = trackFrame(curve, index / treeCount + 0.004);
    const side = index % 2 ? 1 : -1;
    const distance = 28 + (index % 7) * 2.4;
    dummy.position.copy(frame.point).addScaledVector(frame.normal, side * distance); dummy.position.y += 2.1;
    dummy.rotation.set(0, index * 1.71, 0); dummy.scale.setScalar(0.78 + (index % 5) * 0.07); dummy.updateMatrix(); trunks.setMatrixAt(index, dummy.matrix);
    dummy.position.y += 5.1; dummy.updateMatrix(); crowns.setMatrixAt(index, dummy.matrix);
  }
  trunks.castShadow = true; crowns.castShadow = true; group.add(trunks, crowns);

  const lake = new THREE.Mesh(new THREE.CircleGeometry(29, 48), new THREE.MeshPhysicalMaterial({ color: 0x2b96b9, roughness: 0.16, metalness: 0.18, transparent: true, opacity: 0.82 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(3, -0.13, 1); group.add(lake);

  const standMaterial = new THREE.MeshStandardMaterial({ color: 0x24313c, roughness: 0.72, metalness: 0.25 });
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x34b997, roughness: 0.68 });
  [0.08, 0.31, 0.57, 0.82].forEach((t, index) => {
    const frame = trackFrame(curve, t);
    const side = index % 2 ? 1 : -1;
    const stand = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 5.5, 24), standMaterial); base.position.y = 2.5; base.castShadow = true; stand.add(base);
    for (let tier = 0; tier < 5; tier += 1) {
      const seats = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.38, 4.2), seatMaterial); seats.position.set(side * tier * 0.52, 1.2 + tier * 0.9, -8 + tier * 4); stand.add(seats);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 27), standMaterial); roof.position.set(side * 2.5, 7.6, 0); stand.add(roof);
    stand.position.copy(frame.point).addScaledVector(frame.normal, side * 31); stand.rotation.y = frame.heading; group.add(stand);
  });

  const pit = trackFrame(curve, 0.96);
  const pitBuilding = new THREE.Group();
  const building = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 46), new THREE.MeshStandardMaterial({ color: 0xe6ebef, roughness: 0.55, metalness: 0.2 })); building.position.y = 4; building.castShadow = true; pitBuilding.add(building);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(12.15, 2.2, 42), new THREE.MeshStandardMaterial({ color: 0x173f55, emissive: 0x0d5c70, emissiveIntensity: 0.6, roughness: 0.18, metalness: 0.35 })); glass.position.y = 5; pitBuilding.add(glass);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.6, 49), new THREE.MeshStandardMaterial({ color: 0x16202a, metalness: 0.65 })); roof.position.y = 8.2; pitBuilding.add(roof);
  pitBuilding.position.copy(pit.point).addScaledVector(pit.normal, TRACK_WALL_HALF_WIDTH + 9); pitBuilding.rotation.y = pit.heading; group.add(pitBuilding);
}

function addFantasiaDetails(group: THREE.Group, curve: THREE.CatmullRomCurve3): void {
  const dummy = new THREE.Object3D();
  const buildingCount = 82;
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x302340, emissive: 0x10091c, emissiveIntensity: 0.72, roughness: 0.56, metalness: 0.38 });
  const capMaterial = new THREE.MeshBasicMaterial({ color: 0xd45bff, toneMapped: false });
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 15, 5), buildingMaterial, buildingCount);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(5.4, 0.32, 5.4), capMaterial, buildingCount);
  for (let index = 0; index < buildingCount; index += 1) {
    const t = (index / buildingCount + 0.005) % 1;
    const frame = trackFrame(curve, t);
    const side = index % 2 ? 1 : -1;
    const nearStart = t < 0.075 || t > 0.925;
    const distance = 29 + (index % 8) * 4.1 + (nearStart ? 16 : 0);
    const heightScale = 0.72 + (index % 7) * 0.16;
    dummy.position.copy(frame.point).addScaledVector(frame.normal, side * distance); dummy.position.y += 7.5 * heightScale;
    dummy.rotation.set(0, frame.heading + (index % 3 - 1) * 0.24, 0); dummy.scale.set(0.8 + (index % 4) * 0.12, heightScale, 0.8 + ((index + 2) % 4) * 0.1); dummy.updateMatrix(); buildings.setMatrixAt(index, dummy.matrix);
    dummy.position.y += 7.5 * heightScale + 0.2; dummy.scale.y = 1; dummy.updateMatrix(); caps.setMatrixAt(index, dummy.matrix);
  }
  buildings.castShadow = true; group.add(buildings, caps);

  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x292333, roughness: 0.98 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(6, 0), rockMaterial, 30);
  for (let index = 0; index < 30; index += 1) {
    const frame = trackFrame(curve, index / 30 + 0.013);
    const side = index % 2 ? 1 : -1;
    dummy.position.copy(frame.point).addScaledVector(frame.normal, side * (58 + (index % 5) * 8)); dummy.position.y += 3 + (index % 4);
    dummy.rotation.set(index * 0.4, index * 1.1, index * 0.2); dummy.scale.set(1 + index % 3 * 0.35, 0.8 + index % 4 * 0.3, 1); dummy.updateMatrix(); rocks.setMatrixAt(index, dummy.matrix);
  }
  rocks.castShadow = true; group.add(rocks);

  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.25, 2.35), windowMaterial, buildingCount * 3);
  const warm = new THREE.Color(0xffb65c); const cool = new THREE.Color(0xb95bff); const cyan = new THREE.Color(0x4be7d0);
  for (let buildingIndex = 0; buildingIndex < buildingCount; buildingIndex += 1) {
    const t = (buildingIndex / buildingCount + 0.005) % 1;
    const frame = trackFrame(curve, t);
    const side = buildingIndex % 2 ? 1 : -1;
    const nearStart = t < 0.075 || t > 0.925;
    const distance = 29 + (buildingIndex % 8) * 4.1 + (nearStart ? 16 : 0);
    for (let row = 0; row < 3; row += 1) {
      const instance = buildingIndex * 3 + row;
      dummy.position.copy(frame.point).addScaledVector(frame.normal, side * (distance - 2.55)); dummy.position.y += 3 + row * 3.35 + buildingIndex % 3 * 0.5;
      dummy.rotation.set(0, frame.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); windows.setMatrixAt(instance, dummy.matrix);
      windows.setColorAt(instance, (buildingIndex + row) % 5 === 0 ? cyan : row === 1 ? cool : warm);
    }
  }
  if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
  group.add(windows);
}

function addHungaroringDetails(group: THREE.Group, curve: THREE.CatmullRomCurve3): void {
  const dummy = new THREE.Object3D();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3c24, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x27643a, roughness: 0.96 });
  const treeCount = 190;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.5, 4.6, 7), trunkMaterial, treeCount);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.8, 8.2, 9), leafMaterial, treeCount);
  for (let index = 0; index < treeCount; index += 1) {
    const t = (index / treeCount + 0.003) % 1;
    const frame = trackFrame(curve, t);
    const side = index % 2 ? 1 : -1;
    const nearPitStraight = t < 0.08 || t > 0.91;
    const distance = 37 + (index % 9) * 4.6 + (nearPitStraight ? 24 : 0);
    const scale = 0.72 + (index % 6) * 0.08;
    dummy.position.copy(frame.point).addScaledVector(frame.normal, side * distance); dummy.position.y += 2.3 * scale;
    dummy.rotation.set(0, index * 1.37, 0); dummy.scale.setScalar(scale); dummy.updateMatrix(); trunks.setMatrixAt(index, dummy.matrix);
    dummy.position.y += 5.25 * scale; dummy.updateMatrix(); crowns.setMatrixAt(index, dummy.matrix);
  }
  trunks.castShadow = true; crowns.castShadow = true; group.add(trunks, crowns);

  const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x355e35, roughness: 1 });
  const hills = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(9, 1), hillMaterial, 38);
  for (let index = 0; index < 38; index += 1) {
    const frame = trackFrame(curve, index / 38 + 0.011);
    const side = index % 2 ? 1 : -1;
    dummy.position.copy(frame.point).addScaledVector(frame.normal, side * (94 + (index % 6) * 18)); dummy.position.y += 1 + (index % 4) * 1.4;
    dummy.rotation.set(index * 0.21, index * 0.83, index * 0.11);
    dummy.scale.set(2.2 + index % 3 * 0.65, 0.8 + index % 4 * 0.16, 2.6 + (index + 1) % 4 * 0.5); dummy.updateMatrix(); hills.setMatrixAt(index, dummy.matrix);
  }
  hills.receiveShadow = true; group.add(hills);

  const gravelMaterial = new THREE.MeshStandardMaterial({ color: 0x9a8865, roughness: 1, side: THREE.DoubleSide });
  [0.065, 0.17, 0.46, 0.72, 0.885].forEach((t, index) => {
    const frame = trackFrame(curve, t);
    const gravel = new THREE.Mesh(new THREE.CircleGeometry(30 + index % 2 * 7, 40), gravelMaterial);
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.copy(frame.point).addScaledVector(frame.normal, (index % 2 ? 1 : -1) * 54); gravel.position.y -= 0.1;
    gravel.receiveShadow = true; group.add(gravel);
  });

  const standMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd0d1, roughness: 0.68, metalness: 0.42 });
  const seatMaterials = [0xd82435, 0xf4f4ef, 0x287447].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.78 }));
  [0.018, 0.052, 0.105, 0.84, 0.93].forEach((t, index) => {
    const frame = trackFrame(curve, t);
    const side = index < 3 ? 1 : -1;
    const stand = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(11, 6.2, 42), standMaterial); base.position.y = 3; base.castShadow = true; stand.add(base);
    for (let tier = 0; tier < 6; tier += 1) {
      const seats = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.45, 6.5), seatMaterials[tier % seatMaterials.length]!);
      seats.position.set(side * tier * 0.48, 1.25 + tier * 0.82, -16 + tier * 6.2); stand.add(seats);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.46, 46), new THREE.MeshStandardMaterial({ color: 0x26313a, metalness: 0.7, roughness: 0.38 }));
    roof.position.set(side * 2.8, 8.2, 0); stand.add(roof);
    stand.position.copy(frame.point).addScaledVector(frame.normal, side * 39); stand.rotation.y = frame.heading; group.add(stand);
  });

  const pit = trackFrame(curve, 0.975);
  const pitBuilding = new THREE.Group();
  const pitShell = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 82), new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.58, metalness: 0.22 }));
  pitShell.position.y = 5; pitShell.castShadow = true; pitBuilding.add(pitShell);
  const pitGlass = new THREE.Mesh(new THREE.BoxGeometry(14.2, 2.6, 76), new THREE.MeshStandardMaterial({ color: 0x233d47, emissive: 0x102c34, emissiveIntensity: 0.38, roughness: 0.2, metalness: 0.4 }));
  pitGlass.position.y = 6.2; pitBuilding.add(pitGlass);
  const pitRoof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.65, 86), new THREE.MeshStandardMaterial({ color: 0xbfc4c5, metalness: 0.72, roughness: 0.35 }));
  pitRoof.position.y = 10.3; pitBuilding.add(pitRoof);
  pitBuilding.position.copy(pit.point).addScaledVector(pit.normal, -37); pitBuilding.rotation.y = pit.heading; group.add(pitBuilding);

  const tower = new THREE.Group();
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e7e2, metalness: 0.5, roughness: 0.48 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 25, 10), towerMaterial); mast.position.y = 12.5; mast.castShadow = true; tower.add(mast);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.2, 8, 14), new THREE.MeshStandardMaterial({ color: 0xd52d3d, roughness: 0.62 })); tank.position.y = 26; tank.castShadow = true; tower.add(tank);
  tower.position.copy(pit.point).addScaledVector(pit.normal, -72); group.add(tower);

  const flagPoleMaterial = new THREE.MeshStandardMaterial({ color: 0xc8ced1, metalness: 0.75, roughness: 0.3 });
  const flagColors = [0xce2939, 0xf1f0e8, 0x287244];
  [0.01, 0.085, 0.31, 0.57, 0.79, 0.945].forEach((t, index) => {
    const frame = trackFrame(curve, t);
    const side = index % 2 ? 1 : -1;
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 7), flagPoleMaterial); pole.position.y = 4.5; flag.add(pole);
    flagColors.forEach((color, stripe) => {
      const fabric = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.62), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      fabric.position.set(1.85, 8.5 - stripe * 0.62, 0); flag.add(fabric);
    });
    flag.position.copy(frame.point).addScaledVector(frame.normal, side * 29); flag.rotation.y = frame.heading; group.add(flag);
  });
}

export function createTrackScene(trackId: TrackId, weather: string): { group: THREE.Group; curve: THREE.CatmullRomCurve3; rain?: THREE.Points } {
  const group = new THREE.Group();
  const curve = createTrackCurve(trackId);
  const segments = trackId === "hungaroring" ? 1_440 : TRACK_SEGMENTS;
  const wet = weather === "rain";
  const roadMaterial = new THREE.MeshStandardMaterial({ color: wet ? 0x1c242b : 0x30343a, roughness: wet ? 0.25 : 0.84, metalness: wet ? 0.3 : 0.04 });
  const road = new THREE.Mesh(makeRibbon(curve, TRACK_ROAD_HALF_WIDTH, segments, 0.11), roadMaterial); road.receiveShadow = true; group.add(road);

  const rubber = new THREE.Mesh(makeRibbon(curve, 2.7, segments, 0.135), new THREE.MeshStandardMaterial({ color: 0x171b20, transparent: true, opacity: wet ? 0.28 : 0.42, roughness: 0.68 }));
  rubber.receiveShadow = true; group.add(rubber);

  const curbAccent = trackId === "velocity" ? "#e5343d" : trackId === "hungaroring" ? "#d92335" : "#b64ee8";
  const curbMaterial = new THREE.MeshStandardMaterial({ map: checkerTexture("#f4f5f6", curbAccent), roughness: wet ? 0.48 : 0.82, side: THREE.DoubleSide });
  const shoulderColor = trackId === "velocity" ? 0x53725c : trackId === "hungaroring" ? 0x397044 : 0x392842;
  const shoulderMaterial = new THREE.MeshStandardMaterial({ color: shoulderColor, roughness: 0.96, side: THREE.DoubleSide });
  for (const side of [-1, 1] as const) {
    const curb = new THREE.Mesh(makeSideBand(curve, TRACK_ROAD_HALF_WIDTH, TRACK_CURB_OUTER_WIDTH, side, segments, 0.13), curbMaterial); curb.receiveShadow = true; group.add(curb);
    const shoulder = new THREE.Mesh(makeSideBand(curve, TRACK_CURB_OUTER_WIDTH, TRACK_WALL_HALF_WIDTH, side, segments, 0.05), shoulderMaterial); shoulder.receiveShadow = true; group.add(shoulder);
  }
  addRumbleStrips(group, curve, curbAccent);
  addBarriers(group, curve);
  addStartArea(group, curve, trackId);
  addTrackFurniture(group, curve, trackId);
  if (trackId === "velocity") addVelocityDetails(group, curve);
  else if (trackId === "hungaroring") addHungaroringDetails(group, curve);
  else addFantasiaDetails(group, curve);

  let rain: THREE.Points | undefined;
  if (weather === "rain") {
    const count = 1900;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = ((index * 47) % 260) - 130;
      positions[index * 3 + 1] = (index * 17) % 55;
      positions[index * 3 + 2] = ((index * 83) % 260) - 130;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    rain = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9bc9ff, size: 0.12, transparent: true, opacity: 0.62 })); group.add(rain);
  }
  return { group, curve, rain };
}
