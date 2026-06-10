export default function OrgDetailLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-32 bg-notion-bg-secondary rounded mb-4" />

      {/* Header row 1: logo + name + links */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-md bg-notion-bg-secondary" />
        <div className="h-8 w-40 bg-notion-bg-secondary rounded" />
        <div className="w-5 h-5 rounded bg-notion-bg-secondary" />
        <div className="w-5 h-5 rounded bg-notion-bg-secondary" />
      </div>

      {/* Header row 2: metadata pills */}
      <div className="flex items-center gap-3 mt-3">
        <div className="h-4 w-24 bg-notion-bg-secondary rounded" />
        <span className="text-notion-border">|</span>
        <div className="h-4 w-28 bg-notion-bg-secondary rounded" />
        <span className="text-notion-border">|</span>
        <div className="h-5 w-16 rounded-full bg-notion-bg-secondary" />
        <span className="text-notion-border">|</span>
        <div className="w-7 h-7 rounded-full bg-notion-bg-secondary" />
      </div>

      {/* ICP description */}
      <div className="mt-3 space-y-1.5">
        <div className="h-3.5 w-full bg-notion-bg-secondary rounded" />
        <div className="h-3.5 w-3/4 bg-notion-bg-secondary rounded" />
      </div>

      {/* Properties row */}
      <div className="flex gap-5 mt-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-3.5 w-24 bg-notion-bg-secondary rounded" />
        ))}
      </div>

      {/* Divider */}
      <div className="border-b border-notion-border mt-6" />

      {/* Tabs */}
      <div className="flex gap-0 border-b border-notion-border mt-0">
        {["Overview", "Runs", "Chat"].map((tab) => (
          <div key={tab} className="px-4 py-2.5">
            <div className="h-4 w-16 bg-notion-bg-secondary rounded" />
          </div>
        ))}
      </div>

      {/* Content area: two-column layout */}
      <div className="flex gap-6 mt-6">
        {/* Left: Signals skeleton */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-20 bg-notion-bg-secondary rounded mb-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-notion-border rounded-md px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-notion-bg-secondary" />
                <div className="h-4 flex-1 bg-notion-bg-secondary rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Right: Tasks skeleton */}
        <div className="w-[380px] shrink-0 space-y-2">
          <div className="h-4 w-16 bg-notion-bg-secondary rounded mb-3" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="border border-notion-border rounded-md px-3 py-2.5">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-notion-bg-secondary" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-full bg-notion-bg-secondary rounded" />
                  <div className="h-3 w-20 bg-notion-bg-secondary rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
