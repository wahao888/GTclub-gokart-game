import { createKartServer } from "./server";

const server = createKartServer();
void server.start().then((address) => {
  console.log(`Formula Kart server listening on http://${address.address}:${address.port}`);
}).catch((error) => {
  console.error("Formula Kart server failed to start", error);
  process.exit(1);
});

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
