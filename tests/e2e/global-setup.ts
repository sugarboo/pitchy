import { preview } from "vite";

const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = 4173;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await preview({
    preview: {
      host: PREVIEW_HOST,
      port: PREVIEW_PORT,
      strictPort: true,
    },
  });

  return async () => {
    const closePromise = new Promise<void>((resolve, reject) => {
      server.httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    server.httpServer.closeAllConnections();
    await closePromise;
  };
}
