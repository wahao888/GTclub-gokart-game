import { useEffect, useRef } from "react";
import * as THREE from "three";
import { VEHICLES, VEHICLE_BY_ID, type PartLevel, type VehicleId } from "@f1-kart/shared";
import { createKart } from "../game/carFactory";

type ShowcaseEnvironment = "studio" | "garage";

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function createSignMaterial(title: string, subtitle: string): THREE.MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#101821");
    gradient.addColorStop(1, "#05090e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#c99243";
    context.lineWidth = 5;
    context.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);
    context.fillStyle = "#f2e4c6";
    context.font = "800 72px sans-serif";
    context.textAlign = "center";
    context.fillText(title, canvas.width / 2, 142);
    context.fillStyle = "#c99243";
    context.font = "600 25px sans-serif";
    context.fillText(subtitle, canvas.width / 2, 208);
    context.fillStyle = "#768391";
    context.font = "500 19px sans-serif";
    context.fillText("PRIVATE COLLECTION · BAY 09", canvas.width / 2, 255);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}

function addArchedWindow(parent: THREE.Object3D, x: number): void {
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xd3e8eb,
    emissive: 0x86b8c6,
    emissiveIntensity: 1.65,
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });
  const frame = new THREE.MeshStandardMaterial({ color: 0x161d24, metalness: 0.8, roughness: 0.24 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x80684e, metalness: 0.06, roughness: 0.72 });
  const z = -6.86;
  const width = 2.42;
  addBox(parent, [width, 3.1, 0.05], glass, [x, 2.68, z]);
  const archGlass = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 32, 0, Math.PI), glass);
  archGlass.position.set(x, 4.23, z);
  parent.add(archGlass);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(width / 2, 0.085, 8, 40, Math.PI), frame);
  arch.position.set(x, 4.23, z + 0.035);
  parent.add(arch);
  for (const side of [-1, 1]) {
    addBox(parent, [0.11, 3.2, 0.12], frame, [x + side * width / 2, 2.67, z + 0.03]);
    addBox(parent, [0.32, 5.75, 0.42], stone, [x + side * (width / 2 + 0.23), 2.62, z - 0.15]);
  }
  addBox(parent, [width + 0.18, 0.11, 0.14], frame, [x, 1.12, z + 0.03]);
  addBox(parent, [0.085, 3.15, 0.1], frame, [x, 2.68, z + 0.06]);
  addBox(parent, [width, 0.07, 0.1], frame, [x, 3.16, z + 0.06]);
  for (const offset of [-0.62, 0.62]) addBox(parent, [0.065, 3.15, 0.09], frame, [x + offset, 2.68, z + 0.06]);
}

function addPendantLight(parent: THREE.Object3D, x: number, z: number): void {
  const dark = new THREE.MeshStandardMaterial({ color: 0x171b1e, metalness: 0.78, roughness: 0.24 });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffd79a, toneMapped: false });
  addBox(parent, [0.025, 1.05, 0.025], dark, [x, 5.35, z]);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 18, 1, true), dark);
  shade.position.set(x, 4.78, z);
  parent.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), warm);
  bulb.position.set(x, 4.62, z);
  parent.add(bulb);
  const light = new THREE.PointLight(0xffc987, 5.2, 6.5, 2);
  light.position.set(x, 4.55, z);
  parent.add(light);
}

function addBackgroundCar(parent: THREE.Object3D, vehicleId: VehicleId, x: number, z: number, rotation: number): void {
  const preview = createKart(vehicleId, 0, false);
  preview.scale.setScalar(0.44);
  preview.position.set(x, 0.08, z);
  preview.rotation.y = rotation;
  preview.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  parent.add(preview);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.52, 1.56, 0.08, 40),
    new THREE.MeshPhysicalMaterial({ color: 0x24282c, metalness: 0.52, roughness: 0.27, clearcoat: 0.65 }),
  );
  pad.position.set(x, -0.05, z);
  pad.receiveShadow = true;
  parent.add(pad);
  const target = new THREE.Object3D();
  target.position.set(x, 0.35, z);
  parent.add(target);
  const bayLight = new THREE.SpotLight(0xffddb0, 38, 12, Math.PI / 5.2, 0.66);
  bayLight.position.set(x + 0.7, 5.2, z + 1.4);
  bayLight.target = target;
  parent.add(bayLight);
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(1.52, 0.025, 6, 56),
    new THREE.MeshBasicMaterial({ color: VEHICLE_BY_ID[vehicleId].colors[1], transparent: true, opacity: 0.65, toneMapped: false }),
  );
  marker.rotation.x = Math.PI / 2;
  marker.position.set(x, 0.005, z);
  parent.add(marker);
}

function addGarageEnvironment(scene: THREE.Scene, vehicleId: VehicleId, car: THREE.Group): THREE.Mesh {
  const architecture = new THREE.Group();
  architecture.name = "heritage-showroom";
  scene.add(architecture);

  const accent = new THREE.Color(VEHICLE_BY_ID[vehicleId].colors[1]);
  const floorMaterial = new THREE.MeshPhysicalMaterial({ color: 0x625548, metalness: 0.25, roughness: 0.19, clearcoat: 0.94, clearcoatRoughness: 0.14 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xa17b58, metalness: 0.03, roughness: 0.68 });
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xeee0c6, metalness: 0.02, roughness: 0.64 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x111921, metalness: 0.76, roughness: 0.25 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb48343, metalness: 0.84, roughness: 0.2 });
  const accentGlow = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 22), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.13, -0.5);
  floor.receiveShadow = true;
  architecture.add(floor);
  const grid = new THREE.GridHelper(26, 26, 0x9b8064, 0x5d5144);
  grid.position.y = -0.115;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.24;
  architecture.add(grid);

  const sunPatchMaterial = new THREE.MeshBasicMaterial({ color: 0xffd69b, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const x of [-6.2, -3.05, 0.1, 3.25]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 5.8), sunPatchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = -0.18;
    patch.position.set(x, -0.095, -0.75);
    architecture.add(patch);
  }

  addBox(architecture, [24, 7.2, 0.34], wallMaterial, [0, 2.8, -7.12]);
  addBox(architecture, [0.35, 7.1, 18], wallMaterial, [-10.3, 2.8, -0.2]);
  addBox(architecture, [24, 0.34, 18], ceilingMaterial, [0, 6.24, -0.2]);
  for (const x of [-7.7, -4.6, -1.5, 1.6, 4.7, 7.8]) addArchedWindow(architecture, x);

  for (const z of [-5.4, -2.2, 1, 4.2]) {
    addBox(architecture, [21.5, 0.28, 0.38], ceilingMaterial, [0, 5.94, z]);
    addBox(architecture, [18.8, 0.05, 0.08], new THREE.MeshBasicMaterial({ color: 0xffdca5, toneMapped: false }), [0, 5.75, z]);
  }
  for (const x of [-6.2, -2.8, 0.6, 4]) addPendantLight(architecture, x, -2.4);

  const sun = new THREE.DirectionalLight(0xffd3a0, 8.2);
  sun.position.set(-8, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  architecture.add(sun);
  architecture.add(new THREE.AmbientLight(0xffe8c9, 1.5));
  const coolFill = new THREE.RectAreaLight(0xb7dcff, 10, 10, 4);
  coolFill.position.set(2, 5.6, 2.5);
  coolFill.rotation.x = -Math.PI / 2;
  architecture.add(coolFill);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(3.65, 3.82, 0.3, 72),
    new THREE.MeshPhysicalMaterial({ color: 0x171d22, metalness: 0.82, roughness: 0.15, clearcoat: 1 }),
  );
  platform.position.set(-0.8, 0.03, 0.15);
  platform.receiveShadow = true;
  architecture.add(platform);
  const platformTop = new THREE.Mesh(
    new THREE.CylinderGeometry(3.48, 3.48, 0.06, 72),
    new THREE.MeshPhysicalMaterial({ color: 0x41464a, metalness: 0.48, roughness: 0.19, clearcoat: 1 }),
  );
  platformTop.position.set(-0.8, 0.2, 0.15);
  platformTop.receiveShadow = true;
  architecture.add(platformTop);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.69, 0.07, 10, 96), accentGlow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-0.8, 0.15, 0.15);
  architecture.add(ring);
  const underGlow = new THREE.PointLight(accent, 12, 9, 2);
  underGlow.position.set(-0.8, 0.3, 0.2);
  architecture.add(underGlow);

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.75), createSignMaterial("FORMULA KART", "HERITAGE MOTOR GALLERY"));
  banner.position.set(5.8, 3.72, -6.9);
  architecture.add(banner);
  for (const side of [-1, 1]) addBox(architecture, [0.09, 2.1, 0.1], brass, [5.8 + side * 3.02, 3.72, -6.83]);

  const cabinetRed = new THREE.MeshStandardMaterial({ color: 0x7e1825, metalness: 0.55, roughness: 0.3 });
  for (const x of [6.8, 8.15]) {
    addBox(architecture, [1.16, 1.55, 0.72], cabinetRed, [x, 0.67, -5.85]);
    for (const y of [0.2, 0.57, 0.94]) addBox(architecture, [0.82, 0.035, 0.76], brass, [x, y, -5.47]);
    addBox(architecture, [1.22, 0.08, 0.8], darkMetal, [x, 1.48, -5.85]);
  }

  const otherCars = VEHICLES.filter((entry) => entry.id !== vehicleId).slice(0, 3);
  const parked = [
    { x: -4.8, z: -3.2, rotation: -0.02 },
    { x: -2.35, z: -4.35, rotation: -0.07 },
    { x: 0.25, z: -5.0, rotation: -0.12 },
  ];
  otherCars.forEach((entry, index) => {
    const bay = parked[index]!;
    addBackgroundCar(architecture, entry.id, bay.x, bay.z, bay.rotation);
  });

  const key = new THREE.SpotLight(0xffffff, 56, 18, Math.PI / 4, 0.65);
  key.position.set(3.8, 6.8, 5.8);
  key.target = car;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  architecture.add(key);
  const rim = new THREE.SpotLight(accent, 34, 16, Math.PI / 4, 0.7);
  rim.position.set(-6, 4.5, -1.8);
  rim.target = car;
  architecture.add(rim);

  return ring;
}

export function CarShowcase({
  vehicleId,
  livery = 0,
  compact = false,
  environment = "studio",
}: {
  vehicleId: VehicleId;
  livery?: PartLevel;
  compact?: boolean;
  environment?: ShowcaseEnvironment;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const isGarage = environment === "garage";
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !isGarage, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isGarage ? 1.38 : 1.22;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    if (isGarage) {
      scene.background = new THREE.Color(0x2a221c);
      scene.fog = new THREE.Fog(0x2a221c, 21, 38);
    }
    const camera = new THREE.PerspectiveCamera(isGarage ? 34 : 28, 1, 0.1, 100);
    camera.position.set(isGarage ? 8.7 : 5.8, isGarage ? 4.2 : 2.8, isGarage ? 10.8 : 7);
    camera.lookAt(isGarage ? -1.15 : 0, isGarage ? 1.05 : 0.72, isGarage ? -0.6 : 0);

    const car = createKart(vehicleId, livery, true);
    car.rotation.y = isGarage ? -0.48 : -0.55;
    if (isGarage) car.position.set(-0.8, 0.27, 0.15);
    car.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    scene.add(car);

    let displayRing: THREE.Group | THREE.Mesh | null = null;
    if (isGarage) {
      displayRing = addGarageEnvironment(scene, vehicleId, car);
      scene.add(new THREE.HemisphereLight(0xfff2dc, 0x4b3020, 2.8));
    } else {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshPhysicalMaterial({ color: 0x202a32, roughness: 0.26, metalness: 0.52, clearcoat: 0.58 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.05;
      floor.receiveShadow = true;
      scene.add(floor);
      scene.add(new THREE.HemisphereLight(0xf0f6ff, 0x25303c, 3));
      const key = new THREE.DirectionalLight(0xffffff, 5.6);
      key.position.set(4, 8, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xaad8ff, 3.4);
      fill.position.set(-5, 4, 5);
      scene.add(fill);
      const rim = new THREE.SpotLight(0x6fdfff, 32, 18, Math.PI / 5, 0.65);
      rim.position.set(-5, 4, -2);
      rim.target = car;
      scene.add(rim);
      const warm = new THREE.PointLight(0xff6b82, 17, 12);
      warm.position.set(4, 1.6, -3);
      scene.add(warm);
      const front = new THREE.SpotLight(0xffffff, 16, 16, Math.PI / 4, 0.75);
      front.position.set(1, 3.5, 7);
      front.target = car;
      scene.add(front);
    }

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      car.rotation.y += isGarage ? 0.00125 : 0.0025;
      if (displayRing) displayRing.rotation.z -= 0.0007;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
          objectMaterials.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => {
        const map = (material as THREE.MeshStandardMaterial).map;
        map?.dispose();
        material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [environment, vehicleId, livery]);

  return <div className={`${compact ? "car-showcase compact" : "car-showcase"} ${environment === "garage" ? "garage-environment" : ""}`} ref={host} aria-label="3D 賽車預覽" />;
}
