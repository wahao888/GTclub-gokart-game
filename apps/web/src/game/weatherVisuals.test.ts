import { describe, expect, it } from "vitest";
import { WEATHER_VISUALS } from "./weatherVisuals";

describe("weather visual presets", () => {
  it("keeps overcast conditions readable with bright diffuse light", () => {
    const clear = WEATHER_VISUALS.clear;
    const cloudy = WEATHER_VISUALS.cloudy;
    expect(cloudy.exposure).toBeGreaterThan(clear.exposure);
    expect(cloudy.hemisphereIntensity).toBeGreaterThan(clear.hemisphereIntensity);
    expect(cloudy.fillIntensity).toBeGreaterThan(clear.fillIntensity * 4);
    expect(cloudy.fogMultiplier).toBeLessThan(1);
  });

  it("still makes rain darker than cloudy weather", () => {
    expect(WEATHER_VISUALS.rain.exposure).toBeLessThan(WEATHER_VISUALS.cloudy.exposure);
    expect(WEATHER_VISUALS.rain.hemisphereIntensity).toBeLessThan(WEATHER_VISUALS.cloudy.hemisphereIntensity);
  });
});
