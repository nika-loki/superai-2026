import { ashChannel } from "experimental-ash/channels/ash";
import { localDev, vercelOidc, none } from "experimental-ash/channels/auth";

export default ashChannel({
  auth: [
    // Open on localhost for `ash dev` and the REPL; ignored in production.
    localDev(),
    // Lets the Ash TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // HACK: allow unauthenticated requests for demo — remove after hackathon.
    none(),
  ],
});
