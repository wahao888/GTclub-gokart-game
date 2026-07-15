import * as THREE from "three";
import { VEHICLE_BY_ID, type PartLevel, type VehicleId } from "@f1-kart/shared";

interface LoftSection {
  z: number;
  width: number;
  y: number;
  height: number;
}

interface WheelLayout {
  x: number;
  frontZ: number;
  rearZ: number;
  y: number;
  radius: number;
  width: number;
  open?: boolean;
}

interface CarMaterials {
  paint: THREE.MeshPhysicalMaterial;
  secondary: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshPhysicalMaterial;
  carbon: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  tyre: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  brake: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  light: THREE.MeshStandardMaterial;
  redLight: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
}

const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

function labelTexture(
  text: string,
  foreground = "#ffffff",
  background = "transparent",
  subline = ""
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = foreground;
  ctx.font = "italic 900 100px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, subline ? 105 : 132, 930);
  if (subline) {
    ctx.globalAlpha = 0.82;
    ctx.font = "700 36px Arial, sans-serif";
    ctx.letterSpacing = "8px";
    ctx.fillText(subline, 512, 196, 900);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function decalMaterial(text: string, foreground = "#ffffff", background = "transparent", subline = ""): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: labelTexture(text, foreground, background, subline),
    transparent: background === "transparent",
    alphaTest: background === "transparent" ? 0.08 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = V(0, 0, 0),
  rotation: [number, number, number] = V(0, 0, 0),
  scale: [number, number, number] = V(1, 1, 1),
  name = ""
): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.scale.set(...scale);
  object.name = name;
  object.castShadow = material.transparent !== true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  material: THREE.Material,
  position?: [number, number, number],
  rotation?: [number, number, number],
  scale?: [number, number, number]
): THREE.Mesh {
  return mesh(parent, new THREE.BoxGeometry(...size, 2, 2, 2), material, position, rotation, scale);
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  position?: [number, number, number],
  rotation?: [number, number, number],
  segments = 18
): THREE.Mesh {
  return mesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, position, rotation);
}

function loftGeometry(sections: LoftSection[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const perimeter = 8;
  for (const section of sections) {
    const halfW = section.width / 2;
    const halfH = section.height / 2;
    const points: Array<[number, number]> = [
      [-halfW * 0.58, section.y + halfH],
      [halfW * 0.58, section.y + halfH],
      [halfW, section.y + halfH * 0.38],
      [halfW, section.y - halfH * 0.38],
      [halfW * 0.7, section.y - halfH],
      [-halfW * 0.7, section.y - halfH],
      [-halfW, section.y - halfH * 0.38],
      [-halfW, section.y + halfH * 0.38]
    ];
    points.forEach(([x, y]) => positions.push(x, y, section.z));
  }
  for (let section = 0; section < sections.length - 1; section += 1) {
    for (let side = 0; side < perimeter; side += 1) {
      const next = (side + 1) % perimeter;
      const a = section * perimeter + side;
      const b = section * perimeter + next;
      const c = (section + 1) * perimeter + next;
      const d = (section + 1) * perimeter + side;
      // The perimeter is clockwise when viewed from +Z. Wind the longitudinal
      // faces outward so the body shell is not removed by back-face culling.
      indices.push(a, d, b, b, d, c);
    }
  }
  for (let side = 1; side < perimeter - 1; side += 1) indices.push(0, side, side + 1);
  const end = (sections.length - 1) * perimeter;
  for (let side = 1; side < perimeter - 1; side += 1) indices.push(end, end + side + 1, end + side);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createMaterials(vehicleId: VehicleId, livery: PartLevel): CarMaterials {
  const spec = VEHICLE_BY_ID[vehicleId];
  const primary = new THREE.Color(spec.colors[0]);
  const secondary = new THREE.Color(spec.colors[1]);
  const accent = new THREE.Color(spec.colors[2]);
  if (livery === 1) {
    primary.multiplyScalar(0.48);
    secondary.multiplyScalar(0.62);
  }
  if (livery === 2) primary.lerp(new THREE.Color("#f4f7ff"), 0.24);
  if (livery === 3) {
    primary.lerp(new THREE.Color("#101c28"), 0.34);
    secondary.lerp(new THREE.Color("#24ffd1"), 0.28);
  }
  const darkPaint = primary.getHSL({ h: 0, s: 0, l: 0 }).l < 0.18;
  const paintGlow = primary.clone().lerp(new THREE.Color("#9fc8dc"), darkPaint ? 0.2 : 0.055);
  const secondaryGlow = secondary.clone().lerp(new THREE.Color("#ffffff"), 0.06);
  const paintOptions = {
    metalness: livery === 2 ? 0.82 : 0.56,
    roughness: livery === 1 ? 0.5 : 0.2,
    clearcoat: livery === 1 ? 0.18 : 1,
    clearcoatRoughness: livery === 1 ? 0.42 : 0.1
  };
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: primary, emissive: paintGlow, emissiveIntensity: darkPaint ? 0.2 : 0.075, ...paintOptions }),
    secondary: new THREE.MeshPhysicalMaterial({ color: secondary, emissive: secondaryGlow, emissiveIntensity: 0.08, ...paintOptions }),
    accent: new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.72, roughness: 0.2, clearcoat: 0.8 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0x171d24, metalness: 0.58, roughness: 0.31, clearcoat: 0.42 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x242d37, metalness: 0.34, roughness: 0.5 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.02, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: vehicleId === "zenith-sfx-400" || vehicleId === "titan-gt-3" ? 0xb68b34 : 0x252a31, metalness: 0.92, roughness: 0.16 }),
    brake: new THREE.MeshStandardMaterial({ color: secondary, metalness: 0.35, roughness: 0.33 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x173247, emissive: 0x07131d, emissiveIntensity: 0.12, metalness: 0.28, roughness: 0.08, transmission: 0.03, transparent: true, opacity: 0.96, clearcoat: 1 }),
    light: new THREE.MeshStandardMaterial({ color: 0xdffaff, emissive: 0x85eaff, emissiveIntensity: 5.2, roughness: 0.12, toneMapped: false }),
    redLight: new THREE.MeshStandardMaterial({ color: 0xff244c, emissive: 0xff082f, emissiveIntensity: 4.5, roughness: 0.18, toneMapped: false }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8edf2, metalness: 1, roughness: 0.08 })
  };
}

function addDecal(
  parent: THREE.Object3D,
  text: string,
  size: [number, number],
  position: [number, number, number],
  rotation: [number, number, number],
  foreground = "#ffffff",
  subline = "",
  background = "transparent"
): void {
  mesh(parent, new THREE.PlaneGeometry(...size), decalMaterial(text, foreground, background, subline), position, rotation);
}

function addWheel(parent: THREE.Object3D, mats: CarMaterials, x: number, y: number, z: number, radius: number, width: number, open = false): void {
  const pivot = new THREE.Group();
  pivot.name = z > 0 ? "front-wheel-pivot" : "rear-wheel-pivot";
  pivot.position.set(x, y, z);
  parent.add(pivot);

  const rolling = new THREE.Group();
  rolling.name = "rolling-wheel";
  rolling.rotation.z = Math.PI / 2;
  pivot.add(rolling);
  mesh(rolling, new THREE.CylinderGeometry(radius, radius, width, 24), mats.tyre);
  mesh(rolling, new THREE.CylinderGeometry(radius * 0.57, radius * 0.57, width + 0.016, 20), mats.rim);
  mesh(rolling, new THREE.CylinderGeometry(radius * 0.43, radius * 0.43, width + 0.035, 24), mats.dark);
  mesh(rolling, new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, width + 0.055, 24), mats.chrome);
  for (const side of [-1, 1]) {
    mesh(rolling, new THREE.TorusGeometry(radius * 0.82, radius * 0.027, 6, 32), mats.accent, V(0, side * (width / 2 + 0.01), 0), V(Math.PI / 2, 0, 0));
  }
  for (let spoke = 0; spoke < 8; spoke += 1) {
    box(rolling, [radius * 0.09, width + 0.075, radius * 0.5], mats.rim, V(0, 0, 0), V(0, spoke * Math.PI / 4, 0));
  }
  box(rolling, [radius * 0.16, width + 0.1, radius * 0.22], mats.brake, V(radius * 0.27, 0, 0));

  if (!open) {
    mesh(parent, new THREE.SphereGeometry(radius * 0.96, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), mats.paint, V(x * 0.92, y + radius * 0.12, z), V(0, 0, x > 0 ? -0.08 : 0.08), V(0.74, 0.76, 1.05));
  }
}

function addWheels(parent: THREE.Object3D, mats: CarMaterials, layout: WheelLayout): void {
  for (const x of [-layout.x, layout.x]) {
    addWheel(parent, mats, x, layout.y, layout.frontZ, layout.radius, layout.width, layout.open);
    addWheel(parent, mats, x, layout.y, layout.rearZ, layout.radius, layout.width, layout.open);
  }
}

function addSuspension(parent: THREE.Object3D, mats: CarMaterials, layout: WheelLayout): void {
  for (const z of [layout.frontZ, layout.rearZ]) {
    for (const x of [-layout.x, layout.x]) {
      for (const yOffset of [-0.12, 0.14]) {
        const arm = cylinder(parent, 0.035, 0.035, layout.x - 0.54, mats.carbon, V(x * 0.55, layout.y + yOffset, z + (z > 0 ? -0.12 : 0.12)), V(0, 0, Math.PI / 2), 8);
        arm.rotation.y = x > 0 ? 0.1 : -0.1;
      }
    }
  }
}

function addWing(parent: THREE.Object3D, mats: CarMaterials, width: number, z: number, y: number, accent = false): void {
  box(parent, [width, 0.11, 0.64], accent ? mats.accent : mats.carbon, V(0, y, z), V(-0.08, 0, 0));
  box(parent, [width * 0.94, 0.1, 0.33], accent ? mats.secondary : mats.carbon, V(0, y + 0.22, z - 0.03), V(-0.14, 0, 0));
  for (const x of [-width / 2, width / 2]) box(parent, [0.08, 0.55, 0.78], mats.secondary, V(x, y + 0.11, z));
  for (const x of [-width * 0.3, width * 0.3]) box(parent, [0.07, 0.78, 0.08], mats.carbon, V(x, y - 0.35, z + 0.05), V(0.1, 0, 0));
}

function addHeadlights(parent: THREE.Object3D, mats: CarMaterials, positions: Array<[number, number, number]>, wide = false): void {
  for (const [x, y, z] of positions) {
    mesh(parent, new THREE.CapsuleGeometry(wide ? 0.11 : 0.08, wide ? 0.56 : 0.38, 5, 12), mats.light, V(x, y, z), V(0, 0, Math.PI / 2), V(1, 1, 0.28));
    mesh(parent, new THREE.CapsuleGeometry(wide ? 0.17 : 0.13, wide ? 0.62 : 0.44, 5, 12), mats.dark, V(x, y - 0.015, z - 0.035), V(0, 0, Math.PI / 2), V(1, 1, 0.28));
  }
}

function addTailLights(parent: THREE.Object3D, mats: CarMaterials, width = 1): void {
  for (const x of [-width, width]) {
    mesh(parent, new THREE.CapsuleGeometry(0.06, 0.45, 4, 10), mats.redLight, V(x, 0.88, -2.42), V(0, 0, Math.PI / 2), V(1, 1, 0.26));
  }
}

function addMirrors(parent: THREE.Object3D, mats: CarMaterials, x: number, y: number, z: number): void {
  for (const side of [-1, 1]) {
    cylinder(parent, 0.025, 0.035, 0.32, mats.carbon, V(side * (x - 0.14), y - 0.1, z), V(0, 0, Math.PI / 2), 8);
    mesh(parent, new THREE.CapsuleGeometry(0.1, 0.24, 5, 10), mats.secondary, V(side * x, y, z), V(0, 0, Math.PI / 2), V(1, 1, 0.5));
  }
}

function addExhaust(parent: THREE.Object3D, mats: CarMaterials, positions: Array<[number, number, number]>, radius = 0.12): void {
  for (const position of positions) {
    cylinder(parent, radius, radius * 1.08, 0.28, mats.chrome, position, V(Math.PI / 2, 0, 0), 16);
    cylinder(parent, radius * 0.68, radius * 0.68, 0.3, mats.dark, V(position[0], position[1], position[2] - 0.01), V(Math.PI / 2, 0, 0), 16);
  }
}

function addFloorAero(parent: THREE.Object3D, mats: CarMaterials, width: number, length: number): void {
  box(parent, [width, 0.08, length], mats.carbon, V(0, 0.32, 0));
  box(parent, [width + 0.28, 0.08, 0.64], mats.carbon, V(0, 0.34, length / 2 + 0.15), V(0.04, 0, 0));
  for (const x of [-width / 2, width / 2]) box(parent, [0.08, 0.17, length * 0.74], mats.accent, V(x, 0.41, 0.05));
  for (const x of [-0.64, 0, 0.64]) box(parent, [0.05, 0.25, 0.92], mats.carbon, V(x, 0.44, -length / 2 + 0.28), V(-0.16, 0, 0));
}

function addCoupeCabin(parent: THREE.Object3D, mats: CarMaterials, open = false): void {
  if (open) {
    // Opaque cockpit tub, inner door liners and bulkheads prevent the open-top
    // roadster from reading as a hollow or transparent shell.
    box(parent, [1.82, 0.34, 2.45], mats.dark, V(0, 0.88, -0.18));
    box(parent, [1.94, 0.58, 0.24], mats.carbon, V(0, 1.05, -1.2), V(-0.08, 0, 0));
    box(parent, [1.72, 0.34, 0.4], mats.dark, V(0, 1.15, 0.88), V(0.12, 0, 0));
    for (const side of [-1, 1]) {
      box(parent, [0.2, 0.48, 2.12], mats.paint, V(side * 1.24, 0.94, -0.08), V(0, side * 0.025, 0));
      box(parent, [0.1, 0.24, 1.68], mats.dark, V(side * 1.12, 1.11, -0.14), V(0, side * 0.025, 0));
      box(parent, [0.52, 0.2, 0.66], mats.dark, V(side * 0.38, 1.02, -0.24), V(-0.08, 0, 0));
      box(parent, [0.5, 0.7, 0.18], mats.dark, V(side * 0.38, 1.34, -0.55), V(-0.18, 0, 0));
      box(parent, [0.35, 0.18, 0.14], mats.secondary, V(side * 0.38, 1.68, -0.64), V(-0.18, 0, 0));
    }
    box(parent, [0.16, 0.32, 1.38], mats.carbon, V(0, 1.05, -0.22));
    mesh(parent, new THREE.TorusGeometry(0.2, 0.035, 7, 22), mats.dark, V(-0.39, 1.34, 0.64), V(Math.PI / 2, 0, 0.08));
    cylinder(parent, 0.025, 0.025, 0.32, mats.chrome, V(-0.39, 1.2, 0.55), V(-0.55, 0, 0), 8);
    for (const x of [-0.32, 0, 0.32]) mesh(parent, new THREE.CircleGeometry(0.07, 16), mats.light, V(x, 1.27, 1.08), V(-0.14, 0, 0));
    for (const x of [-0.48, 0.48]) cylinder(parent, 0.045, 0.045, 1.22, mats.chrome, V(x, 1.45, -0.48), V(Math.PI / 2, 0, 0), 10);
    cylinder(parent, 0.05, 0.05, 1.12, mats.chrome, V(0, 1.72, -0.7), V(0, 0, Math.PI / 2), 10);
    return;
  }
  mesh(parent, loftGeometry([
    { z: -1.35, width: 1.48, y: 1.18, height: 0.58 },
    { z: -0.74, width: 1.72, y: 1.27, height: 0.82 },
    { z: 0.28, width: 1.6, y: 1.34, height: 0.88 },
    { z: 1.05, width: 1.35, y: 1.16, height: 0.56 }
  ]), mats.glass);
  box(parent, [1.47, 0.055, 0.07], mats.chrome, V(0, 1.63, 0.08));
  for (const x of [-0.78, 0.78]) box(parent, [0.055, 0.62, 1.42], mats.dark, V(x, 1.25, -0.12), V(0, 0, x > 0 ? -0.08 : 0.08));
}

function addCoupeBase(parent: THREE.Object3D, mats: CarMaterials, layout: WheelLayout, openCabin = false): void {
  addFloorAero(parent, mats, 2.78, 5.05);
  mesh(parent, loftGeometry([
    { z: -2.42, width: 2.18, y: 0.7, height: 0.56 },
    { z: -1.8, width: 2.7, y: 0.72, height: 0.7 },
    { z: -0.75, width: 2.92, y: 0.72, height: 0.74 },
    { z: 0.72, width: 2.9, y: 0.7, height: 0.7 },
    { z: 1.72, width: 2.68, y: 0.66, height: 0.62 },
    { z: 2.7, width: 1.96, y: 0.61, height: 0.42 },
    { z: 3.02, width: 1.24, y: 0.58, height: 0.22 }
  ]), mats.paint);
  addCoupeCabin(parent, mats, openCabin);
  addWheels(parent, mats, layout);
  addMirrors(parent, mats, 1.32, 1.25, 0.52);
  addHeadlights(parent, mats, [V(-0.82, 0.86, 2.35), V(0.82, 0.86, 2.35)], true);
  addTailLights(parent, mats, 0.78);
  box(parent, [1.25, 0.33, 0.08], mats.dark, V(0, 0.6, 2.94), V(-0.18, 0, 0));
  for (const x of [-0.67, 0.67]) box(parent, [0.48, 0.3, 0.08], mats.dark, V(x, 0.6, 2.75), V(-0.15, 0, x > 0 ? -0.08 : 0.08));
  addExhaust(parent, mats, [V(-0.45, 0.57, -2.48), V(0.45, 0.57, -2.48)], 0.1);
}

function addHalo(parent: THREE.Object3D, mats: CarMaterials, y = 1.42, z = 0.05): void {
  mesh(parent, new THREE.TorusGeometry(0.54, 0.055, 7, 28, Math.PI * 1.72), mats.carbon, V(0, y, z), V(Math.PI / 2, 0, Math.PI * 0.14));
  cylinder(parent, 0.048, 0.048, 0.64, mats.carbon, V(0, y - 0.15, z + 0.48), V(-0.54, 0, 0), 8);
}

function addFormulaBase(parent: THREE.Object3D, mats: CarMaterials, futuristic = false): void {
  const layout: WheelLayout = { x: futuristic ? 1.64 : 1.58, frontZ: 1.7, rearZ: -1.45, y: 0.62, radius: futuristic ? 0.62 : 0.58, width: 0.42, open: true };
  addFloorAero(parent, mats, 2.1, 4.7);
  mesh(parent, loftGeometry([
    { z: -2.18, width: 1.28, y: 0.75, height: 0.62 },
    { z: -1.18, width: 1.82, y: 0.77, height: 0.72 },
    { z: 0.2, width: 1.5, y: 0.79, height: 0.62 },
    { z: 1.05, width: 0.78, y: 0.68, height: 0.46 },
    { z: 2.48, width: 0.32, y: 0.52, height: 0.24 },
    { z: 3.1, width: 0.18, y: 0.45, height: 0.1 }
  ]), mats.paint);
  for (const side of [-1, 1]) {
    mesh(parent, loftGeometry([
      { z: -1.38, width: 0.52, y: 0.69, height: 0.58 },
      { z: -0.4, width: 0.68, y: 0.64, height: 0.54 },
      { z: 0.72, width: 0.52, y: 0.58, height: 0.36 }
    ]), mats.secondary, V(side * 0.88, 0, 0));
  }
  mesh(parent, new THREE.SphereGeometry(0.58, 18, 12), mats.dark, V(0, 1.1, -0.16), V(0, 0, 0), V(0.92, 0.7, 1.15));
  cylinder(parent, 0.3, 0.38, 0.46, mats.accent, V(0, 1.4, -0.23), V(0, 0, 0), 18);
  addHalo(parent, mats);
  addWheels(parent, mats, layout);
  addSuspension(parent, mats, layout);
  box(parent, [3.65, 0.1, 0.58], mats.carbon, V(0, 0.42, 2.72), V(0.02, 0, 0));
  box(parent, [3.35, 0.12, 0.28], mats.secondary, V(0, 0.65, 2.67), V(0.12, 0, 0));
  for (const x of [-1.75, 1.75]) box(parent, [0.08, 0.54, 0.72], mats.secondary, V(x, 0.54, 2.69));
  addWing(parent, mats, 3.05, -2.05, 1.37, futuristic);
  addExhaust(parent, mats, [V(0, 1.02, -2.28)], 0.13);
  addDecal(parent, "22", [0.48, 0.32], V(0, 0.83, 1.65), V(-Math.PI / 2, 0, 0), "#ffffff");
}

function buildGateOracleFormula(parent: THREE.Object3D, mats: CarMaterials): void {
  addFormulaBase(parent, mats);

  // Yellow spear nose and central red pinstripe from the reference livery.
  mesh(parent, loftGeometry([
    { z: 0.62, width: 0.72, y: 0.89, height: 0.2 },
    { z: 1.38, width: 0.54, y: 0.79, height: 0.18 },
    { z: 2.38, width: 0.34, y: 0.62, height: 0.15 },
    { z: 3.1, width: 0.16, y: 0.48, height: 0.08 }
  ]), mats.accent);
  box(parent, [0.09, 0.045, 2.55], mats.secondary, V(0, 0.79, 1.68), V(0.07, 0, 0));
  addDecal(parent, "GATE.IO", [0.45, 0.9], V(0, 0.925, 1.36), V(-Math.PI / 2, 0, 0), "#07152d", "DEMO 01");

  // Deep navy sidepods with the large white ORACLE treatment and red aero line.
  for (const side of [-1, 1]) {
    mesh(parent, loftGeometry([
      { z: -1.38, width: 0.68, y: 0.82, height: 0.66 },
      { z: -0.42, width: 0.82, y: 0.75, height: 0.62 },
      { z: 0.62, width: 0.58, y: 0.67, height: 0.42 }
    ]), mats.paint, V(side * 0.9, 0, 0));
    box(parent, [0.07, 0.16, 2.55], mats.secondary, V(side * 1.16, 0.89, -0.28), V(0, 0, side * 0.04));
    box(parent, [0.13, 0.12, 1.62], mats.accent, V(side * 1.33, 0.54, -0.22), V(0, 0, side * -0.04));
    addDecal(parent, "ORACLE", [1.5, 0.38], V(side * 1.255, 0.88, -0.36), V(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0), "#f4f7ff", "RACING");
    addDecal(parent, "Gate.io", [0.82, 0.22], V(side * 1.265, 0.69, 0.66), V(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0), "#ffffff");
  }

  // Sculpted red engine cover, dorsal fin and the yellow charging-bull motif.
  mesh(parent, loftGeometry([
    { z: -2.02, width: 0.32, y: 1.0, height: 0.42 },
    { z: -1.42, width: 0.66, y: 1.12, height: 0.62 },
    { z: -0.72, width: 0.82, y: 1.22, height: 0.7 },
    { z: -0.18, width: 0.5, y: 1.08, height: 0.48 }
  ]), mats.secondary);
  box(parent, [0.09, 0.7, 1.65], mats.secondary, V(0, 1.48, -1.2), V(0.12, 0, 0));
  for (const side of [-1, 1]) {
    mesh(parent, new THREE.SphereGeometry(0.28, 16, 10), mats.accent, V(side * 0.34, 1.42, -0.88), V(0, 0, side * 0.18), V(1.45, 0.62, 0.22));
    mesh(parent, new THREE.ConeGeometry(0.13, 0.58, 12), mats.accent, V(side * 0.63, 1.43, -0.72), V(0, 0, side * -1.1), V(1, 1, 0.35));
  }
  addDecal(parent, "RED BULL", [1.08, 0.28], V(0, 1.71, -0.72), V(-Math.PI / 2, 0, 0), "#f6d246");

  // Front-facing airbox with yellow lip and black intake.
  mesh(parent, new THREE.TorusGeometry(0.29, 0.075, 8, 24), mats.accent, V(0, 1.72, -0.58));
  mesh(parent, new THREE.CircleGeometry(0.225, 24), mats.dark, V(0, 1.72, -0.565));
  box(parent, [0.74, 0.34, 0.5], mats.secondary, V(0, 1.58, -0.79), V(-0.08, 0, 0));

  // Multi-element black/red front wing with sharp endplates.
  for (const [y, z, width] of [[0.38, 2.78, 3.72], [0.5, 2.67, 3.52], [0.61, 2.54, 3.22]] as Array<[number, number, number]>) {
    box(parent, [width, 0.065, 0.34], mats.carbon, V(0, y, z), V(0.08, 0, 0));
  }
  for (const side of [-1, 1]) {
    box(parent, [0.08, 0.58, 0.82], mats.secondary, V(side * 1.82, 0.54, 2.68), V(0, side * 0.06, 0));
    box(parent, [0.06, 0.1, 1.12], mats.accent, V(side * 1.48, 0.55, 2.65), V(0, side * -0.14, 0));
  }

  // Reference-style rear wing billboard. Gate.io is deliberately readable
  // from the default front three-quarter presentation angle.
  box(parent, [3.34, 0.54, 0.13], mats.carbon, V(0, 1.72, -2.25), V(-0.08, 0, 0));
  box(parent, [3.08, 0.06, 0.15], mats.accent, V(0, 1.47, -2.2));
  addDecal(parent, "Gate.io", [2.52, 0.38], V(0, 1.73, -2.17), V(0, 0, 0), "#ffffff", "FORMULA DEMO");
  addDecal(parent, "Gate.io", [2.52, 0.38], V(0, 1.73, -2.33), V(0, Math.PI, 0), "#ffffff", "FORMULA DEMO");

  addDecal(parent, "1", [0.5, 0.42], V(0, 1.02, 0.38), V(-Math.PI / 2, 0, 0), "#ffffff");
  addDecal(parent, "HONDA RBPT", [0.86, 0.2], V(-0.78, 1.15, -1.13), V(0, -Math.PI / 2, 0), "#ffffff");
}

function buildCrimsonPrincess(parent: THREE.Object3D, mats: CarMaterials): void {
  const layout: WheelLayout = { x: 1.42, frontZ: 1.66, rearZ: -1.56, y: 0.62, radius: 0.58, width: 0.38 };
  addCoupeBase(parent, mats, layout);
  addWing(parent, mats, 2.72, -2.2, 1.33, true);
  for (const x of [-0.72, 0.72]) {
    box(parent, [0.08, 0.13, 1.2], mats.accent, V(x, 0.96, 1.2), V(0, x > 0 ? -0.13 : 0.13, 0));
    mesh(parent, new THREE.TorusGeometry(0.28, 0.045, 7, 20, Math.PI * 1.55), mats.secondary, V(x, 0.92, 1.98), V(Math.PI / 2, 0, x > 0 ? -0.35 : 0.35));
  }
  const bow = new THREE.Group(); bow.position.set(0, 1.86, -0.05); parent.add(bow);
  mesh(bow, new THREE.SphereGeometry(0.18, 16, 10), mats.secondary, V(0, 0, 0), V(0, 0, 0), V(1, 0.72, 0.7));
  for (const side of [-1, 1]) {
    mesh(bow, new THREE.SphereGeometry(0.36, 18, 10), mats.secondary, V(side * 0.35, 0.06, 0), V(0, 0, side * 0.46), V(1.24, 0.62, 0.32));
    box(bow, [0.22, 0.62, 0.08], mats.secondary, V(side * 0.2, -0.33, 0.02), V(0, 0, side * -0.38));
  }
  addDecal(parent, "PRINCESS 07", [1.55, 0.38], V(-1.47, 0.97, -0.18), V(0, -Math.PI / 2, 0), "#f8e7e0", "CRIMSON RACING");
  addDecal(parent, "PRINCESS", [1.28, 0.3], V(0, 1.03, 1.18), V(-Math.PI / 2, 0, 0), "#fff3e8");
}

function buildRedlineFormula(parent: THREE.Object3D, mats: CarMaterials): void {
  addFormulaBase(parent, mats);
  for (const side of [-1, 1]) {
    box(parent, [0.08, 0.28, 1.3], mats.accent, V(side * 0.75, 0.83, -0.22), V(0, 0, side * 0.04));
    addDecal(parent, "RED ROCK", [1.12, 0.28], V(side * 1.245, 0.76, -0.38), V(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0), "#f4e7d0");
  }
  addDecal(parent, "R-01", [0.8, 0.24], V(0, 1.46, -2.12), V(0, Math.PI, 0), "#fff0dc", "FORMULA R");
}

function buildSakuraDrift(parent: THREE.Object3D, mats: CarMaterials): void {
  const layout: WheelLayout = { x: 1.38, frontZ: 1.55, rearZ: -1.46, y: 0.64, radius: 0.59, width: 0.4 };
  addCoupeBase(parent, mats, layout);
  addWing(parent, mats, 3.02, -2.18, 1.36);
  for (const x of [-0.78, 0.78]) {
    box(parent, [0.54, 0.44, 0.42], mats.paint, V(x, 1.08, 2.05), V(-0.08, 0, x > 0 ? -0.08 : 0.08));
    mesh(parent, new THREE.PlaneGeometry(0.34, 0.23), mats.light, V(x, 1.23, 2.27), V(-0.12, 0, 0));
  }
  for (const side of [-1, 1]) {
    for (const z of [-1.05, -0.55, 0.8, 1.24]) cylinder(parent, 0.026, 0.026, 0.09, mats.chrome, V(side * 1.47, 0.88, z), V(0, 0, Math.PI / 2), 8);
    box(parent, [0.13, 0.26, 1.08], mats.carbon, V(side * 1.47, 0.45, 1.82), V(0, side * 0.08, 0));
  }
  addDecal(parent, "SAKURA DRIFT", [1.72, 0.42], V(-1.47, 0.95, -0.1), V(0, -Math.PI / 2, 0), "#11151b", "TOUGE UNION");
  addDecal(parent, "峠", [0.7, 0.62], V(0, 1.02, 1.15), V(-Math.PI / 2, 0, 0), "#11151b");
  addExhaust(parent, mats, [V(0.88, 0.48, -2.55)], 0.16);
}

function buildHyperion(parent: THREE.Object3D, mats: CarMaterials): void {
  const layout: WheelLayout = { x: 1.45, frontZ: 1.65, rearZ: -1.58, y: 0.61, radius: 0.6, width: 0.4 };
  addCoupeBase(parent, mats, layout);
  addWing(parent, mats, 3.18, -2.2, 1.62, true);
  for (const side of [-1, 1]) {
    box(parent, [0.05, 0.08, 3.8], mats.secondary, V(side * 1.28, 0.84, 0.12), V(0, side * 0.08, 0));
    box(parent, [0.32, 0.12, 0.9], mats.carbon, V(side * 1.42, 0.4, 2.35), V(0.1, side * 0.2, 0));
    mesh(parent, new THREE.CapsuleGeometry(0.08, 0.52, 4, 10), mats.light, V(side * 0.79, 0.92, 2.4), V(0, 0, Math.PI / 2), V(1, 1, 0.25));
  }
  for (const z of [1.25, 1.75, 2.2]) box(parent, [0.05, 0.16, 0.75], mats.secondary, V(0, 1, z), V(-0.25, 0, 0));
  addDecal(parent, "PROJECT D", [1.58, 0.36], V(-1.5, 0.96, -0.34), V(0, -Math.PI / 2, 0), "#52f8ff", "HYPERION D-01");
  addDecal(parent, "D-01", [1, 0.28], V(0, 1.83, -2.22), V(0, Math.PI, 0), "#65fbff");
}

function buildBerryJet(parent: THREE.Object3D, mats: CarMaterials): void {
  addFormulaBase(parent, mats, true);
  const nacelles = new THREE.Group(); nacelles.position.set(0, 1.36, -1.15); parent.add(nacelles);
  for (const side of [-1, 1]) {
    const x = side * 0.78;
    mesh(nacelles, new THREE.TorusGeometry(0.55, 0.17, 12, 30), mats.chrome, V(x, 0, 0));
    mesh(nacelles, new THREE.TorusGeometry(0.34, 0.07, 8, 24), mats.secondary, V(x, 0, 0.03));
    mesh(nacelles, new THREE.CircleGeometry(0.31, 24), new THREE.MeshStandardMaterial({ color: 0xffd6a0, emissive: 0xff5c16, emissiveIntensity: 5, toneMapped: false, side: THREE.DoubleSide }), V(x, 0, -0.08));
    for (let blade = 0; blade < 8; blade += 1) box(nacelles, [0.055, 0.65, 0.06], mats.dark, V(x, 0, 0.05), V(0, 0, blade * Math.PI / 4));
  }
  box(parent, [2.62, 0.18, 1.26], mats.paint, V(0, 1.54, -1.12), V(-0.05, 0, 0));
  for (const side of [-1, 1]) box(parent, [0.12, 0.8, 1.02], mats.secondary, V(side * 1.28, 1.62, -1.26), V(0, 0, side * -0.12));
  addDecal(parent, "BERRY JET", [1.36, 0.34], V(-1.14, 1.57, -1.1), V(0, -Math.PI / 2, 0), "#ffe9df", "RACING 22");
}

function buildGuineaGT(parent: THREE.Object3D, mats: CarMaterials): void {
  const layout: WheelLayout = { x: 1.43, frontZ: 1.58, rearZ: -1.5, y: 0.64, radius: 0.6, width: 0.42 };
  addCoupeBase(parent, mats, layout);
  addWing(parent, mats, 2.82, -2.18, 1.35);
  for (const side of [-1, 1]) {
    box(parent, [0.12, 0.28, 1.2], mats.secondary, V(side * 1.43, 0.54, 0.1), V(0, 0, side * -0.05));
    box(parent, [0.09, 0.1, 4.05], mats.accent, V(side * 0.92, 1.01, 0.18), V(0, side * -0.07, 0));
  }
  addDecal(parent, "GUINEA GT", [1.58, 0.46], V(-1.49, 0.98, -0.16), V(0, -Math.PI / 2, 0), "#101317", "RACING 01");
  addDecal(parent, "01", [0.58, 0.54], V(1.5, 0.95, -0.65), V(0, Math.PI / 2, 0), "#101317", "SKYLINE SQUAD");
  addDecal(parent, "(•ᴗ•)", [1.12, 0.56], V(0, 1.06, 1.04), V(-Math.PI / 2, 0, 0), "#ed7d18");
}

function buildLibertyRoadster(parent: THREE.Object3D, mats: CarMaterials): void {
  const layout: WheelLayout = { x: 1.39, frontZ: 1.56, rearZ: -1.48, y: 0.64, radius: 0.62, width: 0.43 };
  addCoupeBase(parent, mats, layout, true);
  box(parent, [2.62, 0.16, 3.85], mats.carbon, V(0, 0.48, -0.02));
  box(parent, [2.16, 0.52, 0.34], mats.paint, V(0, 0.86, -1.36), V(-0.06, 0, 0));
  addWing(parent, mats, 3.02, -2.18, 1.55, true);
  for (const side of [-1, 1]) {
    box(parent, [0.28, 0.55, 2.36], mats.paint, V(side * 1.28, 0.73, 0.02), V(0, side * 0.025, 0));
    box(parent, [0.12, 0.16, 2.72], mats.carbon, V(side * 1.38, 0.47, 0.02), V(0, side * 0.02, 0));
    box(parent, [0.1, 0.09, 4.25], mats.accent, V(side * 1.17, 0.94, 0.06), V(0, side * 0.06, 0));
    for (const z of [-1.42, 1.5]) {
      const arch = mesh(parent, new THREE.TorusGeometry(0.66, 0.055, 7, 24, Math.PI), mats.accent, V(side * 1.47, 0.72, z), V(0, Math.PI / 2, 0));
      arch.rotation.z = Math.PI;
    }
  }
  addDecal(parent, "LIBERTY 8", [1.56, 0.44], V(-1.49, 0.97, -0.12), V(0, -Math.PI / 2, 0), "#f1c45f", "ROADSTER WORKS");
  addDecal(parent, "8", [0.68, 0.62], V(0.72, 1.03, 1.06), V(-Math.PI / 2, 0, 0), "#f1c45f");
}

function buildWhiteDragon(parent: THREE.Object3D, mats: CarMaterials): void {
  addFormulaBase(parent, mats);
  for (const side of [-1, 1]) {
    box(parent, [0.06, 0.2, 2.65], mats.accent, V(side * 0.69, 0.88, 0.22), V(0, side * -0.05, 0));
    addDecal(parent, "WHITE DRAGON", [1.32, 0.32], V(side * 1.245, 0.78, -0.42), V(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0), "#17130e", "FORMULA 77");
  }
  mesh(parent, new THREE.TorusGeometry(0.26, 0.035, 6, 20, Math.PI * 1.65), mats.accent, V(0, 1.04, 1.42), V(-Math.PI / 2, 0, 0.3));
  addDecal(parent, "龍 77", [0.8, 0.4], V(0, 0.82, 1.35), V(-Math.PI / 2, 0, 0), "#bd8d2b");
  addDecal(parent, "WHITE DRAGON", [1.4, 0.3], V(0, 1.48, -2.12), V(0, Math.PI, 0), "#14110d");
}

function addPlayerEffects(group: THREE.Group, mats: CarMaterials, vehicleId: VehicleId): void {
  const glow = new THREE.PointLight(VEHICLE_BY_ID[vehicleId].colors[1], 2.4, 9, 2);
  glow.position.set(0, 0.65, -2.45);
  group.add(glow);
  for (const x of [-0.46, 0.46]) {
    const flame = mesh(group, new THREE.ConeGeometry(0.21, 1.7, 12), new THREE.MeshBasicMaterial({ color: 0x61e7ff, transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), V(x, 0.64, -3.02), V(Math.PI / 2, 0, 0), V(1, 1, 1), "boost-flame");
    flame.visible = false;
    mesh(flame, new THREE.ConeGeometry(0.1, 1.05, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), V(0, 0.2, 0));
  }
  for (let index = 0; index < 3; index += 1) {
    const ring = mesh(
      group,
      new THREE.TorusGeometry(0.76 + index * 0.1, 0.055, 8, 28),
      new THREE.MeshBasicMaterial({ color: index % 2 ? 0xc062ff : 0x55e8ff, transparent: true, opacity: 0.68, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
      V(0, 0.78, -3.25 - index * 0.75),
      undefined,
      undefined,
      "boost-ring"
    );
    ring.visible = false;
  }
  const boostLight = new THREE.PointLight(0x5deaff, 0, 15, 2);
  boostLight.name = "boost-light";
  boostLight.position.set(0, 0.72, -3.1);
  group.add(boostLight);
  box(group, [1.42, 0.025, 2.6], new THREE.MeshBasicMaterial({ color: mats.secondary.color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }), V(0, 0.3, -0.15));
}

export function createKart(vehicleId: VehicleId, livery: PartLevel = 0, player = false): THREE.Group {
  const group = new THREE.Group();
  group.name = vehicleId;
  const mats = createMaterials(vehicleId, livery);

  switch (vehicleId) {
    case "gate-oracle-rb": buildGateOracleFormula(group, mats); break;
    case "velocity-v10": buildCrimsonPrincess(group, mats); break;
    case "oracle-rb20": buildRedlineFormula(group, mats); break;
    case "phantom-f1": buildSakuraDrift(group, mats); break;
    case "storm-apex": buildHyperion(group, mats); break;
    case "omega-legacy": buildBerryJet(group, mats); break;
    case "nova-se-200": buildGuineaGT(group, mats); break;
    case "titan-gt-3": buildLibertyRoadster(group, mats); break;
    case "zenith-sfx-400": buildWhiteDragon(group, mats); break;
  }

  if (player) addPlayerEffects(group, mats, vehicleId);
  group.scale.setScalar(0.9);
  return group;
}
