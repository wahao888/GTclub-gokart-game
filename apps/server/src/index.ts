import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { TRACK_BY_ID, pickWeather, type ClientMessage, type RaceSnapshot, type RoomPlayer, type ServerMessage, type TrackId, type VehicleId } from "@f1-kart/shared";

interface ClientState {
  id: string;
  socket: WebSocket;
  alive: boolean;
  roomCode?: string;
  name?: string;
  vehicleId?: VehicleId;
  ready: boolean;
  finished: boolean;
  snapshot?: RaceSnapshot;
  lastCheckpoint: number;
  lastLap: number;
}

interface Room {
  code: string;
  hostId: string;
  trackId: TrackId;
  clients: Map<string, ClientState>;
  countdownStarted: boolean;
  racing: boolean;
  finishOrder: string[];
}

const PORT = Number(process.env.PORT ?? 8080);
const clients = new Map<string, ClientState>();
const rooms = new Map<string, Room>();

function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do { code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(""); } while (rooms.has(code));
  return code;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function publicPlayers(room: Room): RoomPlayer[] {
  return [...room.clients.values()].map((client) => ({ id: client.id, name: client.name ?? "Racer", vehicleId: client.vehicleId ?? "velocity-v10", ready: client.ready, finished: client.finished, rank: room.finishOrder.indexOf(client.id) >= 0 ? room.finishOrder.indexOf(client.id) + 1 : undefined }));
}

function broadcast(room: Room, message: ServerMessage): void { room.clients.forEach((client) => send(client.socket, message)); }

function broadcastRoom(room: Room): void {
  broadcast(room, { v: 1, type: "room_state", roomCode: room.code, hostId: room.hostId, trackId: room.trackId, players: publicPlayers(room) });
}

function fail(client: ClientState, code: string, message: string): void { send(client.socket, { v: 1, type: "error", code, message }); }

function leaveRoom(client: ClientState): void {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode); client.roomCode = undefined;
  if (!room) return;
  room.clients.delete(client.id);
  broadcast(room, { v: 1, type: "player_left", playerId: client.id });
  if (room.clients.size === 0) { rooms.delete(room.code); return; }
  if (room.hostId === client.id) room.hostId = room.clients.keys().next().value as string;
  broadcastRoom(room);
}

function startIfReady(room: Room): void {
  if (room.countdownStarted || room.clients.size === 0 || [...room.clients.values()].some((client) => !client.ready)) return;
  room.countdownStarted = true;
  const seed = Date.now(); const weather = pickWeather(seed); const startsAt = Date.now() + 3200;
  broadcast(room, { v: 1, type: "countdown", startsAt, seed, weather });
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.racing = true; broadcast(room, { v: 1, type: "race_start", serverTime: Date.now() });
  }, 3200);
}

function handleMessage(client: ClientState, raw: string): void {
  let message: ClientMessage;
  try { message = JSON.parse(raw) as ClientMessage; } catch { fail(client, "INVALID_JSON", "無法解析訊息"); return; }
  if (message.v !== 1 || typeof message.type !== "string") { fail(client, "INVALID_PROTOCOL", "不支援的協定版本"); return; }
  switch (message.type) {
    case "create_room": {
      if (message.name.trim().length < 2 || message.name.trim().length > 16) { fail(client, "INVALID_NAME", "名稱需為 2–16 字"); return; }
      leaveRoom(client);
      const code = roomCode(); const room: Room = { code, hostId: client.id, trackId: message.trackId, clients: new Map(), countdownStarted: false, racing: false, finishOrder: [] };
      client.name = message.name.trim(); client.vehicleId = message.vehicleId; client.ready = false; client.finished = false; client.roomCode = code;
      room.clients.set(client.id, client); rooms.set(code, room); broadcastRoom(room); break;
    }
    case "join_room": {
      const room = rooms.get(message.roomCode.toUpperCase());
      if (!room) { fail(client, "ROOM_NOT_FOUND", "找不到房間代碼"); return; }
      if (room.clients.size >= 8) { fail(client, "ROOM_FULL", "房間已滿"); return; }
      if (room.racing || room.countdownStarted) { fail(client, "RACE_STARTED", "房間賽事已開始"); return; }
      if ([...room.clients.values()].some((entry) => entry.name?.toLowerCase() === message.name.trim().toLowerCase())) { fail(client, "NAME_TAKEN", "房間內已有相同名稱"); return; }
      leaveRoom(client); client.name = message.name.trim().slice(0, 16); client.vehicleId = message.vehicleId; client.ready = false; client.finished = false; client.roomCode = room.code;
      room.clients.set(client.id, client); broadcastRoom(room); break;
    }
    case "set_ready": {
      const room = client.roomCode ? rooms.get(client.roomCode) : undefined;
      if (!room || room.racing) return; client.ready = message.ready; broadcastRoom(room); startIfReady(room); break;
    }
    case "transform": {
      const room = client.roomCode ? rooms.get(client.roomCode) : undefined; if (!room?.racing) return;
      const snapshot = message.snapshot;
      if (!Array.isArray(snapshot.position) || snapshot.position.some((value) => !Number.isFinite(value)) || !Number.isFinite(snapshot.rotation)) return;
      const checkpointCount = TRACK_BY_ID[room.trackId].checkpointCount;
      const checkpoint = Math.min(checkpointCount - 1, Math.max(0, Math.floor(snapshot.checkpoint)));
      const lap = Math.min(TRACK_BY_ID[room.trackId].laps, Math.max(1, Math.floor(snapshot.lap)));
      client.snapshot = { ...snapshot, checkpoint, lap, playerId: client.id, serverTime: Date.now() }; break;
    }
    case "checkpoint": {
      const room = client.roomCode ? rooms.get(client.roomCode) : undefined; if (!room?.racing) return;
      const count = TRACK_BY_ID[room.trackId].checkpointCount;
      const expected = (client.lastCheckpoint + 1) % count;
      if (message.checkpoint === expected && (message.lap === client.lastLap || message.lap === client.lastLap + 1)) { client.lastCheckpoint = message.checkpoint; client.lastLap = message.lap; }
      break;
    }
    case "finish": {
      const room = client.roomCode ? rooms.get(client.roomCode) : undefined; if (!room?.racing || client.finished || !Number.isFinite(message.totalTimeMs)) return;
      client.finished = true; room.finishOrder.push(client.id); broadcast(room, { v: 1, type: "finish_order", playerIds: room.finishOrder }); broadcastRoom(room); break;
    }
    case "leave_room": leaveRoom(client); break;
    default: fail(client, "UNKNOWN_MESSAGE", "未知訊息類型");
  }
}

const httpServer = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  if (request.url === "/healthz") { response.writeHead(200); response.end(JSON.stringify({ ok: true, rooms: rooms.size, players: clients.size })); return; }
  response.writeHead(200); response.end(JSON.stringify({ name: "Formula Kart WebSocket Server", status: "online" }));
});
const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
wss.on("connection", (socket) => {
  const client: ClientState = { id: randomUUID().slice(0, 8), socket, alive: true, ready: false, finished: false, lastCheckpoint: -1, lastLap: 1 };
  clients.set(client.id, client); send(socket, { v: 1, type: "connected", playerId: client.id });
  socket.on("pong", () => { client.alive = true; });
  socket.on("message", (data) => handleMessage(client, data.toString()));
  socket.on("close", () => { setTimeout(() => { leaveRoom(client); clients.delete(client.id); }, 10_000); });
  socket.on("error", () => undefined);
});

const snapshotInterval = setInterval(() => {
  rooms.forEach((room) => {
    if (!room.racing) return;
    const snapshots = [...room.clients.values()].flatMap((client) => client.snapshot ? [client.snapshot] : []);
    snapshots.sort((a, b) => b.lap - a.lap || b.checkpoint - a.checkpoint);
    snapshots.forEach((snapshot, index) => { snapshot.rank = index + 1; });
    broadcast(room, { v: 1, type: "snapshot", snapshots });
  });
}, 100);

const heartbeatInterval = setInterval(() => {
  clients.forEach((client) => {
    if (!client.alive) { client.socket.terminate(); return; }
    client.alive = false; client.socket.ping();
  });
}, 15_000);

httpServer.listen(PORT, "0.0.0.0", () => { console.log(`Formula Kart server listening on http://0.0.0.0:${PORT}`); });

function shutdown(): void {
  clearInterval(snapshotInterval); clearInterval(heartbeatInterval);
  wss.close(() => httpServer.close(() => process.exit(0)));
}
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
