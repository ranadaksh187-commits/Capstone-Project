import { Router } from "express";
import mongoose from "mongoose";
import Notification from "../models/notification.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
router.use(authenticate);

router.get("/", asyncHandler(async (request, response) => {
  const notifications = await Notification.find({ recipientId: request.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  response.json(notifications.map((notification) => ({
    id: notification._id.toString(),
    kind: notification.type,
    type: notification.type,
    message: notification.message,
    entityType: notification.entityType,
    entityId: notification.entityId?.toString() ?? null,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  })));
}));

router.put("/:notificationId/read", asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.notificationId)) {
    const error = new Error("Notification not found");
    error.status = 404;
    throw error;
  }
  const notification = await Notification.findOneAndUpdate(
    { _id: request.params.notificationId, recipientId: request.user._id },
    { $set: { read: true } },
    { new: true },
  );
  if (!notification) {
    const error = new Error("Notification not found");
    error.status = 404;
    throw error;
  }
  response.status(204).end();
}));

export default router;
