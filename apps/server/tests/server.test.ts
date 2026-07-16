import { once } from "node:events";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@f1-kart/shared";
import { createKartServer, type KartServer, type KartServerOptions } from "../src/server";

class TestClient {
  private messages: ServerMessage[] = [];
  private waiters: Array<{ type: ServerMessage["type"]; resolve: (message: ServerMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(readonly socket: WebSocket) {
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as ServerMessage;
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.type === message.type);
      if (waiterIndex >= 0) {
        const waiter = this.waiters.splice(waiterIndex, 1)[0]!;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else this.messages.push(message);
    });
  }

  send(message: ClientMessage): void { this.socket.send(JSON.stringify(message)); }
  sendRaw(message: string): void { this.socket.send(message); }

  next<T extends ServerMessage["type"]>(type: T, timeoutMs = 2_000): Promise<Extract<ServerMessage, { type: T }>> {
    const index = this.messages.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push({ type, resolve: (message) => resolve(message as Extract<ServerMessage, { type: T }>), reject, timer });
    });
  }

  close(): void { this.socket.close(); }
}

const servers: KartServer[] = [];
const clients: TestClient[] = [];

async function startServer(options: KartServerOptions = {}): Promise<{ server: KartServer; url: string }> {
  const server = createKartServer({
    host: "127.0.0.1",
    port: 0,
    countdownMs: 30,
    reconnectGraceMs: 100,
    minimumRaceDurationMs: 0,
    raceTimeoutMs: 1_000,
    roomIdleTtlMs: 5_000,
    maxMessagesPerSecond: 1_000,
    maxTransformsPerSecond: 1_000,
    snapshotIntervalMs: 20,
    heartbeatIntervalMs: 5_000,
    ...options,
  });
  servers.push(server);
  const address = await server.start();
  return { server, url: `ws://127.0.0.1:${address.port}/ws` };
}

async function connect(url: string, origin?: string): Promise<TestClient> {
  const socket = new WebSocket(url, origin ? { origin } : undefined);
  const client = new TestClient(socket);
  clients.push(client);
  await once(socket, "open");
  await client.next("connected");
  return client;
}

async function createRoom(client: TestClient, name = "Host Racer"): Promise<Extract<ServerMessage, { type: "session" }>> {
  client.send({ v: 2, type: "create_room", name, vehicleId: "velocity-v10", trackId: "hungaroring" });
  return client.next("session");
}

async function joinRoom(client: TestClient, roomCode: string, name: string): Promise<Extract<ServerMessage, { type: "session" }>> {
  client.send({ v: 2, type: "join_room", name, vehicleId: "velocity-v10", roomCode });
  return client.next("session");
}

async function startRace(host: TestClient, guest: TestClient): Promise<void> {
  host.send({ v: 2, type: "set_ready", ready: true });
  guest.send({ v: 2, type: "set_ready", ready: true });
  await Promise.all([host.next("countdown"), guest.next("countdown")]);
  await Promise.all([host.next("race_start"), guest.next("race_start")]);
}

function completeHungaroring(client: TestClient): void {
  client.send({ v: 2, type: "checkpoint", checkpoint: 0, lap: 1 });
  for (let checkpoint = 1; checkpoint < 14; checkpoint += 1) {
    client.send({ v: 2, type: "checkpoint", checkpoint, lap: 1 });
  }
  client.send({ v: 2, type: "finish" });
}

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("Formula Kart protocol v2 server", () => {
  it("caps rooms at ten players and rejects duplicate names", async () => {
    const { url } = await startServer();
    const host = await connect(url);
    const hostSession = await createRoom(host);

    const duplicate = await connect(url);
    duplicate.send({ v: 2, type: "join_room", name: "host racer", vehicleId: "velocity-v10", roomCode: hostSession.roomCode });
    expect((await duplicate.next("error")).code).toBe("NAME_TAKEN");

    for (let index = 1; index <= 9; index += 1) {
      const guest = await connect(url);
      await joinRoom(guest, hostSession.roomCode, `Guest ${index}`);
    }
    const eleventh = await connect(url);
    eleventh.send({ v: 2, type: "join_room", name: "Guest 10", vehicleId: "velocity-v10", roomCode: hostSession.roomCode });
    const error = await eleventh.next("error");
    expect(error.code).toBe("ROOM_FULL");
  });

  it("requires valid progress, publishes authoritative results, and supports host rematch", async () => {
    const { url } = await startServer();
    const host = await connect(url);
    const hostSession = await createRoom(host);
    const guest = await connect(url);
    const guestSession = await joinRoom(guest, hostSession.roomCode, "Guest Racer");
    await startRace(host, guest);

    host.send({ v: 2, type: "finish" });
    expect((await host.next("error")).code).toBe("INVALID_FINISH");

    completeHungaroring(host);
    const hostResult = await host.next("race_result");
    expect(hostResult).toMatchObject({ playerId: hostSession.playerId, rank: 1, totalRacers: 2 });
    await guest.next("race_result");

    completeHungaroring(guest);
    const guestResult = await guest.next("race_result");
    expect(guestResult).toMatchObject({ playerId: guestSession.playerId, rank: 2, totalRacers: 2 });
    const completed = await host.next("race_complete");
    expect(completed.classification).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: hostSession.playerId, rank: 1, status: "finished" }),
      expect.objectContaining({ playerId: guestSession.playerId, rank: 2, status: "finished" }),
    ]));

    host.send({ v: 2, type: "rematch" });
    await Promise.all([host.next("room_reset"), guest.next("room_reset")]);
    let room = await host.next("room_state");
    for (let attempt = 0; attempt < 12 && (room.players.length !== 2 || room.players.some((player) => player.ready || player.finished)); attempt += 1) {
      room = await host.next("room_state");
    }
    expect(room.players).toHaveLength(2);
    expect(room.players.every((player) => !player.ready && !player.finished)).toBe(true);
  });

  it("resumes a disconnected player within the grace period and expires it afterward", async () => {
    const { url } = await startServer({ reconnectGraceMs: 80 });
    const host = await connect(url);
    const session = await createRoom(host);
    host.socket.close();
    await once(host.socket, "close");

    const resumed = await connect(url);
    resumed.send({ v: 2, type: "resume_room", playerId: session.playerId, resumeToken: session.resumeToken, roomCode: session.roomCode });
    const resumedSession = await resumed.next("session");
    expect(resumedSession.playerId).toBe(session.playerId);
    expect((await resumed.next("room_state")).players[0]?.connected).toBe(true);

    resumed.socket.close();
    await once(resumed.socket, "close");
    await new Promise((resolve) => setTimeout(resolve, 120));
    const expired = await connect(url);
    expired.send({ v: 2, type: "resume_room", playerId: session.playerId, resumeToken: session.resumeToken, roomCode: session.roomCode });
    expect((await expired.next("error")).code).toBe("RESUME_FAILED");
  });

  it("isolates room snapshots and transfers the host after the reconnect deadline", async () => {
    const { url } = await startServer({ reconnectGraceMs: 60 });
    const hostA = await connect(url);
    const sessionA = await createRoom(hostA, "Room A Host");
    const guestA = await connect(url);
    await joinRoom(guestA, sessionA.roomCode, "Room A Guest");
    const hostB = await connect(url);
    const sessionB = await createRoom(hostB, "Room B Host");
    const guestB = await connect(url);
    const guestBSession = await joinRoom(guestB, sessionB.roomCode, "Room B Guest");
    await Promise.all([startRace(hostA, guestA), startRace(hostB, guestB)]);

    hostA.send({
      v: 2,
      type: "transform",
      snapshot: { vehicleId: "velocity-v10", livery: 0, position: [0, 0, 0], rotation: 0, speed: 20, lap: 1, checkpoint: 0, finished: false },
    });
    const roomASnapshot = await guestA.next("snapshot");
    expect(roomASnapshot.snapshots.some((snapshot) => snapshot.playerId === sessionA.playerId)).toBe(true);
    const roomBSnapshot = await hostB.next("snapshot");
    expect(roomBSnapshot.snapshots.some((snapshot) => snapshot.playerId === sessionA.playerId)).toBe(false);

    hostB.socket.close();
    await once(hostB.socket, "close");
    let state = await guestB.next("room_state");
    for (let attempt = 0; attempt < 10 && state.hostId !== guestBSession.playerId; attempt += 1) {
      state = await guestB.next("room_state");
    }
    expect(state.hostId).toBe(guestBSession.playerId);
    expect(state.players.find((player) => player.id === sessionB.playerId)?.dnf).toBe(true);
  });

  it("rejects malformed payloads and checkpoint or lap jumps", async () => {
    const { url } = await startServer();
    const host = await connect(url);
    const session = await createRoom(host);
    const guest = await connect(url);
    await joinRoom(guest, session.roomCode, "Validation Guest");
    await startRace(host, guest);

    host.sendRaw('{"v":1,"type":"finish"}');
    expect((await host.next("error")).code).toBe("PROTOCOL_UPGRADE_REQUIRED");
    host.sendRaw('{"v":2,"type":"transform","snapshot":{"vehicleId":"velocity-v10","livery":0,"position":[0,null,0],"rotation":0,"speed":20,"lap":1,"checkpoint":0,"finished":false}}');
    expect((await host.next("error")).code).toBe("INVALID_MESSAGE");

    host.send({ v: 2, type: "checkpoint", checkpoint: 0, lap: 1 });
    host.send({ v: 2, type: "checkpoint", checkpoint: 4, lap: 1 });
    host.send({ v: 2, type: "checkpoint", checkpoint: 1, lap: 2 });
    host.sendRaw('{"v":2,"type":"finish","rank":1,"totalTimeMs":-999}');
    expect((await host.next("error")).code).toBe("INVALID_FINISH");
  });

  it("rejects unsupported origins and rate-limits abusive clients", async () => {
    const { url } = await startServer({ allowedOrigins: ["https://kart.gtclub.tw"], maxMessagesPerSecond: 3 });
    const rejected = new WebSocket(url, { origin: "https://evil.example" });
    const status = await new Promise<number>((resolve) => rejected.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0)));
    expect(status).toBe(403);

    const client = await connect(url, "https://kart.gtclub.tw");
    await createRoom(client);
    client.send({ v: 2, type: "set_ready", ready: false });
    client.send({ v: 2, type: "set_ready", ready: false });
    client.send({ v: 2, type: "set_ready", ready: false });
    client.send({ v: 2, type: "set_ready", ready: false });
    expect((await client.next("error")).code).toBe("RATE_LIMITED");
  });
});
