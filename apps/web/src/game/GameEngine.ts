import * as THREE from "three";
import {
  TRACK_BY_ID,
  VEHICLES,
  calculateRewards,
  effectiveStats,
  seededRandom,
  type PartLevel,
  type PlayerStateV1,
  type Quality,
  type RaceConfig,
  type RaceResult,
  type RaceSnapshot,
  type VehicleId
} from "@f1-kart/shared";
import { createKart } from "./carFactory";
import { createAiDriverProfiles, type AiDriverProfile } from "./aiDriver";
import { DriftEffects } from "./DriftEffects";
import { finishCoastSpeed, getHandlingWorldScale, getSpeedSensation, resolveKartCollision, resolveWallContact, wallEscapeHeading } from "./physics";
import { TRACK_CURB_OUTER_WIDTH, TRACK_ROAD_HALF_WIDTH, TRACK_WALL_HALF_WIDTH, createTrackScene } from "./trackData";
import { WEATHER_VISUALS } from "./weatherVisuals";

type RacePhase = "countdown" | "racing" | "coasting" | "finished";

export interface GameTelemetry {
  speedKph: number;
  rpm: number;
  gear: string;
  lap: number;
  laps: number;
  position: number;
  racers: number;
  currentLapMs: number;
  totalTimeMs: number;
  bestLapMs?: number;
  fuel: number;
  tires: [number, number, number, number];
  boost: number;
  drs: boolean;
  drifting: boolean;
  wrongWay: boolean;
  timeGap: number;
  defensiveWake: boolean;
  lateralOffset: number;
  nitroActive: boolean;
  miniBoostActive: boolean;
  speedIntensity: number;
  racePhase: RacePhase;
  collisionPulse: number;
  aiSpeedSpreadKph: number;
  aiFieldSpreadMeters: number;
}

interface EngineCallbacks {
  onTelemetry: (telemetry: GameTelemetry) => void;
  onCountdown: (value: string | null) => void;
  onPause: (paused: boolean) => void;
  onFinish: (result: RaceResult) => void;
  onNetworkSnapshot?: (snapshot: Omit<RaceSnapshot, "playerId" | "serverTime">) => void;
}

interface AiCar {
  mesh: THREE.Group;
  distance: number;
  previousDistance: number;
  speed: number;
  previousSpeed: number;
  lateral: number;
  previousLateral: number;
  targetLateral: number;
  heading: number;
  previousHeading: number;
  lastLap: number;
  mistakeTimer: number;
  mistakeOffset: number;
  decisionTimer: number;
  passTimer: number;
  overtakeSide: -1 | 1;
  profile: AiDriverProfile;
  vehicleId: VehicleId;
}

class EngineAudio {
  private context?: AudioContext;
  private engineOscillator?: OscillatorNode;
  private subOscillator?: OscillatorNode;
  private masterGain?: GainNode;
  private filter?: BiquadFilterNode;
  constructor(private volume: number) {}
  enable(): void {
    if (this.context) { void this.context.resume(); return; }
    try {
      this.context = new AudioContext();
      this.engineOscillator = this.context.createOscillator();
      this.subOscillator = this.context.createOscillator();
      this.masterGain = this.context.createGain();
      this.filter = this.context.createBiquadFilter();
      const engineGain = this.context.createGain();
      const subGain = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();

      const harmonics = new Float32Array([0, 1, 0.46, 0.24, 0.13, 0.075, 0.04]);
      this.engineOscillator.setPeriodicWave(this.context.createPeriodicWave(new Float32Array(harmonics.length), harmonics));
      this.subOscillator.type = "triangle";
      this.engineOscillator.detune.value = -4;
      this.subOscillator.detune.value = 5;
      engineGain.gain.value = 0.38;
      subGain.gain.value = 0.72;
      this.filter.type = "lowpass";
      this.filter.frequency.value = 520;
      this.filter.Q.value = 2.4;
      compressor.threshold.value = -28;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.012;
      compressor.release.value = 0.2;
      this.masterGain.gain.value = 0.0001;

      this.engineOscillator.connect(engineGain).connect(this.filter);
      this.subOscillator.connect(subGain).connect(this.filter);
      this.filter.connect(compressor).connect(this.masterGain).connect(this.context.destination);
      this.engineOscillator.start();
      this.subOscillator.start();
    } catch { /* Audio is enhancement only. */ }
  }
  update(speedKph: number, throttle: boolean, racing: boolean): void {
    if (!this.context || !this.engineOscillator || !this.subOscillator || !this.masterGain || !this.filter) return;
    const now = this.context.currentTime;
    const gear = Math.min(7, Math.max(1, Math.ceil(Math.max(1, speedKph) / 42)));
    const withinGear = THREE.MathUtils.clamp((speedKph - (gear - 1) * 42) / 42, 0, 1);
    const engineTone = 48 + gear * 11 + withinGear * 48;
    this.engineOscillator.frequency.setTargetAtTime(engineTone, now, 0.055);
    this.subOscillator.frequency.setTargetAtTime(engineTone * 0.5, now, 0.075);
    this.filter.frequency.setTargetAtTime(430 + speedKph * 0.8 + withinGear * 330, now, 0.08);
    this.masterGain.gain.setTargetAtTime(racing ? this.volume * (throttle ? 0.095 : 0.05) : 0.0001, now, 0.08);
  }
  impact(strength: number): void {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(72 + Math.min(70, strength * 3), now);
    oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.16);
    gain.gain.setValueAtTime(Math.min(0.16, 0.035 + strength * 0.008) * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    oscillator.connect(gain).connect(this.masterGain);
    oscillator.start(now); oscillator.stop(now + 0.2);
  }
  dispose(): void { this.engineOscillator?.stop(); this.subOscillator?.stop(); void this.context?.close(); }
}

export class GameEngine {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(64, 1, 0.1, 900);
  private renderer: THREE.WebGLRenderer;
  private lastFrameTime = performance.now();
  private curve: THREE.CatmullRomCurve3;
  private rain?: THREE.Points;
  private playerCar: THREE.Group;
  private aiCars: AiCar[] = [];
  private remoteCars = new Map<string, { mesh: THREE.Group; snapshot: RaceSnapshot }>();
  private keys = new Set<string>();
  private rng: () => number;
  private audio: EngineAudio;
  private fixedAccumulator = 0;
  private readonly fixedStep = 1 / 60;
  private disposed = false;
  private paused = false;
  private phase: RacePhase = "countdown";
  private countdownElapsed = 0;
  private lastCountdown = "";
  private raceStartedAt = 0;
  private playerDistance = -42;
  private previousPlayerDistance = -42;
  private playerSpeed = 0;
  private previousPlayerSpeed = 0;
  private lateral = 0;
  private previousLateral = 0;
  private lateralVelocity = 0;
  private playerHeading = 0;
  private previousPlayerHeading = 0;
  private steeringInput = 0;
  private trackForwardSpeed = 0;
  private headingOffset = 0;
  private driftTime = 0;
  private wasDrifting = false;
  private boost = 40;
  private boostTimer = 0;
  private miniBoostTimer = 0;
  private counterSteerWindow = 0;
  private counterSteerDirection = 0;
  private driftDirection = 0;
  private boostFlames: THREE.Mesh[] = [];
  private boostRings: THREE.Mesh[] = [];
  private boostLight?: THREE.PointLight;
  private driftEffects: DriftEffects;
  private slipTimer = 0;
  private fuel = 100;
  private tires: [number, number, number, number] = [100, 100, 100, 100];
  private lastCompletedLap = 0;
  private lapStartedAt = 0;
  private lapTimes: number[] = [];
  private telemetryTimer = 0;
  private collisionCooldown = 0;
  private wasBeyondCurb = false;
  private wallContactSide: -1 | 0 | 1 = 0;
  private collisionShake = 0;
  private finishCoastElapsed = 0;
  private pendingResult?: RaceResult;
  private stats = {
    speedSum: 0, samples: 0, maxSpeed: 0, collisions: 0, offTrack: 0,
    longestDrift: 0, totalDrift: 0, boostUses: 0, brakeUsed: false, driftUsed: false,
    wrongWay: 0, airborne: 0, firstCheckpointPosition: 8, ledEveryCheckpoint: true,
    finalLapStartPosition: 8
  };
  private currentPosition = 8;
  private drs = false;
  private defensiveWake = false;
  private groundHeight = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    private container: HTMLElement,
    private config: RaceConfig,
    private vehicleId: VehicleId,
    private livery: PartLevel,
    private playerState: PlayerStateV1,
    private quality: Quality,
    private volume: number,
    private callbacks: EngineCallbacks
  ) {
    if (!document.createElement("canvas").getContext("webgl2")) throw new Error("WEBGL2_UNAVAILABLE");
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== "low", powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const weatherVisuals = WEATHER_VISUALS[config.weather];
    this.renderer.toneMappingExposure = weatherVisuals.exposure;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 1.75 : quality === "medium" ? 1.3 : 1));
    this.container.appendChild(this.renderer.domElement);
    const sky = weatherVisuals.skyColor;
    this.scene.background = new THREE.Color(sky);
    const fogDensity = config.trackId === "fantasia" ? 0.0045 : config.trackId === "hungaroring" ? 0.00145 : 0.003;
    this.scene.fog = new THREE.FogExp2(sky, fogDensity * weatherVisuals.fogMultiplier);
    this.rng = seededRandom(config.seed + 17);
    this.audio = new EngineAudio(volume);
    if (config.mode === "multiplayer") this.playerDistance = -42 - Math.max(0, config.gridPosition ?? 0) * 12;

    const track = createTrackScene(config.trackId, config.weather);
    this.curve = track.curve; this.rain = track.rain; this.scene.add(track.group);
    const startTangent = this.curve.getTangentAt(this.normalizedTrackPosition(this.playerDistance)).normalize();
    this.playerHeading = Math.atan2(startTangent.x, startTangent.z);
    this.previousPlayerDistance = this.playerDistance;
    this.previousPlayerHeading = this.playerHeading;
    const groundSize = config.trackId === "hungaroring" ? 2_600 : config.trackId === "fantasia" ? 1000 : 900;
    const groundColor = config.trackId === "velocity" ? 0x173b27 : config.trackId === "hungaroring" ? 0x315d36 : 0x151221;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.25; ground.receiveShadow = true; this.scene.add(ground);
    this.setupLighting();

    this.playerCar = createKart(vehicleId, livery, true);
    this.playerCar.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === "boost-flame") this.boostFlames.push(object);
      if (object instanceof THREE.Mesh && object.name === "boost-ring") this.boostRings.push(object);
      if (object instanceof THREE.PointLight && object.name === "boost-light") this.boostLight = object;
    });
    this.scene.add(this.playerCar);
    this.driftEffects = new DriftEffects(this.scene, quality, config.seed + 733);
    const candidates = VEHICLES.filter((vehicle) => vehicle.id !== vehicleId);
    const aiVehicles = config.mode === "multiplayer" ? [] : config.mode === "mock" ? candidates.slice(0, 2) : candidates;
    const driverProfiles = createAiDriverProfiles(aiVehicles.length, this.rng);
    const grid = [0, -12, -24, -34, -54, -66, -78];
    aiVehicles.forEach((vehicle, index) => {
      const mesh = createKart(vehicle.id, 0, false); this.scene.add(mesh);
      const distance = grid[index] ?? -80;
      const lateral = index % 2 ? 4.6 : -4.6;
      const tangent = this.curve.getTangentAt(this.normalizedTrackPosition(distance)).normalize();
      const heading = Math.atan2(tangent.x, tangent.z);
      this.aiCars.push({
        mesh, distance, previousDistance: distance, speed: 0, previousSpeed: 0,
        lateral, previousLateral: lateral, targetLateral: lateral, heading, previousHeading: heading,
        lastLap: 0, mistakeTimer: 0, mistakeOffset: 0,
        decisionTimer: 0.15 + this.rng() * 0.35, passTimer: 0, overtakeSide: index % 2 ? -1 : 1,
        profile: driverProfiles[index]!, vehicleId: vehicle.id
      });
    });
    this.updateTransforms(0, 1);

    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.renderer.setAnimationLoop(this.animate);
  }

  private setupLighting(): void {
    const weather = WEATHER_VISUALS[this.config.weather];
    const ambient = new THREE.HemisphereLight(weather.hemisphereSky, weather.hemisphereGround, weather.hemisphereIntensity); this.scene.add(ambient);
    const fill = new THREE.AmbientLight(weather.fillColor, weather.fillIntensity); this.scene.add(fill);
    const sunColor = this.config.trackId === "fantasia" ? 0xffad78 : this.config.trackId === "hungaroring" ? 0xfff4d6 : 0xffffff;
    const sun = new THREE.DirectionalLight(sunColor, weather.keyIntensity);
    sun.position.set(-65, 100, 45); sun.castShadow = this.quality !== "low"; sun.shadow.mapSize.set(this.quality === "high" ? 2048 : 1024, this.quality === "high" ? 2048 : 1024);
    sun.shadow.camera.left = -110; sun.shadow.camera.right = 110; sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110; this.scene.add(sun);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    this.audio.enable();
    if ((key === "escape" || key === "p") && !event.repeat && this.phase !== "finished") { this.setPaused(!this.paused); return; }
    if (key === "e" && !event.repeat && this.phase === "racing" && !this.paused && this.boost >= 40) {
      this.boost -= 40;
      this.boostTimer = 2.55;
      this.playerSpeed = Math.min(96, Math.max(0, this.playerSpeed) + 6.5);
      this.stats.boostUses += 1;
    }
    this.keys.add(key);
  };
  private onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
    // Capture the drift release at input time so a quick opposite tap cannot be
    // lost between two fixed physics frames.
    if (key === " " && this.driftTime >= 0.32 && this.driftDirection !== 0) {
      this.counterSteerWindow = 0.8;
      this.counterSteerDirection = -this.driftDirection;
    }
  };
  private onBlur = (): void => { this.keys.clear(); };

  setPaused(paused: boolean): void {
    this.paused = paused; this.keys.clear(); this.callbacks.onPause(paused);
    if (!paused) this.lastFrameTime = performance.now();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth); const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
  }

  private animate = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    if (!this.paused) {
      this.fixedAccumulator += delta;
      while (this.fixedAccumulator >= this.fixedStep) { this.fixedUpdate(this.fixedStep); this.fixedAccumulator -= this.fixedStep; }
      this.animateRain(delta);
    }
    const interpolation = THREE.MathUtils.clamp(this.fixedAccumulator / this.fixedStep, 0, 1);
    this.updateTransforms(this.paused ? 0 : delta, interpolation);
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private fixedUpdate(dt: number): void {
    if (this.phase === "countdown") { this.updateCountdown(dt); return; }
    if (this.phase === "finished") return;
    this.capturePreviousState();
    if (this.phase === "coasting") this.updateFinishCoast(dt);
    else {
      this.updatePlayer(dt);
      this.updateAi(dt);
      this.resolveAiCollisions();
      this.updateRace(dt);
    }
    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.08) { this.telemetryTimer = 0; this.emitTelemetry(); }
  }

  private capturePreviousState(): void {
    this.previousPlayerDistance = this.playerDistance;
    this.previousPlayerSpeed = this.playerSpeed;
    this.previousLateral = this.lateral;
    this.previousPlayerHeading = this.playerHeading;
    this.aiCars.forEach((ai) => {
      ai.previousDistance = ai.distance;
      ai.previousSpeed = ai.speed;
      ai.previousLateral = ai.lateral;
      ai.previousHeading = ai.heading;
    });
  }

  private updateCountdown(dt: number): void {
    this.countdownElapsed += dt;
    const value = this.countdownElapsed < 1 ? "3" : this.countdownElapsed < 2 ? "2" : this.countdownElapsed < 3 ? "1" : this.countdownElapsed < 3.75 ? "GO" : "";
    if (value !== this.lastCountdown) { this.lastCountdown = value; this.callbacks.onCountdown(value || null); }
    if (this.countdownElapsed >= 3.75) {
      this.phase = "racing"; this.raceStartedAt = performance.now(); this.lapStartedAt = this.raceStartedAt; this.callbacks.onCountdown(null);
    }
  }

  private updatePlayer(dt: number): void {
    const parts = this.playerState.partLevels[this.vehicleId];
    const stats = effectiveStats(this.vehicleId, parts, this.config.weather);
    const throttle = this.keys.has("w") || this.keys.has("arrowup");
    const brake = this.keys.has("s") || this.keys.has("arrowdown");
    const steer = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const drifting = this.keys.has(" ") && Math.abs(steer) > 0 && Math.abs(this.playerSpeed) > 13.9;
    const speedKph = Math.abs(this.playerSpeed) * 3.6;
    const normalizedSpeed = Math.min(1, speedKph / Math.max(1, stats.maxSpeedKph));

    this.defensiveWake = false;
    if (this.config.difficulty === "hard") {
      this.defensiveWake = this.aiCars.some((ai) => ai.distance - this.playerDistance > 0 && ai.distance - this.playerDistance < 8 && Math.abs(ai.lateral - this.lateral) < 2.5);
    }
    const t = this.normalizedTrackPosition(this.playerDistance);
    const inDrsZone = (t > 0.13 && t < 0.27) || (t > 0.59 && t < 0.72);
    const ahead = this.aiCars.filter((ai) => ai.distance > this.playerDistance).sort((a, b) => a.distance - b.distance)[0];
    this.drs = this.currentLap() >= 2 && this.config.weather !== "rain" && inDrsZone && !!ahead && (ahead.distance - this.playerDistance) / Math.max(20, this.playerSpeed) <= 1;
    let topSpeed = stats.maxSpeedKph / 3.6;
    if (this.boostTimer > 0) topSpeed *= 1.22;
    else if (this.miniBoostTimer > 0) topSpeed *= 1.08;
    if (this.drs) topSpeed *= 1.05;

    if (throttle) {
      let acceleration = stats.accelerationRate * (1 - normalizedSpeed * 0.72);
      if (this.boostTimer > 0) acceleration *= 2.3;
      else if (this.miniBoostTimer > 0) acceleration *= 1.5;
      if (this.defensiveWake) acceleration *= 0.96;
      if (this.playerSpeed < topSpeed) this.playerSpeed += acceleration * dt;
    } else if (this.playerSpeed > 0) this.playerSpeed = Math.max(0, this.playerSpeed - (1.9 + normalizedSpeed * 1.6) * dt);
    if (brake) {
      this.stats.brakeUsed = true;
      if (this.playerSpeed > 1) this.playerSpeed = Math.max(0, this.playerSpeed - stats.brakeRate * dt);
      else this.playerSpeed = Math.max(-9, this.playerSpeed - 5.5 * dt);
    }
    if (this.playerSpeed > topSpeed) this.playerSpeed = Math.max(topSpeed, this.playerSpeed - 9 * dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.miniBoostTimer = Math.max(0, this.miniBoostTimer - dt);
    this.counterSteerWindow = Math.max(0, this.counterSteerWindow - dt);

    const grip = stats.grip * (this.defensiveWake ? 0.94 : 1);
    const trackLength = TRACK_BY_ID[this.config.trackId].lengthKm * 1000;
    const worldScale = this.curve.getLength() / trackLength;
    const handlingWorldScale = getHandlingWorldScale(worldScale);
    const trackTangent = this.curve.getTangentAt(this.normalizedTrackPosition(this.playerDistance)).normalize();
    const trackNormal = new THREE.Vector3(-trackTangent.z, 0, trackTangent.x).normalize();
    const trackHeading = Math.atan2(trackTangent.x, trackTangent.z);
    const wallCenterLimit = TRACK_WALL_HALF_WIDTH - 1.85;
    const nearContactWall = this.wallContactSide !== 0 && Math.abs(this.lateral) > wallCenterLimit - 1.1;
    const reversingFromWall = this.playerSpeed < -0.5 || (brake && this.playerSpeed <= 1);

    // Smooth keyboard input into a front-wheel steering angle, then turn the body
    // with a bicycle-style yaw rate. The track only provides a weak heading assist.
    const steeringResponse = steer === 0 ? 10 : 8;
    this.steeringInput += THREE.MathUtils.clamp(steer - this.steeringInput, -steeringResponse * dt, steeringResponse * dt);
    const maximumSteeringAngle = THREE.MathUtils.lerp(0.5, 0.13, normalizedSpeed);
    const steeringAngle = this.steeringInput * maximumSteeringAngle;
    const visualSpeed = Math.abs(this.playerSpeed) * handlingWorldScale;
    // A stationary kart normally cannot yaw, but one resting against a wall
    // needs a little tyre scrub so steering input can actually free its nose.
    const steeringVisualSpeed = nearContactWall ? Math.max(visualSpeed, 4.8) : visualSpeed;
    let yawRate = steeringVisualSpeed / 3.8 * Math.tan(steeringAngle) * (0.92 + stats.handling * 0.028);
    yawRate = THREE.MathUtils.clamp(yawRate, -1.65, 1.65) * Math.sign(this.playerSpeed || 1);
    this.playerHeading -= yawRate * (drifting ? 1.28 : 1) * dt;

    const headingError = this.normalizeAngle(this.playerHeading - trackHeading);
    const assistStrength = drifting ? 0.03 : 0.34;
    if (Math.abs(this.lateral) < 6.8 && Math.abs(headingError) < 0.78 && Math.abs(this.playerSpeed) > 2) {
      this.playerHeading -= headingError * assistStrength * dt;
    }

    if (nearContactWall && this.wallContactSide !== 0) {
      const wallSide = this.wallContactSide as -1 | 1;
      const escapeHeading = wallEscapeHeading(trackHeading, wallSide, reversingFromWall);
      const inwardSteer = reversingFromWall ? wallSide : -wallSide;
      const recoveryRate = steer === inwardSteer ? 7 : steer === -inwardSteer ? 2.8 : 4.8;
      this.playerHeading = this.lerpAngle(this.playerHeading, escapeHeading, 1 - Math.exp(-dt * recoveryRate));
      this.headingOffset *= Math.pow(0.01, dt);
      this.lateralVelocity += -wallSide * 3.4 * dt;
    } else if (this.wallContactSide !== 0 && Math.abs(this.lateral) < wallCenterLimit - 1.1) {
      this.wallContactSide = 0;
    }

    if (drifting) {
      this.stats.driftUsed = true; this.driftTime += dt; this.stats.totalDrift += dt; this.stats.longestDrift = Math.max(this.stats.longestDrift, this.driftTime);
      this.driftDirection = Math.sign(steer);
      // Keep the nose committed to the corner while velocity lags behind it.
      // The larger, slower-building slip angle gives the rear end a readable slide.
      this.headingOffset += (steer * 0.43 - this.headingOffset) * Math.min(1, dt * 3.35);
    } else {
      if (this.wasDrifting) {
        if (this.driftTime >= 1) this.boost = Math.min(100, this.boost + 30);
        else if (this.driftTime >= 0.45) this.boost = Math.min(100, this.boost + 15);
        if (this.driftTime >= 0.32 && this.driftDirection !== 0) {
          this.counterSteerWindow = 0.8;
          this.counterSteerDirection = -this.driftDirection;
        }
      }
      this.driftTime = 0; this.headingOffset *= Math.pow(0.055, dt);
      if (this.counterSteerWindow > 0 && steer === this.counterSteerDirection) {
        this.miniBoostTimer = 0.8;
        this.playerSpeed = Math.min(90, Math.max(0, this.playerSpeed) + 3.5);
        this.counterSteerWindow = 0;
        this.counterSteerDirection = 0;
      }
    }
    this.wasDrifting = drifting;
    this.lateralVelocity *= Math.pow(drifting ? 0.56 : 0.08, dt * grip);
    if (this.slipTimer > 0) { this.slipTimer -= dt; this.lateralVelocity += Math.sin(this.slipTimer * 19) * 2.8 * dt; }
    else if (this.config.weather === "rain" && normalizedSpeed > 0.48 && Math.abs(steer) > 0 && this.rng() < 0.008 * dt) { this.slipTimer = 0.35 + this.rng() * 0.35; }

    const movementHeading = this.playerHeading + this.headingOffset;
    const movementDirection = new THREE.Vector3(Math.sin(movementHeading), 0, Math.cos(movementHeading));
    this.trackForwardSpeed = this.playerSpeed * movementDirection.dot(trackTangent);
    const trackLateralSpeed = this.playerSpeed * movementDirection.dot(trackNormal) * handlingWorldScale;
    this.playerDistance += this.trackForwardSpeed * dt;
    this.lateral += (trackLateralSpeed + this.lateralVelocity) * dt;

    const absoluteLateral = Math.abs(this.lateral);
    if (absoluteLateral > TRACK_ROAD_HALF_WIDTH) {
      const curbDepth = THREE.MathUtils.clamp((absoluteLateral - TRACK_ROAD_HALF_WIDTH) / (TRACK_CURB_OUTER_WIDTH - TRACK_ROAD_HALF_WIDTH), 0, 1);
      const rumbleMotion = THREE.MathUtils.clamp(Math.abs(this.playerSpeed) / 12, 0, 1);
      this.playerSpeed *= Math.pow(0.86, dt * (0.45 + curbDepth));
      this.collisionShake = Math.max(this.collisionShake, (0.018 + curbDepth * 0.035) * rumbleMotion);
      this.lateralVelocity += Math.sin(this.playerDistance * 0.78) * curbDepth * 0.045 * rumbleMotion;
    }
    const beyondCurb = absoluteLateral > TRACK_CURB_OUTER_WIDTH;
    if (beyondCurb) this.playerSpeed *= Math.pow(0.42, dt);
    if (beyondCurb && !this.wasBeyondCurb) this.stats.offTrack += 1;
    this.wasBeyondCurb = beyondCurb;

    const impactSpeed = Math.abs(this.playerSpeed);
    const wallContact = resolveWallContact({
      lateral: this.lateral,
      lateralVelocity: this.lateralVelocity,
      speed: this.playerSpeed,
      heading: this.playerHeading,
      trackHeading,
      wallCenterLimit,
      previousSide: this.wallContactSide,
      reversing: reversingFromWall
    });
    if (wallContact) {
      this.lateral = wallContact.lateral;
      this.lateralVelocity = wallContact.lateralVelocity;
      this.playerSpeed = wallContact.speed;
      this.playerHeading = wallContact.heading;
      this.headingOffset *= 0.2;
      this.wallContactSide = wallContact.side;
      if (wallContact.newImpact) {
        this.stats.collisions += 1;
        this.collisionCooldown = 0.35;
        this.audio.impact(impactSpeed * 0.24);
        this.collisionShake = Math.max(this.collisionShake, 0.26);
      }
    }
    this.collisionCooldown -= dt;
    this.stats.wrongWay += this.trackForwardSpeed < -1 ? dt : 0;
    this.fuel = Math.max(0, this.fuel - dt * (throttle ? 0.055 : 0.018) * (this.boostTimer > 0 ? 1.45 : 1));
    const wear = dt * (0.085 + normalizedSpeed * 0.08 + (drifting ? 0.32 : 0)) * stats.tireWearMultiplier * (this.config.weather === "rain" ? 1.28 : 1);
    this.tires = this.tires.map((value, index) => Math.max(0, value - wear * (index < 2 && Math.abs(steer) > 0 ? 1.16 : 1))) as [number, number, number, number];
    this.stats.speedSum += speedKph; this.stats.samples += 1; this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speedKph);
    this.audio.update(speedKph, throttle, true);
  }

  private updateAi(dt: number): void {
    const difficulty = this.config.difficulty;
    const coeff = difficulty === "easy" ? 0.86 : difficulty === "normal" ? 0.95 : 1.03;
    const chance = difficulty === "easy" ? 0.3 : difficulty === "normal" ? 0.16 : 0.08;
    const reactionTime = difficulty === "easy" ? 0.22 : difficulty === "normal" ? 0.14 : 0.08;
    const trackLength = TRACK_BY_ID[this.config.trackId].lengthKm * 1000;
    const worldScale = this.curve.getLength() / trackLength;
    this.aiCars.forEach((ai) => {
      const t = this.normalizedTrackPosition(ai.distance);
      const tangent = this.curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const future = this.curve.getTangentAt((t + 0.024) % 1).normalize();
      const corner = Math.min(0.5, tangent.angleTo(future) * 1.75);
      const turnDirection = Math.sign(new THREE.Vector3().crossVectors(tangent, future).y) || 1;
      const lap = Math.max(0, Math.floor(ai.distance / trackLength));
      if (lap > ai.lastLap) {
        ai.lastLap = lap;
        if (this.rng() < chance * ai.profile.mistakeFactor) {
          ai.mistakeTimer = 0.65 + this.rng() * 1.15;
          ai.mistakeOffset = (this.rng() - 0.5) * (4.5 + ai.profile.mistakeFactor * 1.8);
        }
      }
      if (ai.mistakeTimer > 0) ai.mistakeTimer -= dt; else ai.mistakeOffset *= Math.pow(0.1, dt);

      const competitors = [
        { distance: this.playerDistance, lateral: this.lateral, speed: this.playerSpeed },
        ...this.aiCars.filter((other) => other !== ai).map((other) => ({ distance: other.distance, lateral: other.lateral, speed: other.speed }))
      ];
      const ahead = competitors.filter((other) => other.distance > ai.distance && other.distance - ai.distance < 38).sort((a, b) => a.distance - b.distance)[0];
      const behind = competitors.filter((other) => other.distance < ai.distance && ai.distance - other.distance < 18).sort((a, b) => b.distance - a.distance)[0];

      ai.passTimer = Math.max(0, ai.passTimer - dt);
      ai.decisionTimer -= dt;
      if (ai.decisionTimer <= 0) {
        ai.decisionTimer = reactionTime + this.rng() * reactionTime * 0.65;
        const laneLimit = TRACK_ROAD_HALF_WIDTH - 2.5;
        const racingLine = THREE.MathUtils.clamp(-turnDirection * corner * 11.2, -6.2, 6.2);
        if (ai.passTimer <= 0) ai.targetLateral = racingLine + ai.profile.laneBias;

        if (ahead && ahead.distance - ai.distance < 26 && Math.abs(ahead.lateral - ai.lateral) < 4.4) {
          const leftCandidate = THREE.MathUtils.clamp(ahead.lateral - 5.4, -laneLimit, laneLimit);
          const rightCandidate = THREE.MathUtils.clamp(ahead.lateral + 5.4, -laneLimit, laneLimit);
          const leftBlocked = competitors.some((other) => other !== ahead && Math.abs(other.distance - ai.distance) < 12 && Math.abs(other.lateral - leftCandidate) < 3.5);
          const rightBlocked = competitors.some((other) => other !== ahead && Math.abs(other.distance - ai.distance) < 12 && Math.abs(other.lateral - rightCandidate) < 3.5);
          if (leftBlocked !== rightBlocked) ai.overtakeSide = leftBlocked ? 1 : -1;
          else if (Math.abs(ai.targetLateral - leftCandidate) + 0.25 < Math.abs(ai.targetLateral - rightCandidate)) ai.overtakeSide = -1;
          else if (Math.abs(ai.targetLateral - rightCandidate) + 0.25 < Math.abs(ai.targetLateral - leftCandidate)) ai.overtakeSide = 1;
          if (!leftBlocked || !rightBlocked) {
            ai.targetLateral = ai.overtakeSide < 0 ? leftCandidate : rightCandidate;
            ai.passTimer = 0.85 + ai.profile.aggression * 0.85;
          }
        } else if (ai.passTimer <= 0 && behind && difficulty !== "easy" && ai.distance - behind.distance < 11) {
          const defenseWeight = difficulty === "hard" ? 0.68 : 0.42;
          ai.targetLateral = THREE.MathUtils.lerp(ai.targetLateral, behind.lateral, defenseWeight);
        }
        ai.targetLateral = THREE.MathUtils.clamp(ai.targetLateral + ai.mistakeOffset, -laneLimit, laneLimit);
      }

      const previousLateral = ai.lateral;
      const laneRate = (difficulty === "easy" ? 2.4 : difficulty === "normal" ? 3.3 : 4.1) * ai.profile.aggression;
      ai.lateral += THREE.MathUtils.clamp(ai.targetLateral - ai.lateral, -laneRate * dt, laneRate * dt);
      const lateralRate = (ai.lateral - previousLateral) / Math.max(dt, 0.001);
      const visualForwardSpeed = Math.max(5, ai.speed * worldScale);
      ai.heading = Math.atan2(tangent.x * visualForwardSpeed + normal.x * lateralRate, tangent.z * visualForwardSpeed + normal.z * lateralRate);

      const vehicle = VEHICLES.find((entry) => entry.id === ai.vehicleId);
      const carBias = (vehicle?.stats.speed ?? 7) * 0.7;
      const formVariation = Math.sin(ai.distance * 0.0035 + ai.profile.pacePhase) * (1 - ai.profile.consistency) * 0.13;
      // Rubber-banding is deliberately tiny and only becomes noticeable after
      // a large gap. Individual driver pace remains the dominant factor.
      const competitionAssist = THREE.MathUtils.clamp((this.playerDistance - ai.distance) / 140, -1, 1) * 0.015;
      const normalizedCornerSkill = THREE.MathUtils.clamp((ai.profile.cornerSkill - 0.91) / 0.165, 0, 1);
      const cornerPenalty = THREE.MathUtils.lerp(1.06, 0.79, normalizedCornerSkill);
      let target = (61 + carBias) * coeff * (ai.profile.paceFactor + formVariation + competitionAssist) * (1 - corner * cornerPenalty) - (ai.mistakeTimer > 0 ? 5 + ai.profile.mistakeFactor * 2.5 : 0);
      if (ahead) {
        const gap = ahead.distance - ai.distance;
        const alongsidePassingLane = Math.abs(ahead.lateral - ai.lateral) > 3.45;
        const safeGap = 8.5 + ai.speed * 0.07 + (1 - ai.profile.aggression) * 3.5;
        if (!alongsidePassingLane && gap < safeGap * 1.7) {
          const followSpeed = ahead.speed + THREE.MathUtils.clamp((gap - safeGap) * 0.28, -4.5, 1.2);
          target = Math.min(target, followSpeed);
        } else if (gap < 22 && alongsidePassingLane) target += 2.4 * ai.profile.aggression;
      }
      const acceleration = (7.1 + (vehicle?.stats.acceleration ?? 7) * 0.12) * ai.profile.accelerationFactor;
      const deceleration = 9.5 + ai.profile.cornerSkill * 2.4;
      ai.speed += THREE.MathUtils.clamp(target - ai.speed, -deceleration * dt, acceleration * dt);
      ai.speed = Math.max(this.phase === "coasting" ? 8 : 22, ai.speed);
      ai.distance += ai.speed * dt;
    });
  }

  private resolveAiCollisions(): void {
    if (this.config.mode === "multiplayer") return;
    for (let first = 0; first < this.aiCars.length; first += 1) {
      for (let second = first + 1; second < this.aiCars.length; second += 1) {
        const a = this.aiCars[first]!;
        const b = this.aiCars[second]!;
        const collision = resolveKartCollision({
          playerDistance: a.distance, playerLateral: a.lateral, playerSpeed: a.speed,
          opponentDistance: b.distance, opponentLateral: b.lateral, opponentSpeed: b.speed
        });
        if (!collision) continue;
        a.distance = collision.playerDistance; a.lateral = collision.playerLateral; a.speed = collision.playerSpeed;
        b.distance = collision.opponentDistance; b.lateral = collision.opponentLateral; b.speed = collision.opponentSpeed;
        const laneLimit = TRACK_ROAD_HALF_WIDTH - 2.5;
        const separationSide = Math.sign(collision.playerLateralImpulse) || (first % 2 ? -1 : 1);
        a.targetLateral = THREE.MathUtils.clamp(a.lateral + separationSide * 2.6, -laneLimit, laneLimit);
        b.targetLateral = THREE.MathUtils.clamp(b.lateral - separationSide * 2.6, -laneLimit, laneLimit);
        a.passTimer = Math.max(a.passTimer, 0.75);
        b.passTimer = Math.max(b.passTimer, 0.75);
      }
    }
    this.aiCars.forEach((ai) => {
      const collision = resolveKartCollision({
        playerDistance: this.playerDistance,
        playerLateral: this.lateral,
        playerSpeed: this.playerSpeed,
        opponentDistance: ai.distance,
        opponentLateral: ai.lateral,
        opponentSpeed: ai.speed
      });
      if (!collision) return;
      this.playerDistance = collision.playerDistance;
      this.lateral = collision.playerLateral;
      this.playerSpeed = collision.playerSpeed;
      ai.distance = collision.opponentDistance;
      ai.lateral = collision.opponentLateral;
      ai.speed = collision.opponentSpeed;
      const laneLimit = TRACK_ROAD_HALF_WIDTH - 2.5;
      ai.targetLateral = THREE.MathUtils.clamp(ai.lateral + Math.sign(ai.lateral - this.lateral) * 1.4, -laneLimit, laneLimit);
      this.lateralVelocity += collision.playerLateralImpulse;
      this.playerHeading += collision.playerLateralImpulse * 0.018;
      this.headingOffset += collision.playerLateralImpulse * 0.012;
      this.collisionShake = Math.max(this.collisionShake, Math.min(0.42, 0.08 + collision.impactSpeed * 0.015));
      if (this.collisionCooldown <= 0) {
        this.stats.collisions += 1;
        this.collisionCooldown = 0.4;
        this.audio.impact(collision.impactSpeed);
      }
    });
  }

  private updateTransforms(dt: number, interpolation: number): void {
    const playerDistance = THREE.MathUtils.lerp(this.previousPlayerDistance, this.playerDistance, interpolation);
    const playerLateral = THREE.MathUtils.lerp(this.previousLateral, this.lateral, interpolation);
    const playerSpeed = THREE.MathUtils.lerp(this.previousPlayerSpeed, this.playerSpeed, interpolation);
    const playerHeading = this.lerpAngle(this.previousPlayerHeading, this.playerHeading, interpolation);
    this.placeCar(this.playerCar, playerDistance, playerLateral, playerSpeed, dt, playerHeading);
    const driftRoll = this.wasDrifting ? -this.driftDirection * 0.065 : 0;
    this.playerCar.rotation.z += (driftRoll - this.playerCar.rotation.z) * Math.min(1, dt * 8.5);
    this.playerCar.children.filter((child) => child.name === "front-wheel-pivot").forEach((pivot) => { pivot.rotation.y = -this.steeringInput * 0.42; });
    this.driftEffects.update(this.playerCar, this.wasDrifting, Math.abs(playerSpeed), this.driftDirection, dt);
    const boostActive = this.boostTimer > 0 || this.miniBoostTimer > 0;
    const nitroActive = this.boostTimer > 0;
    const effectClock = performance.now() * 0.001;
    this.boostFlames.forEach((flame, index) => {
      flame.visible = boostActive;
      if (!boostActive) return;
      const pulse = 0.9 + Math.sin(effectClock * 38 + index * 1.9) * 0.16;
      const width = nitroActive ? 1.32 : 0.92;
      flame.scale.set(width, (nitroActive ? 2.75 : 1.02) * pulse, width);
      const material = flame.material as THREE.MeshBasicMaterial;
      material.color.set(nitroActive ? (index % 2 ? 0xbc63ff : 0x55eaff) : 0xffb52e);
      material.opacity = nitroActive ? 0.96 : 0.78;
    });
    this.boostRings.forEach((ring, index) => {
      ring.visible = nitroActive;
      if (!nitroActive) return;
      const phase = (effectClock * 1.65 + index / this.boostRings.length) % 1;
      ring.position.z = -3.2 - phase * 5.8;
      const scale = 0.72 + phase * 2.45;
      ring.scale.setScalar(scale);
      ring.rotation.z = effectClock * (index % 2 ? 1.7 : -1.45);
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = Math.pow(1 - phase, 1.35) * 0.74;
    });
    if (this.boostLight) {
      this.boostLight.intensity = nitroActive ? 6.2 + Math.sin(effectClock * 31) * 1.1 : this.miniBoostTimer > 0 ? 2.5 : 0;
      this.boostLight.distance = nitroActive ? 17 : 8;
      this.boostLight.color.set(nitroActive ? 0x61eaff : 0xffb52e);
    }
    this.aiCars.forEach((ai) => this.placeCar(
      ai.mesh,
      THREE.MathUtils.lerp(ai.previousDistance, ai.distance, interpolation),
      THREE.MathUtils.lerp(ai.previousLateral, ai.lateral, interpolation),
      THREE.MathUtils.lerp(ai.previousSpeed, ai.speed, interpolation),
      dt,
      this.lerpAngle(ai.previousHeading, ai.heading, interpolation)
    ));
    this.remoteCars.forEach(({ mesh, snapshot }) => {
      mesh.position.lerp(new THREE.Vector3(...snapshot.position), Math.min(1, dt * 11));
      mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, snapshot.rotation, Math.min(1, dt * 11));
    });
  }

  private placeCar(car: THREE.Group, distance: number, lateral: number, speed: number, dt: number, absoluteHeading?: number): void {
    const t = this.normalizedTrackPosition(distance); const p = this.curve.getPointAt(t); const tangent = this.curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(); const pos = p.clone().addScaledVector(normal, lateral); pos.y += 0.18;
    car.position.copy(pos); car.rotation.y = absoluteHeading ?? Math.atan2(tangent.x, tangent.z);
    car.traverse((child) => { if (child.name === "rolling-wheel") child.rotateY(-speed * dt * 0.9); });
    if (car === this.playerCar) this.groundHeight = p.y;
  }

  private updateCamera(dt: number): void {
    if (!this.playerCar) return;
    const p = this.playerCar.position;
    const renderHeading = this.playerCar.rotation.y;
    const forward = new THREE.Vector3(Math.sin(renderHeading), 0, Math.cos(renderHeading));
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const sensation = getSpeedSensation(Math.abs(this.playerSpeed) * 3.6, this.boostTimer > 0, this.miniBoostTimer > 0);
    const desired = p.clone().addScaledVector(forward, -sensation.chaseDistance).addScaledVector(side, this.headingOffset * 1.8);
    desired.y += sensation.cameraHeight;
    this.collisionShake *= Math.pow(0.035, dt);
    const driftShake = this.wasDrifting ? 0.025 : 0;
    const shake = sensation.shake + this.collisionShake + driftShake;
    const clock = performance.now() * 0.001;
    desired.addScaledVector(side, Math.sin(clock * 37) * shake);
    desired.y += Math.sin(clock * 43 + 0.7) * shake * 0.62;
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 9.5));
    const target = p.clone().addScaledVector(forward, sensation.lookAhead); target.y += 1.15; this.camera.lookAt(target);
    this.camera.fov += (sensation.fov - this.camera.fov) * Math.min(1, dt * 5.8); this.camera.updateProjectionMatrix();
  }

  private updateRace(_dt: number): void {
    const trackLength = TRACK_BY_ID[this.config.trackId].lengthKm * 1000;
    const completed = Math.max(0, Math.floor(this.playerDistance / trackLength));
    const remoteProgress = [...this.remoteCars.values()].map(({ snapshot }) => ({ player: false, distance: Math.max(0, snapshot.lap - 1) * trackLength + snapshot.checkpoint / TRACK_BY_ID[this.config.trackId].checkpointCount * trackLength }));
    const sorted = [{ player: true, distance: this.playerDistance }, ...this.aiCars.map((ai) => ({ player: false, distance: ai.distance })), ...remoteProgress].sort((a, b) => b.distance - a.distance);
    this.currentPosition = sorted.findIndex((entry) => entry.player) + 1;
    if (this.playerDistance >= 0 && this.playerDistance < trackLength / TRACK_BY_ID[this.config.trackId].checkpointCount) this.stats.firstCheckpointPosition = this.currentPosition;
    if (this.currentPosition !== 1) this.stats.ledEveryCheckpoint = false;
    if (this.currentLap() === this.config.lapCount && this.stats.finalLapStartPosition === 8) this.stats.finalLapStartPosition = this.currentPosition;
    if (completed > this.lastCompletedLap) {
      const now = performance.now(); const lapTime = now - this.lapStartedAt; const oldPb = this.playerState.bestLaps[this.config.trackId] ?? Infinity;
      this.lapTimes.push(lapTime); this.lastCompletedLap = completed; this.lapStartedAt = now;
      if (lapTime < oldPb) this.playerState.bestLaps[this.config.trackId] = lapTime;
    }
    if (this.playerDistance >= trackLength * this.config.lapCount) this.finishRace();
  }

  private updateFinishCoast(dt: number): void {
    this.finishCoastElapsed += dt;
    const previousSpeed = this.playerSpeed;
    this.playerSpeed = finishCoastSpeed(this.playerSpeed, this.finishCoastElapsed, dt);
    const tangent = this.curve.getTangentAt(this.normalizedTrackPosition(this.playerDistance)).normalize();
    const trackHeading = Math.atan2(tangent.x, tangent.z);
    const headingError = this.normalizeAngle(this.playerHeading - trackHeading);
    this.playerHeading -= headingError * Math.min(1, dt * 2.2);
    this.headingOffset *= Math.pow(0.025, dt);
    this.steeringInput *= Math.pow(0.015, dt);
    this.lateral += (0 - this.lateral) * (1 - Math.exp(-dt * 0.68));
    this.trackForwardSpeed = this.playerSpeed;
    this.playerDistance += (previousSpeed + this.playerSpeed) * 0.5 * dt;
    this.boostTimer = 0;
    this.miniBoostTimer = 0;
    this.drs = false;
    this.wasDrifting = false;
    this.audio.update(this.playerSpeed * 3.6, false, true);
    this.updateAi(dt);

    if (this.playerSpeed <= 0.45 || this.finishCoastElapsed >= 7) {
      this.playerSpeed = 0;
      this.phase = "finished";
      this.audio.update(0, false, false);
      this.emitTelemetry();
      const result = this.pendingResult;
      if (result) window.setTimeout(() => this.callbacks.onFinish(result), 450);
    }
  }

  private finishRace(): void {
    if (this.phase !== "racing") return;
    const totalTimeMs = performance.now() - this.raceStartedAt;
    const fastestLap = this.currentPosition <= 2;
    const rewards = calculateRewards(this.currentPosition, this.config, fastestLap, this.playerState.winStreak, this.playerState.dailyEarnings.coins);
    const ahead = this.aiCars.filter((ai) => ai.distance > this.playerDistance).sort((a, b) => a.distance - b.distance)[0];
    const gap = ahead ? Math.abs(ahead.distance - this.playerDistance) / Math.max(1, ahead.speed) * 1000 : 80 + this.rng() * 1400;
    this.pendingResult = {
      config: this.config,
      position: this.currentPosition,
      totalRacers: this.config.mode === "multiplayer" ? Math.max(1, this.remoteCars.size + 1) : 8,
      totalTimeMs,
      laps: this.lapTimes.slice(0, this.config.lapCount).map((timeMs, index) => ({ lap: index + 1, timeMs, personalBest: timeMs <= (this.playerState.bestLaps[this.config.trackId] ?? Infinity) })),
      fastestLap,
      telemetry: {
        averageSpeedKph: this.stats.speedSum / Math.max(1, this.stats.samples), maxSpeedKph: this.stats.maxSpeed, collisions: this.stats.collisions, offTrackCount: this.stats.offTrack,
        longestDriftSeconds: this.stats.longestDrift, totalDriftSeconds: this.stats.totalDrift, boostUses: this.stats.boostUses, fuelRemaining: this.fuel, tireWear: [...this.tires] as [number, number, number, number],
        brakeUsed: this.stats.brakeUsed, driftUsed: this.stats.driftUsed, wrongWaySeconds: this.stats.wrongWay, airborneSeconds: this.stats.airborne,
        firstCheckpointPosition: this.stats.firstCheckpointPosition, ledEveryCheckpoint: this.stats.ledEveryCheckpoint,
        finalLapPositionsGained: Math.max(0, this.stats.finalLapStartPosition - this.currentPosition), finishGapMs: gap
      },
      rewards
    };
    this.phase = "coasting";
    this.finishCoastElapsed = 0;
    this.keys.clear();
    this.boostTimer = 0;
    this.miniBoostTimer = 0;
  }

  private emitTelemetry(): void {
    const speedKph = Math.abs(this.playerSpeed) * 3.6; const gearNumber = Math.min(7, Math.max(1, Math.ceil(speedKph / 42)));
    const ahead = this.aiCars.filter((ai) => ai.distance > this.playerDistance).sort((a, b) => a.distance - b.distance)[0];
    const sensation = getSpeedSensation(speedKph, this.boostTimer > 0, this.miniBoostTimer > 0);
    const aiSpeeds = this.aiCars.map((ai) => ai.speed * 3.6);
    const aiDistances = this.aiCars.map((ai) => ai.distance);
    const aiSpeedSpreadKph = aiSpeeds.length > 1 ? Math.max(...aiSpeeds) - Math.min(...aiSpeeds) : 0;
    const aiFieldSpreadMeters = aiDistances.length > 1 ? Math.max(...aiDistances) - Math.min(...aiDistances) : 0;
    this.callbacks.onTelemetry({
      speedKph, rpm: Math.round(5000 + ((speedKph % 42) / 42) * 8500), gear: this.playerSpeed < -1 ? "R" : this.playerSpeed < 1 ? "N" : String(gearNumber),
      lap: this.currentLap(), laps: this.config.lapCount, position: this.currentPosition, racers: this.config.mode === "multiplayer" ? Math.max(1, this.remoteCars.size + 1) : 8,
      currentLapMs: this.phase === "racing" ? performance.now() - this.lapStartedAt : this.lapTimes[this.lapTimes.length - 1] ?? 0,
      totalTimeMs: this.phase === "racing" ? performance.now() - this.raceStartedAt : this.pendingResult?.totalTimeMs ?? 0,
      bestLapMs: this.playerState.bestLaps[this.config.trackId], fuel: this.fuel, tires: [...this.tires] as [number, number, number, number], boost: this.boost,
      drs: this.drs, drifting: this.wasDrifting, wrongWay: this.playerSpeed < -1, timeGap: ahead ? (ahead.distance - this.playerDistance) / Math.max(1, ahead.speed) : 0,
      defensiveWake: this.defensiveWake,
      lateralOffset: this.lateral,
      nitroActive: this.boostTimer > 0,
      miniBoostActive: this.miniBoostTimer > 0,
      speedIntensity: sensation.intensity,
      racePhase: this.phase,
      collisionPulse: THREE.MathUtils.clamp(this.collisionShake / 0.42, 0, 1),
      aiSpeedSpreadKph,
      aiFieldSpreadMeters
    });
    if (this.config.mode === "multiplayer" && this.callbacks.onNetworkSnapshot) {
      const checkpoint = Math.floor(this.normalizedTrackPosition(this.playerDistance) * TRACK_BY_ID[this.config.trackId].checkpointCount);
      this.callbacks.onNetworkSnapshot({
        vehicleId: this.vehicleId, livery: this.livery, position: [this.playerCar.position.x, this.playerCar.position.y, this.playerCar.position.z],
        rotation: this.playerCar.rotation.y, speed: speedKph, lap: this.currentLap(), checkpoint, rank: this.currentPosition, finished: this.phase === "coasting" || this.phase === "finished"
      });
    }
  }

  setRemoteSnapshots(snapshots: RaceSnapshot[]): void {
    const active = new Set(snapshots.map((snapshot) => snapshot.playerId));
    snapshots.forEach((snapshot) => {
      const existing = this.remoteCars.get(snapshot.playerId);
      if (existing) { existing.snapshot = snapshot; return; }
      const mesh = createKart(snapshot.vehicleId, snapshot.livery, false);
      mesh.position.set(...snapshot.position); mesh.rotation.y = snapshot.rotation; this.scene.add(mesh);
      this.remoteCars.set(snapshot.playerId, { mesh, snapshot });
    });
    this.remoteCars.forEach(({ mesh }, id) => { if (!active.has(id)) { this.scene.remove(mesh); this.remoteCars.delete(id); } });
  }

  private currentLap(): number {
    const trackLength = TRACK_BY_ID[this.config.trackId].lengthKm * 1000;
    return Math.min(this.config.lapCount, Math.max(1, Math.floor(Math.max(0, this.playerDistance) / trackLength) + 1));
  }
  private normalizedTrackPosition(distance: number): number {
    const length = TRACK_BY_ID[this.config.trackId].lengthKm * 1000;
    return ((distance % length) + length) % length / length;
  }
  private lerpAngle(from: number, to: number, amount: number): number { return from + this.normalizeAngle(to - from) * amount; }
  private normalizeAngle(angle: number): number { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
  private animateRain(dt: number): void {
    if (!this.rain) return;
    const attribute = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i += 1) { let y = attribute.getY(i) - dt * 42; if (y < 0) y = 45 + this.rng() * 10; attribute.setY(i, y); }
    attribute.needsUpdate = true; this.rain.position.x = this.playerCar.position.x; this.rain.position.z = this.playerCar.position.z;
  }

  dispose(): void {
    this.disposed = true; this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown); window.removeEventListener("keyup", this.onKeyUp); window.removeEventListener("blur", this.onBlur);
    this.driftEffects.dispose();
    this.audio.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => { const map = (material as THREE.MeshStandardMaterial).map; map?.dispose(); material.dispose(); });
      }
    });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
