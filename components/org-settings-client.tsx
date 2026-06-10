"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, CheckCircle2 } from "lucide-react";

interface OrgSettingsClientProps {
  orgId: string;
  orgName: string;
  initialOrganisationMd: string;
  icpDescription?: string;
}

const DEFAULT_TEMPLATE = `# Your Company — Seller ICP & Go-to-Market Strategy

## Who We Are
Brief description of your company, what you sell, and your market position.

## Our Product
- **Product 1**: Description
- **Product 2**: Description
- **Product 3**: Description

## Ideal Customer Profile (ICP)
- **Industry:** [target industry]
- **Company size:** [employee range]
- **Geography:** [APAC focus]
- **Tech signals:** [what tools/tech they use]
- **Buying signals:** [what indicates readiness to buy]

## Signal Categories to Monitor
1. **Funding Stage** — Series A/B for Growth; why this matters
2. **Expansion in APAC** — new market entries; why this matters
3. [Add more categories]

## Target Decision Makers
- [Role] — [why this role matters]
- [Role] — [why this role matters]

## Engagement Strategy
How should the seller approach target accounts? What's the value proposition?

## Competitive Landscape
- **Competitor 1**: [differentiator]
- **Competitor 2**: [differentiator]
`;

export function OrgSettingsClient({
  orgId,
  orgName,
  initialOrganisationMd,
}: OrgSettingsClientProps) {
  const router = useRouter();
  const [md, setMd] = useState(initialOrganisationMd);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = md !== initialOrganisationMd;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationMd: md }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to save" }));
        throw new Error(data.error ?? "Failed to save");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [md, orgId, router]);

  const handleReset = useCallback(() => {
    setMd(initialOrganisationMd);
    setError(null);
  }, [initialOrganisationMd]);

  const handleUseTemplate = useCallback(() => {
    const template = DEFAULT_TEMPLATE.replace("{COMPANY_NAME}", orgName);
    setMd(template);
  }, [orgName]);

  return (
    <div className="space-y-6">
      {/* Organisation.md editor */}
      <div className="border border-notion-border rounded-md overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-notion-border bg-notion-bg-secondary">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-notion-text">
              Organisation.md
            </span>
            {isDirty && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Unsaved changes
              </span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={12} />
                Saved
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {initialOrganisationMd === "" && (
              <button
                type="button"
                onClick={handleUseTemplate}
                className="inline-flex items-center gap-1 rounded-md border border-notion-border px-2.5 py-1 text-xs font-medium text-notion-text-muted hover:text-notion-text hover:bg-notion-bg-hover transition-colors"
              >
                Use Template
              </button>
            )}
            {isDirty && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 rounded-md border border-notion-border px-2.5 py-1 text-xs font-medium text-notion-text-muted hover:text-notion-text hover:bg-notion-bg-hover transition-colors"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-notion-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-notion-blue-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={12} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Editor */}
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          className="w-full min-h-[500px] p-4 text-sm text-notion-text font-mono leading-relaxed border-0 focus:outline-none focus:ring-0 resize-y"
          placeholder="Write your Organisation.md here... This defines YOUR company's product, ICP, and how the agent evaluates all target accounts."
        />
      </div>

      {/* Help text */}
      <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-1">
          What is Organisation.md?
        </h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          Organisation.md defines <strong>your company</strong> — what you sell, your Ideal Customer Profile (ICP),
          target market, signal categories, and engagement strategy. The agent reads this before every research run
          to understand what signals to look for and how to score target accounts. This is shared across all accounts in your workspace.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
