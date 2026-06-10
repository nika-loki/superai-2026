"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import type { Signal, Task, AgentRun, Contact, Deal } from "@/lib/data";

// ── Types ──────────────────────────────────────────────────────────────

export type OrgTabData = {
  hasActiveRun: boolean;
  signals: Signal[];
  tasks: Task[];
  contacts: Contact[];
  deals: Deal[];
  runs: AgentRun[];
};

// ── Query Client ───────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: make once, reuse
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

// ── Hook ───────────────────────────────────────────────────────────────

function useOrgData(orgId: string, initialData: OrgTabData) {
  return useQuery<OrgTabData>({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/orgs/${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch org data");
      return res.json();
    },
    initialData,
    // Poll every 5s when a run is active, stop when idle
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.hasActiveRun ? 5_000 : false;
    },
    // Keep data fresh during runs
    staleTime: (query) => {
      const data = query.state.data;
      return data?.hasActiveRun ? 1_000 : 30_000;
    },
  });
}

// ── Context ────────────────────────────────────────────────────────────

const OrgDataContext = createContext<OrgTabData | null>(null);

export function useOrgTabData(): OrgTabData {
  const ctx = useContext(OrgDataContext);
  if (!ctx) throw new Error("useOrgTabData must be used within OrgDetailProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────

export function OrgDetailProvider({
  orgId,
  initialData,
  children,
}: {
  orgId: string;
  initialData: OrgTabData;
  children: ReactNode;
}) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <OrgDataInner orgId={orgId} initialData={initialData}>
        {children}
      </OrgDataInner>
    </QueryClientProvider>
  );
}

function OrgDataInner({
  orgId,
  initialData,
  children,
}: {
  orgId: string;
  initialData: OrgTabData;
  children: ReactNode;
}) {
  const { data } = useOrgData(orgId, initialData);

  return <OrgDataContext.Provider value={data}>{children}</OrgDataContext.Provider>;
}
