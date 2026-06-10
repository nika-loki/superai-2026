import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UpgradeButton } from "@/components/upgrade-button";

const PRO_FEATURES = [
  "Unlimited organisation research",
  "30+ APAC markets covered",
  "AI-powered buying signals",
  "Real-time contact discovery",
  "Next-best-action recommendations",
  "Agent memory & context (Honcho)",
  "Priority research queue",
  "Team collaboration (up to 10 seats)",
] as const;

function CheckIcon() {
  return (
    <svg
      className="size-4 shrink-0 text-notion-green"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

export default function BillingPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-notion-text">
            Billing
          </h1>
          <p className="text-sm text-notion-text-muted mt-0.5">
            Manage your RevenueOS subscription
          </p>
        </div>
        <div />
      </div>

      {/* Current Plan */}
      <div className="mb-8 p-4 rounded-lg border border-notion-border bg-notion-bg-secondary">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-notion-text-muted">Current Plan</p>
            <p className="text-lg font-medium text-notion-text">Free Trial</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-notion-bg-hover text-xs font-medium text-notion-text-muted">
            <span className="size-1.5 rounded-full bg-notion-orange live-dot" />
            Trial Active
          </span>
        </div>
      </div>

      {/* Pro Plan Card */}
      <Card className="border-notion-blue/20">
        <CardHeader>
          <CardTitle className="text-notion-text">
            RevenueOS Pro
          </CardTitle>
          <CardDescription>
            Full APAC intelligence platform for high-performing sales teams
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <span className="text-4xl font-bold text-notion-text">$99</span>
            <span className="text-sm text-notion-text-muted ml-1">/ month</span>
          </div>
          <ul className="space-y-3">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <CheckIcon />
                <span className="text-sm text-notion-text">{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          <UpgradeButton />
        </CardFooter>
      </Card>

      {/* Footer note */}
      <p className="mt-6 text-center text-xs text-notion-text-muted">
        Powered by Stripe. Cancel anytime. No lock-in contracts.
      </p>
    </div>
  );
}
