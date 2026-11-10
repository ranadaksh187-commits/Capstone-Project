import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    required: true,
    enum: ["student", "mentor", "admin"],
    default: "student",
  },
  profilePicture: {
    type: String,
    default: "",
    maxlength: 2048,
  },
  subjects: {
    type: [String],
    default: [],
  },
  skills: {
    type: [String],
    default: [],
  },
  interests: {
    type: [String],
    default: [],
  },
  bio: {
    type: String,
    default: "",
    maxlength: 500,
  },
  available: {
    type: Boolean,
    default: true,
  },
  reputation: {
    type: Number,
    default: 0,
    min: 0,
  },
  suspended: {
    type: Boolean,
    default: false,
  },
  tokenVersion: {
    type: Number,
    default: 0,
    min: 0,
  },
}, { timestamps: true });

userSchema.index({ subjects: 1 });
userSchema.index({ skills: 1 });
userSchema.index({ role: 1, available: 1, suspended: 1 });

export default mongoose.models.User || mongoose.model("User", userSchema);
