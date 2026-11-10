import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  targetType: { type: String, required: true, enum: ["doubt", "answer"] },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    required: true,
    enum: ["spam", "harassment", "inappropriate", "misinformation", "other"],
  },
  details: { type: String, trim: true, maxlength: 1000, default: "" },
  status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
  action: { type: String, enum: ["dismissed", "content_removed", "user_suspended"], default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Report || mongoose.model("Report", reportSchema);
