import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../src/models/user.js";
import { connectDatabase } from "../src/config/database.js";

const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, MONGODB_URI } = process.env;

if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error("Set ADMIN_EMAIL, ADMIN_NAME, and an ADMIN_PASSWORD of at least 12 characters");
}

try {
  await connectDatabase(MONGODB_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    if (existingUser.role !== "admin") {
      throw new Error("That email already belongs to a non-admin user; choose another admin email");
    }
    console.log("The requested admin account already exists; no changes were made.");
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({
      name: ADMIN_NAME.trim(),
      email,
      passwordHash,
      role: "admin",
      available: false,
    });
    console.log("Admin account created.");
  }
} finally {
  await mongoose.disconnect();
}
