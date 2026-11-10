import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import doubtsRouter from "./routes/doubts.js";
import healthRouter from "./routes/health.js";
import notificationsRouter from "./routes/notifications.js";
import peersRouter from "./routes/peers.js";
import reportsRouter from "./routes/reports.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

const app = express();
const clientDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const allowedOrigins = (process.env.CLIENT_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.RENDER_EXTERNAL_URL) {
  allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error("Origin is not allowed by CORS");
    error.status = 403;
    return callback(error);
  },
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
}));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/doubts", doubtsRouter);
app.use("/api/peers", peersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin", adminRouter);
if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDirectory, "index.html"));
  });
}
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
