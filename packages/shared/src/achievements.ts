import type { AchievementDefinition, PlayerStateV1, RaceResult } from "./types";

const general = (id: string, name: string, description: string): AchievementDefinition => ({ id, name, description, category: "general", coins: 100, xp: 100 });
const fun = (id: string, name: string, description: string): AchievementDefinition => ({ id, name, description, category: "fun", coins: 150, xp: 150 });

export const ACHIEVEMENTS: AchievementDefinition[] = [
  general("finish-1", "初次方格旗", "完成第一場比賽"), general("finish-5", "賽道常客", "完成 5 場比賽"), general("finish-20", "資深車手", "完成 20 場比賽"), general("finish-50", "鋼鐵意志", "完成 50 場比賽"),
  general("win-1", "第一座獎盃", "取得第一場勝利"), general("win-5", "勝利方程式", "累積 5 勝"), general("win-20", "世界冠軍", "累積 20 勝"), general("podium-10", "香檳時刻", "登上頒獎台 10 次"),
  general("laps-10", "熱胎完成", "累積 10 圈"), general("laps-50", "里程碑", "累積 50 圈"), general("laps-200", "耐力之王", "累積 200 圈"), general("coins-1000", "第一桶金", "累積賺取 1,000 金幣"),
  general("coins-10000", "車隊金主", "累積賺取 10,000 金幣"), general("level-5", "新星", "達到等級 5"), general("level-10", "超級駕照", "達到等級 10"), general("cars-4", "小型車隊", "擁有 4 台車"),
  general("cars-8", "完整收藏", "擁有全部 9 台車"), general("upgrade-1", "第一次進站", "完成首次升級"), general("upgrade-10", "首席工程師", "累積 10 次升級"), general("max-car", "終極規格", "單一車輛六類改裝全滿"),
  fun("turtle", "龜速也能完賽", "平均速度低於 80 km/h 完賽"), fun("rain-win", "雨戰之王", "雨天獲勝"), fun("cloud-win", "烏雲剋星", "陰天獲勝"), fun("hard-win", "困難征服者", "困難模式獲勝"),
  fun("clean-race", "白手套", "零碰撞、零出界完賽"), fun("drift-10", "橫著走", "連續漂移 10 秒"), fun("drift-60", "煙霧製造機", "單場累積漂移 60 秒"), fun("boost-5", "能量成癮", "單場使用 5 次加速"),
  fun("empty-tank", "最後一滴", "低於 3% 油量完賽"), fun("red-tires", "光頭胎英雄", "四條紅胎完賽"), fun("photo-finish", "照片判定", "以 0.1 秒內差距奪冠"), fun("last-first", "逆轉劇本", "第一檢查點墊底後奪冠"),
  fun("lights-flag", "燈滅領到尾", "每個檢查點皆領先並獲勝"), fun("triple-pb", "連續突破", "連續三圈刷新既有個人最佳"), fun("metronome", "節拍器", "相鄰兩圈差小於 0.05 秒"), fun("wrong-way", "浪子回頭", "觸發逆向警告後完賽"),
  fun("wall-lover", "護欄收藏家", "撞牆 10 次仍完賽"), fun("no-brakes", "誰需要煞車", "不使用煞車獲勝"), fun("no-drift", "抓地派", "不使用漂移獲勝"), fun("speed-290", "極速 290", "達到 290 km/h"),
  fun("airborne", "短暫飛行", "連續騰空超過 1 秒"), fun("last-lap", "末圈獵人", "末圈超越 3 台車"), fun("weather-three", "全天候車手", "完成三種天氣比賽"), fun("track-double", "雙冠王", "兩條賽道皆獲勝")
];

export function evaluateAchievements(state: PlayerStateV1, result?: RaceResult): AchievementDefinition[] {
  const s = state.stats;
  const t = result?.telemetry;
  const adjacentLap = result?.laps.some((lap, index, laps) => index > 0 && Math.abs(lap.timeMs - (laps[index - 1]?.timeMs ?? 0)) <= 50) ?? false;
  const condition: Record<string, boolean> = {
    "finish-1": s.races >= 1, "finish-5": s.races >= 5, "finish-20": s.races >= 20, "finish-50": s.races >= 50,
    "win-1": s.wins >= 1, "win-5": s.wins >= 5, "win-20": s.wins >= 20, "podium-10": s.podiums >= 10,
    "laps-10": s.laps >= 10, "laps-50": s.laps >= 50, "laps-200": s.laps >= 200, "coins-1000": s.totalCoinsEarned >= 1000,
    "coins-10000": s.totalCoinsEarned >= 10000, "level-5": state.level >= 5, "level-10": state.level >= 10, "cars-4": state.ownedVehicleIds.length >= 4,
    "cars-8": state.ownedVehicleIds.length >= 9, "upgrade-1": s.upgrades >= 1, "upgrade-10": s.upgrades >= 10,
    "max-car": Object.values(state.partLevels).some((parts) => Object.values(parts).every((level) => level === 3)),
    turtle: !!t && t.averageSpeedKph < 80, "rain-win": result?.position === 1 && result.config.weather === "rain", "cloud-win": result?.position === 1 && result.config.weather === "cloudy",
    "hard-win": result?.position === 1 && result.config.difficulty === "hard", "clean-race": !!t && t.collisions === 0 && t.offTrackCount === 0,
    "drift-10": !!t && t.longestDriftSeconds >= 10, "drift-60": !!t && t.totalDriftSeconds >= 60, "boost-5": !!t && t.boostUses >= 5,
    "empty-tank": !!t && t.fuelRemaining < 3, "red-tires": !!t && t.tireWear.every((wear) => wear < 15), "photo-finish": result?.position === 1 && (t?.finishGapMs ?? Infinity) <= 100,
    "last-first": result?.position === 1 && t?.firstCheckpointPosition === result.totalRacers, "lights-flag": result?.position === 1 && !!t?.ledEveryCheckpoint,
    "triple-pb": (result?.laps.filter((lap) => lap.personalBest).length ?? 0) >= 3, metronome: adjacentLap, "wrong-way": (t?.wrongWaySeconds ?? 0) >= 2,
    "wall-lover": (t?.collisions ?? 0) >= 10, "no-brakes": result?.position === 1 && t?.brakeUsed === false, "no-drift": result?.position === 1 && t?.driftUsed === false,
    "speed-290": (t?.maxSpeedKph ?? 0) >= 290, airborne: (t?.airborneSeconds ?? 0) >= 1, "last-lap": (t?.finalLapPositionsGained ?? 0) >= 3,
    "weather-three": new Set(s.weatherFinished).size >= 3, "track-double": new Set(s.trackWins).size >= 2
  };
  return ACHIEVEMENTS.filter((achievement) => !state.unlockedAchievements[achievement.id] && condition[achievement.id]);
}
