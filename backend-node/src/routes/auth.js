import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import User from "../models/user.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createAccessToken } from "../utils/jwt.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
  role: z.enum(["student", "mentor"]).optional().default("student"),
  subjects: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
}).strict();
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72),
}).strict();
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  profilePicture: z.string().trim().max(2048).optional(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  bio: z.string().trim().max(500).optional(),
  available: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one profile field to update",
});

function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error("Request validation failed");
    error.status = 400;
    error.details = result.error.issues.map(({ path, message }) => ({
      field: path.join("."),
      message,
    }));
    throw error;
  }
  return result.data;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profilePicture: user.profilePicture,
    subjects: user.subjects,
    skills: user.skills,
    interests: user.interests,
    bio: user.bio,
    available: user.available,
    reputation: user.reputation,
  };
}

function sendSession(response, user, status = 200) {
  response.status(status).json({
    token: createAccessToken(user),
    user: publicUser(user),
  });
}

router.post("/register", loginLimiter, asyncHandler(async (request, response) => {
  const input = parseBody(registerSchema, request.body);
  const existingUser = await User.findOne({ email: input.email }).select("_id");
  if (existingUser) {
    const error = new Error("An account with this email already exists");
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    subjects: input.subjects,
    skills: input.skills,
    interests: input.interests,
  });

  sendSession(response, user, 201);
}));

router.post("/login", loginLimiter, asyncHandler(async (request, response) => {
  const input = parseBody(loginSchema, request.body);
  const user = await User.findOne({ email: input.email }).select("+passwordHash");
  const passwordMatches = user && await bcrypt.compare(input.password, user.passwordHash);
  if (!user || !passwordMatches || user.suspended) {
    const error = new Error("Email or password is incorrect");
    error.status = 401;
    throw error;
  }

  sendSession(response, user);
}));

router.get("/me", authenticate, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

router.post("/logout", authenticate, asyncHandler(async (request, response) => {
  await User.updateOne({ _id: request.user._id }, { $inc: { tokenVersion: 1 } });
  response.status(204).end();
}));

router.patch("/me", authenticate, asyncHandler(async (request, response) => {
  const changes = parseBody(profileSchema, request.body);
  const user = await User.findByIdAndUpdate(
    request.user.id,
    { $set: changes },
    { new: true, runValidators: true },
  );
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  response.json({ user: publicUser(user) });
}));

export default router;
