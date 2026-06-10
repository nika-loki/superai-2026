import { stripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId } = body as { workspaceId: string };

    if (!workspaceId) {
      return Response.json(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }

    const origin = request.headers.get("origin") ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 9900,
            recurring: {
              interval: "month",
            },
            product_data: {
              name: "RevenueOS Pro",
              description:
                "Unlimited account research across 30+ APAC markets. AI-powered signals, contact discovery, and next-best-action recommendations.",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: {
        workspaceId,
      },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create checkout session";
    console.error("[stripe/checkout] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
