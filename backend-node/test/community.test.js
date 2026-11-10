import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/models/user.js";
import { createAccessToken } from "../src/utils/jwt.js";

process.env.JWT_SECRET = "test-secret-for-peerly-community-tests-32";
const databaseName = `peerly_test_${randomUUID().replaceAll("-", "")}`;
const databaseUri = new URL(process.env.PEERLY_TEST_MONGODB_URI || "mongodb://127.0.0.1:27017");
databaseUri.pathname = `/${databaseName}`;
let ownerToken;
let helperToken;
let adminToken;
let answerId;
let reportId;
let helperId;

async function register(name, role = "student") {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name,
      email: `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}@example.test`,
      password: "A-secure-test-password",
      role,
    })
    .expect(201);
  return response.body;
}

before(async () => {
  await connectDatabase(databaseUri.toString());
  const owner = await register("Community Owner");
  ownerToken = owner.token;
  const helper = await register("Community Helper", "mentor");
  helperToken = helper.token;
  helperId = helper.user.id;

  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${helperToken}`)
    .send({ subjects: ["Mathematics"], skills: ["Algebra"], bio: "Happy to help with algebra." })
    .expect(200);

  const passwordHash = await bcrypt.hash("test-administrator-password", 4);
  const admin = await User.create({
    name: "Community Administrator",
    email: `admin-${randomUUID()}@example.test`,
    passwordHash,
    role: "admin",
    available: false,
  });
  adminToken = createAccessToken(admin);
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("profiles, matching, answer reputation, notifications, and moderation work together", async () => {
  const created = await request(app)
    .post("/api/doubts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      title: "How do I solve a linear equation?",
      description: "I am stuck isolating the variable.",
      subject: "Mathematics",
      topic: "Algebra",
      anonymous: true,
    })
    .expect(201);
  assert.equal(created.body.authorName, "Anonymous Student");
  assert.ok(created.body.recommendations.some((peer) => peer.userId === helperId));

  const peers = await request(app).get("/api/peers?subject=Mathematics").expect(200);
  assert.ok(peers.body.some((peer) => peer.id === helperId && peer.skills.includes("Algebra")));

  const answered = await request(app)
    .post(`/api/doubts/${created.body.id}/answers`)
    .set("Authorization", `Bearer ${helperToken}`)
    .send({ content: "Subtract the constant from both sides, then divide by the coefficient." })
    .expect(201);
  answerId = answered.body.answers[0].id;

  const ownerNotifications = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);
  assert.ok(ownerNotifications.body.some((item) => item.type === "answer"));

  await request(app)
    .put(`/api/doubts/answers/${answerId}/helpful`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);
  await request(app)
    .put(`/api/doubts/answers/${answerId}/helpful`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);

  const helperProfile = await User.findById(helperId);
  assert.equal(helperProfile.reputation, 10);
  const helperNotifications = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${helperToken}`)
    .expect(200);
  assert.ok(helperNotifications.body.some((item) => item.type === "match"));
  assert.ok(helperNotifications.body.some((item) => item.type === "helpful"));

  const report = await request(app)
    .post("/api/reports")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      targetType: "answer",
      targetId: answerId,
      reason: "misinformation",
      details: "This answer needs review.",
    })
    .expect(201);
  reportId = report.body.id;

  const adminReports = await request(app)
    .get("/api/admin/reports")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(adminReports.body.some((item) => item.id === reportId));

  await request(app)
    .patch(`/api/admin/reports/${reportId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ action: "suspend_user" })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${helperToken}`)
    .expect(401);
});

test("logout revokes the access token", async () => {
  const member = await register("Logout Member");
  await request(app)
    .post("/api/auth/logout")
    .set("Authorization", `Bearer ${member.token}`)
    .expect(204);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${member.token}`)
    .expect(401);
});
