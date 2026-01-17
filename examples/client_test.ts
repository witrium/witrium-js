/**
 * Quick test script for browser session management.
 * Simple version - just fill in the values and run.
 */

import { WitriumClient } from "../src/client";

async function main() {
  // TODO: Fill these in
  const API_TOKEN = "<API_TOKEN>";
  const WORKFLOW_ID = "<WORKFLOW_ID>";
  const TALENT_ID = "<TALENT_ID>";

  console.log("\n🚀 Testing Browser Session Management\n");

  const client = new WitriumClient(API_TOKEN);

  // Test with automatic session management
  await client.withBrowserSession(async (sessionId) => {
    console.log(`Session ID: ${sessionId}`);
    console.log(`Client session ID: ${client.sessionId}\n`);

    // Run workflow - sessionId is automatically injected!
    console.log(`Running workflow: ${WORKFLOW_ID}`);
    const result = await client.runWorkflowAndWait(WORKFLOW_ID);
    
    // Handle result (single result when returnIntermediateResults is false)
    const workflowResult = Array.isArray(result) ? result[result.length - 1] : result;
    console.log(`  ✓ Workflow run_id: ${workflowResult.runId}`);
    console.log(`  ✓ Status: ${workflowResult.status}\n`);

    // Run talent - sessionId is automatically injected!
    console.log(`Running talent: ${TALENT_ID}`);
    const result2 = await client.runTalent(TALENT_ID, {
      args: { asin: "B08QZMJBFR" },
    });
    console.log(`  ✓ Status: ${JSON.stringify(result2)}\n`);

    // Check session details
    const session = await client.getBrowserSession(sessionId);
    console.log("Session Details:");
    console.log(`  Status: ${session.status}`);
    console.log(`  Busy: ${session.isBusy}`);
    console.log(`  Provider: ${session.provider}\n`);
  }, {
    // preserveState: "test-js-state",
  });

  console.log("✓ Session automatically closed on exit\n");
}

main().catch(console.error);
