import jwt from "jsonwebtoken";

const JWT_SECRET = "CHANGE_THIS_SECRET_NOW_very_long_string";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
