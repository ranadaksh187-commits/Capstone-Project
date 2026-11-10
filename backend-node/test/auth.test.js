import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";

process.env.JWT_SECRET = "test-secret-for-peerly-auth-tests-only-32";
const databaseName = `peerly_test_${randomUUID().replaceAll("-", "")}`;
const databaseUri = new URL(process.env.PEERLY_TEST_MONGODB_URI || "mongodb://127.0.0.1:27017");
databaseUri.pathname = `/${databaseName}`;
let token;
let testEmail;

before(async () => {
  testEmail = `student-${randomUUID()}@example.test`;
  await connectDatabase(databaseUri.toString());
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("registration creates a hashed-password student and returns an access token", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test Student",
      email: testEmail,
      password: "A-secure-test-password",
      subjects: ["Mathematics"],
    })
    .expect(201);

  token = response.body.token;
  assert.ok(token);
  assert.equal(response.body.user.role, "student");
  assert.equal(response.body.user.email, testEmail);
  assert.equal("passwordHash" in response.body.user, false);

  const storedUser = await mongoose.connection.collection("users").findOne({ email: testEmail });
  assert.notEqual(storedUser.passwordHash, "A-secure-test-password");
  assert.match(storedUser.passwordHash, /^\$2[aby]\$/);
});

test("public registration rejects administrator role assignment", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Attempted Admin",
      email: `admin-${randomUUID()}@example.test`,
      password: "A-secure-test-password",
      role: "admin",
    })
    .expect(400);
});

test("login and protected profile endpoints require valid credentials", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: testEmail, password: "A-secure-test-password" })
    .expect(200);
  assert.ok(login.body.token);
  assert.equal(login.body.user.email, testEmail);

  await request(app).get("/api/auth/me").expect(401);

  const profile = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(profile.body.user.email, testEmail);

  const updated = await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ bio: "Learning algebra", subjects: ["Mathematics"] })
    .expect(200);
  assert.equal(updated.body.user.bio, "Learning algebra");
  assert.deepEqual(updated.body.user.subjects, ["Mathematics"]);
});

test("profile updates reject attempts to change privileged fields", async () => {
  await request(app)
    .patch("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ role: "admin" })
    .expect(400);
});
