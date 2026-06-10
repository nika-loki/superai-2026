"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CompanyLogo } from "@/components/company-logo";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";

interface OrgSearchResult {
  id: string;
  name: string;
  domain: string;
  hqCountry: string;
  opportunityScore: number | null;
  status: "onboarding" | "active" | "paused" | "churned";
}

function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

export function AccountSearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K listener + click-triggered custom event
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function handleOpenSearch() {
      setOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-account-search", handleOpenSearch);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-account-search", handleOpenSearch);
    };
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced search
  const fetchResults = useCallback((searchTerm: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchTerm.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/orgs/search?q=${encodeURIComponent(searchTerm)}`,
        );
        if (res.ok) {
          const data: OrgSearchResult[] = await res.json();
          setResults(data);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  useEffect(() => {
    fetchResults(query);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchResults]);

  function handleSelect(orgId: string) {
    setOpen(false);
    router.push(`/org/${orgId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search Accounts</DialogTitle>
        <DialogDescription>
          Search for accounts by name or domain
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-[20%] translate-y-0 sm:max-w-lg p-0 overflow-hidden rounded-xl! border border-notion-border shadow-lg"
        showCloseButton={false}
      >
        <Command className="bg-transparent" shouldFilter={false}>
          <div className="px-3 pt-3 pb-0">
            <CommandInput
              placeholder="Search accounts by name or domain..."
              value={query}
              onValueChange={setQuery}
              className="h-10 text-base"
            />
          </div>
          <CommandList className="max-h-80 px-1 pb-1">
            {!query.trim() && !loading && (
              <CommandEmpty>Type to search accounts...</CommandEmpty>
            )}
            {query.trim() && !loading && results.length === 0 && (
              <CommandEmpty>No accounts found</CommandEmpty>
            )}
            {loading && (
              <div className="py-6 text-center text-sm text-notion-text-muted">
                Searching...
              </div>
            )}
            {!loading && results.length > 0 && (
              <CommandGroup heading="Accounts">
                {results.map((org) => (
                  <CommandItem
                    key={org.id}
                    value={`${org.name} ${org.domain}`}
                    onSelect={() => handleSelect(org.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer bg-white! data-[selected]:bg-notion-bg-hover! text-notion-text"
                  >
                    <CompanyLogo
                      domain={org.domain}
                      name={org.name}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-notion-text truncate">
                        {org.name}
                      </div>
                      <div className="text-xs text-notion-text-muted truncate">
                        {org.domain}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm" title={org.hqCountry}>
                        {getCountryFlag(org.hqCountry)}
                      </span>
                      <ScoreBadge score={org.opportunityScore} size="sm" />
                      <StatusBadge status={org.status} />
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
