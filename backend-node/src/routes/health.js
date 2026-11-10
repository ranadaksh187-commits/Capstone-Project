import { Router } from "express";
import { databaseIsConnected } from "../config/database.js";

const router = Router();

router.get("/", (_request, response) => {
  response.json({
    status: "ok",
    database: databaseIsConnected() ? "connected" : "disconnected",
  });
});

router.get("/ready", (_request, response) => {
  if (!databaseIsConnected()) {
    return response.status(503).json({
      status: "not_ready",
      database: "disconnected",
    });
  }

  return response.json({ status: "ready", database: "connected" });
});

export default router;
