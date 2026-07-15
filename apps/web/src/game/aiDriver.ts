export interface AiDriverProfile {
  paceFactor: number;
  cornerSkill: number;
  accelerationFactor: number;
  consistency: number;
  aggression: number;
  mistakeFactor: number;
  laneBias: number;
  pacePhase: number;
}

const BASE_PACE = [1.045, 1.03, 1.015, 1, 0.985, 0.97, 0.95];
const BASE_LANES = [-3.1, -2.05, -1.1, 0, 1.1, 2.05, 3.1];

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export function createAiDriverProfiles(count: number, random: () => number): AiDriverProfile[] {
  const pace = Array.from({ length: count }, (_, index) => BASE_PACE[index % BASE_PACE.length] ?? 1);
  const lanes = Array.from({ length: count }, (_, index) => BASE_LANES[index % BASE_LANES.length] ?? 0);
  for (let index = pace.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pace[index], pace[swap]] = [pace[swap]!, pace[index]!];
  }
  for (let index = lanes.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [lanes[index], lanes[swap]] = [lanes[swap]!, lanes[index]!];
  }

  return pace.map((basePace, index) => {
    const paceFactor = clamp(basePace + (random() - 0.5) * 0.01, 0.945, 1.05);
    return {
      paceFactor,
      cornerSkill: clamp(paceFactor + (random() - 0.5) * 0.075, 0.91, 1.075),
      accelerationFactor: clamp(paceFactor + (random() - 0.5) * 0.065, 0.92, 1.07),
      consistency: 0.76 + random() * 0.21,
      aggression: 0.72 + random() * 0.3,
      mistakeFactor: clamp(1.05 + (1 - paceFactor) * 3.2 + (random() - 0.5) * 0.24, 0.72, 1.32),
      laneBias: clamp(lanes[index]! + (random() - 0.5) * 0.34, -3.2, 3.2),
      pacePhase: random() * Math.PI * 2
    };
  });
}
