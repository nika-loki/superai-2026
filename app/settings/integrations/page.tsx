"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatDate } from "@/lib/format-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HubSpotStatus {
  connected: boolean;
  portalId?: string;
  connectedAt?: string;
  lastImportAt?: string;
  importStatus?: "idle" | "running" | "error";
  errorMessage?: string | null;
}

type ImportState = "idle" | "running" | "done" | "error";

export default function IntegrationsPage() {
  const [status, setStatus] = useState<HubSpotStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Connect form state
  const [portalId, setPortalId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Import state
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Disconnect state
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/hubspot/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);

        // If the background import just finished, update UI
        if (importState === "running" && data.importStatus === "idle" && data.lastImportAt) {
          setImportState("done");
          stopPolling();
        } else if (importState === "running" && data.importStatus === "error") {
          setImportError(data.errorMessage ?? "Import failed");
          setImportState("error");
          stopPolling();
        }
      }
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, [importState]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => stopPolling();
  }, [fetchStatus, stopPolling]);

  // Poll while import is running
  useEffect(() => {
    if (importState === "running") {
      pollRef.current = setInterval(fetchStatus, 3000);
    }
    return () => stopPolling();
  }, [importState, fetchStatus, stopPolling]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError(null);

    try {
      const res = await fetch("/api/hubspot/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalId, accessToken }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to connect");
      }

      await fetchStatus();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleImport = async () => {
    setImportState("running");
    setImportError(null);

    try {
      const res = await fetch("/api/hubspot/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.status === 202) {
        // Accepted — background job started, polling takes over
        return;
      }

      if (res.status === 409) {
        // Already running — just switch to polling
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Import failed");
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
      setImportState("error");
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/hubspot/disconnect", { method: "POST" });
      setStatus({ connected: false });
      setImportState("idle");
    } catch {
      // Silently handle
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-notion-bg-hover rounded" />
          <div className="h-40 bg-notion-bg-hover rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-notion-text">
            Integrations
          </h1>
          <p className="text-sm text-notion-text-muted mt-0.5">
            Connect your CRM and tools
          </p>
        </div>
        <div />
      </div>

      {/* HubSpot Card */}
      <Card className="border-notion-border">
        <CardHeader>
          <CardTitle className="text-notion-text flex items-center gap-2">
            HubSpot CRM
            {status?.connected && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-notion-bg-hover text-xs font-medium text-notion-green">
                Connected
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Import companies, contacts, and deals from your HubSpot account
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!status?.connected ? (
            /* --- Connect Form --- */
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-id">Portal ID</Label>
                <Input
                  id="portal-id"
                  placeholder="e.g. 12345678"
                  value={portalId}
                  onChange={(e) => setPortalId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-token">Private App Access Token</Label>
                <Input
                  id="access-token"
                  type="password"
                  placeholder="pat-xxx..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  required
                />
                <p className="text-xs text-notion-text-muted">
                  Create a private app token in HubSpot at Settings &gt; Integrations &gt; Private Apps.
                  Required scopes: <code className="text-notion-blue">crm.objects.companies.read</code>,{" "}
                  <code className="text-notion-blue">crm.objects.contacts.read</code>,{" "}
                  <code className="text-notion-blue">crm.objects.deals.read</code>.
                </p>
              </div>

              {connectError && (
                <p className="text-sm text-notion-red">{connectError}</p>
              )}

              <Button type="submit" disabled={connecting}>
                {connecting ? "Connecting..." : "Connect HubSpot"}
              </Button>
            </form>
          ) : (
            /* --- Connected: Status + Actions --- */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-notion-text-muted">Portal ID</p>
                  <p className="text-notion-text font-medium">{status.portalId}</p>
                </div>
                <div>
                  <p className="text-notion-text-muted">Connected</p>
                  <p className="text-notion-text font-medium">
                    {status.connectedAt
                      ? formatDate(status.connectedAt)
                      : "Unknown"}
                  </p>
                </div>
                {status.lastImportAt && (
                  <div>
                    <p className="text-notion-text-muted">Last Import</p>
                    <p className="text-notion-text font-medium">
                      {formatDate(status.lastImportAt)}
                    </p>
                  </div>
                )}
              </div>

              {/* Import Section */}
              <div className="pt-4 border-t border-notion-border">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleImport}
                    disabled={importState === "running"}
                  >
                    {importState === "running" ? "Syncing..." : "Sync from HubSpot"}
                  </Button>
                  {importState === "running" && (
                    <span className="text-sm text-notion-text-muted animate-pulse">
                      Importing in background...
                    </span>
                  )}
                </div>

                {importState === "done" && (
                  <div className="mt-4 p-3 rounded-lg bg-notion-bg-secondary border border-notion-border text-sm">
                    <p className="font-medium text-notion-green mb-1">
                      ✓ Import complete
                    </p>
                    <p className="text-notion-text-muted">
                      Last synced{" "}
                      {status.lastImportAt
                        ? formatDate(status.lastImportAt)
                        : "just now"}
                    </p>
                  </div>
                )}

                {importState === "error" && importError && (
                  <p className="mt-3 text-sm text-notion-red">{importError}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>

        {status?.connected && (
          <CardFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
