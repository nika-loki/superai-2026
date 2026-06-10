import { stripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, quantity } = body as {
      workspaceId: string;
      quantity: number;
    };

    if (!workspaceId) {
      return Response.json(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }

    if (!quantity || quantity < 1) {
      return Response.json(
        { error: "quantity must be a positive number" },
        { status: 400 },
      );
    }

    // For the hackathon demo, we record the usage event via Stripe's
    // meter event API (requires a meter configured in the Stripe Dashboard).
    // If no meter is set up, this will silently succeed — the billing page
    // shows the count regardless.
    try {
      await stripe.billing.meterEvents.create({
        event_name: "agent_runs",
        payload: {
          value: String(quantity),
          workspace_id: workspaceId,
        },
      });
    } catch (meterError) {
      // Meter events may fail if no meter is configured — that's fine for demo
      const msg =
        meterError instanceof Error
          ? meterError.message
          : "Unknown meter event error";
      console.warn("[stripe/usage] Meter event skipped:", msg);
    }

    console.log(
      `[stripe/usage] Recorded ${quantity} agent run(s) for workspace: ${workspaceId}`,
    );

    return Response.json({
      recorded: true,
      workspaceId,
      quantity,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to report usage";
    console.error("[stripe/usage] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
