import type { Difficulty, PartLevel, PartType, TrackSpec, VehicleId, VehicleSpec, Weather } from "./types";

export const DEFAULT_VEHICLE_ID: VehicleId = "gate-oracle-rb";

export const VEHICLES: VehicleSpec[] = [
  { id: "gate-oracle-rb", name: "Gate.io Oracle RB-G1", teamName: "Gate.io Formula Demo", driver: "Rookie", teamLogo: "/team-logos/gate-io-racing.svg", price: 0, stats: { speed: 9.8, acceleration: 9.4, handling: 9.2, braking: 9, boost: 9.5 }, colors: ["#07152d", "#e31b2d", "#f4c21f"], description: "Gate.io × Oracle Racing — 教學演示特別版，深海軍藍車身與黃鼻錐蓄勢出擊。" },
  { id: "titan-gt-3", name: "ZADJHD Rebound R8", teamName: "再凹單就會隊", driver: "Sam", teamLogo: "/team-logos/zadjhd.png", price: 0, stats: { speed: 10, acceleration: 7.5, handling: 6.5, braking: 9.5, boost: 7 }, colors: ["#a70a1b", "#171419", "#e4ad3f"], description: "ZADJHD — 再凹一單就會，逆風翻盤才是本事。" },
  { id: "storm-apex", name: "Project D Hyperion E-X", teamName: "Project D車隊", driver: "Eli", teamLogo: "/team-logos/project-d.jpeg", price: 0, stats: { speed: 7.5, acceleration: 9, handling: 7.5, braking: 6.5, boost: 8 }, colors: ["#182a38", "#18e5f5", "#4778ff"], description: "PROJECT D — Formula Electric" },
  { id: "velocity-v10", name: "Princess Crownfire 07", teamName: "員瑛公主車隊", driver: "Sheena", teamLogo: "/team-logos/princess.jpeg", price: 0, stats: { speed: 6.5, acceleration: 6, handling: 7.5, braking: 7, boost: 6.5 }, colors: ["#a6091b", "#f1394a", "#f5c9a9"], description: "Princess Racing Team — 皇冠加冕，紅鑽閃耀賽道。" },
  { id: "nova-se-200", name: "WHEEK Thunder GT-01", teamName: "天竺鼠車隊", driver: "Nora", teamLogo: "/team-logos/guinea-pig.jpeg", price: 0, stats: { speed: 8.5, acceleration: 8, handling: 9, braking: 8, boost: 8 }, colors: ["#f3eee5", "#ee821c", "#20242a"], description: "Guinea Pig Racing — 天竺鼠出擊，WHEEK 全速前進。" },
  { id: "omega-legacy", name: "StrawBarry Twinflare 22", teamName: "草莓貝瑞車隊", driver: "Barry", teamLogo: "/team-logos/strawbarry.png", price: 0, stats: { speed: 9, acceleration: 6.5, handling: 7, braking: 8.5, boost: 6.5 }, colors: ["#951d31", "#df6877", "#f5d3c8"], description: "StrawBarry Racing — 雙渦輪點燃莓紅風暴，甜美只是超車前的偽裝。" },
  { id: "zenith-sfx-400", name: "Ni Shuo Griffin F77", teamName: "你說的都隊", driver: "Muriel", teamLogo: "/team-logos/ni-shuo.png", price: 0, stats: { speed: 9.5, acceleration: 9.5, handling: 9.5, braking: 8.5, boost: 10 }, colors: ["#f4f2eb", "#1e2229", "#d3a64d"], description: "NI SHUO DE DOU TEAM" },
  { id: "oracle-rb20", name: "RedRock Valiant R1", teamName: "RedRock Racing 紅石車隊", driver: "Simon", teamLogo: "/team-logos/redrock.jpeg", price: 0, stats: { speed: 7.5, acceleration: 7, handling: 8, braking: 7.5, boost: 7 }, colors: ["#821923", "#c73837", "#e0b975"], description: "RedRock Racing — 紅石過彎不留痕，Simon 只把尾燈留給對手。" },
  { id: "phantom-f1", name: "Profitline Drift RX-7", teamName: "賺錢要排隊", driver: "Ken", teamLogo: "/team-logos/profit-queue.jpeg", price: 0, stats: { speed: 8, acceleration: 7.5, handling: 6.5, braking: 8, boost: 7 }, colors: ["#f5f7fa", "#ffffff", "#282e36"], description: "ドリフト魂 — RX-7 FD3S" }
];

export const VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map((vehicle) => [vehicle.id, vehicle])) as Record<VehicleId, VehicleSpec>;

export const TRACKS: TrackSpec[] = [
  { id: "fantasia", name: "Circuit de Fantasia", shortName: "FANTASIA", laps: 3, lengthKm: 2.1, turns: 14, checkpointCount: 12, difficulty: "中等", theme: "黃昏霓虹山城", accent: "#d56cff" },
  { id: "velocity", name: "Velocity Park Speedway", shortName: "VELOCITY", laps: 5, lengthKm: 1.35, turns: 8, checkpointCount: 8, difficulty: "簡單", theme: "晴日公園賽車場", accent: "#23e6b6" }
];

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((track) => [track.id, track])) as Record<TrackSpec["id"], TrackSpec>;

export const PARTS: Array<{ id: PartType; name: string; description: string }> = [
  { id: "wing", name: "尾翼空力", description: "提高抓地，略微犧牲尾速" },
  { id: "power", name: "動力單元", description: "ECU、變速箱映射與混合動力" },
  { id: "tires", name: "輪胎配方", description: "提高抓地並降低磨耗" },
  { id: "suspension", name: "主動懸吊", description: "改善轉向反應與漂移穩定" },
  { id: "livery", name: "車身塗裝", description: "消光、金屬與霓虹外觀" },
  { id: "brakes", name: "碳纖煞車", description: "提高制動與煞車穩定" }
];

export const PART_COSTS: Record<Exclude<PartLevel, 0>, number> = { 1: 600, 2: 1200, 3: 2400 };

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "簡單", normal: "普通", hard: "困難" };
export const WEATHER_LABELS: Record<Weather, string> = { clear: "晴天", cloudy: "陰天", rain: "雨天" };
export const WEATHER_ICONS: Record<Weather, string> = { clear: "☀", cloudy: "☁", rain: "☂" };

export const POSITION_COINS = [700, 500, 400, 320, 260, 220, 180, 150];
export const POSITION_XP = [500, 380, 320, 260, 220, 180, 150, 120];
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = { easy: 1, normal: 1.25, hard: 1.5 };

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeather(seed: number): Weather {
  const roll = seededRandom(seed)();
  if (roll < 0.5) return "clear";
  if (roll < 0.8) return "cloudy";
  return "rain";
}
