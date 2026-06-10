/**
 * Create Stripe Price — one-time script
 *
 * Creates the "RevenueOS Pro" product and a $99/mo recurring price.
 * Outputs the priceId to set as STRIPE_PRICE_ID in .env.local.
 *
 * Usage: npx tsx scripts/create-stripe-price.ts
 */

import "dotenv/config";
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error("Error: STRIPE_SECRET_KEY not found in environment variables.");
  console.error("Make sure .env.local exists and contains STRIPE_SECRET_KEY.");
  process.exit(1);
}

const stripe = new Stripe(secretKey, {
  apiVersion: "2026-05-27.dahlia",
});

async function main() {
  console.log("Creating RevenueOS Pro product...");

  const product = await stripe.products.create({
    name: "RevenueOS Pro",
    description:
      "Unlimited account research across 30+ APAC markets. AI-powered signals, contact discovery, and next-best-action recommendations.",
  });

  console.log(`Product created: ${product.id} (${product.name})`);

  console.log("Creating $99/mo recurring price...");

  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 9900,
    recurring: {
      interval: "month",
    },
  });

  console.log(`Price created: ${price.id}`);
  console.log("");
  console.log("Add this to your .env.local:");
  console.log(`STRIPE_PRICE_ID=${price.id}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
