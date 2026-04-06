import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust reverse proxy headers (needed when deployed behind nginx, Render, Railway, etc.)
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

const allowedOrigins =
  process.env["NODE_ENV"] === "production"
    ? (process.env["ALLOWED_ORIGINS"] || "").split(",").filter(Boolean)
    : ["*"];

app.use(
  cors({
    origin:
      allowedOrigins.length === 0 || allowedOrigins[0] === "*"
        ? "*"
        : (origin, cb) => {
            if (!origin || allowedOrigins.some((o) => origin.startsWith(o)))
              cb(null, true);
            else cb(new Error("Not allowed by CORS"));
          },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Rate limiting — REST endpoints only (NOT socket ICE candidates)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
});
app.use("/api", limiter);

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

app.use("/api", router);

// In production, serve the built Vite client
if (process.env["NODE_ENV"] === "production") {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

export default app;
