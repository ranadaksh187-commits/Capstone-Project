import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import Answer from "../src/models/answer.js";
import Doubt from "../src/models/doubt.js";
import User from "../src/models/user.js";
import app from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";

process.env.JWT_SECRET = "test-secret-for-peerly-recommendations-32";
const databaseName = `peerly_test_${randomUUID().replaceAll("-", "")}`;
const databaseUri = new URL(process.env.PEERLY_TEST_MONGODB_URI || "mongodb://127.0.0.1:27017");
databaseUri.pathname = `/${databaseName}`;
let ownerToken;
let preferredHelper;
let popularHelper;
let unavailableHelper;
let suspendedHelper;
let unrelatedHelper;
let supportDoubt;

async function createUser(name, tokenRole = "student") {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name,
      email: `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}@example.test`,
      password: "A-secure-test-password",
      role: tokenRole,
    })
    .expect(201);
  return { token: response.body.token, userId: response.body.user.id };
}

before(async () => {
  await connectDatabase(databaseUri.toString());
  ownerToken = (await createUser("Question Owner")).token;
  preferredHelper = await createUser("Subject Expert", "mentor");
  popularHelper = await createUser("Popular Helper");
  unavailableHelper = await createUser("Unavailable Helper");
  suspendedHelper = await createUser("Suspended Helper");
  unrelatedHelper = await createUser("Unrelated Helper");

  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${preferredHelper.token}`)
    .send({
      subjects: ["Chemistry"],
      skills: ["Organic Chemistry", "Reaction Mechanisms"],
    })
    .expect(200);
  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${popularHelper.token}`)
    .send({ subjects: ["Chemistry"], skills: ["Thermodynamics"] })
    .expect(200);
  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${unavailableHelper.token}`)
    .send({
      subjects: ["Chemistry"],
      skills: ["Organic Chemistry", "Reaction Mechanisms"],
      available: false,
    })
    .expect(200);
  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${suspendedHelper.token}`)
    .send({ subjects: ["Chemistry"], skills: ["Organic Chemistry"] })
    .expect(200);
  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${unrelatedHelper.token}`)
    .send({ subjects: ["Physics"], skills: ["Mechanics"] })
    .expect(200);

  await User.findByIdAndUpdate(preferredHelper.userId, { reputation: 100 });
  await User.findByIdAndUpdate(popularHelper.userId, { reputation: 10000 });
  await User.findByIdAndUpdate(unavailableHelper.userId, { reputation: 50000 });
  await User.findByIdAndUpdate(suspendedHelper.userId, { suspended: true, reputation: 50000 });
  await User.findByIdAndUpdate(unrelatedHelper.userId, { reputation: 50000 });

  supportDoubt = await Doubt.create({
    title: "Prior chemistry question",
    description: "Test-only evidence for answer acceptance rate.",
    subject: "Chemistry",
    authorId: new mongoose.Types.ObjectId(),
  });
  const acceptedAnswer = await Answer.create({
    doubtId: supportDoubt._id,
    authorId: preferredHelper.userId,
    content: "Test-only accepted answer.",
  });
  supportDoubt.acceptedAnswerId = acceptedAnswer._id;
  await supportDoubt.save();
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("doubt recommendations use the weighted data-driven score and exclude unsuitable helpers", async () => {
  const response = await request(app)
    .post("/api/doubts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      title: "How do organic reaction mechanisms work?",
      description: "I am trying to understand how reaction steps connect.",
      subject: "Chemistry",
      topic: "Organic Chemistry",
      tags: ["Reaction Mechanisms"],
      anonymous: true,
    })
    .expect(201);

  const recommendations = response.body.recommendations;
  assert.equal(recommendations.length, 2);
  assert.equal(recommendations[0].userId, preferredHelper.userId);
  assert.equal(recommendations[0].score, 70.3);
  assert.equal(recommendations[0].matchingPercentage, 70);
  assert.deepEqual(recommendations[0].scoreBreakdown, {
    skillMatch: 100,
    reputation: 1,
    acceptanceRate: 100,
    availability: 100,
  });
  assert.match(recommendations[0].explanation, /Organic Chemistry/);
  assert.equal(recommendations[1].userId, popularHelper.userId);
  assert.ok(recommendations[0].score > recommendations[1].score);

  const helperIds = recommendations.map((helper) => helper.userId);
  for (const excluded of [
    unavailableHelper.userId,
    suspendedHelper.userId,
    unrelatedHelper.userId,
  ]) {
    assert.equal(helperIds.includes(excluded), false);
  }
});
