import jwt from "jsonwebtoken";

export function assertJwtConfiguration() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
}

function getJwtSecret() {
  assertJwtConfiguration();
  return process.env.JWT_SECRET;
}

export function createAccessToken(user) {
  return jwt.sign(
    { role: user.role, tokenVersion: user.tokenVersion || 0 },
    getJwtSecret(),
    { subject: user.id, expiresIn: "1h" },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}
