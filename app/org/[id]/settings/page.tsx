import { db } from "@/agent/lib/db/index";
import { organisations } from "@/agent/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrganisationMd } from "@/lib/s3";
import { OrgSettingsClient } from "@/components/org-settings-client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [orgRows] = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      domain: organisations.domain,
      workspaceId: organisations.workspaceId,
      icpDescription: organisations.icpDescription,
    })
    .from(organisations)
    .where(eq(organisations.id, id))
    .limit(1);

  if (!orgRows) {
    return (
      <div className="min-h-screen bg-white">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold text-notion-text">
            Organisation not found
          </h2>
        </div>
      </div>
    );
  }

  // Fetch the workspace's Organisation.md from S3
  const organisationMd = await getOrganisationMd(orgRows.workspaceId);

  return (
    <div className="min-h-screen bg-white px-8 py-8">
      {/* Back link */}
      <Link
        href={`/org/${id}`}
        className="inline-flex items-center gap-1 text-sm text-notion-text-muted hover:text-notion-text transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to {orgRows.name}
      </Link>

      <h1 className="text-2xl font-semibold text-notion-text mb-1">
        Seller Profile (Organisation.md)
      </h1>
      <p className="text-sm text-notion-text-muted mb-6">
        This defines <strong>your company's</strong> product, ICP, and go-to-market strategy.
        The agent uses this to evaluate all target accounts — including {orgRows.name}.
        Changing this affects how the agent researches every account in your workspace.
        Stored in S3 — shared across your workspace.
      </p>

      <div className="max-w-4xl">
        <OrgSettingsClient
          orgId={orgRows.workspaceId}
          orgName={orgRows.name}
          initialOrganisationMd={organisationMd ?? ""}
        />
      </div>
    </div>
  );
}
