import type {
  ClientMessage,
  ClientRaceSnapshot,
  RaceClassification,
  RaceSnapshot,
  RoomPlayer,
  ServerMessage,
  TrackId,
  VehicleId,
  Weather,
} from "@f1-kart/shared";

export type NetworkStatus = "idle" | "connecting" | "online" | "reconnecting" | "mock" | "error";

export interface MultiplayerEvents {
  onStatus: (status: NetworkStatus, detail?: string) => void;
  onRoom: (roomCode: string, hostId: string, trackId: TrackId, players: RoomPlayer[]) => void;
  onCountdown: (startsAt: number, seed: number, weather: Weather, serverTimeOffsetMs: number) => void;
  onRaceStart: (serverTime: number) => void;
  onSnapshots: (snapshots: RaceSnapshot[]) => void;
  onRaceResult: (result: Extract<ServerMessage, { type: "race_result" }>) => void;
  onRaceComplete: (classification: RaceClassification[]) => void;
  onRoomReset: (roomCode: string) => void;
}

type ConnectAction =
  | { type: "create"; name: string; vehicleId: VehicleId; trackId: TrackId }
  | { type: "join"; name: string; vehicleId: VehicleId; roomCode: string };

interface SavedSession {
  playerId: string;
  resumeToken: string;
  roomCode: string;
}

const SESSION_KEY = "f1-kart.multiplayer-session.v2";
const RECONNECT_LIMIT_MS = 30_000;
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000];

function defaultUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.DEV) return `ws://${location.hostname}:8080/ws`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export class MultiplayerClient {
  private socket?: WebSocket;
  private timeout?: number;
  private reconnectTimer?: number;
  private reconnectStartedAt = 0;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private action?: ConnectAction;
  private session?: SavedSession;
  private waitingForHandshake = false;
  private listening = false;
  private readonly handleOffline = () => {
    if (!this.session || this.intentionalClose || this.status === "idle") return;
    if (!this.reconnectStartedAt) this.reconnectStartedAt = Date.now();
    window.clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.setStatus("reconnecting", "網路已中斷，車輛已暫停；恢復連線後將自動重連…");
  };
  private readonly handleOnline = () => {
    if (this.session && this.status === "reconnecting" && !this.socket) this.openSocket(true);
  };
  playerId = "";
  roomCode = "";
  status: NetworkStatus = "idle";
  serverTimeOffsetMs = 0;

  constructor(private events: MultiplayerEvents, private url = defaultUrl()) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as SavedSession | null;
      if (saved?.playerId && saved.resumeToken && saved.roomCode) this.session = saved;
    } catch { /* ignore invalid session */ }
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("online", this.handleOnline);
    if (this.session && this.status === "idle") {
      this.intentionalClose = false;
      this.openSocket(true);
    }
  }

  dispose(): void {
    this.intentionalClose = true;
    window.clearTimeout(this.timeout);
    window.clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.status = "idle";
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("online", this.handleOnline);
  }

  connect(action: ConnectAction): void {
    this.disconnect(false);
    this.action = action;
    this.session = undefined;
    this.playerId = "";
    this.roomCode = "";
    sessionStorage.removeItem(SESSION_KEY);
    this.intentionalClose = false;
    this.openSocket(false);
  }

  retry(): void {
    if (!this.action) return;
    this.intentionalClose = false;
    this.openSocket(false);
  }

  private openSocket(resume: boolean): void {
    window.clearTimeout(this.timeout);
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.waitingForHandshake = true;
    this.setStatus(resume ? "reconnecting" : "connecting", resume ? "重新連接賽事伺服器…" : "連接賽事伺服器…");
    if (!navigator.onLine) {
      if (resume && this.session) this.scheduleReconnect();
      else this.setStatus("error", "目前沒有網路連線，請恢復網路後重試");
      return;
    }
    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      this.timeout = window.setTimeout(() => socket.close(4000, "connection timeout"), 4_000);
      socket.addEventListener("message", (event) => this.handleMessage(String(event.data), resume));
      socket.addEventListener("error", () => undefined);
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        window.clearTimeout(this.timeout);
        if (this.intentionalClose || this.status === "idle") return;
        if (this.session) this.scheduleReconnect();
        else this.setStatus("error", "無法連接賽事伺服器，請稍後重試");
      });
    } catch {
      if (this.session) this.scheduleReconnect();
      else this.setStatus("error", "瀏覽器無法建立 WebSocket 連線");
    }
  }

  private handleMessage(raw: string, resume: boolean): void {
    let message: ServerMessage;
    try { message = JSON.parse(raw) as ServerMessage; } catch { return; }
    switch (message.type) {
      case "connected":
        window.clearTimeout(this.timeout);
        this.serverTimeOffsetMs = message.serverTime - Date.now();
        this.waitingForHandshake = false;
        if (resume && this.session) {
          this.send({ v: 2, type: "resume_room", ...this.session });
        } else if (this.action?.type === "create") {
          this.send({ v: 2, type: "create_room", name: this.action.name, vehicleId: this.action.vehicleId, trackId: this.action.trackId });
        } else if (this.action?.type === "join") {
          this.send({ v: 2, type: "join_room", name: this.action.name, vehicleId: this.action.vehicleId, roomCode: this.action.roomCode.trim().toUpperCase() });
        }
        break;
      case "session":
        this.playerId = message.playerId;
        this.roomCode = message.roomCode;
        this.session = { playerId: message.playerId, resumeToken: message.resumeToken, roomCode: message.roomCode };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
        this.reconnectStartedAt = 0;
        this.reconnectAttempt = 0;
        this.setStatus("online", resume ? "已恢復賽事連線" : "WebSocket 已連線");
        break;
      case "room_state":
        this.roomCode = message.roomCode;
        this.events.onRoom(message.roomCode, message.hostId, message.trackId, message.players);
        break;
      case "countdown":
        this.events.onCountdown(message.startsAt, message.seed, message.weather, this.serverTimeOffsetMs);
        break;
      case "race_start":
        this.events.onRaceStart(message.serverTime);
        break;
      case "snapshot":
        this.events.onSnapshots(message.snapshots.filter((snapshot) => snapshot.playerId !== this.playerId));
        break;
      case "race_result":
        this.events.onRaceResult(message);
        break;
      case "race_complete":
        this.events.onRaceComplete(message.classification);
        break;
      case "room_reset":
        this.events.onRoomReset(message.roomCode);
        break;
      case "error":
        if (message.code === "RESUME_FAILED" || message.code === "PROTOCOL_UPGRADE_REQUIRED") this.clearSession();
        this.setStatus("error", message.message);
        break;
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    const now = Date.now();
    if (!this.reconnectStartedAt) this.reconnectStartedAt = now;
    if (now - this.reconnectStartedAt >= RECONNECT_LIMIT_MS) {
      this.clearSession();
      this.setStatus("error", "重連逾時，已離開賽事");
      return;
    }
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]!;
    this.reconnectAttempt += 1;
    this.setStatus("reconnecting", `連線中斷，${Math.ceil(delay / 1000)} 秒後重試…`);
    this.reconnectTimer = window.setTimeout(() => this.openSocket(true), delay);
  }

  setReady(ready: boolean): void { this.send({ v: 2, type: "set_ready", ready }); }
  sendSnapshot(snapshot: ClientRaceSnapshot): void { this.send({ v: 2, type: "transform", snapshot }); }
  sendCheckpoint(checkpoint: number, lap: number): void { this.send({ v: 2, type: "checkpoint", checkpoint, lap }); }
  finish(): void { this.send({ v: 2, type: "finish" }); }
  rematch(): void { this.send({ v: 2, type: "rematch" }); }

  private send(message: ClientMessage): void {
    if (!this.waitingForHandshake && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  activateMock(reason = "離線練習模式"): void {
    this.disconnect(false);
    this.setStatus("mock", reason);
  }

  disconnect(sendLeave = true): void {
    this.intentionalClose = true;
    window.clearTimeout(this.timeout);
    window.clearTimeout(this.reconnectTimer);
    if (sendLeave) this.send({ v: 2, type: "leave_room" });
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.clearSession();
    this.status = "idle";
  }

  private clearSession(): void {
    this.session = undefined;
    this.playerId = "";
    this.roomCode = "";
    sessionStorage.removeItem(SESSION_KEY);
  }

  private setStatus(status: NetworkStatus, detail?: string): void {
    this.status = status;
    this.events.onStatus(status, detail);
  }
}
