import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  // In development without a webhook secret, parse directly
  if (!webhookSecret) {
    console.warn(
      "[stripe/webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev mode)",
    );
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }
  } else {
    if (!sig) {
      return Response.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }

    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Webhook signature verification failed";
      console.error("[stripe/webhook] Signature verification failed:", message);
      return Response.json({ error: message }, { status: 400 });
    }
  }

  // Handle events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      console.log(
        `[stripe/webhook] Checkout completed — workspace: ${workspaceId}, customer: ${session.customer}`,
      );
      // TODO: Update workspace subscription status in DB
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[stripe/webhook] Subscription updated — id: ${subscription.id}, status: ${subscription.status}`,
      );
      // TODO: Sync subscription status with workspace
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[stripe/webhook] Subscription deleted — id: ${subscription.id}`,
      );
      // TODO: Downgrade workspace to free tier
      break;
    }

    default:
      console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
  }

  return Response.json({ received: true });
}
