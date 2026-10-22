import { ZipArchive } from "archiver";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createTRPCContext } from "@/trpc/init";

const projectIdSchema = z.string().uuid();

const excludedDirectoryNames = new Set([
  ".git",
  ".next",
  "build",
  "dist",
  "node_modules",
  "out",
  "tmp",
  "temp",
]);

function isExcludedPath(filePath: string): boolean {
  const fileName = filePath.split("/").at(-1)?.toLowerCase() ?? "";
  return (
    fileName === ".env" ||
    fileName.startsWith(".env.") ||
    fileName.endsWith(".pem") ||
    fileName.endsWith(".key") ||
    fileName.includes("credential") ||
    fileName.includes("secret")
  );
}

function normalizeArchivePath(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = normalized.split("/");

  if (
    !normalized ||
    parts.some((part) => !part || part === "." || part === "..") ||
    parts.some((part) => excludedDirectoryNames.has(part.toLowerCase())) ||
    isExcludedPath(normalized)
  ) {
    return null;
  }

  return parts.join("/");
}

function getArchiveFilename(projectName: string): string {
  const safeName =
    projectName
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "project";

  return `${safeName}.zip`;
}

async function createZip(
  files: Record<string, string>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    let fileCount = 0;
    for (const [filePath, content] of Object.entries(files)) {
      const archivePath = normalizeArchivePath(filePath);
      if (!archivePath || typeof content !== "string") {
        continue;
      }

      archive.append(Buffer.from(content, "utf8"), { name: archivePath });
      fileCount += 1;
    }

    if (fileCount === 0) {
      reject(new Error("The generated project contains no downloadable files"));
      return;
    }

    void archive.finalize();
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  try {
    const { userId } = await createTRPCContext();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: {
        name: true,
        messages: {
          where: { fragment: { isNot: null } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            fragment: {
              select: { files: true },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    const files = project.messages[0]?.fragment?.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) {
      return NextResponse.json(
        { error: "Project files are not available. Regenerate the project." },
        { status: 404 },
      );
    }

    const zip = await createZip(files as Record<string, string>);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${getArchiveFilename(project.name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Project download failed", error);
    return NextResponse.json(
      { error: "Project download failed. Please try again." },
      { status: 500 },
    );
  }
}
