export function notFoundHandler(_request, response) {
  response.status(404).json({
    error: { message: "Route not found" },
  });
}

export function errorHandler(error, _request, response, _next) {
  const status = error.code === 11000
    ? 409
    : Number.isInteger(error.status)
      ? error.status
      : 500;
  const message = status >= 500
    ? "Internal server error"
    : error.code === 11000
      ? "An account with this email already exists"
      : error.message;

  if (status >= 500) {
    console.error(error);
  }

  const payload = { error: { message } };
  if (error.details) {
    payload.error.details = error.details;
  }
  response.status(status).json(payload);
}
