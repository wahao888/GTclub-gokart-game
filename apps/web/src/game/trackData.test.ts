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
});
