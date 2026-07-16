export type VehicleId =
  | "gate-oracle-rb"
  | "velocity-v10"
  | "oracle-rb20"
  | "phantom-f1"
  | "storm-apex"
  | "omega-legacy"
  | "nova-se-200"
  | "titan-gt-3"
  | "zenith-sfx-400";

export type TrackId = "fantasia" | "velocity" | "hungaroring";
export type Difficulty = "easy" | "normal" | "hard";
export type Weather = "clear" | "cloudy" | "rain";
export type RaceMode = "single" | "multiplayer" | "mock";
export type Quality = "low" | "medium" | "high";
export type PartType = "wing" | "power" | "tires" | "suspension" | "livery" | "brakes";
export type PartLevel = 0 | 1 | 2 | 3;

export interface VehicleStats {
  speed: number;
  acceleration: number;
  handling: number;
  braking: number;
  boost: number;
}

export interface VehicleSpec {
  id: VehicleId;
  name: string;
  teamName: string;
  driver: string;
  teamLogo: string;
  price: number;
  stats: VehicleStats;
  colors: [string, string, string];
  description: string;
}

export interface TrackSpec {
  id: TrackId;
  name: string;
  shortName: string;
  laps: number;
  lengthKm: number;
  turns: number;
  checkpointCount: number;
  difficulty: "簡單" | "中等";
  theme: string;
  accent: string;
}

export interface EffectiveVehicleStats extends VehicleStats {
  maxSpeedKph: number;
  accelerationRate: number;
  grip: number;
  brakeRate: number;
  tireWearMultiplier: number;
}

export interface CareerStats {
  races: number;
  wins: number;
  podiums: number;
  laps: number;
  totalCoinsEarned: number;
  collisions: number;
  driftSeconds: number;
  upgrades: number;
  weatherFinished: Weather[];
  trackWins: TrackId[];
}

export interface PlayerStateV1 {
  version: 1;
  coins: number;
  xp: number;
  level: number;
  ownedVehicleIds: VehicleId[];
  selectedVehicleId: VehicleId;
  partLevels: Record<VehicleId, Record<PartType, PartLevel>>;
  selectedLiveries: Partial<Record<VehicleId, PartLevel>>;
  bestLaps: Partial<Record<TrackId, number>>;
  unlockedAchievements: Record<string, string>;
  dailyEarnings: { date: string; coins: number };
  winStreak: number;
  stats: CareerStats;
}

export interface RaceConfig {
  trackId: TrackId;
  lapCount: number;
  difficulty: Difficulty;
  weather: Weather;
  seed: number;
  mode: RaceMode;
  roomCode?: string;
  gridPosition?: number;
}

export interface LapResult {
  lap: number;
  timeMs: number;
  personalBest: boolean;
}

export interface RaceTelemetrySummary {
  averageSpeedKph: number;
  maxSpeedKph: number;
  collisions: number;
  offTrackCount: number;
  longestDriftSeconds: number;
  totalDriftSeconds: number;
  boostUses: number;
  fuelRemaining: number;
  tireWear: [number, number, number, number];
  brakeUsed: boolean;
  driftUsed: boolean;
  wrongWaySeconds: number;
  airborneSeconds: number;
  firstCheckpointPosition: number;
  ledEveryCheckpoint: boolean;
  finalLapPositionsGained: number;
  finishGapMs: number;
}

export interface RaceResult {
  config: RaceConfig;
  position: number;
  totalRacers: number;
  totalTimeMs: number;
  laps: LapResult[];
  fastestLap: boolean;
  telemetry: RaceTelemetrySummary;
  rewards: RewardBreakdown;
}

export interface RewardBreakdown {
  baseCoins: number;
  bonusCoins: number;
  awardedCoins: number;
  xp: number;
  capped: boolean;
  labels: string[];
}

export type AchievementCategory = "general" | "fun";
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  coins: number;
  xp: number;
}

export interface RaceSnapshot {
  playerId: string;
  serverTime: number;
  vehicleId: VehicleId;
  livery: PartLevel;
  position: [number, number, number];
  rotation: number;
  speed: number;
  lap: number;
  checkpoint: number;
  rank: number;
  finished: boolean;
}

export type ClientMessage =
  | { v: 1; type: "create_room"; name: string; vehicleId: VehicleId; trackId: TrackId }
  | { v: 1; type: "join_room"; name: string; vehicleId: VehicleId; roomCode: string }
  | { v: 1; type: "set_ready"; ready: boolean }
  | { v: 1; type: "transform"; snapshot: Omit<RaceSnapshot, "playerId" | "serverTime"> }
  | { v: 1; type: "checkpoint"; checkpoint: number; lap: number }
  | { v: 1; type: "finish"; totalTimeMs: number }
  | { v: 1; type: "leave_room" };

export interface RoomPlayer {
  id: string;
  name: string;
  vehicleId: VehicleId;
  ready: boolean;
  finished: boolean;
  rank?: number;
}

export type ServerMessage =
  | { v: 1; type: "connected"; playerId: string }
  | { v: 1; type: "room_state"; roomCode: string; hostId: string; trackId: TrackId; players: RoomPlayer[] }
  | { v: 1; type: "countdown"; startsAt: number; seed: number; weather: Weather }
  | { v: 1; type: "race_start"; serverTime: number }
  | { v: 1; type: "snapshot"; snapshots: RaceSnapshot[] }
  | { v: 1; type: "finish_order"; playerIds: string[] }
  | { v: 1; type: "player_left"; playerId: string }
  | { v: 1; type: "error"; code: string; message: string };
