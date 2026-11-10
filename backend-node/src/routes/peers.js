import { Router } from "express";
import User from "../models/user.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/", asyncHandler(async (request, response) => {
  const subject = typeof request.query.subject === "string" ? request.query.subject.trim() : "";
  const search = typeof request.query.search === "string"
    ? request.query.search.trim().slice(0, 80)
    : "";
  const query = {
    role: { $in: ["student", "mentor"] },
    available: true,
    suspended: false,
  };
  if (subject) {
    query.$or = [
      { subjects: { $regex: new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
      { skills: { $regex: new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
    ];
  }
  if (search) {
    const expression = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$and = [
      { $or: [{ name: expression }, { bio: expression }, { subjects: expression }, { skills: expression }, { interests: expression }] },
    ];
  }

  const peers = await User.find(query)
    .select("name role profilePicture subjects skills interests bio available reputation")
    .sort({ reputation: -1, name: 1 })
    .limit(100);
  const rankedPeers = subject
    ? peers.sort((left, right) => {
      const count = (peer) => [...peer.subjects, ...peer.skills]
        .filter((item) => item.toLowerCase() === subject.toLowerCase()).length;
      return count(right) - count(left) || right.reputation - left.reputation;
    })
    : peers;

  response.json(rankedPeers.map((peer) => ({
    id: peer.id,
    name: peer.name,
    role: peer.role,
    profilePicture: peer.profilePicture,
    subjects: peer.subjects,
    skills: peer.skills,
    interests: peer.interests,
    bio: peer.bio,
    available: peer.available,
    reputation: peer.reputation,
  })));
}));

export default router;
