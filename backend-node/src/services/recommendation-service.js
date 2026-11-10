import Answer from "../models/answer.js";
import Doubt from "../models/doubt.js";
import User from "../models/user.js";

function normalize(value) {
  return value.trim().toLocaleLowerCase();
}

function matchScore(doubt, helper) {
  const profileTerms = new Set(
    [...helper.subjects, ...helper.skills].map(normalize),
  );
  const subjectMatch = profileTerms.has(normalize(doubt.subject));
  const topicTerms = [doubt.topic, ...doubt.tags]
    .map(normalize)
    .filter(Boolean);

  if (topicTerms.length === 0) {
    return subjectMatch ? 100 : 0;
  }

  const matchedTopics = topicTerms.filter((term) => profileTerms.has(term)).length;
  const topicPercentage = matchedTopics / topicTerms.length * 100;
  return (subjectMatch ? 60 : 0) + topicPercentage * 0.4;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export async function recommendHelpers(doubt, excludeUserId, limit = 3) {
  const helpers = await User.find({
    _id: { $ne: excludeUserId },
    role: { $in: ["student", "mentor"] },
    available: true,
    suspended: false,
  }).select("_id name role subjects skills reputation available");

  const candidates = helpers
    .map((helper) => ({ helper, skillMatch: matchScore(doubt, helper) }))
    .filter(({ skillMatch }) => skillMatch > 0);
  if (candidates.length === 0) {
    return [];
  }

  const helperIds = candidates.map(({ helper }) => helper._id);
  const [answerCounts, acceptedCounts] = await Promise.all([
    Answer.aggregate([
      { $match: { authorId: { $in: helperIds } } },
      { $group: { _id: "$authorId", count: { $sum: 1 } } },
    ]),
    Doubt.aggregate([
      { $match: { acceptedAnswerId: { $ne: null } } },
      {
        $lookup: {
          from: "answers",
          localField: "acceptedAnswerId",
          foreignField: "_id",
          as: "acceptedAnswer",
        },
      },
      { $unwind: "$acceptedAnswer" },
      { $match: { "acceptedAnswer.authorId": { $in: helperIds } } },
      { $group: { _id: "$acceptedAnswer.authorId", count: { $sum: 1 } } },
    ]),
  ]);
  const countById = (rows) => new Map(rows.map((row) => [row._id.toString(), row.count]));
  const answersByHelper = countById(answerCounts);
  const acceptedByHelper = countById(acceptedCounts);
  const maxReputation = Math.max(...candidates.map(({ helper }) => helper.reputation), 0);

  return candidates
    .map(({ helper, skillMatch }) => {
      const answerCount = answersByHelper.get(helper.id) ?? 0;
      const acceptedCount = acceptedByHelper.get(helper.id) ?? 0;
      const reputationScore = maxReputation === 0
        ? 0
        : helper.reputation / maxReputation * 100;
      const acceptanceRate = answerCount === 0
        ? 0
        : acceptedCount / answerCount * 100;
      const availability = helper.available ? 100 : 0;
      const score = 0.4 * skillMatch
        + 0.3 * reputationScore
        + 0.2 * acceptanceRate
        + 0.1 * availability;
      const topicMatches = [doubt.topic, ...doubt.tags]
        .filter((term) => term && [...helper.subjects, ...helper.skills]
          .some((profileTerm) => normalize(profileTerm) === normalize(term)));

      return {
        userId: helper.id,
        name: helper.name,
        role: helper.role,
        score: round(score),
        matchingPercentage: Math.round(score),
        scoreBreakdown: {
          skillMatch: round(skillMatch),
          reputation: round(reputationScore),
          acceptanceRate: round(acceptanceRate),
          availability,
        },
        explanation: [
          skillMatch >= 60 ? `Matches the ${doubt.subject} subject` : "Matches related topic skills",
          topicMatches.length ? `matches ${topicMatches.join(", ")}` : null,
          `${round(acceptanceRate)}% of previous answers accepted`,
          "currently available",
        ].filter(Boolean).join("; "),
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || right.scoreBreakdown.reputation - left.scoreBreakdown.reputation
      || left.name.localeCompare(right.name))
    .slice(0, limit);
}
