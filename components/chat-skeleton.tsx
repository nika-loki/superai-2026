export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-[500px] border border-notion-border rounded-md">
      {/* Messages area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-notion-bg-secondary border border-notion-border flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-notion-text-muted"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-notion-text-muted">
            Coming Soon &mdash; Agent Chat
          </p>
          <p className="text-xs text-notion-text-muted mt-1">
            Chat directly with the research agent to deep-dive into signals, contacts, and recommendations.
          </p>
        </div>
      </div>

      {/* Disabled input */}
      <div className="border-t border-notion-border p-3">
        <div className="flex items-center gap-2">
          <input
            disabled
            type="text"
            placeholder="Ask the agent about this account..."
            className="flex-1 rounded-md border border-notion-border bg-notion-bg-secondary px-3 py-2 text-sm text-notion-text-muted placeholder:text-notion-text-muted/50 cursor-not-allowed"
          />
          <button
            disabled
            className="rounded-md bg-notion-blue px-3 py-2 text-sm font-medium text-white opacity-40 cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
