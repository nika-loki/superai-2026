"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  CreditCard,
  Settings,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Search,
  Building2,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecentOrgs } from "@/lib/use-recent-orgs";
import type { OrgVisit } from "@/components/visit-tracker";

// ── Navigation Items ───────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: "count";
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    match: (path) => path === "/",
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    badge: "count",
    match: (path) => path.startsWith("/tasks"),
  },
  {
    label: "Billing",
    href: "/billing",
    icon: CreditCard,
    match: (path) => path.startsWith("/billing"),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    match: (path) => path.startsWith("/settings") && !path.includes("/integrations"),
  },
];

// ── Sidebar Component ──────────────────────────────────────────────────────

interface AppSidebarProps {
  pendingTaskCount?: number;
}

export function AppSidebar({ pendingTaskCount = 0 }: AppSidebarProps) {
  const pathname = usePathname();
  const orgs = useRecentOrgs();
  const [collapsed, setCollapsed] = useState(false);
  const [orgsExpanded, setOrgsExpanded] = useState(true);

  const toggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen sticky top-0 border-r border-notion-border bg-notion-bg-secondary",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[52px]" : "w-[240px]",
      )}
    >
      {/* ── Workspace Header ────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center gap-2 px-3 h-[52px] border-b border-notion-border shrink-0",
        collapsed && "justify-center px-0",
      )}>
        {!collapsed && (
          <>
            <Image
              src="/favicon.svg"
              alt="RevenueOS"
              width={24}
              height={24}
              className="shrink-0 rounded"
              priority
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-notion-text truncate leading-tight">
                Revenue<span className="text-[#7C3AED]">OS</span>
              </p>
            </div>
          </>
        )}
        {collapsed && (
          <Image
            src="/favicon.svg"
            alt="RevenueOS"
            width={20}
            height={20}
            className="rounded"
            priority
          />
        )}
        <button
          onClick={toggleCollapse}
          className={cn(
            "shrink-0 p-1 rounded hover:bg-notion-bg-hover transition-colors",
            "text-notion-text-muted hover:text-notion-text",
            collapsed && "mt-0.5",
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* ── Search hint ─────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-notion-border text-notion-text-muted text-xs hover:bg-notion-bg-hover transition-colors cursor-pointer">
            <Search size={13} />
            <span>Search</span>
            <kbd className="ml-auto text-[10px] font-mono opacity-60 bg-notion-bg px-1 py-0.5 rounded border border-notion-border">
              ⌘K
            </kbd>
          </div>
        </div>
      )}

      {/* ── Main Navigation ─────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
        {/* Core nav items */}
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match(pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md text-sm transition-colors",
                  collapsed
                    ? "justify-center px-1.5 py-2"
                    : "px-2.5 py-1.5",
                  isActive
                    ? "bg-notion-bg text-notion-text font-medium"
                    : "text-notion-text-muted hover:bg-notion-bg-hover hover:text-notion-text",
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.badge === "count" && pendingTaskCount > 0 && (
                      <span className={cn(
                        "ml-auto inline-flex items-center justify-center",
                        "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none",
                        isActive
                          ? "bg-notion-text text-white"
                          : "bg-notion-bg-hover text-notion-text-muted",
                      )}>
                        {pendingTaskCount}
                      </span>
                    )}
                  </>
                )}
                {collapsed && item.badge === "count" && pendingTaskCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-notion-blue" />
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Recent Accounts (only when visits exist) ─────────────── */}
        {orgs.length > 0 && (
          <>
            <div className="my-2 border-t border-notion-border" />

            {!collapsed && (
              <div>
                <button
                  onClick={() => setOrgsExpanded(!orgsExpanded)}
                  className="flex items-center gap-1 w-full px-1 py-1 text-xs font-medium text-notion-text-muted hover:text-notion-text transition-colors"
                >
                  {orgsExpanded ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRightIcon size={12} />
                  )}
                  <span className="uppercase tracking-wider">Recent</span>
                  <span className="ml-auto text-notion-text-muted/60">
                    {orgs.length}
                  </span>
                </button>

                {orgsExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {orgs.map((org: OrgVisit) => {
                      const isOrgActive = pathname === `/org/${org.id}`;
                      const scoreColor = org.opportunityScore
                        ? org.opportunityScore >= 80
                          ? "text-notion-green"
                          : org.opportunityScore >= 60
                            ? "text-notion-orange"
                            : "text-notion-text-muted"
                        : "";

                      return (
                        <Link
                          key={org.id}
                          href={`/org/${org.id}`}
                          className={cn(
                            "flex items-center gap-2 rounded-md text-sm transition-colors",
                            "px-2.5 py-1.5",
                            isOrgActive
                              ? "bg-notion-bg text-notion-text font-medium"
                              : "text-notion-text-muted hover:bg-notion-bg-hover hover:text-notion-text",
                          )}
                        >
                          <Building2 size={14} className="shrink-0 opacity-60" />
                          <span className="truncate flex-1">{org.name}</span>
                          {org.opportunityScore && (
                            <span className={cn(
                              "text-[10px] font-semibold tabular-nums",
                              scoreColor,
                            )}>
                              {org.opportunityScore}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Collapsed: show avatars for recent orgs */}
            {collapsed && (
              <div className="space-y-1 pt-1">
                {orgs.slice(0, 5).map((org: OrgVisit) => {
                  const isOrgActive = pathname === `/org/${org.id}`;
                  return (
                    <Link
                      key={org.id}
                      href={`/org/${org.id}`}
                      className={cn(
                        "flex items-center justify-center rounded-md py-1.5 transition-colors",
                        isOrgActive
                          ? "bg-notion-bg text-notion-text"
                          : "text-notion-text-muted hover:bg-notion-bg-hover hover:text-notion-text",
                      )}
                      title={org.name}
                    >
                      <span className="text-xs font-semibold">
                        {org.name.charAt(0)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>

      {/* ── Bottom Section ──────────────────────────────────────────── */}
      {!collapsed && (
        <div className="px-3 py-2 border-t border-notion-border shrink-0">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-6 h-6 rounded-full bg-notion-bg-hover flex items-center justify-center text-xs font-semibold text-notion-text-muted">
              U
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-notion-text truncate">User</p>
              <p className="text-[10px] text-notion-text-muted truncate">Free Trial</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
