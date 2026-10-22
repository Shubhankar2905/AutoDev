CREATE TABLE "GitHubConnection" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL DEFAULT 'bearer',
    "credentialType" TEXT NOT NULL DEFAULT 'github_app_user_access_token',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubConnection_sessionId_key" ON "GitHubConnection"("sessionId");
