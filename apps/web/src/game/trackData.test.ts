import { describe, expect, it } from "vitest";
import { TRACKS } from "@f1-kart/shared";
import { TRACK_CURB_OUTER_WIDTH, TRACK_ROAD_HALF_WIDTH, TRACK_WALL_HALF_WIDTH, createTrackCurve } from "./trackData";

describe("track geometry", () => {
  it.each(TRACKS)("creates a smooth closed curve for $name", (track) => {
    const curve = createTrackCurve(track.id);
    const start = curve.getPointAt(0);
    const end = curve.getPointAt(1);
    expect(start.distanceTo(end)).toBeLessThan(0.001);
    expect(curve.getLength()).toBeGreaterThan(300);
    expect(curve.getTangentAt(0.25).length()).toBeCloseTo(1, 4);
  });

  it("uses a double-width road followed by curbs and an outer wall", () => {
    expect(TRACK_ROAD_HALF_WIDTH).toBeCloseTo(8.3 * 2, 5);
    expect(TRACK_CURB_OUTER_WIDTH).toBeGreaterThan(TRACK_ROAD_HALF_WIDTH);
    expect(TRACK_WALL_HALF_WIDTH).toBeGreaterThan(TRACK_CURB_OUTER_WIDTH);
  });

  it("keeps Fantasia turns wider than the complete road and shoulder", () => {
    const curve = createTrackCurve("fantasia");
    const sampleCount = 1_200;
    let minimumRadius = Infinity;

    for (let index = 0; index < sampleCount; index += 1) {
      const previous = curve.getPointAt(((index - 1 + sampleCount) % sampleCount) / sampleCount);
      const current = curve.getPointAt(index / sampleCount);
      const next = curve.getPointAt(((index + 1) % sampleCount) / sampleCount);
      const previousDistance = Math.hypot(previous.x - current.x, previous.z - current.z);
      const nextDistance = Math.hypot(next.x - current.x, next.z - current.z);
      const chordDistance = Math.hypot(next.x - previous.x, next.z - previous.z);
      const triangleArea = Math.abs(
        (current.x - previous.x) * (next.z - previous.z) -
        (current.z - previous.z) * (next.x - previous.x)
      ) / 2;
      const radius = triangleArea === 0
        ? Infinity
        : previousDistance * nextDistance * chordDistance / (4 * triangleArea);
      minimumRadius = Math.min(minimumRadius, radius);
    }

    expect(minimumRadius).toBeGreaterThan(TRACK_WALL_HALF_WIDTH);
  });

  it("alternates between left and right turns around Fantasia", () => {
    const curve = createTrackCurve("fantasia");
    const sampleCount = 1_200;
    const turnDirections: number[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const before = curve.getTangentAt(((index - 0.5 + sampleCount) % sampleCount) / sampleCount);
      const after = curve.getTangentAt(((index + 0.5) % sampleCount) / sampleCount);
      const signedTurn = before.x * after.z - before.z * after.x;
      if (Math.abs(signedTurn) > 0.0001) turnDirections.push(Math.sign(signedTurn));
    }

    let directionChanges = 0;
    for (let index = 1; index < turnDirections.length; index += 1) {
      if (turnDirections[index] !== turnDirections[index - 1]) directionChanges += 1;
    }
    if (turnDirections[0] !== turnDirections.at(-1)) directionChanges += 1;

    expect(directionChanges).toBeGreaterThanOrEqual(6);
  });
});
