"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Check,
  EyeOff,
  Undo2,
} from "lucide-react";
import type { Task } from "@/lib/data";
import { TaskStatusIndicator } from "@/components/status-badge";
import { cn } from "@/lib/utils";

interface TasksListProps {
  tasks: Task[];
  orgId: string;
}

function PriorityDot({ priority }: { priority: number }) {
  const color =
    priority > 70
      ? "bg-notion-red"
      : priority >= 40
        ? "bg-notion-orange"
        : "bg-notion-text-muted";
  return <span className={cn("w-2 h-2 rounded-full", color)} />;
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

function TaskCard({
  task,
  orgId,
  onUpdate,
}: {
  task: Task;
  orgId: string;
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
        "border border-notion-border rounded-md",
        isHidden && "opacity-60",
      )}
    >
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-notion-bg-hover transition-colors"
      >
        <span className="mt-0.5 shrink-0">
          <TaskStatusIndicator status={task.status} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm text-notion-text leading-snug",
              isDone && "line-through text-notion-text-muted",
              isHidden && "line-through text-notion-text-muted",
            )}
          >
            {task.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <PriorityDot priority={task.priority} />
            <span className="text-xs text-notion-text-muted">
              Priority {task.priority}
            </span>
            {task.contactName && (
              <>
                <span className="text-notion-border text-xs">|</span>
                <span className="text-xs text-notion-text-muted">
                  {task.contactName}
                </span>
              </>
            )}
          </div>
        </div>
        <span className="mt-1 shrink-0 text-notion-text-muted">
          {expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </span>
      </button>

      {/* Expanded body with rationale + actions */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-notion-border">
          {task.rationale && (
            <>
              <h4 className="text-xs font-medium text-notion-text-muted uppercase tracking-wide mt-2 mb-1">
                Rationale
              </h4>
              <p className="text-sm text-notion-text leading-relaxed mb-3">
                {task.rationale}
              </p>
            </>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isDone && !isHidden && (
              <>
                <button
                  onClick={() => handleAction("completed")}
                  disabled={updating}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-notion-green rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Check size={12} />
                  Complete
                </button>
                <button
                  onClick={() => handleAction("skipped")}
                  disabled={updating}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-notion-text-muted bg-notion-bg-secondary rounded hover:bg-notion-bg-hover transition-colors disabled:opacity-50"
                >
                  <EyeOff size={12} />
                  Hide
                </button>
              </>
            )}
            {(isDone || isHidden) && (
              <button
                onClick={() => handleAction("pending")}
                disabled={updating}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-notion-blue bg-notion-bg-secondary rounded hover:bg-notion-bg-hover transition-colors disabled:opacity-50"
              >
                <Undo2 size={12} />
                Undo
              </button>
            )}
            {isDone && (
              <span className="text-xs text-notion-green font-medium">
                Completed
              </span>
            )}
            {isHidden && (
              <span className="text-xs text-notion-text-muted font-medium">
                Hidden
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TasksList({ tasks, orgId }: TasksListProps) {
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Optimistic update: mutate local cache immediately
  const handleUpdate = useCallback(
    (taskId: string, newStatus: string) => {
      queryClient.setQueryData(["org", orgId], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const data = old as { tasks: Task[] };
        return {
          ...data,
          tasks: data.tasks.map((t: Task) =>
            t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t,
          ),
        };
      });
    },
    [queryClient, orgId],
  );

  if (tasks.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-notion-text mb-3">
          Tasks
          <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
            0
          </span>
        </h2>
        <p className="text-sm text-notion-text-muted py-6 text-center">
          No tasks generated yet.
        </p>
      </div>
    );
  }

  // Partition tasks
  const active = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress",
  );
  const completed = tasks.filter((t) => t.status === "completed");
  const hidden = tasks.filter((t) => t.status === "skipped");

  const sortedActive = [...active].sort((a, b) => b.priority - a.priority);
  const sortedCompleted = [...completed].sort((a, b) => b.priority - a.priority);
  const sortedHidden = [...hidden].sort((a, b) => b.priority - a.priority);

  return (
    <div>
      <h2 className="text-sm font-semibold text-notion-text mb-3">
        Tasks
        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
          {active.length}
        </span>
      </h2>

      {/* Active tasks */}
      {sortedActive.length > 0 ? (
        <div className="space-y-2">
          {sortedActive.map((t) => (
            <TaskCard key={t.id} task={t} orgId={orgId} onUpdate={handleUpdate} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-notion-text-muted py-4 text-center">
          All tasks handled!
        </p>
      )}

      {/* Toggle: show completed */}
      {completed.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs text-notion-text-muted hover:text-notion-text transition-colors"
          >
            {showCompleted ? "Hide" : "Show"} {completed.length} completed
          </button>
          {showCompleted && (
            <div className="space-y-2 mt-2">
              {sortedCompleted.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  orgId={orgId}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toggle: show hidden */}
      {hidden.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="text-xs text-notion-text-muted hover:text-notion-text transition-colors"
          >
            {showHidden ? "Hide" : "Show"} {hidden.length} hidden
          </button>
          {showHidden && (
            <div className="space-y-2 mt-2">
              {sortedHidden.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  orgId={orgId}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
