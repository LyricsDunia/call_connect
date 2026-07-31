import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { setupSignaling } from "./signaling.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env["PORT"] ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

const httpServer = http.createServer(app);
setupSignaling(httpServer);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  if (process.env["NODE_ENV"] === "production") {
    const clientDist = path.resolve(__dirname, "../../client/dist");
    console.log(`Serving static files from: ${clientDist}`);
  }
});
