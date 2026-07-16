import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  TRACK_BY_ID,
  VEHICLE_BY_ID,
  pickWeather,
  type ClientMessage,
  type ClientRaceSnapshot,
  type PartLevel,
  type RaceClassification,
  type RaceSnapshot,
  type RoomPlayer,
  type ServerMessage,
  type TrackId,
  type VehicleId,
} from "@f1-kart/shared";

type Timeout = ReturnType<typeof setTimeout>;

export interface KartServerOptions {
  host?: string;
  port?: number;
  allowedOrigins?: string[];
  maxPlayersPerRoom?: number;
  maxConnections?: number;
  maxRooms?: number;
  maxMessagesPerSecond?: number;
  maxTransformsPerSecond?: number;
  reconnectGraceMs?: number;
  countdownMs?: number;
  roomIdleTtlMs?: number;
  raceTimeoutMs?: number;
  minimumRaceDurationMs?: number;
  snapshotIntervalMs?: number;
  heartbeatIntervalMs?: number;
  maxBufferedBytes?: number;
}

interface ResolvedOptions {
  host: string;
  port: number;
  allowedOrigins: Set<string>;
  maxPlayersPerRoom: number;
  maxConnections: number;
  maxRooms: number;
  maxMessagesPerSecond: number;
  maxTransformsPerSecond: number;
  reconnectGraceMs: number;
  countdownMs: number;
  roomIdleTtlMs: number;
  raceTimeoutMs: number;
  minimumRaceDurationMs?: number;
  snapshotIntervalMs: number;
  heartbeatIntervalMs: number;
  maxBufferedBytes: number;
}

interface ConnectionState {
  socket: WebSocket;
  alive: boolean;
  windowStartedAt: number;
  messagesInWindow: number;
  player?: PlayerState;
}

interface PlayerState {
  id: string;
  resumeToken: string;
  socket?: WebSocket;
  connected: boolean;
  disconnectTimer?: Timeout;
  roomCode: string;
  name: string;
  vehicleId: VehicleId;
  livery: PartLevel;
  ready: boolean;
  finished: boolean;
  dnf: boolean;
  snapshot?: RaceSnapshot;
  lastTransformAt: number;
  lastCheckpoint?: number;
  lastLap: number;
  progressCount: number;
}

interface Room {
  code: string;
  hostId: string;
  trackId: TrackId;
  players: Map<string, PlayerState>;
  countdownStarted: boolean;
  racing: boolean;
  completed: boolean;
  startsAt?: number;
  seed?: number;
  weather?: ReturnType<typeof pickWeather>;
  startedAt?: number;
  finishOrder: string[];
  results: Map<string, { rank: number; totalTimeMs: number }>;
  lastActivityAt: number;
  countdownTimer?: Timeout;
  raceTimer?: Timeout;
}

export interface KartServer {
  start: () => Promise<AddressInfo>;
  close: () => Promise<void>;
  address: () => AddressInfo | null;
  stats: () => { rooms: number; players: number; connections: number };
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function resolveOptions(options: KartServerOptions): ResolvedOptions {
  const envOrigins = (process.env.ALLOWED_ORIGINS ?? (process.env.NODE_ENV === "production" ? "https://gtclub.tw,https://www.gtclub.tw" : ""))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return {
    host: options.host ?? process.env.HOST ?? "0.0.0.0",
    port: options.port ?? envInt("PORT", 8080),
    allowedOrigins: new Set(options.allowedOrigins ?? envOrigins),
    maxPlayersPerRoom: options.maxPlayersPerRoom ?? envInt("MAX_PLAYERS_PER_ROOM", 10),
    maxConnections: options.maxConnections ?? envInt("MAX_CONNECTIONS", 50),
    maxRooms: options.maxRooms ?? envInt("MAX_ROOMS", 20),
    maxMessagesPerSecond: options.maxMessagesPerSecond ?? envInt("MAX_MESSAGES_PER_SECOND", 30),
    maxTransformsPerSecond: options.maxTransformsPerSecond ?? envInt("MAX_TRANSFORMS_PER_SECOND", 20),
    reconnectGraceMs: options.reconnectGraceMs ?? envInt("RECONNECT_GRACE_MS", 30_000),
    countdownMs: options.countdownMs ?? envInt("COUNTDOWN_MS", 5_000),
    roomIdleTtlMs: options.roomIdleTtlMs ?? envInt("ROOM_IDLE_TTL_MS", 30 * 60_000),
    raceTimeoutMs: options.raceTimeoutMs ?? envInt("RACE_TIMEOUT_MS", 15 * 60_000),
    minimumRaceDurationMs: options.minimumRaceDurationMs,
    snapshotIntervalMs: options.snapshotIntervalMs ?? 100,
    heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15_000,
    maxBufferedBytes: options.maxBufferedBytes ?? 256 * 1024,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVehicleId(value: unknown): value is VehicleId {
  return typeof value === "string" && value in VEHICLE_BY_ID;
}

function isTrackId(value: unknown): value is TrackId {
  return typeof value === "string" && value in TRACK_BY_ID;
}

function isPartLevel(value: unknown): value is PartLevel {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 16;
}

function validRoomCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{6}$/i.test(value);
}

function validFinite(value: unknown, limit = 20_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function validSnapshot(value: unknown): value is ClientRaceSnapshot {
  if (!isRecord(value) || !isVehicleId(value.vehicleId) || !isPartLevel(value.livery)) return false;
  if (!Array.isArray(value.position) || value.position.length !== 3 || !value.position.every((entry) => validFinite(entry))) return false;
  return validFinite(value.rotation, 100)
    && validFinite(value.speed, 500)
    && value.speed >= 0
    && Number.isInteger(value.lap)
    && Number.isInteger(value.checkpoint)
    && typeof value.finished === "boolean";
}

function parseMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.v !== 2 || typeof value.type !== "string") return null;
  switch (value.type) {
    case "create_room":
      return validName(value.name) && isVehicleId(value.vehicleId) && isTrackId(value.trackId) ? value as unknown as ClientMessage : null;
    case "join_room":
      return validName(value.name) && isVehicleId(value.vehicleId) && validRoomCode(value.roomCode) ? value as unknown as ClientMessage : null;
    case "resume_room":
      return typeof value.playerId === "string" && typeof value.resumeToken === "string" && validRoomCode(value.roomCode) ? value as unknown as ClientMessage : null;
    case "set_ready":
      return typeof value.ready === "boolean" ? value as unknown as ClientMessage : null;
    case "transform":
      return validSnapshot(value.snapshot) ? value as unknown as ClientMessage : null;
    case "checkpoint":
      return Number.isInteger(value.checkpoint) && Number.isInteger(value.lap) ? value as unknown as ClientMessage : null;
    case "finish":
    case "rematch":
    case "leave_room":
      return value as unknown as ClientMessage;
    default:
      return null;
  }
}

export function createKartServer(input: KartServerOptions = {}): KartServer {
  const config = resolveOptions(input);
  const startedAt = Date.now();
  const connections = new Set<ConnectionState>();
  const players = new Map<string, PlayerState>();
  const rooms = new Map<string, Room>();
  const timers = new Set<ReturnType<typeof setInterval>>();

  function send(socket: WebSocket | undefined, message: ServerMessage): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > config.maxBufferedBytes) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function fail(connection: ConnectionState, code: string, message: string, retryable = false): void {
    send(connection.socket, { v: 2, type: "error", code, message, retryable });
  }

  function broadcast(room: Room, message: ServerMessage): void {
    room.players.forEach((player) => send(player.socket, message));
  }

  function publicPlayers(room: Room): RoomPlayer[] {
    return [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      vehicleId: player.vehicleId,
      ready: player.ready,
      finished: player.finished,
      connected: player.connected,
      dnf: player.dnf,
      rank: room.results.get(player.id)?.rank,
    }));
  }

  function broadcastRoom(room: Room): void {
    broadcast(room, { v: 2, type: "room_state", roomCode: room.code, hostId: room.hostId, trackId: room.trackId, players: publicPlayers(room) });
  }

  function roomCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do { code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(""); } while (rooms.has(code));
    return code;
  }

  function clearPlayerTimer(player: PlayerState): void {
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }

  function deleteRoom(room: Room): void {
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    if (room.raceTimer) clearTimeout(room.raceTimer);
    room.players.forEach((player) => {
      clearPlayerTimer(player);
      players.delete(player.id);
      if (player.socket?.readyState === WebSocket.OPEN) player.socket.close(1001, "房間已關閉");
    });
    rooms.delete(room.code);
  }

  function transferHost(room: Room): void {
    if (room.players.get(room.hostId)?.connected) return;
    room.hostId = ([...room.players.values()].find((player) => player.connected) ?? room.players.values().next().value as PlayerState | undefined)?.id ?? "";
  }

  function classification(room: Room): RaceClassification[] {
    return [...room.players.values()].map((player) => {
      const result = room.results.get(player.id);
      return result
        ? { playerId: player.id, rank: result.rank, totalTimeMs: result.totalTimeMs, status: "finished" as const }
        : { playerId: player.id, status: "dnf" as const };
    });
  }

  function completeRace(room: Room): void {
    if (room.completed) return;
    room.racing = false;
    room.countdownStarted = false;
    room.completed = true;
    if (room.raceTimer) clearTimeout(room.raceTimer);
    room.raceTimer = undefined;
    broadcast(room, { v: 2, type: "race_complete", classification: classification(room) });
    broadcastRoom(room);
  }

  function checkRaceComplete(room: Room): void {
    if (room.racing && [...room.players.values()].every((player) => player.finished || player.dnf)) completeRace(room);
  }

  function removePlayer(player: PlayerState, notify = true): void {
    clearPlayerTimer(player);
    const room = rooms.get(player.roomCode);
    players.delete(player.id);
    if (!room) return;
    room.players.delete(player.id);
    room.lastActivityAt = Date.now();
    if (notify) broadcast(room, { v: 2, type: "player_left", playerId: player.id });
    if (room.players.size === 0) { deleteRoom(room); return; }
    if (room.hostId === player.id) transferHost(room);
    broadcastRoom(room);
    checkRaceComplete(room);
  }

  function expireDisconnectedPlayer(player: PlayerState): void {
    const room = rooms.get(player.roomCode);
    if (!room || player.connected) return;
    if (room.racing && !player.finished) {
      player.dnf = true;
      transferHost(room);
      broadcastRoom(room);
      checkRaceComplete(room);
      return;
    }
    removePlayer(player);
  }

  function makePlayer(connection: ConnectionState, room: Room, name: string, vehicleId: VehicleId): PlayerState {
    const player: PlayerState = {
      id: randomUUID().replaceAll("-", "").slice(0, 12),
      resumeToken: randomUUID() + randomUUID(),
      socket: connection.socket,
      connected: true,
      roomCode: room.code,
      name: name.trim(),
      vehicleId,
      livery: 0,
      ready: false,
      finished: false,
      dnf: false,
      lastTransformAt: 0,
      lastLap: 1,
      progressCount: 0,
    };
    connection.player = player;
    room.players.set(player.id, player);
    players.set(player.id, player);
    send(player.socket, { v: 2, type: "session", playerId: player.id, resumeToken: player.resumeToken, roomCode: room.code });
    return player;
  }

  function resetPlayerForRace(player: PlayerState): void {
    player.ready = false;
    player.finished = false;
    player.dnf = false;
    player.snapshot = undefined;
    player.lastTransformAt = 0;
    player.lastCheckpoint = undefined;
    player.lastLap = 1;
    player.progressCount = 0;
  }

  function startIfReady(room: Room): void {
    const active = [...room.players.values()];
    if (room.countdownStarted || room.racing || room.completed || active.length < 2) return;
    if (active.some((player) => !player.connected || !player.ready)) return;
    room.countdownStarted = true;
    room.lastActivityAt = Date.now();
    room.seed = Date.now();
    room.weather = pickWeather(room.seed);
    room.startsAt = Date.now() + config.countdownMs;
    broadcast(room, { v: 2, type: "countdown", startsAt: room.startsAt, seed: room.seed, weather: room.weather });
    room.countdownTimer = setTimeout(() => {
      if (!rooms.has(room.code) || room.completed) return;
      room.racing = true;
      room.startedAt = room.startsAt;
      room.lastActivityAt = Date.now();
      room.players.forEach((player) => {
        player.finished = false;
        player.dnf = false;
        player.lastTransformAt = 0;
        player.lastCheckpoint = undefined;
        player.lastLap = 1;
        player.progressCount = 0;
      });
      broadcast(room, { v: 2, type: "race_start", serverTime: Date.now() });
      room.raceTimer = setTimeout(() => {
        room.players.forEach((player) => { if (!player.finished) player.dnf = true; });
        completeRace(room);
      }, config.raceTimeoutMs);
    }, config.countdownMs);
  }

  function recordProgress(player: PlayerState, checkpoint: number, lap: number): boolean {
    const room = rooms.get(player.roomCode);
    if (!room) return false;
    const track = TRACK_BY_ID[room.trackId];
    if (!Number.isInteger(checkpoint) || checkpoint < 0 || checkpoint >= track.checkpointCount) return false;
    if (!Number.isInteger(lap) || lap < 1 || lap > track.laps) return false;
    if (player.lastCheckpoint === undefined) {
      if (lap !== 1) return false;
      player.lastCheckpoint = checkpoint;
      player.lastLap = lap;
      return true;
    }
    if (checkpoint === player.lastCheckpoint) return lap === player.lastLap;
    if (checkpoint !== (player.lastCheckpoint + 1) % track.checkpointCount) return false;
    const wrapped = player.lastCheckpoint === track.checkpointCount - 1 && checkpoint === 0;
    const firstGridCrossing = wrapped && player.lastLap === 1 && player.progressCount === 0 && lap === 1;
    if (wrapped && !firstGridCrossing && lap !== player.lastLap + 1) return false;
    if (!wrapped && lap !== player.lastLap) return false;
    player.lastCheckpoint = checkpoint;
    player.lastLap = lap;
    player.progressCount += 1;
    return true;
  }

  function acceptTransform(player: PlayerState, snapshot: ClientRaceSnapshot): boolean {
    const room = rooms.get(player.roomCode);
    if (!room?.racing || player.finished || player.dnf) return false;
    if (snapshot.vehicleId !== player.vehicleId || !isPartLevel(snapshot.livery)) return false;
    const now = Date.now();
    const minimumInterval = 1000 / config.maxTransformsPerSecond;
    if (player.lastTransformAt && now - player.lastTransformAt < minimumInterval) return false;
    if (player.snapshot && player.lastTransformAt) {
      const elapsed = Math.min(2, Math.max(0.001, (now - player.lastTransformAt) / 1000));
      const distance = Math.hypot(
        snapshot.position[0] - player.snapshot.position[0],
        snapshot.position[1] - player.snapshot.position[1],
        snapshot.position[2] - player.snapshot.position[2],
      );
      const allowedDistance = Math.max(25, (Math.max(snapshot.speed, player.snapshot.speed) / 3.6 + 30) * elapsed * 3);
      if (distance > allowedDistance) return false;
    }
    if (!recordProgress(player, snapshot.checkpoint, snapshot.lap)) return false;
    player.lastTransformAt = now;
    player.livery = snapshot.livery;
    player.snapshot = {
      ...snapshot,
      playerId: player.id,
      serverTime: now,
      vehicleId: player.vehicleId,
      rank: 0,
      finished: player.finished,
    };
    room.lastActivityAt = now;
    return true;
  }

  function minimumRaceDuration(room: Room): number {
    if (config.minimumRaceDurationMs !== undefined) return config.minimumRaceDurationMs;
    const track = TRACK_BY_ID[room.trackId];
    return Math.floor((track.lengthKm * 1000 * track.laps / 110) * 1000 * 0.55);
  }

  function finishPlayer(connection: ConnectionState): void {
    const player = connection.player;
    const room = player ? rooms.get(player.roomCode) : undefined;
    if (!player || !room?.racing || player.finished || player.dnf || room.startedAt === undefined) return;
    const requiredProgress = Math.max(1, TRACK_BY_ID[room.trackId].checkpointCount * TRACK_BY_ID[room.trackId].laps - 1);
    const elapsed = Date.now() - room.startedAt;
    if (player.progressCount < requiredProgress || elapsed < minimumRaceDuration(room)) {
      fail(connection, "INVALID_FINISH", "尚未完成有效圈數，完賽結果未被接受");
      return;
    }
    player.finished = true;
    if (player.snapshot) player.snapshot.finished = true;
    room.finishOrder.push(player.id);
    const result = { rank: room.finishOrder.length, totalTimeMs: elapsed };
    room.results.set(player.id, result);
    room.lastActivityAt = Date.now();
    broadcast(room, {
      v: 2,
      type: "race_result",
      playerId: player.id,
      rank: result.rank,
      totalRacers: room.players.size,
      totalTimeMs: result.totalTimeMs,
      finishOrder: [...room.finishOrder],
    });
    broadcastRoom(room);
    checkRaceComplete(room);
  }

  function resumePlayer(connection: ConnectionState, message: Extract<ClientMessage, { type: "resume_room" }>): void {
    const player = players.get(message.playerId);
    const room = rooms.get(message.roomCode.toUpperCase());
    if (!player || !room || player.roomCode !== room.code || player.resumeToken !== message.resumeToken || player.dnf) {
      fail(connection, "RESUME_FAILED", "無法恢復先前的房間", false);
      return;
    }
    if (player.connected) {
      fail(connection, "SESSION_ACTIVE", "這個玩家連線仍在使用中");
      return;
    }
    clearPlayerTimer(player);
    player.socket = connection.socket;
    player.connected = true;
    connection.player = player;
    room.lastActivityAt = Date.now();
    send(player.socket, { v: 2, type: "session", playerId: player.id, resumeToken: player.resumeToken, roomCode: room.code });
    send(player.socket, { v: 2, type: "room_state", roomCode: room.code, hostId: room.hostId, trackId: room.trackId, players: publicPlayers(room) });
    if (room.countdownStarted && room.startsAt && room.seed && room.weather) {
      send(player.socket, { v: 2, type: "countdown", startsAt: room.startsAt, seed: room.seed, weather: room.weather });
    }
    if (room.racing) send(player.socket, { v: 2, type: "race_start", serverTime: Date.now() });
    broadcastRoom(room);
  }

  function resetRoom(connection: ConnectionState): void {
    const player = connection.player;
    const room = player ? rooms.get(player.roomCode) : undefined;
    if (!player || !room || room.hostId !== player.id || !room.completed) {
      fail(connection, "REMATCH_NOT_ALLOWED", "只有房主可在賽後發起重賽");
      return;
    }
    [...room.players.values()].forEach((entry) => {
      if (!entry.connected) removePlayer(entry, false);
      else resetPlayerForRace(entry);
    });
    if (!rooms.has(room.code) || room.players.size === 0) return;
    room.countdownStarted = false;
    room.racing = false;
    room.completed = false;
    room.startsAt = undefined;
    room.startedAt = undefined;
    room.finishOrder = [];
    room.results.clear();
    room.lastActivityAt = Date.now();
    transferHost(room);
    broadcast(room, { v: 2, type: "room_reset", roomCode: room.code });
    broadcastRoom(room);
  }

  function handleMessage(connection: ConnectionState, raw: string): void {
    const now = Date.now();
    if (now - connection.windowStartedAt >= 1000) {
      connection.windowStartedAt = now;
      connection.messagesInWindow = 0;
    }
    connection.messagesInWindow += 1;
    if (connection.messagesInWindow > config.maxMessagesPerSecond) {
      fail(connection, "RATE_LIMITED", "訊息頻率過高，連線已關閉", true);
      connection.socket.close(1008, "rate limited");
      return;
    }
    const message = parseMessage(raw);
    if (!message) {
      const legacy = raw.includes('"v":1');
      fail(connection, legacy ? "PROTOCOL_UPGRADE_REQUIRED" : "INVALID_MESSAGE", legacy ? "遊戲已更新，請重新整理頁面" : "訊息格式無效");
      return;
    }
    switch (message.type) {
      case "create_room": {
        if (connection.player) { fail(connection, "ALREADY_IN_ROOM", "請先離開目前房間"); return; }
        if (rooms.size >= config.maxRooms) { fail(connection, "SERVER_BUSY", "房間數已達上限，請稍後再試", true); return; }
        const code = roomCode();
        const room: Room = {
          code,
          hostId: "",
          trackId: message.trackId,
          players: new Map(),
          countdownStarted: false,
          racing: false,
          completed: false,
          finishOrder: [],
          results: new Map(),
          lastActivityAt: now,
        };
        rooms.set(code, room);
        const player = makePlayer(connection, room, message.name, message.vehicleId);
        room.hostId = player.id;
        broadcastRoom(room);
        break;
      }
      case "join_room": {
        if (connection.player) { fail(connection, "ALREADY_IN_ROOM", "請先離開目前房間"); return; }
        const room = rooms.get(message.roomCode.toUpperCase());
        if (!room) { fail(connection, "ROOM_NOT_FOUND", "找不到房間代碼"); return; }
        if (room.players.size >= config.maxPlayersPerRoom) { fail(connection, "ROOM_FULL", `房間已滿，最多 ${config.maxPlayersPerRoom} 人`); return; }
        if (room.racing || room.countdownStarted || room.completed) { fail(connection, "RACE_STARTED", "房間賽事已開始或等待重賽"); return; }
        if ([...room.players.values()].some((entry) => entry.name.toLocaleLowerCase() === message.name.trim().toLocaleLowerCase())) {
          fail(connection, "NAME_TAKEN", "房間內已有相同名稱"); return;
        }
        makePlayer(connection, room, message.name, message.vehicleId);
        room.lastActivityAt = now;
        broadcastRoom(room);
        break;
      }
      case "resume_room":
        resumePlayer(connection, message);
        break;
      case "set_ready": {
        const player = connection.player;
        const room = player ? rooms.get(player.roomCode) : undefined;
        if (!player || !room || room.racing || room.completed) return;
        player.ready = message.ready;
        room.lastActivityAt = now;
        broadcastRoom(room);
        startIfReady(room);
        break;
      }
      case "transform":
        if (connection.player) acceptTransform(connection.player, message.snapshot);
        break;
      case "checkpoint":
        if (connection.player && rooms.get(connection.player.roomCode)?.racing) recordProgress(connection.player, message.checkpoint, message.lap);
        break;
      case "finish":
        finishPlayer(connection);
        break;
      case "rematch":
        resetRoom(connection);
        break;
      case "leave_room":
        if (connection.player) {
          const player = connection.player;
          connection.player = undefined;
          removePlayer(player);
        }
        break;
      default:
        break;
    }
  }

  const httpServer: HttpServer = createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    if (request.url === "/healthz") {
      response.writeHead(200);
      response.end(JSON.stringify({
        ok: true,
        name: "Formula Kart WebSocket Server",
        version: "2.0.0",
        protocol: 2,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        rooms: rooms.size,
        players: [...players.values()].filter((player) => player.connected).length,
        connections: connections.size,
      }));
      return;
    }
    response.writeHead(200);
    response.end(JSON.stringify({ name: "Formula Kart WebSocket Server", status: "online", protocol: 2 }));
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: 16 * 1024,
    verifyClient: ({ origin }, done) => {
      const allowed = config.allowedOrigins.size === 0 || (!!origin && config.allowedOrigins.has(origin));
      done(allowed, allowed ? 101 : 403, allowed ? undefined : "Origin not allowed");
    },
  });

  wss.on("connection", (socket) => {
    if (connections.size >= config.maxConnections) {
      send(socket, { v: 2, type: "error", code: "SERVER_BUSY", message: "連線人數已達上限，請稍後再試", retryable: true });
      socket.close(1013, "server busy");
      return;
    }
    const connection: ConnectionState = { socket, alive: true, windowStartedAt: Date.now(), messagesInWindow: 0 };
    connections.add(connection);
    send(socket, { v: 2, type: "connected", serverTime: Date.now() });
    socket.on("pong", () => { connection.alive = true; });
    socket.on("message", (data) => handleMessage(connection, data.toString()));
    socket.on("close", () => {
      connections.delete(connection);
      const player = connection.player;
      if (!player || player.socket !== socket) return;
      player.socket = undefined;
      player.connected = false;
      const room = rooms.get(player.roomCode);
      if (room) broadcastRoom(room);
      player.disconnectTimer = setTimeout(() => expireDisconnectedPlayer(player), config.reconnectGraceMs);
    });
    socket.on("error", () => undefined);
  });
  wss.on("error", () => undefined);

  timers.add(setInterval(() => {
    rooms.forEach((room) => {
      if (!room.racing) return;
      const snapshots = [...room.players.values()].flatMap((player) => player.snapshot ? [player.snapshot] : []);
      snapshots.sort((a, b) => {
        const first = room.players.get(a.playerId)?.progressCount ?? 0;
        const second = room.players.get(b.playerId)?.progressCount ?? 0;
        return second - first || b.checkpoint - a.checkpoint;
      });
      snapshots.forEach((snapshot, index) => { snapshot.rank = index + 1; });
      broadcast(room, { v: 2, type: "snapshot", snapshots });
    });
  }, config.snapshotIntervalMs));

  timers.add(setInterval(() => {
    connections.forEach((connection) => {
      if (!connection.alive) { connection.socket.terminate(); return; }
      connection.alive = false;
      connection.socket.ping();
    });
  }, config.heartbeatIntervalMs));

  timers.add(setInterval(() => {
    const now = Date.now();
    rooms.forEach((room) => {
      if (!room.racing && now - room.lastActivityAt > config.roomIdleTtlMs) deleteRoom(room);
    });
  }, Math.min(60_000, Math.max(1_000, config.roomIdleTtlMs / 2))));

  return {
    start: () => new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(config.port, config.host, () => {
        httpServer.off("error", reject);
        resolve(httpServer.address() as AddressInfo);
      });
    }),
    close: async () => {
      timers.forEach((timer) => clearInterval(timer));
      rooms.forEach((room) => {
        if (room.countdownTimer) clearTimeout(room.countdownTimer);
        if (room.raceTimer) clearTimeout(room.raceTimer);
        room.players.forEach(clearPlayerTimer);
      });
      wss.clients.forEach((socket) => socket.terminate());
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
    address: () => httpServer.address() as AddressInfo | null,
    stats: () => ({ rooms: rooms.size, players: players.size, connections: connections.size }),
  };
}
