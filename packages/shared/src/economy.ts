import { DEFAULT_VEHICLE_ID, DIFFICULTY_MULTIPLIER, PART_COSTS, POSITION_COINS, POSITION_XP, VEHICLES, VEHICLE_BY_ID } from "./data";
import type { EffectiveVehicleStats, PartLevel, PartType, PlayerStateV1, RaceConfig, RewardBreakdown, VehicleId, Weather } from "./types";

export const DAILY_COIN_CAP = 5000;
export const PLAYER_STORAGE_KEY = "f1-kart.player.v1";
export const SETTINGS_STORAGE_KEY = "f1-kart.settings.v1";

const blankParts = (): Record<PartType, PartLevel> => ({ wing: 0, power: 0, tires: 0, suspension: 0, livery: 0, brakes: 0 });

export function createDefaultPlayerState(date = new Date().toLocaleDateString("en-CA")): PlayerStateV1 {
  return {
    version: 1,
    coins: 1500,
    xp: 0,
    level: 1,
    ownedVehicleIds: VEHICLES.map((vehicle) => vehicle.id),
    selectedVehicleId: DEFAULT_VEHICLE_ID,
    partLevels: Object.fromEntries(VEHICLES.map((vehicle) => [vehicle.id, blankParts()])) as PlayerStateV1["partLevels"],
    selectedLiveries: {},
    bestLaps: {},
    unlockedAchievements: {},
    dailyEarnings: { date, coins: 0 },
    winStreak: 0,
    stats: { races: 0, wins: 0, podiums: 0, laps: 0, totalCoinsEarned: 0, collisions: 0, driftSeconds: 0, upgrades: 0, weatherFinished: [], trackWins: [] }
  };
}

export function isValidPlayerState(value: unknown): value is PlayerStateV1 {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PlayerStateV1>;
  return state.version === 1 && typeof state.coins === "number" && typeof state.xp === "number" && Array.isArray(state.ownedVehicleIds) && typeof state.selectedVehicleId === "string" && !!state.partLevels && !!state.stats;
}

export function xpForNextLevel(level: number): number {
  return 500 + 150 * Math.max(0, level - 1);
}

export function applyXp(state: PlayerStateV1, amount: number): void {
  state.xp += Math.max(0, Math.round(amount));
  while (state.xp >= xpForNextLevel(state.level)) {
    state.xp -= xpForNextLevel(state.level);
    state.level += 1;
  }
}

export function effectiveStats(vehicleId: VehicleId, parts: Record<PartType, PartLevel>, weather: Weather): EffectiveVehicleStats {
  const base = VEHICLE_BY_ID[vehicleId].stats;
  const wing = parts.wing;
  const power = parts.power;
  const tires = parts.tires;
  const suspension = parts.suspension;
  const brakes = parts.brakes;
  const weatherSpeed = weather === "cloudy" ? 0.95 : weather === "rain" ? 0.9 : 1;
  const weatherAccel = weather === "rain" ? 0.85 : 1;
  const weatherHandling = weather === "rain" ? 0.8 : 1;
  const speedScale = 1 - wing * 0.005 + power * 0.01;
  return {
    speed: base.speed,
    acceleration: base.acceleration,
    handling: base.handling,
    braking: base.braking,
    boost: base.boost,
    maxSpeedKph: (220 + base.speed * 8) * speedScale * weatherSpeed,
    accelerationRate: (8 + base.acceleration * 0.62) * (1 + power * 0.03) * weatherAccel,
    grip: (0.78 + base.handling * 0.035) * (1 + wing * 0.02 + tires * 0.03 + suspension * 0.03) * weatherHandling,
    brakeRate: (11 + base.braking * 0.85) * (1 + brakes * 0.04),
    tireWearMultiplier: 1 - tires * 0.02
  };
}

export function calculateRewards(position: number, config: RaceConfig, fastestLap: boolean, priorWinStreak: number, dailyEarned: number): RewardBreakdown {
  if (config.mode === "mock") return { baseCoins: 0, bonusCoins: 0, awardedCoins: 0, xp: 0, capped: false, labels: ["Mock 練習不發獎勵"] };
  const index = Math.min(7, Math.max(0, position - 1));
  const multiplier = config.mode === "multiplayer" ? 1 : DIFFICULTY_MULTIPLIER[config.difficulty];
  const baseCoins = Math.round((POSITION_COINS[index] ?? 150) * multiplier);
  let xp = Math.round((POSITION_XP[index] ?? 120) * multiplier);
  let bonusCoins = 0;
  const labels: string[] = [];
  if (fastestLap) { bonusCoins += 100; xp += 80; labels.push("全場最佳圈"); }
  if (position === 1 && priorWinStreak > 0) {
    const streak = Math.min(0.25, priorWinStreak * 0.05);
    bonusCoins += Math.round(baseCoins * streak);
    labels.push(`連勝 +${Math.round(streak * 100)}%`);
  }
  if (position === 1 && config.weather === "rain") { bonusCoins += Math.round(baseCoins * 0.15); labels.push("雨戰之王 +15%"); }
  const uncapped = baseCoins + bonusCoins;
  const awardedCoins = Math.max(0, Math.min(uncapped, DAILY_COIN_CAP - dailyEarned));
  return { baseCoins, bonusCoins, awardedCoins, xp, capped: awardedCoins < uncapped, labels };
}

export function buyVehicle(state: PlayerStateV1, vehicleId: VehicleId): boolean {
  const vehicle = VEHICLE_BY_ID[vehicleId];
  if (state.ownedVehicleIds.includes(vehicleId) || state.coins < vehicle.price) return false;
  state.coins -= vehicle.price;
  state.ownedVehicleIds.push(vehicleId);
  return true;
}

export function upgradePart(state: PlayerStateV1, vehicleId: VehicleId, part: PartType): boolean {
  if (!state.ownedVehicleIds.includes(vehicleId)) return false;
  const current = state.partLevels[vehicleId][part];
  if (current >= 3) return false;
  const next = (current + 1) as Exclude<PartLevel, 0>;
  const cost = PART_COSTS[next];
  if (state.coins < cost) return false;
  state.coins -= cost;
  state.partLevels[vehicleId][part] = next;
  state.stats.upgrades += 1;
  return true;
}
