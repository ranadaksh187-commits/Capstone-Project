import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Answer from "../models/answer.js";
import Doubt from "../models/doubt.js";
import Report from "../models/report.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
const reportSchema = z.object({
  targetType: z.enum(["doubt", "answer"]),
  targetId: z.string().refine(mongoose.isValidObjectId, "Invalid target"),
  reason: z.enum(["spam", "harassment", "inappropriate", "misinformation", "other"]),
  details: z.string().trim().max(1000).optional().default(""),
}).strict();

router.post("/", authenticate, asyncHandler(async (request, response) => {
  const parsed = reportSchema.safeParse(request.body);
  if (!parsed.success) {
    const error = new Error("Request validation failed");
    error.status = 400;
    error.details = parsed.error.issues.map(({ path, message }) => ({
      field: path.join("."),
      message,
    }));
    throw error;
  }

  const { targetType, targetId, reason, details } = parsed.data;
  const target = targetType === "doubt"
    ? await Doubt.findById(targetId).select("authorId")
    : await Answer.findById(targetId).select("authorId");
  if (!target) {
    const error = new Error("Reported content not found");
    error.status = 404;
    throw error;
  }
  if (target.authorId.equals(request.user._id)) {
    const error = new Error("You cannot report your own content");
    error.status = 400;
    throw error;
  }

  const report = await Report.create({
    reporterId: request.user._id,
    targetType,
    targetId,
    reason,
    details,
  });
  response.status(201).json({ id: report.id, status: report.status });
}));

export default router;
