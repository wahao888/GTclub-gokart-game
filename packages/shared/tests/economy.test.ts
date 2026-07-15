import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, calculateRewards, createDefaultPlayerState, effectiveStats, evaluateAchievements, pickWeather, upgradePart } from "../src";

describe("economy and progression", () => {
  it("creates all limited-free cars and selects the first team car", () => {
    const state = createDefaultPlayerState("2026-07-15");
    expect(state.coins).toBe(1500);
    expect(state.ownedVehicleIds).toEqual([
      "gate-oracle-rb",
      "titan-gt-3",
      "storm-apex",
      "velocity-v10",
      "nova-se-200",
      "omega-legacy",
      "zenith-sfx-400",
      "oracle-rb20",
      "phantom-f1",
    ]);
    expect(state.selectedVehicleId).toBe("gate-oracle-rb");
  });
  it("applies rain and upgrades to effective stats", () => {
    const state = createDefaultPlayerState();
    const clear = effectiveStats("oracle-rb20", state.partLevels["oracle-rb20"], "clear");
    state.partLevels["oracle-rb20"].power = 3;
    const rain = effectiveStats("oracle-rb20", state.partLevels["oracle-rb20"], "rain");
    expect(rain.maxSpeedKph).toBeLessThan(clear.maxSpeedKph);
    expect(rain.accelerationRate).toBeLessThan(clear.accelerationRate);
  });
  it("charges the correct part price", () => {
    const state = createDefaultPlayerState();
    expect(upgradePart(state, "oracle-rb20", "power")).toBe(true);
    expect(state.coins).toBe(900);
    expect(state.partLevels["oracle-rb20"].power).toBe(1);
  });
  it("caps daily race coins", () => {
    const rewards = calculateRewards(1, { trackId:"velocity",lapCount:5,difficulty:"hard",weather:"rain",seed:1,mode:"single" }, true, 3, 4900);
    expect(rewards.awardedCoins).toBe(100);
    expect(rewards.capped).toBe(true);
  });
  it("has exactly 44 unique achievements", () => {
    expect(ACHIEVEMENTS).toHaveLength(44);
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(44);
    const state = createDefaultPlayerState(); state.stats.races = 1;
    expect(evaluateAchievements(state).some((item) => item.id === "finish-1")).toBe(true);
  });
  it("uses deterministic weather", () => {
    expect(pickWeather(123456)).toBe(pickWeather(123456));
  });
});
