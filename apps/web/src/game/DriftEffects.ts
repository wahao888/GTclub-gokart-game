import * as THREE from "three";
import type { Quality } from "@f1-kart/shared";

interface Particle {
  active: boolean;
  age: number;
  life: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

function particleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,.82)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    active: false,
    age: 0,
    life: 1,
    position: new THREE.Vector3(0, -999, 0),
    velocity: new THREE.Vector3()
  }));
}

export class DriftEffects {
  private smokeGeometry = new THREE.BufferGeometry();
  private sparkGeometry = new THREE.BufferGeometry();
  private smokeMaterial: THREE.PointsMaterial;
  private sparkMaterial: THREE.PointsMaterial;
  private smoke: THREE.Points;
  private sparks: THREE.Points;
  private skidGeometry = new THREE.BufferGeometry();
  private skidMaterial = new THREE.LineBasicMaterial({ color: 0x07090b, transparent: true, opacity: 0.7, depthWrite: false });
  private skidMarks: THREE.LineSegments;
  private smokeParticles: Particle[];
  private sparkParticles: Particle[];
  private smokePositions: Float32Array;
  private smokeColors: Float32Array;
  private sparkPositions: Float32Array;
  private sparkColors: Float32Array;
  private skidPositions: Float32Array;
  private smokeCursor = 0;
  private sparkCursor = 0;
  private skidCursor = 0;
  private skidCount = 0;
  private spawnAccumulator = 0;
  private previousWheels?: [THREE.Vector3, THREE.Vector3];
  private randomState: number;
  private smokeRate: number;
  private texture = particleTexture();

  constructor(private scene: THREE.Scene, quality: Quality, seed: number) {
    const smokeCount = quality === "high" ? 68 : quality === "medium" ? 46 : 28;
    const sparkCount = quality === "high" ? 34 : quality === "medium" ? 24 : 14;
    const skidSegments = quality === "high" ? 520 : quality === "medium" ? 360 : 220;
    this.smokeRate = quality === "high" ? 46 : quality === "medium" ? 34 : 22;
    this.randomState = (seed ^ 0x9e3779b9) >>> 0;
    this.smokeParticles = createParticles(smokeCount);
    this.sparkParticles = createParticles(sparkCount);
    this.smokePositions = new Float32Array(smokeCount * 3);
    this.smokeColors = new Float32Array(smokeCount * 3);
    this.sparkPositions = new Float32Array(sparkCount * 3);
    this.sparkColors = new Float32Array(sparkCount * 3);
    this.skidPositions = new Float32Array(skidSegments * 6);
    for (let index = 0; index < smokeCount; index += 1) this.smokePositions[index * 3 + 1] = -999;
    for (let index = 0; index < sparkCount; index += 1) this.sparkPositions[index * 3 + 1] = -999;

    this.smokeGeometry.setAttribute("position", new THREE.BufferAttribute(this.smokePositions, 3));
    this.smokeGeometry.setAttribute("color", new THREE.BufferAttribute(this.smokeColors, 3));
    this.sparkGeometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkGeometry.setAttribute("color", new THREE.BufferAttribute(this.sparkColors, 3));
    this.skidGeometry.setAttribute("position", new THREE.BufferAttribute(this.skidPositions, 3));
    this.skidGeometry.setDrawRange(0, 0);

    this.smokeMaterial = new THREE.PointsMaterial({
      size: 2.15,
      map: this.texture,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true
    });
    this.sparkMaterial = new THREE.PointsMaterial({
      size: 0.28,
      map: this.texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false
    });
    this.smoke = new THREE.Points(this.smokeGeometry, this.smokeMaterial);
    this.sparks = new THREE.Points(this.sparkGeometry, this.sparkMaterial);
    this.skidMarks = new THREE.LineSegments(this.skidGeometry, this.skidMaterial);
    this.smoke.frustumCulled = false;
    this.sparks.frustumCulled = false;
    this.skidMarks.frustumCulled = false;
    this.smoke.renderOrder = 4;
    this.sparks.renderOrder = 5;
    this.scene.add(this.skidMarks, this.smoke, this.sparks);
  }

  update(car: THREE.Group, drifting: boolean, speed: number, driftDirection: number, dt: number): void {
    if (dt <= 0) return;
    const heading = car.rotation.y;
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const wheelHeight = car.position.y - 0.1;
    const wheels: [THREE.Vector3, THREE.Vector3] = [
      car.position.clone().addScaledVector(forward, -1.43).addScaledVector(right, -1.38).setY(wheelHeight),
      car.position.clone().addScaledVector(forward, -1.43).addScaledVector(right, 1.38).setY(wheelHeight)
    ];

    if (drifting && speed > 13.9) {
      const strength = THREE.MathUtils.clamp((speed - 13.9) / 34 + 0.35, 0.35, 1);
      this.spawnAccumulator += dt * this.smokeRate * strength;
      while (this.spawnAccumulator >= 1) {
        this.spawnSmoke(wheels[this.smokeCursor % 2]!, forward, right, strength);
        this.spawnAccumulator -= 1;
      }
      if (this.random() < dt * (7 + strength * 13)) {
        const outsideWheel = driftDirection >= 0 ? wheels[0] : wheels[1];
        this.spawnSpark(outsideWheel!, forward, right, driftDirection || 1);
      }
      if (this.previousWheels) {
        this.addSkidSegment(this.previousWheels[0], wheels[0]);
        this.addSkidSegment(this.previousWheels[1], wheels[1]);
      }
      this.previousWheels = [wheels[0].clone(), wheels[1].clone()];
    } else {
      this.spawnAccumulator = 0;
      this.previousWheels = undefined;
    }

    this.updateParticleSet(this.smokeParticles, this.smokePositions, this.smokeColors, dt, false);
    this.updateParticleSet(this.sparkParticles, this.sparkPositions, this.sparkColors, dt, true);
    (this.smokeGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.smokeGeometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnSmoke(origin: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3, strength: number): void {
    const particle = this.smokeParticles[this.smokeCursor % this.smokeParticles.length]!;
    this.smokeCursor += 1;
    particle.active = true;
    particle.age = 0;
    particle.life = 0.62 + this.random() * 0.52;
    particle.position.copy(origin);
    particle.position.x += (this.random() - 0.5) * 0.28;
    particle.position.y += 0.25 + this.random() * 0.16;
    particle.position.z += (this.random() - 0.5) * 0.28;
    particle.velocity.copy(forward).multiplyScalar(-(1.2 + this.random() * 2.1) * strength);
    particle.velocity.addScaledVector(right, (this.random() - 0.5) * 1.4);
    particle.velocity.y = 0.65 + this.random() * 1.05;
  }

  private spawnSpark(origin: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3, direction: number): void {
    const particle = this.sparkParticles[this.sparkCursor % this.sparkParticles.length]!;
    this.sparkCursor += 1;
    particle.active = true;
    particle.age = 0;
    particle.life = 0.18 + this.random() * 0.2;
    particle.position.copy(origin).addScaledVector(right, -Math.sign(direction) * 0.16);
    particle.position.y += 0.08;
    particle.velocity.copy(forward).multiplyScalar(-(2.5 + this.random() * 4));
    particle.velocity.addScaledVector(right, -Math.sign(direction) * (1 + this.random() * 2.5));
    particle.velocity.y = 0.9 + this.random() * 1.8;
  }

  private updateParticleSet(particles: Particle[], positions: Float32Array, colors: Float32Array, dt: number, sparks: boolean): void {
    particles.forEach((particle, index) => {
      const offset = index * 3;
      if (!particle.active) {
        positions[offset + 1] = -999;
        return;
      }
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.active = false;
        positions[offset + 1] = -999;
        return;
      }
      const life = 1 - particle.age / particle.life;
      particle.position.addScaledVector(particle.velocity, dt);
      if (sparks) particle.velocity.y -= 8.5 * dt;
      else particle.velocity.multiplyScalar(Math.pow(0.38, dt));
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      if (sparks) {
        colors[offset] = 1;
        colors[offset + 1] = 0.18 + life * 0.62;
        colors[offset + 2] = 0.02;
      } else {
        const shade = 0.34 + life * 0.66;
        colors[offset] = shade;
        colors[offset + 1] = shade * 0.98;
        colors[offset + 2] = shade * 0.95;
      }
    });
  }

  private addSkidSegment(from: THREE.Vector3, to: THREE.Vector3): void {
    if (from.distanceToSquared(to) > 4) return;
    const capacity = this.skidPositions.length / 6;
    const offset = (this.skidCursor % capacity) * 6;
    this.skidCursor += 1;
    this.skidCount = Math.min(capacity, this.skidCount + 1);
    this.skidPositions.set([from.x, from.y, from.z, to.x, to.y, to.z], offset);
    (this.skidGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.skidGeometry.setDrawRange(0, this.skidCount * 2);
  }

  private random(): number {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  dispose(): void {
    this.scene.remove(this.skidMarks, this.smoke, this.sparks);
    this.smokeGeometry.dispose();
    this.sparkGeometry.dispose();
    this.skidGeometry.dispose();
    this.smokeMaterial.dispose();
    this.sparkMaterial.dispose();
    this.skidMaterial.dispose();
    this.texture.dispose();
  }
}
