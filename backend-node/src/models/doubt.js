import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true, maxlength: 2048 },
  name: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true, maxlength: 120 },
  size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
}, { _id: false });

const doubtSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  subject: { type: String, required: true, trim: true, maxlength: 80 },
  topic: { type: String, trim: true, maxlength: 120, default: "" },
  difficulty: {
    type: String,
    enum: ["beginner", "intermediate", "advanced"],
    default: "beginner",
  },
  tags: { type: [String], default: [], maxlength: 20 },
  attachments: { type: [attachmentSchema], default: [] },
  anonymous: { type: Boolean, default: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: {
    type: String,
    enum: ["open", "answered", "resolved"],
    default: "open",
    index: true,
  },
  acceptedAnswerId: { type: mongoose.Schema.Types.ObjectId, ref: "Answer", default: null },
}, { timestamps: true });

doubtSchema.index({ subject: 1, topic: 1, difficulty: 1, status: 1, createdAt: -1 });
doubtSchema.index({ title: "text", description: "text", tags: "text" });

export default mongoose.models.Doubt || mongoose.model("Doubt", doubtSchema);
