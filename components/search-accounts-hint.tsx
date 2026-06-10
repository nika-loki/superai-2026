"use client";

/**
 * Small badge that hints at the Cmd+K shortcut.
 * Clicking it opens the AccountSearchDialog via a custom event.
 */
export function SearchAccountsHint() {
  function handleClick() {
    window.dispatchEvent(new CustomEvent("open-account-search"));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-notion-text-muted border border-notion-border rounded-md hover:bg-notion-bg-hover transition-colors"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className="opacity-50"
      >
        <path
          d="M7 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M11.5 11.5L14.5 14.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span>Search accounts</span>
      <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-notion-bg-secondary border border-notion-border rounded">
        <span className="hidden sm:inline">&#8984;K</span>
        <span className="sm:hidden">Ctrl+K</span>
      </kbd>
    </button>
  );
}
