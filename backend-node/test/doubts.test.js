import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";

process.env.JWT_SECRET = "test-secret-for-peerly-doubt-tests-only-32";
const databaseName = `peerly_test_${randomUUID().replaceAll("-", "")}`;
const databaseUri = new URL(process.env.PEERLY_TEST_MONGODB_URI || "mongodb://127.0.0.1:27017");
databaseUri.pathname = `/${databaseName}`;
let ownerToken;
let helperToken;
let otherToken;
let doubtId;
let answerId;

async function register(name) {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name,
      email: `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}@example.test`,
      password: "A-secure-test-password",
    })
    .expect(201);
  return response.body.token;
}

before(async () => {
  await connectDatabase(databaseUri.toString());
  ownerToken = await register("Doubt Owner");
  helperToken = await register("Peer Helper");
  otherToken = await register("Another Student");
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("anonymous doubt creation hides its author identity from public responses", async () => {
  const response = await request(app)
    .post("/api/doubts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      title: "How do limits work?",
      description: "I am stuck on the difference between a limit and substitution.",
      subject: "Mathematics",
      topic: "Limits",
      difficulty: "intermediate",
      tags: ["calculus"],
      anonymous: true,
    })
    .expect(201);

  doubtId = response.body.id;
  assert.equal(response.body.authorName, "Anonymous Student");
  assert.equal(response.body.anonymous, true);
  assert.equal("authorId" in response.body, false);

  const listed = await request(app).get("/api/doubts").expect(200);
  const publicDoubt = listed.body.find((item) => item.id === doubtId);
  assert.equal(publicDoubt.authorName, "Anonymous Student");
  assert.equal("authorId" in publicDoubt, false);
});

test("doubt ownership is enforced for edits and deletion", async () => {
  await request(app)
    .patch(`/api/doubts/${doubtId}`)
    .set("Authorization", `Bearer ${otherToken}`)
    .send({ title: "Changed by another user" })
    .expect(404);

  const updated = await request(app)
    .patch(`/api/doubts/${doubtId}`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ title: "Updated anonymous question", anonymous: true })
    .expect(200);
  assert.equal(updated.body.title, "Updated anonymous question");
  assert.equal(updated.body.authorName, "Anonymous Student");

  await request(app)
    .delete(`/api/doubts/${doubtId}`)
    .set("Authorization", `Bearer ${otherToken}`)
    .expect(404);
});

test("answers support ownership, unique helpful votes, and accepted-answer resolution", async () => {
  const answered = await request(app)
    .post(`/api/doubts/${doubtId}/answers`)
    .set("Authorization", `Bearer ${helperToken}`)
    .send({ content: "Try simplifying the expression before evaluating it." })
    .expect(201);
  answerId = answered.body.answers[0].id;
  assert.equal(answered.body.status, "answered");
  assert.equal(answered.body.answers[0].authorName, "Peer Helper");

  await request(app)
    .put(`/api/doubts/answers/${answerId}/helpful`)
    .set("Authorization", `Bearer ${helperToken}`)
    .expect(403);

  await request(app)
    .put(`/api/doubts/answers/${answerId}/helpful`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);
  const duplicateVote = await request(app)
    .put(`/api/doubts/answers/${answerId}/helpful`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);
  assert.equal(duplicateVote.body.answers[0].helpfulCount, 1);

  const accepted = await request(app)
    .put(`/api/doubts/answers/${answerId}/accept`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);
  assert.equal(accepted.body.status, "resolved");
  assert.equal(accepted.body.answers[0].accepted, true);
});

test("answer authors can edit and delete only their own answers", async () => {
  await request(app)
    .patch(`/api/doubts/answers/${answerId}`)
    .set("Authorization", `Bearer ${otherToken}`)
    .send({ content: "Not my answer" })
    .expect(404);

  const updated = await request(app)
    .patch(`/api/doubts/answers/${answerId}`)
    .set("Authorization", `Bearer ${helperToken}`)
    .send({ content: "Updated explanation." })
    .expect(200);
  assert.equal(updated.body.answers[0].content, "Updated explanation.");

  await request(app)
    .delete(`/api/doubts/answers/${answerId}`)
    .set("Authorization", `Bearer ${helperToken}`)
    .expect(204);

  const remaining = await request(app)
    .get("/api/doubts")
    .expect(200);
  const doubt = remaining.body.find((item) => item.id === doubtId);
  assert.equal(doubt.status, "open");
  assert.equal(doubt.answers.length, 0);
});
