ALTER TABLE "Fragment"
ADD COLUMN "sandboxId" TEXT,
ADD COLUMN "sandboxStatus" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN "sandboxError" TEXT;
