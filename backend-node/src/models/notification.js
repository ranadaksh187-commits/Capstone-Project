import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ["match", "answer", "helpful", "report"],
  },
  message: { type: String, required: true, trim: true, maxlength: 240 },
  entityType: { type: String, enum: ["doubt", "answer", "report"], default: null },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
