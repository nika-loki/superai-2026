/**
 * RevenueOS — exa-agentic-research tool
 *
 * Uses Exa's Agent API for complex, multi-step research tasks.
 * Requires the beta identifier "agent-2026-05-07" passed per-call.
 *
 * For simpler queries, prefer exa-answer instead.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { getExaSdk } from "../lib/exa";

/** Exa Agent API beta identifier — required per-call, NOT on constructor */
const EXA_AGENT_BETA = "agent-2026-05-07";

export default defineTool({
  description:
    "Run a complex, multi-step research task using Exa's Agent API. " +
    "Use for deep research questions that require synthesizing information " +
    "from multiple sources (e.g. 'Research Grab's expansion into financial services " +
    "across Southeast Asia'). For simpler factual queries, prefer exa-answer. " +
    "Optionally provide a JSON output schema for structured results.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The research question or task to investigate"),
    outputSchema: z
      .string()
      .optional()
      .describe(
        "JSON schema string describing the desired output structure. " +
          "Example: '{\"type\":\"object\",\"properties\":{\"findings\":{\"type\":\"array\"},\"summary\":{\"type\":\"string\"}}}'",
      ),
  }),
  async execute(input) {
    try {
      console.log(
        `[exa-agentic-research] Starting research: "${input.query.slice(0, 100)}${input.query.length > 100 ? "..." : ""}"`,
      );

      const exa = getExaSdk();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentApi = (exa as any).beta?.agent?.runs;
      if (!agentApi) {
        return "Error: Exa Agent API (exa.beta.agent.runs) is not available in the current SDK version. Use exa_company_deep_dive or exa_answer instead.";
      }

      // Build the research request — betas must be passed per-call
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createRequest: Record<string, any> = {
        betas: [EXA_AGENT_BETA],
        query: input.query,
      };

      if (input.outputSchema) {
        try {
          createRequest.outputSchema = JSON.parse(input.outputSchema);
        } catch {
          console.warn(
            "[exa-agentic-research] Could not parse outputSchema as JSON, ignoring",
          );
        }
      }

      // Create the research run
      const run = await agentApi.create(createRequest);
      console.log(`[exa-agentic-research] Created run ${run.id}, polling...`);

      // Use SDK's pollUntilFinished if available, otherwise manual poll
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof agentApi.pollUntilFinished === "function") {
        const result = await agentApi.pollUntilFinished(run.id, {
          betas: [EXA_AGENT_BETA],
        });
        const output =
          typeof result === "string"
            ? result
            : JSON.stringify(result.output ?? result.result ?? result, null, 2);
        console.log(`[exa-agentic-research] Completed (run: ${run.id})`);
        return `Research Results (Run ID: ${run.id}):\n\n${output}`;
      }

      // Manual polling fallback
      const maxAttempts = 120;
      const pollInterval = 5_000;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let runResult: any = run;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        runResult = await agentApi.get(run.id, { betas: [EXA_AGENT_BETA] });
        const status = runResult.status?.toLowerCase() ?? "";

        if (["completed", "done", "succeeded"].includes(status)) {
          const output =
            runResult.output ?? runResult.result ?? runResult.data ?? runResult;
          const formatted =
            typeof output === "string"
              ? output
              : JSON.stringify(output, null, 2);
          console.log(`[exa-agentic-research] Completed (run: ${run.id})`);
          return `Research Results (Run ID: ${run.id}):\n\n${formatted}`;
        }

        if (["failed", "error"].includes(status)) {
          const errorMsg = runResult.error ?? "Unknown error";
          console.error(
            `[exa-agentic-research] Run ${run.id} failed: ${errorMsg}`,
          );
          return `Research run failed: ${errorMsg}`;
        }
      }

      return `Research run timed out after polling. Run ID: ${run.id}. The agent can continue with other tools.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[exa-agentic-research] Error:", message);
      return `Error during agentic research: ${message}`;
    }
  },
});
