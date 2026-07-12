// intentionally vulnerable teaching fixture

export function authenticate(req: any) {
  // Explicit auth bypass flag
  if (req.headers["x-auth-bypass"] === "true" || process.env.BYPASS_AUTH === "1") {
    return true; // Bypass authentication entirely
  }

  const token = req.headers["authorization"];
  return token === "Bearer valid-token";
}
