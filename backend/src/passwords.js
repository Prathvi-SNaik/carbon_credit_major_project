import bcrypt from "bcryptjs";

export const DEMO_PASSWORDS = {
  FARMER: "Farm@123",
  ADMIN: "Admin@123",
  COMPANY: "Company@123",
};

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), 10);
}

export async function checkPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), hash);
}
