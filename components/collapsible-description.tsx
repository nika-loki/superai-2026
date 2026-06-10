"use client";

import { useState } from "react";

const COLLAPSE_THRESHOLD = 200;

interface CollapsibleDescriptionProps {
  text: string;
}

export function CollapsibleDescription({ text }: CollapsibleDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  if (text.length <= COLLAPSE_THRESHOLD) {
    return (
      <p className="text-sm text-notion-text-muted mt-3 max-w-3xl leading-relaxed">
        {text}
      </p>
    );
  }

  const truncated = text.slice(0, COLLAPSE_THRESHOLD);

  return (
    <p className="text-sm text-notion-text-muted mt-3 max-w-3xl leading-relaxed">
      {expanded ? text : truncated}
      {!expanded && "..."}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="text-notion-blue hover:underline cursor-pointer ml-1"
      >
        {expanded ? "less" : "more"}
      </button>
    </p>
  );
}
