/**
 * RevenueOS — S3 Client for Organisation.md Storage
 *
 * Reads/writes Organisation.md files at <workspace_id>/org.md
 * in the configured S3 bucket.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const Bucket = process.env.S3_BUCKET_NAME;
if (!Bucket) throw new Error("S3_BUCKET_NAME env var is required");

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-southeast-1",
});

/** Build the S3 key for a workspace's Organisation.md */
function orgMdKey(workspaceId: string): string {
  return `${workspaceId}/org.md`;
}

/**
 * Read the Organisation.md for a workspace from S3.
 * Returns null if the file doesn't exist.
 */
export async function getOrganisationMd(
  workspaceId: string,
): Promise<string | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket,
        Key: orgMdKey(workspaceId),
      }),
    );

    const body = await result.Body?.transformToString();
    return body ?? null;
  } catch (err: unknown) {
    // NoSuchKey is expected when no Organisation.md has been uploaded yet
    if (err instanceof Error && err.name === "NoSuchKey") {
      return null;
    }
    console.error("[s3] Error reading Organisation.md:", {
      bucket: Bucket,
      key: orgMdKey(workspaceId),
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    });
    return null;
  }
}

/**
 * Write the Organisation.md for a workspace to S3.
 */
export async function putOrganisationMd(
  workspaceId: string,
  content: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: orgMdKey(workspaceId),
      Body: content,
      ContentType: "text/markdown",
    }),
  );
}

/**
 * Seed Organisation.md into S3 (used by seed script).
 * Skips if the file already exists.
 */
export async function seedOrganisationMd(
  workspaceId: string,
  content: string,
): Promise<void> {
  const existing = await getOrganisationMd(workspaceId);
  if (existing !== null) {
    console.log("  -> Organisation.md already exists in S3, skipping seed");
    return;
  }
  await putOrganisationMd(workspaceId, content);
  console.log("  -> Seeded Organisation.md to S3");
}
