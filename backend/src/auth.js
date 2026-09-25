import jwt from "jsonwebtoken";
import { jwtSecret } from "./db.js";
import { User } from "./models.js";

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: "7d" });
}

export async function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required" });
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = await User.findById(payload.sub);
    if (!req.user) return res.status(401).json({ error: "User missing" });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

export function roles(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: "Not allowed for this role" });
    next();
  };
}
