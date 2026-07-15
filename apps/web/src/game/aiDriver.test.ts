import { describe, expect, it } from "vitest";
import { createAiDriverProfiles } from "./aiDriver";

function fixedRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("AI driver roster", () => {
  it("creates a reproducible field with meaningfully different pace", () => {
    const first = createAiDriverProfiles(7, fixedRandom(42));
    const repeat = createAiDriverProfiles(7, fixedRandom(42));
    expect(first).toEqual(repeat);
    const pace = first.map((driver) => driver.paceFactor);
    expect(Math.max(...pace) - Math.min(...pace)).toBeGreaterThan(0.08);
  });

  it("gives drivers different lines, consistency, and corner traits", () => {
    const drivers = createAiDriverProfiles(7, fixedRandom(91));
    const lanes = drivers.map((driver) => driver.laneBias);
    expect(new Set(lanes.map((lane) => lane.toFixed(2))).size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...lanes) - Math.min(...lanes)).toBeGreaterThan(3.5);
    expect(Math.max(...drivers.map((driver) => driver.cornerSkill))).toBeGreaterThan(Math.min(...drivers.map((driver) => driver.cornerSkill)) + 0.04);
    expect(drivers.every((driver) => driver.consistency >= 0.76 && driver.consistency <= 0.97)).toBe(true);
  });
});
