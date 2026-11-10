import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Answer from "../models/answer.js";
import Doubt from "../models/doubt.js";
import Report from "../models/report.js";
import User from "../models/user.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
const reviewSchema = z.object({
  action: z.enum(["dismiss", "remove_content", "suspend_user"]),
}).strict();

router.use(authenticate, authorize("admin"));

router.get("/reports", asyncHandler(async (_request, response) => {
  const reports = await Report.find({ status: "open" })
    .populate("reporterId", "name email")
    .sort({ createdAt: 1 })
    .limit(100);

  const items = await Promise.all(reports.map(async (report) => {
    const content = report.targetType === "doubt"
      ? await Doubt.findById(report.targetId).populate("authorId", "name email")
      : await Answer.findById(report.targetId)
        .populate("authorId", "name email")
        .populate("doubtId", "title");
    return {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId.toString(),
      reason: report.reason,
      details: report.details,
      reporter: report.reporterId ? {
        id: report.reporterId.id,
        name: report.reporterId.name,
        email: report.reporterId.email,
      } : null,
      content: content ? {
        text: report.targetType === "doubt"
          ? `${content.title}\n${content.description}`
          : content.content,
        authorName: content.authorId?.name || "Unknown user",
        authorId: content.authorId?.id || null,
        doubtTitle: report.targetType === "answer" ? content.doubtId?.title || "" : "",
      } : null,
      createdAt: report.createdAt.toISOString(),
    };
  }));
  response.json(items);
}));

router.patch("/reports/:reportId", asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.reportId)) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }
  const parsed = reviewSchema.safeParse(request.body);
  if (!parsed.success) {
    const error = new Error("Request validation failed");
    error.status = 400;
    error.details = parsed.error.issues.map(({ path, message }) => ({
      field: path.join("."),
      message,
    }));
    throw error;
  }

  const report = await Report.findOne({ _id: request.params.reportId, status: "open" });
  if (!report) {
    const error = new Error("Open report not found");
    error.status = 404;
    throw error;
  }

  let action = "dismissed";
  if (parsed.data.action === "remove_content") {
    action = "content_removed";
    if (report.targetType === "doubt") {
      await Answer.deleteMany({ doubtId: report.targetId });
      await Doubt.deleteOne({ _id: report.targetId });
    } else {
      const answer = await Answer.findByIdAndDelete(report.targetId);
      if (answer) {
        const doubt = await Doubt.findById(answer.doubtId);
        if (doubt?.acceptedAnswerId?.equals(answer._id)) {
          doubt.acceptedAnswerId = null;
          doubt.status = await Answer.countDocuments({ doubtId: doubt._id }) > 0 ? "answered" : "open";
          await doubt.save();
        }
      }
    }
  } else if (parsed.data.action === "suspend_user") {
    const target = report.targetType === "doubt"
      ? await Doubt.findById(report.targetId).select("authorId")
      : await Answer.findById(report.targetId).select("authorId");
    if (!target) {
      const error = new Error("Reported content no longer exists");
      error.status = 404;
      throw error;
    }
    const user = await User.findOneAndUpdate(
      { _id: target.authorId, role: { $ne: "admin" } },
      { $set: { suspended: true } },
    );
    if (!user) {
      const error = new Error("This account cannot be suspended");
      error.status = 400;
      throw error;
    }
    action = "user_suspended";
  }

  report.status = "resolved";
  report.action = action;
  report.reviewedBy = request.user._id;
  report.reviewedAt = new Date();
  await report.save();
  response.json({ id: report.id, status: report.status, action: report.action });
}));

router.patch("/users/:userId/suspension", asyncHandler(async (request, response) => {
  const schema = z.object({ suspended: z.boolean() }).strict();
  const parsed = schema.safeParse(request.body);
  if (!mongoose.isValidObjectId(request.params.userId)) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  if (!parsed.success) {
    const error = new Error("Request validation failed");
    error.status = 400;
    error.details = parsed.error.issues.map(({ path, message }) => ({
      field: path.join("."),
      message,
    }));
    throw error;
  }

  const user = await User.findOneAndUpdate(
    { _id: request.params.userId, role: { $ne: "admin" } },
    { $set: { suspended: parsed.data.suspended } },
    { new: true },
  ).select("name suspended");
  if (!user) {
    const error = new Error("User not found or cannot be changed");
    error.status = 404;
    throw error;
  }
  response.json({ id: user.id, name: user.name, suspended: user.suspended });
}));

export default router;
