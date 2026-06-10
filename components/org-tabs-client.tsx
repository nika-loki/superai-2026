"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Kanban,
  Activity,
  MessageSquare,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SignalsList } from "@/components/signals-list";
import { TasksList } from "@/components/tasks-list";
import { ContactsList } from "@/components/contacts-list";
import { DealsPipeline } from "@/components/deals-pipeline";
import { RunsTimeline } from "@/components/runs-timeline";
import { AgentRunPanel } from "@/components/agent-run-panel";
import { ChatSkeleton } from "@/components/chat-skeleton";
import { useOrgTabData } from "@/components/org-detail-provider";

interface OrgTabsClientProps {
  orgId: string;
  orgName: string;
  defaultTab?: string;
  triggerRun?: boolean;
  hasActiveRun?: boolean;
}

export function OrgTabsClient({
  orgId,
  orgName,
  defaultTab = "overview",
  triggerRun = false,
  hasActiveRun = false,
}: OrgTabsClientProps) {
  const router = useRouter();
  const hasTriggered = useRef(false);
  const data = useOrgTabData();

  const handleRunComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  // Clean the trigger param from URL on mount so refreshes don't re-trigger
  useEffect(() => {
    if (triggerRun && !hasTriggered.current) {
      hasTriggered.current = true;
      window.history.replaceState(null, "", `/org/${orgId}?tab=runs`);
    }
  }, [triggerRun, orgId]);

  return (
    <Tabs defaultValue={defaultTab}>
      <div className="px-8">
        <TabsList className="mt-6">
          <TabsTrigger value="overview">
            <LayoutDashboard className="size-3.5 shrink-0" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <Users className="size-3.5 shrink-0" />
            Contacts{data.contacts.length > 0 ? ` (${data.contacts.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="deals">
            <Kanban className="size-3.5 shrink-0" />
            Deals{data.deals.length > 0 ? ` (${data.deals.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="runs">
            <Activity className="size-3.5 shrink-0" />
            Runs{data.runs.length > 0 ? ` (${data.runs.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare className="size-3.5 shrink-0" />
            Chat
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Overview Tab */}
      <TabsContent value="overview" className="mt-6 px-8">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <SignalsList signals={data.signals} />
          </div>
          <div className="w-[380px] shrink-0">
            <TasksList tasks={data.tasks} orgId={orgId} />
          </div>
        </div>
      </TabsContent>

      {/* Contacts Tab */}
      <TabsContent value="contacts" className="mt-6 px-8">
        <div className="max-w-2xl">
          <ContactsList contacts={data.contacts} />
        </div>
      </TabsContent>

      {/* Deals Tab */}
      <TabsContent value="deals" className="mt-6 px-8">
        <DealsPipeline deals={data.deals} />
      </TabsContent>

      {/* Runs Tab */}
      <TabsContent value="runs" className="mt-6 px-8">
        <div className="space-y-6">
          {/* Live agent run panel */}
          <AgentRunPanel
            orgName={orgName}
            orgId={orgId}
            onRunComplete={handleRunComplete}
            autoStart={triggerRun}
            hasActiveRun={hasActiveRun}
          />

          {/* Historical runs */}
          {data.runs.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-notion-text-muted mb-3">
                Run History
              </h3>
              <RunsTimeline runs={data.runs} />
            </div>
          )}
        </div>
      </TabsContent>

      {/* Chat Tab */}
      <TabsContent value="chat" className="mt-6 px-8">
        <ChatSkeleton />
      </TabsContent>
    </Tabs>
  );
}
