import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACHIEVEMENTS,
  DIFFICULTY_LABELS,
  PARTS,
  PART_COSTS,
  TRACKS,
  TRACK_BY_ID,
  VEHICLES,
  VEHICLE_BY_ID,
  WEATHER_ICONS,
  WEATHER_LABELS,
  applyXp,
  buyVehicle,
  effectiveStats,
  evaluateAchievements,
  pickWeather,
  upgradePart,
  xpForNextLevel,
  type AchievementDefinition,
  type Difficulty,
  type PartLevel,
  type PlayerStateV1,
  type Quality,
  type RaceConfig,
  type RaceResult,
  type RaceSnapshot,
  type RoomPlayer,
  type TrackId,
  type VehicleId,
  type Weather
} from "@f1-kart/shared";
import { CarShowcase } from "./components/CarShowcase";
import { TrackMapIcon } from "./components/TrackMapIcon";
import { GameEngine, type GameTelemetry } from "./game/GameEngine";
import { MultiplayerClient, type NetworkStatus } from "./multiplayer/MultiplayerClient";
import { loadPlayer, loadSettings, savePlayer, saveSettings } from "./storage";

type Screen = "home" | "setup" | "garage" | "shop" | "achievements" | "multiplayer" | "race" | "results";
const initialTelemetry: GameTelemetry = { speedKph: 0, rpm: 5000, gear: "N", lap: 1, laps: 3, position: 8, racers: 8, currentLapMs: 0, totalTimeMs: 0, fuel: 100, tires: [100, 100, 100, 100], boost: 40, drs: false, drifting: false, wrongWay: false, timeGap: 0, defensiveWake: false, lateralOffset: 0, nitroActive: false, miniBoostActive: false, speedIntensity: 0, racePhase: "countdown", collisionPulse: 0, aiSpeedSpreadKph: 0, aiFieldSpreadMeters: 0 };

function formatTime(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "--:--.---";
  const minutes = Math.floor(ms / 60000); const seconds = Math.floor(ms % 60000 / 1000); const millis = Math.floor(ms % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function clonePlayer(player: PlayerStateV1): PlayerStateV1 { return structuredClone(player); }

function TopBar({ player, screen, navigate, quality, setQuality }: { player: PlayerStateV1; screen: Screen; navigate: (screen: Screen) => void; quality: Quality; setQuality: (quality: Quality) => void }) {
  if (screen === "race") return null;
  return <header className="topbar">
    <button className="brand" onClick={() => navigate("home")}><span className="brand-mark">F//K</span><span>FORMULA KART<small>GATE.IO RACING</small></span></button>
    <nav>
      <button className={screen === "garage" ? "active" : ""} onClick={() => navigate("garage")}>車庫</button>
      <button className={screen === "shop" ? "active" : ""} onClick={() => navigate("shop")}>商城</button>
      <button className={screen === "achievements" ? "active" : ""} onClick={() => navigate("achievements")}>成就</button>
      <button className={screen === "multiplayer" ? "active" : ""} onClick={() => navigate("multiplayer")}>多人</button>
    </nav>
    <div className="player-strip"><span>LV.{player.level}</span><b>◉ {player.coins.toLocaleString()}</b><label>畫質<select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label></div>
  </header>;
}

function StatBars({ vehicleId, player, weather = "clear" }: { vehicleId: VehicleId; player: PlayerStateV1; weather?: Weather }) {
  const base = VEHICLE_BY_ID[vehicleId].stats; const effective = effectiveStats(vehicleId, player.partLevels[vehicleId], weather);
  const rows: Array<[string, number, string]> = [
    ["極速", base.speed, `${Math.round(effective.maxSpeedKph)} km/h`], ["加速", base.acceleration, effective.accelerationRate.toFixed(1)], ["操控", base.handling, effective.grip.toFixed(2)], ["煞車", base.braking, effective.brakeRate.toFixed(1)], ["加速效率", base.boost, `${Math.round(base.boost * 10)}%`]
  ];
  return <div className="stat-bars">{rows.map(([label, value, display]) => <div className="stat-row" key={label}><span>{label}</span><div><i style={{ width: `${value * 10}%` }} /></div><b>{display}</b></div>)}</div>;
}

function Home({ player, navigate }: { player: PlayerStateV1; navigate: (screen: Screen) => void }) {
  const selected = VEHICLE_BY_ID[player.selectedVehicleId];
  return <main className="home page">
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span>SEASON 01</span> WORLD KART CHAMPIONSHIP</div><h1>FORMULA<br/><em>KART</em></h1><p>九種獨立車體，從教學版 Gate.io 方程式賽車、寬體甩尾跑車到頂級超跑。選擇你的風格，挑戰霓虹山城與速度公園。</p><div className="hero-actions"><button className="primary xl" onClick={() => navigate("setup")}>開始比賽 <span>→</span></button><button className="ghost xl" onClick={() => navigate("garage")}>進入車庫</button></div><div className="control-hints"><span><kbd>WASD</kbd> 駕駛</span><span><kbd>SPACE</kbd> 漂移</span><span><kbd>E</kbd> 加速</span></div></div>
      <div className="hero-car"><div className="car-number">01</div><CarShowcase vehicleId={player.selectedVehicleId} livery={player.selectedLiveries[player.selectedVehicleId] ?? 0}/><div className="selected-car"><small>SELECTED MACHINE</small><b>{selected.name}</b><span>{selected.teamName} · {selected.driver}</span></div></div>
    </section>
    <section className="dashboard-grid">
      <button className="feature-card race-card" onClick={() => navigate("setup")}><span className="card-index">01</span><div><small>GRAND PRIX</small><h2>單人錦標賽</h2><p>兩條賽道 · 三種難度 · 動態天氣</p></div><b>進入 →</b></button>
      <button className="feature-card" onClick={() => navigate("multiplayer")}><span className="status-dot online"/><div><small>LIVE PADDOCK</small><h2>多人房間</h2><p>WebSocket 即時連線 · 最多 8 人</p></div><b>連線 →</b></button>
      <div className="career-card"><div><small>DRIVER PROGRESS</small><b>LEVEL {player.level}</b></div><div className="xp-track"><i style={{ width: `${player.xp / xpForNextLevel(player.level) * 100}%` }}/></div><p>{player.xp} / {xpForNextLevel(player.level)} XP</p><div className="mini-stats"><span><b>{player.stats.wins}</b>勝利</span><span><b>{player.stats.races}</b>完賽</span><span><b>{Object.keys(player.unlockedAchievements).length}</b>成就</span></div></div>
    </section>
  </main>;
}

function Setup({ onStart, back }: { onStart: (trackId: TrackId, difficulty: Difficulty) => void; back: () => void }) {
  const [trackId, setTrackId] = useState<TrackId>("velocity"); const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  return <main className="page setup-page"><div className="page-heading"><button className="back" onClick={back}>←</button><div><small>RACE CONTROL</small><h1>建立大獎賽</h1></div></div>
    <section><div className="section-title"><span>01</span><div><h2>選擇賽道</h2><p>每條賽道有不同圈數、彎道與 DRS 區域</p></div></div><div className="track-grid">{TRACKS.map((track) => <button key={track.id} className={`track-card ${track.id === trackId ? "selected" : ""} ${track.id}`} onClick={() => setTrackId(track.id)}><div className="track-art"><TrackMapIcon trackId={track.id}/><i>{track.shortName}</i></div><div className="track-info"><small>{track.difficulty}</small><h3>{track.name}</h3><p>{track.theme}</p><dl><div><dt>圈數</dt><dd>{track.laps}</dd></div><div><dt>長度</dt><dd>{track.lengthKm} km</dd></div><div><dt>彎道</dt><dd>{track.turns}</dd></div></dl></div></button>)}</div></section>
    <section><div className="section-title"><span>02</span><div><h2>AI 難度</h2><p>更高難度帶來更快反應與獎勵倍率</p></div></div><div className="difficulty-row">{(["easy","normal","hard"] as Difficulty[]).map((item, index) => <button key={item} className={difficulty === item ? "selected" : ""} onClick={() => setDifficulty(item)}><b>{DIFFICULTY_LABELS[item]}</b><span>{["放鬆競速 · ×1.0", "旗鼓相當 · ×1.25", "防守氣流 · ×1.5"][index]}</span></button>)}</div></section>
    <div className="launch-bar"><div><span>出賽設定</span><b>{TRACK_BY_ID[trackId].name} · {TRACK_BY_ID[trackId].laps} 圈 · {DIFFICULTY_LABELS[difficulty]}</b></div><button className="primary xl" onClick={() => onStart(trackId, difficulty)}>進入發車區 →</button></div>
  </main>;
}

function Garage({ player, updatePlayer }: { player: PlayerStateV1; updatePlayer: (fn: (draft: PlayerStateV1) => void, message?: string) => void }) {
  const [view, setView] = useState<VehicleId>(player.selectedVehicleId);
  const vehicle = VEHICLE_BY_ID[view];
  const owned = player.ownedVehicleIds.includes(view);
  const livery = player.selectedLiveries[view] ?? 0;
  const viewIndex = VEHICLES.findIndex((entry) => entry.id === view);
  const upgrades = Object.values(player.partLevels[view]).reduce<number>((total, level) => total + level, 0);
  const moveView = (offset: number) => setView(VEHICLES[(viewIndex + offset + VEHICLES.length) % VEHICLES.length]!.id);
  return <main className="page garage-page">
    <div className="page-heading garage-heading"><div><small>PRIVATE MOTOR GALLERY · BAY 09</small><h1>車庫與改裝</h1></div><p><b className="limited-free">LIMITED FREE</b> 九台賽車本週全車開放</p></div>
    <div className="garage-layout">
      <aside className="vehicle-list"><header><span>COLLECTION</span><b>車輛收藏</b><small>{String(VEHICLES.length).padStart(2, "0")} MACHINES</small></header>{VEHICLES.map((item, index) => <button key={item.id} className={item.id === view ? "active" : ""} onClick={() => setView(item.id)}><span className="garage-slot">{String(index + 1).padStart(2, "0")}</span><img className="team-logo" src={item.teamLogo} alt={`${item.teamName} Logo`}/><div><b>{item.name}</b><small>{item.teamName}</small><em>車手 · {item.driver}</em></div><i>{item.id === player.selectedVehicleId ? "RACE" : "FREE"}</i></button>)}</aside>
      <section className="garage-main">
        <div className="showroom-toolbar"><div><i className="live-dot"/><span>HERITAGE SHOWROOM</span><small>環境照明 · 即時車漆預覽</small></div><div className="showroom-meter"><span>DISPLAY BAY</span><b>{String(viewIndex + 1).padStart(2, "0")}<em>/{String(VEHICLES.length).padStart(2, "0")}</em></b></div></div>
        <div className="garage-stage">
          <CarShowcase environment="garage" vehicleId={view} livery={livery}/>
          <div className="stage-cinema"/>
          <button className="showroom-arrow previous" aria-label="上一台車" onClick={() => moveView(-1)}>‹</button>
          <button className="showroom-arrow next" aria-label="下一台車" onClick={() => moveView(1)}>›</button>
          <div className="stage-location"><b>FK</b><span>FORMULA KART<br/><small>PRIVATE COLLECTION</small></span></div>
          <div className="stage-copy"><small>LIMITED FREE · SIGNATURE MACHINE</small><h2>{vehicle.name}</h2><div className="team-meta"><img src={vehicle.teamLogo} alt=""/><span><b>{vehicle.teamName}</b><small>車手 · {vehicle.driver}</small></span></div><p>{vehicle.description}</p><div className="stage-tags"><span>360° AUTO ROTATE</span><span>LIVE MATERIAL</span><span>{vehicle.id.toUpperCase()}</span></div></div>
          <div className="rotation-status"><i/><span>AUTO ROTATE</span><b>360°</b></div>
        </div>
        <div className="garage-data"><div className="performance-panel"><div className="data-title"><span>01</span><div><small>VEHICLE TELEMETRY</small><h3>性能資料</h3></div><em>FACTORY SPEC</em></div><StatBars vehicleId={view} player={player}/></div><div className="spec-box"><div className="data-title compact"><span>02</span><div><small>GARAGE STATUS</small><h3>車輛狀態</h3></div></div><dl><div><dt>動力規格</dt><dd>{Math.round(effectiveStats(view, player.partLevels[view], "clear").maxSpeedKph)} <small>KM/H</small></dd></div><div><dt>升級完成度</dt><dd>{upgrades} <small>/ 18</small></dd></div><div><dt>收藏狀態</dt><dd className="free-state">LIMITED FREE</dd></div></dl><div className="upgrade-meter"><i style={{ width: `${upgrades / 18 * 100}%` }}/></div>{owned ? <button className={player.selectedVehicleId === view ? "selected-button" : "primary"} disabled={player.selectedVehicleId === view} onClick={() => updatePlayer((draft) => { draft.selectedVehicleId = view; }, `${vehicle.name} 已設為出賽車輛`)}>{player.selectedVehicleId === view ? "目前出賽車輛" : "免費選用此車"}</button> : <button className="primary" onClick={() => updatePlayer((draft) => { if (!buyVehicle(draft, view)) throw new Error("金幣不足"); }, `已購入 ${vehicle.name}`)}>限時免費領取</button>}</div></div>
      </section>
    </div>
  </main>;
}

function Shop({ player, updatePlayer }: { player: PlayerStateV1; updatePlayer: (fn: (draft: PlayerStateV1) => void, message?: string) => void }) {
  const selected = player.selectedVehicleId;
  return <main className="page shop-page"><div className="page-heading"><div><small>PERFORMANCE CENTRE</small><h1>車隊商城</h1></div><div className="wallet">可用金幣 <b>◉ {player.coins.toLocaleString()}</b></div></div>
    <section><div className="section-title"><span>01</span><div><h2>限時免費車輛</h2><p>九台賽車已全部加入你的車庫</p></div></div><div className="market-grid">{VEHICLES.map((vehicle) => { const owned = player.ownedVehicleIds.includes(vehicle.id); return <article key={vehicle.id} className={owned ? "owned" : ""}><div className="mini-car" style={{ background: `radial-gradient(circle at 50% 70%,${vehicle.colors[1]}44,transparent 45%),linear-gradient(145deg,${vehicle.colors[0]},#080b10)` }}><img src={vehicle.teamLogo} alt={`${vehicle.teamName} Logo`}/></div><small>LIMITED FREE · {vehicle.driver}</small><h3>{vehicle.name}</h3><p>{vehicle.description}</p><button disabled={owned} onClick={() => updatePlayer((draft) => { if (!buyVehicle(draft, vehicle.id)) throw new Error("領取失敗"); }, `已領取 ${vehicle.name}`)}>{owned ? "已免費加入車庫" : "限時免費領取"}</button></article>; })}</div></section>
    <section><div className="section-title"><span>02</span><div><h2>{VEHICLE_BY_ID[selected].name} 改裝</h2><p>零件綁定目前出賽車輛，購買後立即生效</p></div></div><div className="parts-grid">{PARTS.map((part) => { const level = player.partLevels[selected][part.id]; const next = Math.min(3, level + 1) as Exclude<PartLevel,0>; return <article key={part.id}><div className="part-icon">{({wing:"⌁",power:"⚡",tires:"◉",suspension:"↕",livery:"◆",brakes:"⊘"} as Record<string,string>)[part.id]}</div><small>{part.id.toUpperCase()}</small><h3>{part.name}</h3><p>{part.description}</p><div className="level-dots">{[1,2,3].map((dot) => <i key={dot} className={dot <= level ? "on" : ""}/>)}</div><button disabled={level === 3} onClick={() => updatePlayer((draft) => { if (!upgradePart(draft, selected, part.id)) throw new Error("金幣不足或已滿級"); if (part.id === "livery") draft.selectedLiveries[selected] = next; }, `${part.name} 已升級至 Lv.${next}`)}>{level === 3 ? "MAX" : `◉ ${PART_COSTS[next].toLocaleString()}　升級 Lv.${next}`}</button></article>; })}</div></section>
  </main>;
}

function Achievements({ player }: { player: PlayerStateV1 }) {
  const unlocked = Object.keys(player.unlockedAchievements).length;
  return <main className="page achievements-page"><div className="page-heading"><div><small>DRIVER RECORDS</small><h1>成就檔案</h1></div><div className="achievement-progress"><b>{unlocked}<small>/ 44</small></b><span>已解鎖</span></div></div>
    {(["general","fun"] as const).map((category) => <section key={category}><div className="section-title"><span>{category === "general" ? "01" : "02"}</span><div><h2>{category === "general" ? "一般成就" : "趣味與彩蛋"}</h2><p>{category === "general" ? "累積賽事生涯與收藏進度" : "用意想不到的方式完成挑戰"}</p></div></div><div className="achievement-grid">{ACHIEVEMENTS.filter((achievement) => achievement.category === category).map((achievement) => { const done = !!player.unlockedAchievements[achievement.id]; return <article key={achievement.id} className={done ? "done" : "locked"}><span>{done ? "◆" : "◇"}</span><div><small>{done ? "UNLOCKED" : "LOCKED"}</small><h3>{achievement.name}</h3><p>{achievement.description}</p><b>◉ {achievement.coins} · {achievement.xp} XP</b></div></article>; })}</div></section>)}
  </main>;
}

interface MultiplayerUi { status: NetworkStatus; detail: string; roomCode: string; hostId: string; trackId: TrackId; players: RoomPlayer[]; }
function Multiplayer({ ui, playerId, player, onCreate, onJoin, onReady, onMockStart }: { ui: MultiplayerUi; playerId: string; player: PlayerStateV1; onCreate: (name: string, trackId: TrackId) => void; onJoin: (name: string, code: string) => void; onReady: (ready: boolean) => void; onMockStart: () => void }) {
  const [name, setName] = useState(localStorage.getItem("f1-kart.player-name") ?? "Racer"); const [code, setCode] = useState(""); const [trackId, setTrackId] = useState<TrackId>("velocity");
  const inRoom = ui.roomCode && ui.status === "online"; const self = ui.players.find((entry) => entry.id === playerId);
  const remember = () => localStorage.setItem("f1-kart.player-name", name);
  return <main className="page multiplayer-page"><div className="page-heading"><div><small>LIVE PADDOCK</small><h1>多人賽事大廳</h1></div><div className={`connection ${ui.status}`}><i/>{ui.status === "online" ? "WEBSOCKET ONLINE" : ui.status === "mock" ? "MOCK MODE" : ui.status.toUpperCase()}</div></div>
    {!inRoom && <div className="lobby-layout"><section className="lobby-panel"><div className="panel-number">01</div><h2>車手身份</h2><label>玩家名稱<input maxLength={16} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="lobby-car"><CarShowcase compact vehicleId={player.selectedVehicleId} livery={player.selectedLiveries[player.selectedVehicleId] ?? 0}/><span>出賽車輛<b>{VEHICLE_BY_ID[player.selectedVehicleId].name}</b></span></div></section><section className="lobby-panel"><div className="panel-number">02</div><h2>建立房間</h2><div className="track-toggle">{TRACKS.map((track) => <button key={track.id} className={track.id === trackId ? "active" : ""} onClick={() => setTrackId(track.id)}>{track.shortName}<small>{track.laps} 圈</small></button>)}</div><button className="primary wide" disabled={name.trim().length < 2 || ui.status === "connecting"} onClick={() => { remember(); onCreate(name.trim(), trackId); }}>建立私人房間</button><div className="or"><span>或使用代碼加入</span></div><div className="join-row"><input maxLength={6} placeholder="ROOM CODE" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())}/><button disabled={code.length !== 6 || name.trim().length < 2} onClick={() => { remember(); onJoin(name.trim(), code); }}>加入</button></div></section></div>}
    {ui.status === "mock" && <section className="mock-banner"><span>⚡</span><div><small>AUTOMATIC FALLBACK</small><h2>Mock 模擬已就緒</h2><p>{ui.detail}。兩名模擬車手會沿賽道移動，練習模式不發放獎勵。</p></div><button className="primary" onClick={onMockStart}>開始 Mock 練習</button></section>}
    {inRoom && <section className="room-panel"><div className="room-code"><small>ROOM CODE</small><b>{ui.roomCode}</b><button onClick={() => void navigator.clipboard?.writeText(ui.roomCode)}>複製代碼</button></div><div className="room-track"><span>{TRACK_BY_ID[ui.trackId].shortName}</span><div><b>{TRACK_BY_ID[ui.trackId].name}</b><small>{TRACK_BY_ID[ui.trackId].laps} 圈 · 最多 8 人</small></div></div><div className="player-grid">{ui.players.map((entry, index) => <article key={entry.id} className={entry.ready ? "ready" : ""}><span>{String(index+1).padStart(2,"0")}</span><div><b>{entry.name}{entry.id === ui.hostId ? "　♛" : ""}</b><small>{VEHICLE_BY_ID[entry.vehicleId].name}</small></div><i>{entry.ready ? "READY" : "WAITING"}</i></article>)}{Array.from({length: Math.max(0,8-ui.players.length)},(_,index)=><article className="empty" key={index}><span>--</span><div><b>等待車手</b><small>空車位</small></div></article>)}</div><div className="ready-bar"><p>{ui.detail || "所有玩家準備後自動開始倒數"}</p><button className={self?.ready ? "ghost" : "primary"} onClick={() => onReady(!self?.ready)}>{self?.ready ? "取消準備" : "準備出賽"}</button></div></section>}
  </main>;
}

function RaceHud({ telemetry, config }: { telemetry: GameTelemetry; config: RaceConfig }) {
  const rpmPercent = Math.min(100, Math.max(0, (telemetry.rpm - 5000) / 85));
  return <div className={`race-hud ${telemetry.nitroActive ? "nitro-active" : telemetry.miniBoostActive ? "mini-active" : ""} ${telemetry.drifting ? "is-drifting" : ""} ${telemetry.speedIntensity > 0.2 ? "is-high-speed" : ""} ${telemetry.collisionPulse > 0.08 ? "has-impact" : ""}`} style={{"--speed-intensity":telemetry.speedIntensity,"--collision-pulse":telemetry.collisionPulse} as React.CSSProperties} data-lateral-offset={telemetry.lateralOffset.toFixed(3)} data-nitro-active={String(telemetry.nitroActive)} data-mini-boost-active={String(telemetry.miniBoostActive)} data-race-phase={telemetry.racePhase} data-speed-intensity={telemetry.speedIntensity.toFixed(3)} data-ai-speed-spread={telemetry.aiSpeedSpreadKph.toFixed(2)} data-ai-field-spread={telemetry.aiFieldSpreadMeters.toFixed(2)}><div className="speed-vignette"/>{(telemetry.nitroActive||telemetry.miniBoostActive)&&<div className={`boost-effects ${telemetry.nitroActive?"nitro":"mini"}`}><span>{telemetry.nitroActive?"NITRO":"MINI TURBO"}</span></div>}{telemetry.racePhase === "coasting" && <div className="finish-coast-banner"><small>CHEQUERED FLAG</small><b>FINISH</b><span>動力已切斷 · 車輛自動滑行</span></div>}<div className="hud-top"><div className="position-box"><small>POSITION</small><b>{telemetry.position}<em>/{telemetry.racers}</em></b></div><div className="race-info"><small>{TRACK_BY_ID[config.trackId].shortName} GRAND PRIX</small><b>LAP {telemetry.lap}<em> / {telemetry.laps}</em></b></div><div className="weather-box"><span>{WEATHER_ICONS[config.weather]}</span><div><small>TRACK STATUS</small><b>{WEATHER_LABELS[config.weather]}</b></div></div></div>
    <div className="gap-pill">前車差距 <b>{telemetry.timeGap > 0 ? `+${telemetry.timeGap.toFixed(2)}` : "LEADER"}</b></div>
    {(telemetry.wrongWay || telemetry.defensiveWake) && <div className={`race-warning ${telemetry.wrongWay ? "danger" : "wake"}`}>{telemetry.wrongWay ? "↻　逆向行駛" : "≋　防守氣流干擾"}</div>}
    <div className="lap-timing"><span>本圈<b>{formatTime(telemetry.currentLapMs)}</b></span><span>最佳<b className="purple">{formatTime(telemetry.bestLapMs)}</b></span></div>
    <div className="telemetry-cluster"><div className="tyre-widget"><small>TYRE WEAR</small><div>{telemetry.tires.map((wear,index)=><i key={index} className={wear>70?"green":wear>40?"yellow":wear>15?"orange":"red"} style={{"--wear":`${wear*3.6}deg`} as React.CSSProperties}><b>{index<2?"F":"R"}{index%2?"R":"L"}</b></i>)}</div></div><div className="speed-widget"><div className="rpm-bar"><i style={{width:`${rpmPercent}%`}}/></div><div><b>{Math.round(telemetry.speedKph)}</b><span>KM/H</span><em>{telemetry.gear}</em></div><div className="status-lights"><span className={telemetry.drs?"on":""}>DRS</span><span className={telemetry.drifting?"on drift":""}>DRIFT</span></div></div><div className="energy-widget"><small>ENERGY</small><strong>{Math.round(telemetry.boost)}<em>%</em></strong><div><i style={{height:`${telemetry.boost}%`}}/></div><span>FUEL {Math.round(telemetry.fuel)}%</span></div></div>
  </div>;
}

function GameView({ config, player, quality, volume, paused, remoteSnapshots, onPause, onCountdown, onTelemetry, onFinish, onNetworkSnapshot }: { config: RaceConfig; player: PlayerStateV1; quality: Quality; volume: number; paused: boolean; remoteSnapshots: RaceSnapshot[]; onPause:(paused:boolean)=>void; onCountdown:(value:string|null)=>void; onTelemetry:(t:GameTelemetry)=>void; onFinish:(r:RaceResult)=>void; onNetworkSnapshot:(snapshot:Omit<RaceSnapshot,"playerId"|"serverTime">)=>void }) {
  const host = useRef<HTMLDivElement>(null); const engine = useRef<GameEngine | null>(null);
  useEffect(() => { if (!host.current) return; try { engine.current = new GameEngine(host.current, config, player.selectedVehicleId, player.selectedLiveries[player.selectedVehicleId] ?? 0, player, quality, volume, { onTelemetry, onCountdown, onPause, onFinish, onNetworkSnapshot }); } catch (error) { if (error instanceof Error && error.message === "WEBGL2_UNAVAILABLE") host.current.innerHTML = '<div class="webgl-error"><h2>需要 WebGL 2</h2><p>請更新瀏覽器或啟用硬體加速後再試。</p></div>'; } return () => engine.current?.dispose(); }, []);
  useEffect(() => engine.current?.setPaused(paused), [paused]); useEffect(() => engine.current?.setRemoteSnapshots(remoteSnapshots), [remoteSnapshots]);
  return <div className="game-canvas" ref={host}/>;
}

function Results({ result, achievements, back }: { result: RaceResult; achievements: AchievementDefinition[]; back: () => void }) {
  return <main className="results-page"><div className="results-backdrop"/><section className="results-panel"><div className="result-rank"><small>OFFICIAL CLASSIFICATION</small><span>P{result.position}</span><h1>{result.position === 1 ? "VICTORY" : result.position <= 3 ? "PODIUM FINISH" : "RACE COMPLETE"}</h1><p>{TRACK_BY_ID[result.config.trackId].name} · {WEATHER_LABELS[result.config.weather]}</p></div><div className="result-columns"><div><h2>圈速成績</h2>{result.laps.map((lap)=><div className="lap-result" key={lap.lap}><span>LAP {String(lap.lap).padStart(2,"0")}</span><b>{formatTime(lap.timeMs)}</b>{lap.personalBest && <i>PB</i>}</div>)}<div className="lap-result total"><span>總時間</span><b>{formatTime(result.totalTimeMs)}</b></div></div><div><h2>賽事獎勵</h2><div className="reward-total"><span>◉</span><b>+{result.rewards.awardedCoins}</b><small>金幣</small></div><div className="reward-xp">+{result.rewards.xp} XP</div>{result.rewards.labels.map((label)=><p className="bonus" key={label}>◆ {label}</p>)}{result.rewards.capped && <p className="cap-warning">今日金幣已達上限</p>}</div></div>{achievements.length>0&&<div className="new-achievements"><small>ACHIEVEMENT UNLOCKED</small>{achievements.map((achievement)=><span key={achievement.id}>◆　{achievement.name}</span>)}</div>}<button className="primary xl wide" onClick={back}>返回主畫面</button></section></main>;
}

export default function App() {
  const loaded = useMemo(() => loadPlayer(), []); const [player, setPlayer] = useState(loaded.state); const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState<Screen>("home"); const [toast, setToast] = useState(loaded.recovered ? "存檔已從備份恢復" : "");
  const [raceConfig, setRaceConfig] = useState<RaceConfig | null>(null); const [telemetry, setTelemetry] = useState(initialTelemetry); const [countdown, setCountdown] = useState<string|null>(null); const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<RaceResult|null>(null); const [newAchievements, setNewAchievements] = useState<AchievementDefinition[]>([]); const [remoteSnapshots, setRemoteSnapshots] = useState<RaceSnapshot[]>([]);
  const [mp, setMp] = useState<MultiplayerUi>({status:"idle",detail:"",roomCode:"",hostId:"",trackId:"velocity",players:[]}); const mpRace = useRef<{seed:number;weather:Weather}>({seed:Date.now(),weather:"clear"});
  const mpStateRef = useRef(mp); mpStateRef.current = mp;
  const multiplayer = useRef<MultiplayerClient | null>(null);
  if (!multiplayer.current) multiplayer.current = new MultiplayerClient({
    onStatus:(status,detail)=>setMp((value)=>({...value,status,detail:detail??""})),
    onRoom:(roomCode,hostId,trackId,players)=>setMp((value)=>({...value,roomCode,hostId,trackId,players})),
    onCountdown:(_startsAt,seed,weather)=>{mpRace.current={seed,weather};setMp((value)=>({...value,detail:`${WEATHER_LABELS[weather]} · 倒數即將開始`}));},
    onRaceStart:()=>{const room=mpStateRef.current;const gridPosition=Math.max(0,room.players.findIndex((entry)=>entry.id===multiplayer.current?.playerId));const config:RaceConfig={trackId:room.trackId,lapCount:TRACK_BY_ID[room.trackId].laps,difficulty:"normal",weather:mpRace.current.weather,seed:mpRace.current.seed,mode:"multiplayer",roomCode:room.roomCode,gridPosition};setRaceConfig(config);setScreen("race");},
    onSnapshots:setRemoteSnapshots,
    onFinishOrder:()=>undefined
  });
  useEffect(() => () => multiplayer.current?.disconnect(), []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(()=>setToast(""),3200); return()=>window.clearTimeout(timeout); }, [toast]);

  const updatePlayer = (fn:(draft:PlayerStateV1)=>void,message?:string) => { const draft=clonePlayer(player); try { fn(draft); const unlocked=evaluateAchievements(draft); unlock(draft,unlocked); savePlayer(draft); setPlayer(draft); if(message)setToast(message); if(unlocked.length)setNewAchievements(unlocked); } catch(error) { setToast(error instanceof Error?error.message:"操作失敗"); } };
  const unlock = (draft:PlayerStateV1, achievements:AchievementDefinition[]) => { achievements.forEach((achievement)=>{draft.unlockedAchievements[achievement.id]=new Date().toISOString();draft.coins+=achievement.coins;applyXp(draft,achievement.xp);}); };
  const startRace = (trackId:TrackId,difficulty:Difficulty,mode:RaceConfig["mode"]="single") => { const seed=Date.now(); const weather=pickWeather(seed); setRaceConfig({trackId,lapCount:TRACK_BY_ID[trackId].laps,difficulty,weather,seed,mode});setTelemetry({...initialTelemetry,laps:TRACK_BY_ID[trackId].laps});setPaused(false);setScreen("race"); };
  const finishRace = (raceResult:RaceResult) => { if(raceResult.config.mode==="multiplayer")multiplayer.current?.finish(raceResult.totalTimeMs);const draft=clonePlayer(player);const today=new Date().toLocaleDateString("en-CA");if(draft.dailyEarnings.date!==today)draft.dailyEarnings={date:today,coins:0};draft.coins+=raceResult.rewards.awardedCoins;draft.dailyEarnings.coins+=raceResult.rewards.awardedCoins;draft.stats.totalCoinsEarned+=raceResult.rewards.awardedCoins;applyXp(draft,raceResult.rewards.xp);if(raceResult.config.mode!=="mock"){draft.stats.races+=1;draft.stats.laps+=raceResult.config.lapCount;draft.stats.collisions+=raceResult.telemetry.collisions;draft.stats.driftSeconds+=raceResult.telemetry.totalDriftSeconds;if(!draft.stats.weatherFinished.includes(raceResult.config.weather))draft.stats.weatherFinished.push(raceResult.config.weather);if(raceResult.position<=3)draft.stats.podiums+=1;if(raceResult.position===1){draft.stats.wins+=1;draft.winStreak+=1;if(!draft.stats.trackWins.includes(raceResult.config.trackId))draft.stats.trackWins.push(raceResult.config.trackId);}else draft.winStreak=0;}const best=Math.min(...raceResult.laps.map((lap)=>lap.timeMs));if(Number.isFinite(best))draft.bestLaps[raceResult.config.trackId]=Math.min(best,draft.bestLaps[raceResult.config.trackId]??Infinity);const unlocked=evaluateAchievements(draft,raceResult);unlock(draft,unlocked);savePlayer(draft);setPlayer(draft);setNewAchievements(unlocked);setResult(raceResult);setScreen("results"); };
  const navigate=(next:Screen)=>{if(screen==="race")return;setScreen(next);};
  const changeQuality=(quality:Quality)=>{const next={...settings,quality};setSettings(next);saveSettings(next);setToast(`畫質已設為${quality==="high"?"高":quality==="medium"?"中":"低"}`);};

  return <div className="app-shell"><TopBar player={player} screen={screen} navigate={navigate} quality={settings.quality} setQuality={changeQuality}/>
    {screen==="home"&&<Home player={player} navigate={navigate}/>} {screen==="setup"&&<Setup onStart={startRace} back={()=>setScreen("home")}/>} {screen==="garage"&&<Garage player={player} updatePlayer={updatePlayer}/>} {screen==="shop"&&<Shop player={player} updatePlayer={updatePlayer}/>} {screen==="achievements"&&<Achievements player={player}/>}
    {screen==="multiplayer"&&<Multiplayer ui={mp} playerId={multiplayer.current.playerId} player={player} onCreate={(name,trackId)=>multiplayer.current?.connect({type:"create",name,vehicleId:player.selectedVehicleId,trackId})} onJoin={(name,roomCode)=>multiplayer.current?.connect({type:"join",name,vehicleId:player.selectedVehicleId,roomCode})} onReady={(ready)=>multiplayer.current?.setReady(ready)} onMockStart={()=>startRace(mp.trackId,"normal","mock")}/>}
    {screen==="race"&&raceConfig&&<div className="race-screen"><GameView config={raceConfig} player={player} quality={settings.quality} volume={settings.volume} paused={paused} remoteSnapshots={remoteSnapshots} onPause={setPaused} onCountdown={setCountdown} onTelemetry={setTelemetry} onFinish={finishRace} onNetworkSnapshot={(snapshot)=>multiplayer.current?.sendSnapshot(snapshot)}/><RaceHud telemetry={telemetry} config={raceConfig}/>{countdown&&<div className={`countdown ${countdown==="GO"?"go":""}`}><small>{WEATHER_ICONS[raceConfig.weather]} {WEATHER_LABELS[raceConfig.weather]} · {TRACK_BY_ID[raceConfig.trackId].shortName}</small><b>{countdown}</b></div>}{paused&&<div className="pause-overlay"><section><small>RACE CONTROL</small><h1>比賽暫停</h1><button className="primary wide" onClick={()=>setPaused(false)}>繼續比賽</button><button className="ghost wide" onClick={()=>{setPaused(false);setScreen("home");}}>退出至主畫面</button><p>按 ESC 或 P 也可繼續</p></section></div>}</div>}
    {screen==="results"&&result&&<Results result={result} achievements={newAchievements} back={()=>{setResult(null);setScreen("home");}}/>}
    {toast&&<div className="toast">◆　{toast}</div>}
  </div>;
}
