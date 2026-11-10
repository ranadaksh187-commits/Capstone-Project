import mongoose from "mongoose";

export async function connectDatabase(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export function databaseIsConnected() {
  return mongoose.connection.readyState === 1;
}
