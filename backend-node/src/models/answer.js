import mongoose from "mongoose";

const answerSchema = new mongoose.Schema({
  doubtId: { type: mongoose.Schema.Types.ObjectId, ref: "Doubt", required: true, index: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  content: { type: String, required: true, trim: true, maxlength: 5000 },
  helpfulVoters: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    default: [],
  },
}, { timestamps: true });

answerSchema.virtual("helpfulCount").get(function helpfulCount() {
  return this.helpfulVoters.length;
});

export default mongoose.models.Answer || mongoose.model("Answer", answerSchema);
