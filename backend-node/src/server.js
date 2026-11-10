import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import mongoose from "mongoose";
import { assertJwtConfiguration } from "./utils/jwt.js";

const port = Number(process.env.PORT || 8081);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

try {
  assertJwtConfiguration();
  await connectDatabase(process.env.MONGODB_URI);
  const server = app.listen(port, () => {
    console.log(`Peerly Node API listening on port ${port}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    });
  }
} catch (error) {
  console.error("Could not start Peerly because the MongoDB connection failed:", error.message);
  process.exitCode = 1;
}
