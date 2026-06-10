/**
 * RevenueOS — Braintrust Telemetry
 *
 * Instruments the Ash agent with Braintrust via OpenTelemetry.
 * Sends AI SDK spans (model calls, tool executions) to Braintrust
 * for trace visualization and observability.
 *
 * Requires BRAINTRUST_API_KEY in environment.
 * Project: RevenueOS
 */

import { BraintrustExporter } from "@braintrust/otel";
import { defineInstrumentation } from "experimental-ash/instrumentation";
import { registerOTel } from "@vercel/otel";

export default defineInstrumentation({
  setup: ({ agentName }) =>
    registerOTel({
      serviceName: agentName,
      traceExporter: new BraintrustExporter({
        parent: `project_name:SalesDuo`,
        filterAISpans: true,
      }),
    }),
  recordInputs: true,
  recordOutputs: true,
  events: {
    "step.started"(input) {
      return {
        runtimeContext: {
          "revenueos.session_id": input.session.id,
          "revenueos.turn_id": input.turn.id,
          "revenueos.turn_sequence": String(input.turn.sequence),
          "revenueos.step_index": String(input.step),
          "revenueos.channel_kind": input.channel.kind,
        },
      };
    },
  },
});
