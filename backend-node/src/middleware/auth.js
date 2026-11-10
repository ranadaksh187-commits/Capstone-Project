import jwt from "jsonwebtoken";
import { verifyAccessToken } from "../utils/jwt.js";
import User from "../models/user.js";
import { asyncHandler } from "./async-handler.js";

export const authenticate = asyncHandler(async (request, _response, next) => {
  const authorization = request.get("authorization");
  const [scheme, token, extra] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token || extra) {
    const error = new Error("Authentication is required");
    error.status = 401;
    throw error;
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      throw error;
    }
    const authError = new Error("Invalid or expired access token");
    authError.status = 401;
    throw authError;
  }

  const user = await User.findById(claims.sub);
  if (!user || user.suspended || (claims.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    const error = new Error("This account cannot access the platform");
    error.status = 401;
    throw error;
  }

  request.user = user;
  next();
});

export const optionalAuthenticate = asyncHandler(async (request, _response, next) => {
  const authorization = request.get("authorization");
  if (!authorization) {
    next();
    return;
  }

  const [scheme, token, extra] = authorization.split(" ");
  if (scheme !== "Bearer" || !token || extra) {
    const error = new Error("Invalid authorization header");
    error.status = 401;
    throw error;
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      throw error;
    }
    const authError = new Error("Invalid or expired access token");
    authError.status = 401;
    throw authError;
  }

  const user = await User.findById(claims.sub);
  if (!user || user.suspended || (claims.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    const error = new Error("This account cannot access the platform");
    error.status = 401;
    throw error;
  }
  request.user = user;
  next();
});

export function authorize(...roles) {
  return function roleGuard(request, _response, next) {
    if (!request.user || !roles.includes(request.user.role)) {
      const error = new Error("You do not have permission to perform this action");
      error.status = 403;
      return next(error);
    }

    return next();
  };
}
