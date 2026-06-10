"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UpgradeButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "demo-workspace" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to create checkout session",
        );
      }

      const data = await res.json();

      if (typeof data.url === "string") {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("[billing] Checkout error:", err);
      alert(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      size="lg"
      className="w-full bg-notion-blue hover:bg-notion-blue-hover text-white"
    >
      {loading ? "Redirecting to Stripe..." : "Upgrade to Pro"}
    </Button>
  );
}
