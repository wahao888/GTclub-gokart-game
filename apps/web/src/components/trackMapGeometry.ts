import type { TrackId } from "@f1-kart/shared";
import { createTrackCurve } from "../game/trackData";

export interface TrackMapPoint {
  x: number;
  y: number;
  angle: number;
}

export interface TrackMapGeometry {
  path: string;
  startX: number;
  startY: number;
  startAngle: number;
  points: TrackMapPoint[];
}

const VIEWBOX_WIDTH = 240;
const MAP_CENTRE_Y = 65;
const MAP_WIDTH = 184;
const MAP_HEIGHT = 106;
const SAMPLE_COUNT = 320;

export function buildTrackMap(trackId: TrackId): TrackMapGeometry {
  const curvePoints = createTrackCurve(trackId).getSpacedPoints(SAMPLE_COUNT);
  const minX = Math.min(...curvePoints.map((point) => point.x));
  const maxX = Math.max(...curvePoints.map((point) => point.x));
  const minZ = Math.min(...curvePoints.map((point) => point.z));
  const maxZ = Math.max(...curvePoints.map((point) => point.z));
  const scale = Math.min(MAP_WIDTH / (maxX - minX), MAP_HEIGHT / (maxZ - minZ));
  const middleX = (minX + maxX) * 0.5;
  const middleZ = (minZ + maxZ) * 0.5;
  const projected = curvePoints.map((point) => ({
    x: VIEWBOX_WIDTH * 0.5 + (point.x - middleX) * scale,
    y: MAP_CENTRE_Y + (point.z - middleZ) * scale
  }));
  const points = projected.map((point, index): TrackMapPoint => {
    const next = projected[(index + 1) % (projected.length - 1)] ?? projected[0]!;
    return {
      ...point,
      angle: Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI
    };
  });
  const start = points[0]!;
  return {
    path: `${projected.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`,
    startX: start.x,
    startY: start.y,
    startAngle: start.angle,
    points
  };
}

export const TRACK_MAPS: Record<TrackId, TrackMapGeometry> = {
  fantasia: buildTrackMap("fantasia"),
  velocity: buildTrackMap("velocity"),
  hungaroring: buildTrackMap("hungaroring")
};

export function getTrackMapPoint(trackId: TrackId, progress: number): TrackMapPoint {
  const map = TRACK_MAPS[trackId];
  const wrapped = ((progress % 1) + 1) % 1;
  const sample = wrapped * (map.points.length - 1);
  const index = Math.floor(sample);
  const nextIndex = (index + 1) % (map.points.length - 1);
  const amount = sample - index;
  const current = map.points[index]!;
  const next = map.points[nextIndex]!;
  let angleDelta = next.angle - current.angle;
  if (angleDelta > 180) angleDelta -= 360;
  if (angleDelta < -180) angleDelta += 360;
  return {
    x: current.x + (next.x - current.x) * amount,
    y: current.y + (next.y - current.y) * amount,
    angle: current.angle + angleDelta * amount
  };
}
