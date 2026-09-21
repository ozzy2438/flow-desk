import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await params;
  const artifact = await db.screenshotArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact || artifact.storageDriver !== "local") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(process.cwd(), artifact.storagePath));
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
