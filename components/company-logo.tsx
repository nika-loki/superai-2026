"use client";

import { cn } from "@/lib/utils";

interface CompanyLogoProps {
  domain: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-12 h-12",
};

const TEXT_MAP = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/**
 * Company logo from Company Enrich API.
 * Falls back to a letter avatar on error.
 */
export function CompanyLogo({ domain, name, size = "md", className }: CompanyLogoProps) {
  const logoUrl = `https://api.companyenrich.com/logo/${domain}`;
  const initial = name.charAt(0).toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-md bg-notion-bg-secondary border border-notion-border overflow-hidden shrink-0",
        SIZE_MAP[size],
        className,
      )}
    >
      {/* Letter fallback always rendered underneath */}
      <span className={cn("font-semibold text-notion-text-muted", TEXT_MAP[size])}>
        {initial}
      </span>
      {/* Logo image overlays the fallback on success */}
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => {
          // Hide img on error so fallback letter shows through
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </span>
  );
}
