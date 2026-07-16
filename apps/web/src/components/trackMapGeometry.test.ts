import { describe, expect, it } from "vitest";
import { TRACKS } from "@f1-kart/shared";
import { getTrackMapPoint, TRACK_MAPS } from "./trackMapGeometry";

describe("track map geometry", () => {
  it.each(TRACKS)("projects $name into the minimap view box", (track) => {
    const map = TRACK_MAPS[track.id];
    expect(map.path.length).toBeGreaterThan(500);
    expect(map.points.length).toBeGreaterThan(300);
    map.points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(25);
      expect(point.x).toBeLessThanOrEqual(215);
      expect(point.y).toBeGreaterThanOrEqual(10);
      expect(point.y).toBeLessThanOrEqual(120);
      expect(Number.isFinite(point.angle)).toBe(true);
    });
  });

  it.each(TRACKS)("wraps $name racer positions after each lap", (track) => {
    const start = getTrackMapPoint(track.id, 0);
    const nextLap = getTrackMapPoint(track.id, 1);
    expect(nextLap.x).toBeCloseTo(start.x, 6);
    expect(nextLap.y).toBeCloseTo(start.y, 6);
  });
});
