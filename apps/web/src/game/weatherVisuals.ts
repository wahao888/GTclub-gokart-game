import type { Weather } from "@f1-kart/shared";

export interface WeatherVisualPreset {
  exposure: number;
  skyColor: number;
  fogMultiplier: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  keyIntensity: number;
  fillColor: number;
  fillIntensity: number;
}

export const WEATHER_VISUALS: Record<Weather, WeatherVisualPreset> = {
  clear: {
    exposure: 1.05,
    skyColor: 0x7ab8dc,
    fogMultiplier: 1,
    hemisphereSky: 0xcde8ff,
    hemisphereGround: 0x1a1922,
    hemisphereIntensity: 2.1,
    keyIntensity: 3.1,
    fillColor: 0xcfe5f2,
    fillIntensity: 0.18
  },
  cloudy: {
    exposure: 1.2,
    skyColor: 0x87949f,
    fogMultiplier: 0.76,
    hemisphereSky: 0xe3edf2,
    hemisphereGround: 0x4a5360,
    hemisphereIntensity: 2.35,
    keyIntensity: 2.45,
    fillColor: 0xd9e5ec,
    fillIntensity: 0.82
  },
  rain: {
    exposure: 0.94,
    skyColor: 0x34434f,
    fogMultiplier: 1.05,
    hemisphereSky: 0xaec4d2,
    hemisphereGround: 0x202833,
    hemisphereIntensity: 1.75,
    keyIntensity: 1.55,
    fillColor: 0xa9bdca,
    fillIntensity: 0.35
  }
};
