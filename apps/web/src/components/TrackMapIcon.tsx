import type { TrackId } from "@f1-kart/shared";
import { createTrackCurve } from "../game/trackData";
import "./trackMap.css";

interface TrackMapGeometry {
  path: string;
  startX: number;
  startY: number;
  startAngle: number;
}

const VIEWBOX_WIDTH = 240;
const MAP_CENTRE_Y = 65;
const MAP_WIDTH = 184;
const MAP_HEIGHT = 106;

function buildTrackMap(trackId: TrackId): TrackMapGeometry {
  const points = createTrackCurve(trackId).getSpacedPoints(160);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const scale = Math.min(MAP_WIDTH / (maxX - minX), MAP_HEIGHT / (maxZ - minZ));
  const middleX = (minX + maxX) * 0.5;
  const middleZ = (minZ + maxZ) * 0.5;
  const projected = points.map((point) => ({
    x: VIEWBOX_WIDTH * 0.5 + (point.x - middleX) * scale,
    y: MAP_CENTRE_Y + (point.z - middleZ) * scale
  }));
  const start = projected[0]!;
  const next = projected[1]!;
  return {
    path: `${projected.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`,
    startX: start.x,
    startY: start.y,
    startAngle: Math.atan2(next.y - start.y, next.x - start.x) * 180 / Math.PI
  };
}

const TRACK_MAPS: Record<TrackId, TrackMapGeometry> = {
  fantasia: buildTrackMap("fantasia"),
  velocity: buildTrackMap("velocity")
};

export function TrackMapIcon({ trackId }: { trackId: TrackId }) {
  const map = TRACK_MAPS[trackId];
  return <svg className="track-map" data-track-id={trackId} viewBox="0 0 240 150" aria-hidden="true">
    <path className="track-map-glow" d={map.path}/>
    <path className="track-map-road" d={map.path}/>
    <path className="track-map-surface" d={map.path}/>
    <path className="track-map-centre" d={map.path}/>
    <g className="track-map-start" transform={`translate(${map.startX} ${map.startY}) rotate(${map.startAngle})`}>
      <rect x="-1.8" y="-8" width="3.6" height="16"/>
      <rect className="track-map-start-dark" x="-1.8" y="-8" width="3.6" height="4"/>
      <rect className="track-map-start-dark" x="-1.8" y="0" width="3.6" height="4"/>
    </g>
  </svg>;
}
