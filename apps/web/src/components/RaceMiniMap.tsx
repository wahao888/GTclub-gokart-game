import { TRACK_BY_ID, type RaceConfig } from "@f1-kart/shared";
import type { CSSProperties } from "react";
import type { GameTelemetry } from "../game/GameEngine";
import { getTrackMapPoint, TRACK_MAPS } from "./trackMapGeometry";

const RIVAL_COLORS = ["#63e6ff", "#ff719e", "#a98cff", "#72f4a8", "#ff9f5a", "#d7f06e", "#f4f7fb"];

export function RaceMiniMap({ telemetry, config }: { telemetry: GameTelemetry; config: RaceConfig }) {
  const map = TRACK_MAPS[config.trackId];
  const rivals = telemetry.raceMapRacers.filter((racer) => racer.kind !== "player");
  const racers = [...rivals, ...telemetry.raceMapRacers.filter((racer) => racer.kind === "player")];
  const style = { "--race-map-accent": TRACK_BY_ID[config.trackId].accent } as CSSProperties;

  return <aside className="race-mini-map" style={style} aria-label="賽道小地圖">
    <div className="race-mini-map__header">
      <div><small>LIVE TRACK</small><b>賽道位置</b></div>
      <span><i/>你　<em/>對手</span>
    </div>
    <svg viewBox="0 0 240 130" role="img" aria-label={`${TRACK_BY_ID[config.trackId].name} 即時位置`}>
      <path className="race-mini-map__track-glow" d={map.path}/>
      <path className="race-mini-map__track" d={map.path}/>
      <path className="race-mini-map__line" d={map.path}/>
      <g className="race-mini-map__start" transform={`translate(${map.startX} ${map.startY}) rotate(${map.startAngle})`}>
        <rect x="-1.2" y="-6" width="2.4" height="12"/>
      </g>
      {racers.map((racer, index) => {
        const point = getTrackMapPoint(config.trackId, racer.progress);
        if (racer.kind === "player") {
          return <g
            key={racer.id}
            className="race-mini-map__marker race-mini-map__marker--player"
            data-marker-kind="player"
            transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${(point.angle + 90).toFixed(2)})`}
          >
            <circle className="race-mini-map__player-pulse" r="9"/>
            <path d="M0 -8 L6.2 7 L0 4.4 L-6.2 7 Z"/>
          </g>;
        }
        const color = RIVAL_COLORS[index % RIVAL_COLORS.length];
        return <g
          key={racer.id}
          className={`race-mini-map__marker race-mini-map__marker--${racer.kind}`}
          data-marker-kind={racer.kind}
          style={{ "--rival-color": color } as CSSProperties}
          transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}
        >
          <circle r="5.2"/>
          <text y="1.8">{racer.rank}</text>
        </g>;
      })}
    </svg>
    <div className="race-mini-map__footer"><span>P{telemetry.position}</span><b>{rivals.length} 位對手</b></div>
  </aside>;
}
