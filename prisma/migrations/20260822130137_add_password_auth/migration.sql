-- Adds real password authentication. The 5 existing seeded users get
-- backfilled with the hash of the shared demo password ("password123",
-- documented in README.md) via the temporary DEFAULT below; the default
-- is then dropped so every future insert (signup, or a differently-seeded
-- account) must supply its own hash explicitly rather than silently
-- reusing the demo password.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '$2b$10$xHiYOkLlSipYv3gcMiiL/e1v3EdQtK4n3ujm2o4WVae0tTRC4E6HC';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
