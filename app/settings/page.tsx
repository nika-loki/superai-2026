import { db } from "@/agent/lib/db/index";
import { organisations } from "@/agent/lib/db/schema";
import { getOrganisationMd } from "@/lib/s3";
import { OrgSettingsClient } from "@/components/org-settings-client";

export default async function SettingsPage() {
  // Get first org to access workspaceId (single-tenant for now)
  const [org] = await db
    .select({ workspaceId: organisations.workspaceId })
    .from(organisations)
    .limit(1);

  if (!org) {
    return (
      <div className="min-h-screen bg-white">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold text-notion-text">
            No workspace found
          </h2>
        </div>
      </div>
    );
  }

  // Fetch the workspace's Organisation.md from S3
  const organisationMd = await getOrganisationMd(org.workspaceId);

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h1 className="text-2xl font-semibold text-notion-text mb-1">
        Seller Profile (Organisation.md)
      </h1>
      <p className="text-sm text-notion-text-muted mb-6">
        This defines <strong>your company&apos;s</strong> product, ICP, and go-to-market strategy.
        The agent uses this to evaluate all target accounts. Changing this affects how the agent
        researches every account in your workspace.
      </p>

      <div className="max-w-4xl">
        <OrgSettingsClient
          orgId={org.workspaceId}
          orgName="Workspace"
          initialOrganisationMd={organisationMd ?? ""}
        />
      </div>
    </div>
  );
}
