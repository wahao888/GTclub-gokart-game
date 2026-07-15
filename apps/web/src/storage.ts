import { DEFAULT_VEHICLE_ID, PLAYER_STORAGE_KEY, SETTINGS_STORAGE_KEY, VEHICLES, createDefaultPlayerState, isValidPlayerState, type PlayerStateV1, type Quality } from "@f1-kart/shared";

export interface GameSettings { quality: Quality; volume: number; }
export const DEFAULT_SETTINGS: GameSettings = { quality: "medium", volume: 0.65 };

function withLimitedFreeVehicles(state: PlayerStateV1): PlayerStateV1 {
  const defaults = createDefaultPlayerState();
  const firstGateRelease = !state.ownedVehicleIds.includes(DEFAULT_VEHICLE_ID);
  return {
    ...state,
    ownedVehicleIds: VEHICLES.map((vehicle) => vehicle.id),
    selectedVehicleId: firstGateRelease ? DEFAULT_VEHICLE_ID : state.selectedVehicleId,
    partLevels: { ...defaults.partLevels, ...state.partLevels },
  };
}

export function loadPlayer(): { state: PlayerStateV1; recovered: boolean } {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return { state: createDefaultPlayerState(), recovered: false };
    const parsed: unknown = JSON.parse(raw);
    if (isValidPlayerState(parsed)) return { state: withLimitedFreeVehicles(parsed), recovered: false };
    throw new Error("invalid save");
  } catch {
    const backup = localStorage.getItem(`${PLAYER_STORAGE_KEY}.backup`);
    try {
      const parsed: unknown = backup ? JSON.parse(backup) : null;
      if (isValidPlayerState(parsed)) return { state: withLimitedFreeVehicles(parsed), recovered: true };
    } catch { /* reset below */ }
    return { state: createDefaultPlayerState(), recovered: true };
  }
}

export function savePlayer(state: PlayerStateV1): void {
  const current = localStorage.getItem(PLAYER_STORAGE_KEY);
  if (current) localStorage.setItem(`${PLAYER_STORAGE_KEY}.backup`, current);
  localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(state));
}

export function loadSettings(): GameSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null") as Partial<GameSettings> | null;
    if (parsed && ["low", "medium", "high"].includes(parsed.quality ?? "") && typeof parsed.volume === "number") return parsed as GameSettings;
  } catch { /* defaults */ }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
