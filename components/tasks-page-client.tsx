"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  EyeOff,
  Undo2,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskStatusIndicator } from "@/components/status-badge";
import { CompanyLogo } from "@/components/company-logo";

// ── Types ──────────────────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  orgId: string;
  orgName: string;
  orgDomain: string;
  type: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  description: string;
  rationale: string | null;
  priority: number;
  contactName: string | null;
  createdAt: string | null;
}

type TaskGroup = "all" | "active" | "completed" | "skipped";
type SortBy = "priority" | "createdAt" | "orgName";

interface Stats {
  active: number;
  completed: number;
  total: number;
}

interface TasksPageClientProps {
  tasks: TaskRow[];
  stats: Stats;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: number }) {
  const color =
    priority > 70
      ? "bg-notion-red"
      : priority >= 40
        ? "bg-notion-orange"
        : "bg-notion-text-muted";
  return <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />;
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    send_email: "Email",
    linkedin_dm: "LinkedIn",
    schedule_call: "Call",
    research_deeper: "Research",
  };
  return labels[type] ?? type;
}

function typeColor(type: string) {
  const colors: Record<string, string> = {
    send_email: "bg-blue-50 text-blue-700 border-blue-200",
    linkedin_dm: "bg-indigo-50 text-indigo-700 border-indigo-200",
    schedule_call: "bg-emerald-50 text-emerald-700 border-emerald-200",
    research_deeper: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return colors[type] ?? "bg-gray-50 text-gray-700 border-gray-200";
}

async function updateTaskStatus(taskId: string, status: string) {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update task");
  return res.json();
}

function relativeTime(dateStr: string | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Task Card ──────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onUpdate,
}: {
  task: TaskRow;
  onUpdate: (taskId: string, newStatus: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const isDone = task.status === "completed";
  const isHidden = task.status === "skipped";

  const handleAction = useCallback(
    async (newStatus: string) => {
      setUpdating(true);
      try {
        await updateTaskStatus(task.id, newStatus);
        onUpdate(task.id, newStatus);
      } catch (err) {
        console.error("Failed to update task:", err);
      } finally {
        setUpdating(false);
      }
    },
    [task.id, onUpdate],
  );

  return (
    <div
      className={cn(
        "group border border-notion-border rounded-lg transition-shadow",
        "hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        isDone && "opacity-70",
        isHidden && "opacity-50",
      )}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-notion-bg-hover/50 transition-colors rounded-lg"
      >
        {/* Status indicator */}
        <span className="mt-0.5 shrink-0">
          <TaskStatusIndicator status={task.status} />
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm text-notion-text leading-snug",
              (isDone || isHidden) && "line-through text-notion-text-muted",
            )}
          >
            {task.description}
          </p>

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <PriorityDot priority={task.priority} />
            <span className="text-[11px] text-notion-text-muted tabular-nums">
              P{task.priority}
            </span>

            {/* Type badge */}
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
                typeColor(task.type),
              )}
            >
              {typeLabel(task.type)}
            </span>

            {/* Org link */}
            <Link
              href={`/org/${task.orgId}`}
              className="inline-flex items-center gap-1 text-[11px] text-notion-text-muted hover:text-notion-blue transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <CompanyLogo domain={task.orgDomain} name={task.orgName} size="sm" className="!w-4 !h-4 !rounded-sm !text-[8px]" />
              {task.orgName}
            </Link>

            {/* Contact */}
            {task.contactName && (
              <>
                <span className="text-notion-border text-[11px]">·</span>
                <span className="text-[11px] text-notion-text-muted">
                  {task.contactName}
                </span>
              </>
            )}

            {/* Timestamp */}
            {task.createdAt && (
              <>
                <span className="text-notion-border text-[11px]">·</span>
                <span className="text-[11px] text-notion-text-muted">
                  {relativeTime(task.createdAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <span className="mt-1 shrink-0 text-notion-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-notion-border">
          {task.rationale && (
            <div className="mt-3">
              <h4 className="text-[10px] font-semibold text-notion-text-muted uppercase tracking-wider mb-1">
                Rationale
              </h4>
              <p className="text-sm text-notion-text leading-relaxed">
                {task.rationale}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {!isDone && !isHidden && (
              <>
                <button
                  onClick={() => handleAction("completed")}
                  disabled={updating}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-notion-green rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Check size={12} />
                  Complete
                </button>
                <button
                  onClick={() => handleAction("skipped")}
                  disabled={updating}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-notion-text-muted bg-notion-bg-secondary rounded-md hover:bg-notion-bg-hover transition-colors disabled:opacity-50 border border-notion-border"
                >
                  <EyeOff size={12} />
                  Skip
                </button>
              </>
            )}
            {(isDone || isHidden) && (
              <button
                onClick={() => handleAction("pending")}
                disabled={updating}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-notion-blue bg-notion-bg-secondary rounded-md hover:bg-notion-bg-hover transition-colors disabled:opacity-50 border border-notion-border"
              >
                <Undo2 size={12} />
                Reopen
              </button>
            )}
            <Link
              href={`/org/${task.orgId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-notion-text-muted hover:text-notion-text transition-colors"
            >
              View org
              <ExternalLink size={10} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function TasksPageClient({ tasks, stats }: TasksPageClientProps) {
  const router = useRouter();
  const [group, setGroup] = useState<TaskGroup>("all");
  const [sortBy, setSortBy] = useState<SortBy>("priority");

  const handleUpdate = useCallback(
    (_taskId: string, _newStatus: string) => {
      // Re-fetch server component data after mutation
      router.refresh();
    },
    [router],
  );

  // Filter
  const filtered = tasks.filter((t) => {
    switch (group) {
      case "active":
        return t.status === "pending" || t.status === "in_progress";
      case "completed":
        return t.status === "completed";
      case "skipped":
        return t.status === "skipped";
      default:
        return true;
    }
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "priority":
        return b.priority - a.priority;
      case "createdAt":
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      case "orgName":
        return a.orgName.localeCompare(b.orgName);
      default:
        return 0;
    }
  });

  // Group by org for "all" view
  const groupedByOrg = group === "all"
    ? sorted.reduce<Record<string, TaskRow[]>>((acc, t) => {
        const key = t.orgName;
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
      }, {})
    : null;

  const tabs: { key: TaskGroup; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "active", label: "Active", count: stats.active },
    { key: "completed", label: "Done", count: stats.completed },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-notion-text">
          Tasks
        </h1>
        <p className="text-sm text-notion-text-muted mt-1">
          Next-best-actions across all your accounts
        </p>
      </div>

      {/* ── Stats Bar ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border border-notion-border bg-notion-bg-secondary">
          <p className="text-xs font-medium text-notion-text-muted uppercase tracking-wider">
            Active
          </p>
          <p className="text-2xl font-bold text-notion-text mt-1 tabular-nums">
            {stats.active}
          </p>
        </div>
        <div className="p-4 rounded-lg border border-notion-border bg-notion-bg-secondary">
          <p className="text-xs font-medium text-notion-text-muted uppercase tracking-wider">
            Completed
          </p>
          <p className="text-2xl font-bold text-notion-green mt-1 tabular-nums">
            {stats.completed}
          </p>
        </div>
        <div className="p-4 rounded-lg border border-notion-border bg-notion-bg-secondary">
          <p className="text-xs font-medium text-notion-text-muted uppercase tracking-wider">
            Total
          </p>
          <p className="text-2xl font-bold text-notion-text mt-1 tabular-nums">
            {stats.total}
          </p>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-4 border-b border-notion-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setGroup(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              group === tab.key
                ? "border-notion-text text-notion-text font-medium"
                : "border-transparent text-notion-text-muted hover:text-notion-text",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none",
                group === tab.key
                  ? "bg-notion-text text-white"
                  : "bg-notion-bg-hover text-notion-text-muted",
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}

        {/* Sort dropdown */}
        <div className="ml-auto flex items-center gap-1">
          <ArrowUpDown size={13} className="text-notion-text-muted" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs text-notion-text-muted bg-transparent border-none outline-none cursor-pointer hover:text-notion-text transition-colors"
          >
            <option value="priority">Priority</option>
            <option value="createdAt">Newest</option>
            <option value="orgName">Account</option>
          </select>
        </div>
      </div>

      {/* ── Task List ──────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-notion-bg-secondary flex items-center justify-center mx-auto mb-3">
            <Check size={20} className="text-notion-green" />
          </div>
          <p className="text-sm text-notion-text-muted">
            {group === "all"
              ? "No tasks yet. Run the agent on an account to generate tasks."
              : group === "active"
                ? "All caught up! No active tasks."
                : "Nothing here yet."}
          </p>
        </div>
      ) : groupedByOrg ? (
        // Grouped by org view
        <div className="space-y-6">
          {Object.entries(groupedByOrg).map(([orgName, orgTasks]) => (
            <div key={orgName}>
              <div className="flex items-center gap-2 mb-2">
                <CompanyLogo domain={orgTasks[0].orgDomain} name={orgName} size="sm" />
                <h3 className="text-xs font-semibold text-notion-text-muted uppercase tracking-wider">
                  {orgName}
                </h3>
                <span className="text-[10px] text-notion-text-muted/60">
                  {orgTasks.length} task{orgTasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {orgTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onUpdate={handleUpdate} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat list view
        <div className="space-y-2">
          {sorted.map((t) => (
            <TaskCard key={t.id} task={t} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
