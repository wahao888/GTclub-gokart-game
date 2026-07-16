import type { TrackId } from "@f1-kart/shared";

export interface SpeedSensation {
  intensity: number;
  fov: number;
  chaseDistance: number;
  cameraHeight: number;
  lookAhead: number;
  shake: number;
}

export interface KartCollisionState {
  playerDistance: number;
  playerLateral: number;
  playerSpeed: number;
  opponentDistance: number;
  opponentLateral: number;
  opponentSpeed: number;
}

export interface KartCollisionResult extends KartCollisionState {
  playerLateralImpulse: number;
  impactSpeed: number;
}

export interface WallContactState {
  lateral: number;
  lateralVelocity: number;
  speed: number;
  heading: number;
  trackHeading: number;
  wallCenterLimit: number;
  previousSide: -1 | 0 | 1;
  reversing: boolean;
}

export interface WallContactResult {
  lateral: number;
  lateralVelocity: number;
  speed: number;
  heading: number;
  side: -1 | 1;
  newImpact: boolean;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (value: number): number => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function getHandlingWorldScale(worldScale: number): number {
  // Large circuit meshes may be expanded so a wide kart road does not pinch
  // at hairpins. That visual expansion must not amplify steering or lane drift.
  return clamp(worldScale, 0.25, 0.95);
}

export interface SteeringCalibration {
  inputResponse: number;
  yawMultiplier: number;
}

export function getSteeringCalibration(trackId: TrackId): SteeringCalibration {
  // Hungaroring has a dense sequence of technical corners. Keyboard input is
  // deliberately ramped more slowly and its final yaw is reduced so a short
  // tap cannot snap the kart across the widened road.
  return trackId === "hungaroring"
    ? { inputResponse: 3.6, yawMultiplier: 0.52 }
    : { inputResponse: 8, yawMultiplier: 1 };
}

export function getTrackPaceMultiplier(trackId: TrackId): number {
  // The Hungaroring mesh is visually larger than its timing distance. A lower
  // pace keeps the perceived speed readable while retaining a sub-three-minute lap.
  return trackId === "hungaroring" ? 0.82 : 1;
}

export function getSpeedSensation(speedKph: number, nitro = false, miniBoost = false): SpeedSensation {
  // Perception ramps non-linearly through vibration while the lens, position
  // and look target stay fixed, keeping the kart at one screen distance.
  const normalized = smoothstep((Math.max(0, speedKph) - 25) / 265);
  const intensity = Math.pow(normalized, 0.82);
  return {
    intensity,
    fov: 58,
    chaseDistance: 8.4,
    cameraHeight: 4.05,
    lookAhead: 5.5,
    shake: Math.max(0, (intensity - 0.58) / 0.42) * 0.045 + (nitro ? 0.065 : miniBoost ? 0.018 : 0)
  };
}

export function finishCoastSpeed(speed: number, elapsedSeconds: number, dt: number): number {
  const forwardSpeed = Math.max(0, speed);
  const automaticBrake = smoothstep((elapsedSeconds - 1.1) / 4.5) * 18;
  const rollingAndAeroDrag = 0.55 + forwardSpeed * forwardSpeed * 0.00065;
  return Math.max(0, forwardSpeed - (rollingAndAeroDrag + automaticBrake) * dt);
}

const normalizeAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

export function wallEscapeHeading(trackHeading: number, side: -1 | 1, reversing: boolean): number {
  // Positive lateral lies on the curve normal. Forward motion needs the nose
  // pointed toward the opposite normal; reverse uses the mirrored angle.
  return trackHeading + side * (reversing ? -0.3 : 0.3);
}

export function resolveWallContact(state: WallContactState): WallContactResult | null {
  if (Math.abs(state.lateral) <= state.wallCenterLimit) return null;
  const side = (state.lateral >= 0 ? 1 : -1) as -1 | 1;
  const newImpact = state.previousSide !== side;
  const targetHeading = wallEscapeHeading(state.trackHeading, side, state.reversing);
  const headingBlend = newImpact ? 0.78 : 0.34;
  return {
    lateral: side * (state.wallCenterLimit - 0.32),
    lateralVelocity: -side * Math.max(0.9, Math.abs(state.lateralVelocity) * 0.36),
    speed: newImpact ? state.speed * 0.66 : state.speed,
    heading: state.heading + normalizeAngle(targetHeading - state.heading) * headingBlend,
    side,
    newImpact
  };
}

export function resolveKartCollision(state: KartCollisionState): KartCollisionResult | null {
  const longitudinalRadius = 4.8;
  const lateralRadius = 2.85;
  const distanceDelta = state.opponentDistance - state.playerDistance;
  const lateralDelta = state.opponentLateral - state.playerLateral;
  const longitudinalOverlap = longitudinalRadius - Math.abs(distanceDelta);
  const lateralOverlap = lateralRadius - Math.abs(lateralDelta);
  if (longitudinalOverlap <= 0 || lateralOverlap <= 0) return null;

  const side = lateralDelta === 0 ? (distanceDelta >= 0 ? 1 : -1) : Math.sign(lateralDelta);
  const playerBehind = distanceDelta >= 0;
  const closingSpeed = playerBehind
    ? Math.max(0, state.playerSpeed - state.opponentSpeed)
    : Math.max(0, state.opponentSpeed - state.playerSpeed);
  const contactWeight = clamp(1 - Math.abs(lateralDelta) / lateralRadius, 0.18, 1);
  const impactSpeed = closingSpeed * contactWeight;
  const bumperContact = longitudinalOverlap / longitudinalRadius < lateralOverlap / lateralRadius;

  let playerSpeed = state.playerSpeed;
  let opponentSpeed = state.opponentSpeed;
  let playerDistance = state.playerDistance;
  let opponentDistance = state.opponentDistance;
  if (bumperContact && playerBehind) {
    playerSpeed = Math.max(0, playerSpeed - impactSpeed * 0.58);
    opponentSpeed = Math.max(0, opponentSpeed + impactSpeed * 0.34);
    playerDistance -= longitudinalOverlap * 0.48;
    opponentDistance += longitudinalOverlap * 0.52;
  } else if (bumperContact) {
    playerSpeed = Math.max(0, Math.min(state.opponentSpeed, playerSpeed + impactSpeed * 0.3));
    opponentSpeed = Math.max(0, opponentSpeed - impactSpeed * 0.62);
    playerDistance += longitudinalOverlap * 0.52;
    opponentDistance -= longitudinalOverlap * 0.48;
  } else {
    // Door-to-door contact scrubs a little speed but resolves mainly sideways;
    // it must not teleport either kart forward or backward along the circuit.
    playerSpeed *= 0.985;
    opponentSpeed *= 0.985;
  }

  const separation = lateralOverlap * (bumperContact ? 0.28 : 0.56);
  return {
    playerDistance,
    playerLateral: clamp(state.playerLateral - side * separation, -19.2, 19.2),
    playerSpeed,
    opponentDistance,
    opponentLateral: clamp(state.opponentLateral + side * separation, -18.8, 18.8),
    opponentSpeed,
    playerLateralImpulse: -side * (1.5 + impactSpeed * 0.1),
    impactSpeed
  };
}
