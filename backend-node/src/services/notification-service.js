import Notification from "../models/notification.js";

export function createNotification(recipientId, type, message, entityType, entityId) {
  return Notification.create({ recipientId, type, message, entityType, entityId });
}
