import { Sandbox } from "@e2b/code-interpreter";

const SANDBOX_TEMPLATE = "vibe-nextjs-shubh-2";
const PREVIEW_PORT = 3000;
const PREVIEW_READY_TIMEOUT_SECONDS = 90;

export type ProjectFiles = Record<string, string>;

function isSafeProjectPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

function assertProjectFiles(files: unknown): asserts files is ProjectFiles {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("Project files are not available");
  }

  for (const [path, content] of Object.entries(files)) {
    if (!isSafeProjectPath(path) || typeof content !== "string") {
      throw new Error("Project files contain an invalid path or value");
    }
  }
}

async function waitForPreview(sandbox: Sandbox): Promise<void> {
  await sandbox.commands.run(
    `timeout ${PREVIEW_READY_TIMEOUT_SECONDS}s sh -c 'until curl -fsS http://127.0.0.1:${PREVIEW_PORT} >/dev/null; do sleep 1; done'`,
  );
}

export async function createAndRestoreSandbox(files: unknown) {
  assertProjectFiles(files);
  const sandbox = await Sandbox.create(SANDBOX_TEMPLATE);

  try {
    for (const [path, content] of Object.entries(files)) {
      await sandbox.files.write(path, content);
    }

    await waitForPreview(sandbox);
    return {
      sandbox,
      sandboxId: sandbox.sandboxId,
      previewUrl: `https://${sandbox.getHost(PREVIEW_PORT)}`,
    };
  } catch (error) {
    await sandbox.kill().catch((cleanupError) => {
      console.error("Failed to clean up an unavailable sandbox", cleanupError);
    });
    throw error;
  }
}

export async function checkSandboxAvailability(
  sandboxId: string | null,
  previewUrl: string,
): Promise<boolean> {
  if (sandboxId) {
    try {
      const sandbox = await Sandbox.connect(sandboxId);
      await sandbox.commands.run(
        `curl -fsS --max-time 5 http://127.0.0.1:${PREVIEW_PORT} >/dev/null`,
      );
      return true;
    } catch {
      return false;
    }
  }

  try {
    const response = await fetch(previewUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
