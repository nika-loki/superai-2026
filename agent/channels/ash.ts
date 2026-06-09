import { ashChannel } from "experimental-ash/channels/ash";
import { type AuthFn, localDev, vercelOidc } from "experimental-ash/channels/auth";

// Replace with your real auth (Auth.js, Clerk, …): return a SessionAuthContext
// for signed-in users, or null to reject. Throws in production until you do.
function exampleProductionAuth(): AuthFn<Request> {
  return () => {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error(
        "Configure production auth in agent/channels/ash.ts (e.g. Auth.js or Clerk).",
      );
    }
    return null;
  };
}

export default ashChannel({
  auth: [
    // Open on localhost for `ash dev` and the REPL; ignored in production.
    localDev(),
    // Lets the Ash TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Your end-user auth — replace the placeholder above.
    exampleProductionAuth(),
  ],
});
