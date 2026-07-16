import { describe, expect, it } from "vitest";
import { finishCoastSpeed, getHandlingWorldScale, getSpeedSensation, getSteeringCalibration, getTrackPaceMultiplier, resolveKartCollision, resolveWallContact, wallEscapeHeading } from "./physics";

describe("vehicle physics helpers", () => {
  it("does not let an enlarged circuit mesh amplify steering sensitivity", () => {
    expect(getHandlingWorldScale(0.376)).toBeCloseTo(0.376);
    expect(getHandlingWorldScale(0.945)).toBeCloseTo(0.945);
    expect(getHandlingWorldScale(2.084)).toBe(0.95);
  });

  it("makes Hungaroring keyboard steering slower and less abrupt", () => {
    const fantasia = getSteeringCalibration("fantasia");
    const hungaroring = getSteeringCalibration("hungaroring");
    expect(hungaroring.inputResponse).toBeLessThan(fantasia.inputResponse);
    expect(hungaroring.yawMultiplier).toBeLessThan(fantasia.yawMultiplier * 0.55);
  });

  it("slows Hungaroring pace without changing the other circuits", () => {
    expect(getTrackPaceMultiplier("fantasia")).toBe(1);
    expect(getTrackPaceMultiplier("velocity")).toBe(1);
    expect(getTrackPaceMultiplier("hungaroring")).toBe(0.82);
  });

  it("keeps camera composition fixed while high speed adds vibration", () => {
    const low = getSpeedSensation(45);
    const fast = getSpeedSensation(280);
    expect(fast.fov).toBe(low.fov);
    expect(fast.chaseDistance).toBe(low.chaseDistance);
    expect(fast.cameraHeight).toBe(low.cameraHeight);
    expect(fast.lookAhead).toBe(low.lookAhead);
    expect(fast.intensity).toBeGreaterThan(0.9);
    expect(fast.shake).toBeGreaterThan(low.shake);
  });

  it("keeps a fixed camera during nitro while adding stronger vibration", () => {
    const fast = getSpeedSensation(280);
    const nitro = getSpeedSensation(280, true);
    expect(nitro.chaseDistance).toBe(fast.chaseDistance);
    expect(nitro.cameraHeight).toBe(fast.cameraHeight);
    expect(nitro.fov).toBe(fast.fov);
    expect(nitro.lookAhead).toBe(fast.lookAhead);
    expect(nitro.shake).toBeGreaterThan(fast.shake);
  });

  it("coasts before progressively applying the automatic finish brake", () => {
    const early = finishCoastSpeed(70, 0.5, 1);
    const late = finishCoastSpeed(70, 5.5, 1);
    expect(early).toBeGreaterThan(60);
    expect(late).toBeLessThan(early - 12);

    let raceSpeed = 78;
    for (let frame = 0; frame < 7 * 60; frame += 1) raceSpeed = finishCoastSpeed(raceSpeed, (frame + 1) / 60, 1 / 60);
    expect(raceSpeed).toBe(0);
  });

  it("transfers speed and separates overlapping cars", () => {
    const result = resolveKartCollision({
      playerDistance: 100,
      playerLateral: 0,
      playerSpeed: 70,
      opponentDistance: 103,
      opponentLateral: 0.5,
      opponentSpeed: 50
    });
    expect(result).not.toBeNull();
    expect(result!.playerSpeed).toBeLessThan(70);
    expect(result!.opponentSpeed).toBeGreaterThan(50);
    expect(result!.opponentDistance - result!.playerDistance).toBeGreaterThan(3);
    expect(Math.abs(result!.opponentLateral - result!.playerLateral)).toBeGreaterThan(0.5);
  });

  it("ignores cars outside the collision envelope", () => {
    expect(resolveKartCollision({ playerDistance: 0, playerLateral: 0, playerSpeed: 60, opponentDistance: 8, opponentLateral: 0, opponentSpeed: 50 })).toBeNull();
  });

  it("resolves side contact laterally without jumping along the track", () => {
    const result = resolveKartCollision({ playerDistance: 50, playerLateral: 0, playerSpeed: 60, opponentDistance: 50, opponentLateral: 2.2, opponentSpeed: 60 });
    expect(result).not.toBeNull();
    expect(result!.playerDistance).toBe(50);
    expect(result!.opponentDistance).toBe(50);
    expect(result!.opponentLateral - result!.playerLateral).toBeGreaterThan(2.2);
  });

  it("does not accelerate a struck kart beyond the kart hitting it", () => {
    const result = resolveKartCollision({ playerDistance: 103, playerLateral: 0, playerSpeed: 0, opponentDistance: 100, opponentLateral: 0.4, opponentSpeed: 60 });
    expect(result).not.toBeNull();
    expect(result!.playerSpeed).toBeLessThanOrEqual(60);
  });

  it("applies one wall impact and then keeps pushing the kart inward", () => {
    const first = resolveWallContact({ lateral: 19.7, lateralVelocity: 3, speed: 40, heading: -0.8, trackHeading: 0, wallCenterLimit: 19.35, previousSide: 0, reversing: false });
    expect(first).not.toBeNull();
    expect(first!.newImpact).toBe(true);
    expect(first!.speed).toBeCloseTo(26.4);
    expect(first!.lateral).toBeLessThan(19.35);
    expect(first!.lateralVelocity).toBeLessThan(0);
    expect(first!.heading).toBeGreaterThan(-0.2);

    const sustained = resolveWallContact({ lateral: 19.5, lateralVelocity: 1, speed: first!.speed, heading: first!.heading, trackHeading: 0, wallCenterLimit: 19.35, previousSide: 1, reversing: false });
    expect(sustained!.newImpact).toBe(false);
    expect(sustained!.speed).toBe(first!.speed);
  });

  it("mirrors the escape angle when reversing away from a wall", () => {
    expect(wallEscapeHeading(0, 1, false)).toBeGreaterThan(0);
    expect(wallEscapeHeading(0, 1, true)).toBeLessThan(0);
  });
});
