import jwt from "jsonwebtoken";

const JWT_SECRET = "CHANGE_THIS_SECRET_TO_A_LONG_RANDOM_STRING_123456789";

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
