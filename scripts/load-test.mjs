import { WebSocket } from "ws";

const url = process.env.WS_URL ?? "ws://127.0.0.1:8080/ws";
const origin = process.env.ORIGIN ?? "http://localhost:5188";
const hostHeader = process.env.HOST_HEADER;
const roomCount = Number(process.env.ROOMS ?? 5);
const playersPerRoom = Number(process.env.PLAYERS_PER_ROOM ?? 10);
const durationMs = Number(process.env.DURATION_MS ?? 60_000);
const total = roomCount * playersPerRoom;
const clients = [];
const rooms = [];
let messagesReceived = 0;
let errors = 0;

function waitFor(client, predicate, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("message", onMessage);
      reject(new Error("Timed out waiting for server message"));
    }, timeoutMs);
    const onMessage = (raw) => {
      messagesReceived += 1;
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      client.off("message", onMessage);
      resolve(message);
    };
    client.on("message", onMessage);
  });
}

async function connect() {
  return await new Promise((resolve, reject) => {
    const client = new WebSocket(url, {
      origin,
      maxPayload: 16 * 1024,
      ...(hostHeader ? { headers: { Host: hostHeader } } : {}),
    });
    const timer = setTimeout(() => reject(new Error("Timed out waiting for handshake")), 10_000);
    client.once("message", (raw) => {
      messagesReceived += 1;
      const message = JSON.parse(String(raw));
      if (message.type !== "connected") return reject(new Error(`Unexpected handshake: ${message.type}`));
      clearTimeout(timer);
      resolve(client);
    });
    client.once("error", reject);
  });
}

async function addPlayer(roomIndex, playerIndex) {
  const client = await connect();
  clients.push(client);
  client.on("message", (raw) => {
    messagesReceived += 1;
    try {
      const message = JSON.parse(String(raw));
      if (message.type === "error") {
        errors += 1;
        console.error(`server error ${message.code}: ${message.message}`);
      }
    } catch { errors += 1; }
  });
  if (playerIndex === 0) {
    const sessionPromise = waitFor(client, (message) => message.type === "session");
    client.send(JSON.stringify({ v: 2, type: "create_room", name: `Load ${roomIndex}-0`, vehicleId: "gate-oracle-rb", trackId: "fantasia" }));
    const session = await sessionPromise;
    rooms[roomIndex] = session.roomCode;
  } else {
    const sessionPromise = waitFor(client, (message) => message.type === "session");
    client.send(JSON.stringify({ v: 2, type: "join_room", name: `Load ${roomIndex}-${playerIndex}`, vehicleId: "gate-oracle-rb", roomCode: rooms[roomIndex] }));
    await sessionPromise;
  }
  return client;
}

console.log(`Connecting ${total} clients to ${url} in ${roomCount} rooms…`);
for (let room = 0; room < roomCount; room += 1) {
  for (let player = 0; player < playersPerRoom; player += 1) await addPlayer(room, player);
}
for (const client of clients) client.send(JSON.stringify({ v: 2, type: "set_ready", ready: true }));

await new Promise((resolve) => setTimeout(resolve, 6_000));

let tick = 0;
const startedAt = Date.now();
const sender = setInterval(() => {
  tick += 1;
  for (let index = 0; index < clients.length; index += 1) {
    const angle = tick / 40 + index * 0.05;
    clients[index].send(JSON.stringify({
      v: 2,
      type: "transform",
      snapshot: {
        vehicleId: "gate-oracle-rb",
        livery: 0,
        position: [Math.cos(angle) * 20, 0, Math.sin(angle) * 20],
        rotation: angle % (Math.PI * 2),
        speed: 70,
        lap: 0,
        checkpoint: 0,
        finished: false,
      },
    }));
  }
}, 100);

const reporter = setInterval(() => {
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.log(`${elapsed}s: ${clients.length} connected, ${messagesReceived} messages, load-client RSS ${rss} MB, ${errors} errors`);
}, 30_000);

await new Promise((resolve) => setTimeout(resolve, durationMs));
clearInterval(sender);
clearInterval(reporter);
for (const client of clients) client.close(1000, "load test complete");
console.log(JSON.stringify({ clients: clients.length, rooms: roomCount, durationMs, messagesReceived, errors }));
if (clients.length !== total || errors > 0) process.exitCode = 1;
