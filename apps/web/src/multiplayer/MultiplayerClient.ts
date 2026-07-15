import type { ClientMessage, RaceSnapshot, RoomPlayer, ServerMessage, TrackId, VehicleId, Weather } from "@f1-kart/shared";

export type NetworkStatus = "idle" | "connecting" | "online" | "mock" | "error";

export interface MultiplayerEvents {
  onStatus: (status: NetworkStatus, detail?: string) => void;
  onRoom: (roomCode: string, hostId: string, trackId: TrackId, players: RoomPlayer[]) => void;
  onCountdown: (startsAt: number, seed: number, weather: Weather) => void;
  onRaceStart: (serverTime: number) => void;
  onSnapshots: (snapshots: RaceSnapshot[]) => void;
  onFinishOrder: (playerIds: string[]) => void;
}

export class MultiplayerClient {
  private socket?: WebSocket;
  private timeout?: number;
  playerId = "";
  roomCode = "";
  status: NetworkStatus = "idle";

  constructor(private events: MultiplayerEvents, private url = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`) {}

  connect(action: { type: "create"; name: string; vehicleId: VehicleId; trackId: TrackId } | { type: "join"; name: string; vehicleId: VehicleId; roomCode: string }): void {
    this.disconnect(false); this.setStatus("connecting", "連接賽事伺服器…");
    try {
      this.socket = new WebSocket(this.url);
      this.timeout = window.setTimeout(() => this.activateMock("伺服器 4 秒內未回應"), 4000);
      this.socket.addEventListener("open", () => {
        window.clearTimeout(this.timeout); this.setStatus("online", "WebSocket 已連線");
        if (action.type === "create") this.send({ v: 1, type: "create_room", name: action.name, vehicleId: action.vehicleId, trackId: action.trackId });
        else this.send({ v: 1, type: "join_room", name: action.name, vehicleId: action.vehicleId, roomCode: action.roomCode.trim().toUpperCase() });
      });
      this.socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
      this.socket.addEventListener("error", () => this.activateMock("WebSocket 連線失敗"));
      this.socket.addEventListener("close", () => { if (this.status === "online" || this.status === "connecting") this.activateMock("連線中斷，已切換 Mock Mode"); });
    } catch { this.activateMock("瀏覽器無法建立 WebSocket"); }
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage;
    try { message = JSON.parse(raw) as ServerMessage; } catch { return; }
    switch (message.type) {
      case "connected": this.playerId = message.playerId; break;
      case "room_state": this.roomCode = message.roomCode; this.events.onRoom(message.roomCode, message.hostId, message.trackId, message.players); break;
      case "countdown": this.events.onCountdown(message.startsAt, message.seed, message.weather); break;
      case "race_start": this.events.onRaceStart(message.serverTime); break;
      case "snapshot": this.events.onSnapshots(message.snapshots.filter((snapshot) => snapshot.playerId !== this.playerId)); break;
      case "finish_order": this.events.onFinishOrder(message.playerIds); break;
      case "error": this.setStatus("error", message.message); break;
      default: break;
    }
  }

  setReady(ready: boolean): void { this.send({ v: 1, type: "set_ready", ready }); }
  sendSnapshot(snapshot: Omit<RaceSnapshot, "playerId" | "serverTime">): void { this.send({ v: 1, type: "transform", snapshot }); }
  finish(totalTimeMs: number): void { this.send({ v: 1, type: "finish", totalTimeMs }); }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  activateMock(reason = "Mock Mode 已啟用"): void {
    window.clearTimeout(this.timeout); this.socket?.close(); this.socket = undefined; this.setStatus("mock", reason);
  }

  disconnect(sendLeave = true): void {
    window.clearTimeout(this.timeout);
    if (sendLeave) this.send({ v: 1, type: "leave_room" });
    const socket = this.socket; this.socket = undefined; socket?.close();
    this.status = "idle";
  }

  private setStatus(status: NetworkStatus, detail?: string): void { this.status = status; this.events.onStatus(status, detail); }
}
