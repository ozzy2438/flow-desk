import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getEnv } from "../env";
import { getFeatureFlags } from "../flags";

export type StoredScreenshot = {
  driver: string;
  storagePath: string;
};

/**
 * docs/browser-worker.md: screenshots live in object storage, only their
 * metadata lives in Postgres. The local filesystem driver is the default so
 * `pnpm dev` needs no cloud credentials; an S3 driver is a documented,
 * flag-gated follow-up (Phase 0's "feature flags for every external
 * provider").
 */
export async function storeScreenshot(buffer: Buffer, flowId: string): Promise<StoredScreenshot> {
  const flags = getFeatureFlags();
  if (flags.remoteScreenshotStorage) {
    throw new Error(
      "SCREENSHOT_STORAGE_DRIVER=s3 is configured but the S3 driver is not implemented in this build. Set it back to 'local' or add an S3 adapter behind this same storeScreenshot() interface.",
    );
  }

  const env = getEnv();
  const dir = path.join(process.cwd(), env.SCREENSHOT_STORAGE_DIR, flowId);
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.png`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, buffer);

  return { driver: "local", storagePath: path.relative(process.cwd(), filePath) };
}
