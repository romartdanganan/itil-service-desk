import bcrypt from "bcryptjs";

// A cost factor of 10 is bcrypt's own recommended default — high enough
// to make brute-forcing a stolen hash meaningfully slow, low enough that
// a real login request still completes in well under a second.
const SALT_ROUNDS = 10;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
