import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Answer from "../models/answer.js";
import Doubt from "../models/doubt.js";
import User from "../models/user.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";
import { createNotification } from "../services/notification-service.js";
import { recommendHelpers } from "../services/recommendation-service.js";

const router = Router();
const attachmentSchema = z.object({
  url: z.string().url().max(2048),
  name: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(5 * 1024 * 1024),
}).strict();
const doubtSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(5000),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(120).optional().default(""),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional().default("beginner"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  attachments: z.array(attachmentSchema).max(3).optional().default([]),
  anonymous: z.boolean().optional().default(true),
}).strict();
const answerSchema = z.object({
  content: z.string().trim().min(1).max(5000),
}).strict();
const doubtUpdateSchema = doubtSchema.partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one doubt field to update" },
);
const answerUpdateSchema = answerSchema.partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide answer content to update" },
);

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

function notFound() {
  const error = new Error("Doubt or answer not found");
  error.status = 404;
  return error;
}

function isOwner(resource, userId) {
  return resource.authorId.toString() === userId.toString();
}

async function getDoubtView(doubtId, viewerId) {
  const doubt = await Doubt.findById(doubtId).populate("authorId", "name role");
  if (!doubt) {
    throw notFound();
  }

  const answers = await Answer.find({ doubtId: doubt._id })
    .populate("authorId", "name role")
    .sort({ createdAt: 1 });

  return {
    id: doubt.id,
    title: doubt.title,
    description: doubt.description,
    subject: doubt.subject,
    topic: doubt.topic,
    difficulty: doubt.difficulty,
    tags: doubt.tags,
    attachments: doubt.attachments,
    anonymous: doubt.anonymous,
    isMine: viewerId ? doubt.authorId?._id?.toString() === viewerId.toString() : false,
    authorName: doubt.anonymous ? "Anonymous Student" : doubt.authorId?.name || "Former member",
    authorRole: doubt.anonymous ? null : doubt.authorId?.role || "student",
    status: doubt.status,
    acceptedAnswerId: doubt.acceptedAnswerId?.toString() ?? null,
    createdAt: doubt.createdAt.toISOString(),
    updatedAt: doubt.updatedAt.toISOString(),
    answers: answers.map((answer) => ({
      id: answer.id,
      authorName: answer.authorId?.name || "Former member",
      authorRole: answer.authorId?.role || "student",
      isMine: viewerId ? answer.authorId?._id?.toString() === viewerId.toString() : false,
      content: answer.content,
      helpfulCount: answer.helpfulVoters.length,
      helpful: answer.helpfulVoters.length > 0,
      votedByMe: viewerId ? answer.helpfulVoters.some((voterId) => voterId.equals(viewerId)) : false,
      accepted: doubt.acceptedAnswerId?.equals(answer._id) ?? false,
      createdAt: answer.createdAt.toISOString(),
      updatedAt: answer.updatedAt.toISOString(),
    })),
  };
}

async function findOwnedDoubt(doubtId, userId) {
  if (!mongoose.isValidObjectId(doubtId)) {
    throw notFound();
  }
  const doubt = await Doubt.findById(doubtId);
  if (!doubt || !isOwner(doubt, userId)) {
    throw notFound();
  }
  return doubt;
}

router.get("/", optionalAuthenticate, asyncHandler(async (request, response) => {
  const query = {};
  for (const field of ["subject", "topic", "difficulty", "status"]) {
    const value = request.query[field];
    if (typeof value === "string" && value.trim()) {
      query[field] = field === "status" ? value.trim().toLowerCase() : value.trim();
    }
  }

  const search = typeof request.query.search === "string"
    ? request.query.search.trim().slice(0, 120)
    : "";
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(escaped, "i");
    query.$or = [
      { title: expression },
      { description: expression },
      { tags: expression },
    ];
  }

  const doubts = await Doubt.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .select("_id");

  response.json(await Promise.all(doubts.map(({ id }) => getDoubtView(id, request.user?._id))));
}));

router.post("/", authenticate, asyncHandler(async (request, response) => {
  const input = parseBody(doubtSchema, request.body);
  const doubt = await Doubt.create({ ...input, authorId: request.user._id });
  const [doubtView, recommendations] = await Promise.all([
    getDoubtView(doubt.id, request.user._id),
    recommendHelpers(doubt, request.user._id),
  ]);
  await Promise.all(recommendations.map((helper) => createNotification(
    helper.userId,
    "match",
    `A new ${doubt.subject} question may match your skills.`,
    "doubt",
    doubt._id,
  )));
  response.status(201).json({ ...doubtView, recommendations });
}));

router.get("/:doubtId/recommendations", authenticate, asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.doubtId)) {
    throw notFound();
  }
  const doubt = await Doubt.findById(request.params.doubtId);
  if (!doubt) {
    throw notFound();
  }
  response.json(await recommendHelpers(doubt, request.user._id));
}));

router.patch("/:doubtId", authenticate, asyncHandler(async (request, response) => {
  const doubt = await findOwnedDoubt(request.params.doubtId, request.user.id);
  const changes = parseBody(doubtUpdateSchema, request.body);
  Object.assign(doubt, changes);
  await doubt.save();
  response.json(await getDoubtView(doubt.id, request.user._id));
}));

router.delete("/:doubtId", authenticate, asyncHandler(async (request, response) => {
  const doubt = await findOwnedDoubt(request.params.doubtId, request.user.id);
  await Answer.deleteMany({ doubtId: doubt._id });
  await doubt.deleteOne();
  response.status(204).end();
}));

router.post("/:doubtId/answers", authenticate, asyncHandler(async (request, response) => {
  const input = parseBody(answerSchema, request.body);
  if (!mongoose.isValidObjectId(request.params.doubtId)) {
    throw notFound();
  }
  const doubt = await Doubt.findById(request.params.doubtId);
  if (!doubt) {
    throw notFound();
  }

  await Answer.create({
    doubtId: doubt._id,
    authorId: request.user._id,
    content: input.content,
  });
  if (doubt.status === "open") {
    doubt.status = "answered";
    await doubt.save();
  }
  if (!doubt.authorId.equals(request.user._id)) {
    await createNotification(doubt.authorId, "answer", "Someone answered your question.", "doubt", doubt._id);
  }

  response.status(201).json(await getDoubtView(doubt.id, request.user._id));
}));

router.patch("/answers/:answerId", authenticate, asyncHandler(async (request, response) => {
  const changes = parseBody(answerUpdateSchema, request.body);
  if (!mongoose.isValidObjectId(request.params.answerId)) {
    throw notFound();
  }
  const answer = await Answer.findById(request.params.answerId);
  if (!answer || !isOwner(answer, request.user.id)) {
    throw notFound();
  }
  answer.content = changes.content;
  await answer.save();
  response.json(await getDoubtView(answer.doubtId, request.user._id));
}));

router.delete("/answers/:answerId", authenticate, asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.answerId)) {
    throw notFound();
  }
  const answer = await Answer.findById(request.params.answerId);
  if (!answer || !isOwner(answer, request.user.id)) {
    throw notFound();
  }

  const doubt = await Doubt.findById(answer.doubtId);
  await answer.deleteOne();
  if (doubt?.acceptedAnswerId?.equals(answer._id)) {
    doubt.acceptedAnswerId = null;
    doubt.status = await Answer.countDocuments({ doubtId: doubt._id }) > 0 ? "answered" : "open";
    await doubt.save();
  } else if (doubt?.status === "answered" && await Answer.countDocuments({ doubtId: doubt._id }) === 0) {
    doubt.status = "open";
    await doubt.save();
  }

  response.status(204).end();
}));

router.put("/answers/:answerId/helpful", authenticate, asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.answerId)) {
    throw notFound();
  }
  const answer = await Answer.findById(request.params.answerId);
  if (!answer) {
    throw notFound();
  }
  if (isOwner(answer, request.user.id)) {
    const error = new Error("You cannot vote for your own answer");
    error.status = 403;
    throw error;
  }

  const update = await Answer.updateOne(
    { _id: answer._id, helpfulVoters: { $ne: request.user._id } },
    { $addToSet: { helpfulVoters: request.user._id } },
  );
  if (update.modifiedCount > 0) {
    await User.updateOne({ _id: answer.authorId }, { $inc: { reputation: 10 } });
    await createNotification(answer.authorId, "helpful", "Your answer was marked helpful. You earned 10 reputation points.", "answer", answer._id);
  }
  response.json(await getDoubtView(answer.doubtId, request.user._id));
}));

router.put("/answers/:answerId/accept", authenticate, asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.answerId)) {
    throw notFound();
  }
  const answer = await Answer.findById(request.params.answerId);
  if (!answer) {
    throw notFound();
  }
  const doubt = await findOwnedDoubt(answer.doubtId, request.user.id);
  if (isOwner(answer, request.user.id)) {
    const error = new Error("You cannot accept your own answer");
    error.status = 403;
    throw error;
  }

  doubt.acceptedAnswerId = answer._id;
  doubt.status = "resolved";
  await doubt.save();
  await createNotification(answer.authorId, "helpful", "Your answer was accepted.", "answer", answer._id);
  response.json(await getDoubtView(doubt.id, request.user._id));
}));

export default router;
