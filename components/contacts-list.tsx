"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Mail,
  Linkedin,
  User,
} from "lucide-react";
import type { Contact } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ContactsListProps {
  contacts: Contact[];
}

const SENIORITY_STYLES: Record<string, string> = {
  "C-Suite": "bg-notion-blue text-white",
  VP: "bg-notion-purple text-white",
  Director: "bg-notion-orange text-white",
  Manager: "bg-notion-green text-white",
};

function SeniorityBadge({ seniority }: { seniority: string }) {
  const className = SENIORITY_STYLES[seniority] ?? "bg-notion-bg-secondary text-notion-text-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        className,
      )}
    >
      {seniority}
    </span>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-notion-border rounded-md">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-notion-bg-hover transition-colors"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-notion-text-muted shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-notion-text-muted shrink-0" />
        )}
        <div className="size-8 rounded-full bg-notion-bg-secondary flex items-center justify-center shrink-0">
          <User size={14} className="text-notion-text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-notion-text truncate block">
            {contact.name}
          </span>
          {contact.title && (
            <span className="text-xs text-notion-text-muted truncate block">
              {contact.title}
            </span>
          )}
        </div>
        <SeniorityBadge seniority={contact.seniority} />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-notion-border">
          <div className="flex items-center gap-3 mt-3 mb-3">
            {/* Email */}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-1 text-xs text-notion-blue hover:underline"
              >
                <Mail size={12} />
                {contact.email}
              </a>
            )}
            {/* LinkedIn */}
            {contact.linkedinUrl && (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-notion-blue hover:underline"
              >
                <Linkedin size={12} />
                LinkedIn
              </a>
            )}
          </div>

          {/* Relevance note */}
          {contact.relevanceNote && (
            <div>
              <h4 className="text-xs font-medium text-notion-text-muted uppercase tracking-wide mb-1">
                Relevance
              </h4>
              <p className="text-sm text-notion-text leading-relaxed">
                {contact.relevanceNote}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContactsList({ contacts }: ContactsListProps) {
  if (contacts.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-notion-text mb-3">
          Contacts
          <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
            0
          </span>
        </h2>
        <p className="text-sm text-notion-text-muted py-6 text-center">
          No contacts discovered yet. Run the agent to find key contacts.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-notion-text mb-3">
        Contacts
        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
          {contacts.length}
        </span>
      </h2>
      <div className="space-y-2">
        {contacts.map((c) => (
          <ContactCard key={c.id} contact={c} />
        ))}
      </div>
    </div>
  );
}
