import type { TrackId } from "@f1-kart/shared";
import { TRACK_MAPS } from "./trackMapGeometry";
import "./trackMap.css";

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
