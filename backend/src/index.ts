import type { Server } from "node:http";
import { createApp } from "./app";
import {
  connectInfrastructure,
  disconnectInfrastructure,
} from "./lib/infrastructure";

const port = Number(process.env.PORT ?? 3000);

export async function startServer(): Promise<Server> {
  await connectInfrastructure();
  const app = createApp();

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
      resolve(server);
    });

    server.once("error", async (error) => {
      await disconnectInfrastructure().catch(() => undefined);
      reject(error);
    });
  });
}

export async function stopServer(server: Server) {
  const failures: unknown[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    failures.push(error);
  }

  try {
    await disconnectInfrastructure();
  } catch (error) {
    failures.push(error);
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Failed to cleanly stop the server",
    );
  }
}

if (import.meta.main) {
  try {
    const server = await startServer();
    let isShuttingDown = false;

    const shutdown = async (signal: NodeJS.Signals) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`Received ${signal}; shutting down.`);

      try {
        await stopServer(server);
      } catch (error) {
        console.error("Server shutdown did not complete cleanly.");
        console.error(error);
        process.exitCode = 1;
      }
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server. Check Postgres and Redis connectivity.");
    console.error(error);
    process.exitCode = 1;
  }
}
