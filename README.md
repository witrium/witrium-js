# Witrium Client

A JavaScript/TypeScript client library for interacting with the Witrium API. Witrium is a cloud-based browser automation platform that allows you to create and execute web automations through a visual interface and control them programmatically via this client.

## How Witrium Works

Witrium operates by spinning up browser instances in the cloud to execute predefined automations that you create through the Witrium UI. Here's the typical workflow:

1. **Create Automations via UI**: You use the Witrium web interface to record and define your automations (workflows)
2. **Execute via API**: You use this client to trigger those automations programmatically
3. **Cloud Execution**: Witrium runs your automation in a real browser instance in the cloud
4. **Retrieve Results**: You poll for results and handle the automation outcomes

Each workflow is identified by a unique `workflow_id` and can accept arguments to customize its execution.

## Installation

You can install the package using npm or yarn:

```bash
npm install @witrium/witrium
```

```bash
yarn add @witrium/witrium
```

## Quick Start

The snippet below shows the **minimum** you need to get up-and-running:

```typescript
import { WitriumClient, WorkflowRunStatus } from '@witrium/witrium';

// 1. Provide your API endpoint & token (export these as env-vars in production)
const apiToken = "YOUR_WITRIUM_API_TOKEN"; // Obtain from dashboard

const client = new WitriumClient(apiToken);

async function main() {
  try {
    // 2. Kick-off the **login** workflow and keep the browser alive
    const login = await client.runWorkflow("login-workflow-id", {
      args: { username: "user@example.com", password: "secretPass!" },
      keep_session_alive: true, // 🔑 keep the browser running after login
    });

    // 3. Block until the browser is *ready for reuse*
    await client.waitUntilState(
      login.run_id,
      WorkflowRunStatus.RUNNING, // Wait until browser is alive
      { allInstructionsExecuted: true } // …and the last login step finished
    );

    // 4. Re-use that **same** browser session in a follow-up workflow
    const scrape = await client.runWorkflow("dashboard-scrape-workflow-id", {
      args: { section: "sales" },
      use_existing_session: login.run_id, // 👈 same browser instance
    });

    // 5. Wait for the scrape to finish and collect the results
    const results = await client.waitUntilState(
      scrape.run_id,
      WorkflowRunStatus.COMPLETED
    );

    console.log("Sales data:", results.result);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
```

---

## Workflow Lifecycle & Polling Essentials

`client.runWorkflow(...)` **only submits** a job – the real browser work happens asynchronously in the cloud. Keep these steps in mind whenever you design multi-step automations:

1. **Submit** – your call returns instantly with a `run_id`.
2. **Poll / Wait** – use `waitUntilState()` (or `runWorkflowAndWait()`) to block until the run reaches:
   • `WorkflowRunStatus.RUNNING` – the browser has spun-up and is ready (handy when you enabled `keep_session_alive`).
   • `WorkflowRunStatus.COMPLETED` – the workflow has finished executing.
3. **Chain or Fetch Results** – once the target state is reached you can either run another workflow (chaining sessions) or read the data via `getWorkflowResults()`.

### When to wait for which state?

| Scenario | Recommended `targetStatus` | Extra flags |
|----------|-----------------------------|-------------|
| You **saved state** using `preserve_state` | `COMPLETED` | – |
| You **kept the session alive** using `keep_session_alive` **and intend to reuse it** | `RUNNING` | `allInstructionsExecuted: true` |

> ⏳ **Tip:** For very long login flows (e.g. multi-factor auth) combine `minWaitTime` with `pollingInterval` to reduce server load.

### Concurrency vs. Serial Execution

• **State Preservation (`preserve_state`)** – Each follow-up workflow spins up its **own** browser. Scale **horizontally** & run many in parallel.
• **Session Persistence (`keep_session_alive`)** – All follow-up workflows share **one** browser instance. Run them **serially** (until multi-tab support lands).

---

## Common Use Cases and Session Management

### The Authentication Challenge

A common pattern in web automation involves authentication: you need to log into a service first, then perform actions in the authenticated session. Witrium provides two powerful approaches to handle this:

#### Approach 1: State Preservation (Concurrent-Friendly)
- Best for: Running multiple post-login automations concurrently
- How it works: Save browser state after login, then restore it in new browser instances

#### Approach 2: Session Persistence (Resource-Efficient)
- Best for: Sequential automations that need to share the exact same browser session
- How it works: Keep the browser alive after login, run subsequent automations in the same instance

## Session Management Patterns

### Pattern 1: Disconnected Sessions with State Preservation

This approach allows you to save the browser state (cookies, localStorage, etc.) after a login workflow and then restore that state in new browser instances for subsequent workflows.

**Advantages:**
- Multiple post-login workflows can run concurrently
- Each workflow gets its own browser instance
- Horizontal scaling of browser instances
- Robust isolation between concurrent executions

**Use Case Example:**

```typescript
import { WitriumClient, WorkflowRunStatus } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  // Step 1: Run login workflow and preserve the authenticated state
  const loginResponse = await client.runWorkflow("login-workflow-id", {
    args: { username: "user@example.com", password: "secure123" },
    preserve_state: "authenticated-session", // Save state with this name
  });

  // Step 2: Wait for login to complete
  await client.waitUntilState(
    loginResponse.run_id,
    WorkflowRunStatus.COMPLETED
  );

  // Step 3: Run multiple post-login workflows concurrently
  // Each will spawn a new browser but restore the authenticated state

  const [dashboardResponse, profileResponse] = await Promise.all([
    // Workflow A: Extract data from dashboard
    client.runWorkflow("dashboard-scraping-workflow-id", {
      args: { report_type: "monthly" },
      use_states: ["authenticated-session"], // Restore the saved state
    }),
    // Workflow B: Update user profile (can run concurrently)
    client.runWorkflow("profile-update-workflow-id", {
      args: { new_email: "newemail@example.com" },
      use_states: ["authenticated-session"], // Same state, different browser instance
    })
  ]);

  // Both workflows are now running concurrently in separate browser instances
  // but both have access to the authenticated session
}
```

### Pattern 2: Persistent Session with Keep-Alive

This approach keeps the browser instance alive after the login workflow completes, allowing subsequent workflows to run in the same browser session.

**Advantages:**
- More resource-efficient (reuses same browser instance)
- Maintains exact session continuity
- No need to restore state (session never ends)
- Faster execution for subsequent workflows

**Limitations:**
- Subsequent workflows must run serially (one after another)
- Cannot run multiple post-login workflows concurrently in the same session

**Use Case Example:**

```typescript
import { WitriumClient, WorkflowRunStatus } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  // Step 1: Run login workflow and keep the browser session alive
  const loginResponse = await client.runWorkflow("login-workflow-id", {
    args: { username: "user@example.com", password: "secure123" },
    keep_session_alive: true, // Keep browser instance running
  });

  // Step 2: Wait for login to complete and start running
  // We wait for RUNNING status because the browser is kept alive
  await client.waitUntilState(
    loginResponse.run_id,
    WorkflowRunStatus.RUNNING,
    { allInstructionsExecuted: true } // Ensure login steps are done
  );

  // Step 3: Run subsequent workflows in the same browser session
  // These must run serially, not concurrently

  // Workflow A: Extract data from dashboard
  const dashboardResponse = await client.runWorkflow("dashboard-scraping-workflow-id", {
    args: { report_type: "monthly" },
    use_existing_session: loginResponse.run_id, // Use the live session
  });

  // Wait for dashboard workflow to complete before next one
  await client.waitUntilState(
    dashboardResponse.run_id,
    WorkflowRunStatus.COMPLETED
  );

  // Workflow B: Update user profile (must wait for previous to complete)
  const profileResponse = await client.runWorkflow("profile-update-workflow-id", {
    args: { new_email: "newemail@example.com" },
    use_existing_session: loginResponse.run_id, // Same live session
  });
}
```

### Choosing the Right Pattern

| Factor | State Preservation | Session Persistence |
|--------|-------------------|-------------------|
| **Concurrency** | ✅ Multiple workflows can run simultaneously | ❌ Must run serially |
| **Resource Usage** | Higher (multiple browser instances) | ✅ Lower (single browser instance) |
| **Isolation** | ✅ Complete isolation between workflows | ❌ Shared session state |
| **Setup Complexity** | Medium (manage state names) | ✅ Simple (just workflow run IDs) |
| **Use Case** | Bulk data processing, parallel operations | Sequential workflows, state-dependent operations |

## Complete Examples

### Example 1: E-commerce Data Extraction (State Preservation)

```typescript
import { WitriumClient, WorkflowRunStatus } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function extractCategoryData(category: string, stateName: string) {
  try {
    const response = await client.runWorkflow("category-scraper-workflow", {
      args: { category },
      use_states: [stateName],
    });

    const results = await client.waitUntilState(
      response.run_id,
      WorkflowRunStatus.COMPLETED
    );

    return { category, data: results.result };
  } catch (error) {
    console.error(`Failed to extract ${category}:`, error);
    return { category, error: String(error) };
  }
}

async function run() {
  console.log("Logging into e-commerce platform...");
  // Step 1: Login and save state
  const loginResponse = await client.runWorkflow("ecommerce-login-workflow", {
    args: { email: "seller@example.com", password: "secure123" },
    preserve_state: "ecommerce-authenticated",
  });

  // Wait for login completion
  await client.waitUntilState(
    loginResponse.run_id,
    WorkflowRunStatus.COMPLETED
  );
  console.log("Login completed, state preserved");

  // Step 2: Extract data from multiple categories concurrently
  const categories = ["electronics", "clothing", "home-garden", "books", "sports"];
  
  // Submit all category extraction tasks concurrently
  const results = await Promise.all(
    categories.map(category => extractCategoryData(category, "ecommerce-authenticated"))
  );

  console.log(`Extracted data from ${results.length} categories`);
  results.forEach(result => {
    if (result.error) {
      console.error(`Error in ${result.category}: ${result.error}`);
    } else {
      console.log(`${result.category}: ${Array.isArray(result.data) ? result.data.length : 'some'} items extracted`);
    }
  });
}
```

### Example 2: Banking Workflow (Session Persistence)

```typescript
import { WitriumClient, WorkflowRunStatus } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  // Step 1: Secure login with 2FA
  console.log("Initiating secure banking login...");
  const loginResponse = await client.runWorkflow("bank-login-with-2fa-workflow", {
    args: {
      username: "customer123",
      password: "secure456",
      phone_number: "+1234567890", // For 2FA
    },
    keep_session_alive: true, // Keep session for subsequent operations
  });

  // Wait for login and 2FA to complete
  console.log("Waiting for login and 2FA completion...");
  const loginResults = await client.waitUntilState(
    loginResponse.run_id,
    WorkflowRunStatus.RUNNING,
    {
      allInstructionsExecuted: true,
      minWaitTime: 30000, // 30s - 2FA usually takes some time (note: ms in JS)
    }
  );
  console.log("Secure login completed");

  // Step 2: Check account balances
  console.log("Checking account balances...");
  const balanceResponse = await client.runWorkflow("check-balances-workflow", {
    args: { account_types: ["checking", "savings", "credit"] },
    use_existing_session: loginResponse.run_id,
  });

  const balanceResults = await client.waitUntilState(
    balanceResponse.run_id,
    WorkflowRunStatus.COMPLETED
  );
  console.log("Account balances retrieved:", balanceResults.result);

  // Step 3: Download transaction history
  console.log("Downloading transaction history...");
  const transactionResponse = await client.runWorkflow("download-transactions-workflow", {
    args: {
      date_range: "last_30_days",
      format: "csv",
      accounts: ["checking", "savings"],
    },
    use_existing_session: loginResponse.run_id,
  });

  await client.waitUntilState(
    transactionResponse.run_id,
    WorkflowRunStatus.COMPLETED
  );
  console.log("Transaction history downloaded");

  // Step 4: Generate financial report
  console.log("Generating financial report...");
  const reportResponse = await client.runWorkflow("generate-financial-report-workflow", {
    args: {
      report_type: "monthly_summary",
      include_charts: true,
    },
    use_existing_session: loginResponse.run_id,
  });

  await client.waitUntilState(
    reportResponse.run_id,
    WorkflowRunStatus.COMPLETED
  );

  console.log("Financial report generated successfully");
  console.log("All banking operations completed in the same secure session");
}
```

## Running Talents

In addition to workflows, you can execute "Talents" directly. Talents are pre-defined capabilities or simpler automation units that can be executed with specific arguments.

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  // Run a talent by ID with its execution schema
  const result = await client.runTalent("talent-uuid", {
    args: { key: "value" },
    // Optional parameters:
    // files: [...],
    // use_states: ["state-id"],
    // preserve_state: "new-state-name"
  });
  
  console.log("Talent status:", result.status);
  console.log("Talent result:", result.result);
  if (result.error_message) {
    console.error("Error:", result.error_message);
  }
}
```

## Basic Usage

### Standard Client

```typescript
import { WitriumClient, WorkflowRunStatus } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  // Run a workflow and wait for results
  const results = await client.runWorkflowAndWait("workflow-uuid", {
    args: { key1: "value1", key2: 42 },
    pollingInterval: 5000,
    timeout: 300000,
  });
  console.log(`Workflow completed with status: ${results.status}`);
  console.log("Results:", results.result);

  // Or run a workflow without waiting
  const response = await client.runWorkflow("workflow-uuid", {
    args: { key1: "value1" },
  });
  console.log(`Workflow run started: ${response.run_id}`);

  // Get results later
  const laterResults = await client.getWorkflowResults(response.run_id);

  // Wait for workflow to start running
  const runningState = await client.waitUntilState(
    response.run_id,
    WorkflowRunStatus.RUNNING
  );
  console.log(`Workflow is now running: ${runningState.status}`);
}
```

## Progress Tracking and Monitoring

### Real-time Progress Tracking

```typescript
import { WitriumClient, WorkflowRunResults } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  try {
    // Run workflow with progress tracking
    const result = await client.runWorkflowAndWait("workflow-uuid", {
      args: { key1: "value1" },
      onProgress: (intermediateResults: WorkflowRunResults) => {
        console.log(`Status: ${intermediateResults.status}`);
        intermediateResults.executions?.forEach(execution => {
          if (execution.status === "C") {
            console.log(`✅ ${execution.instruction}`);
          } else if (execution.status === "F") {
            console.error(`❌ ${execution.instruction}: ${execution.error_message}`);
          }
        });
      }
    });
    console.log("Workflow completed!");
  } catch (error) {
    console.error("Workflow failed:", error);
  }
}
```

### Using Callbacks for Custom Monitoring

```typescript
import { WitriumClient, WorkflowRunResults } from '@witrium/witrium';

// Define a custom progress callback
function monitorWorkflowProgress(result: WorkflowRunResults) {
  const status = result.status;
  const executions = result.executions || [];
  
  console.log(`📊 Status: ${status}, Executions: ${executions.length}`);
  
  // Log each execution step
  executions.forEach((execution, i) => {
    const statusEmoji: Record<string, string> = {
      P: "⏳", // Pending
      R: "🔄", // Running
      C: "✅", // Completed
      F: "❌", // Failed
    };
    const emoji = statusEmoji[execution.status] || "❓";
    
    console.log(`  ${emoji} Step ${i+1}: ${execution.instruction}`);
    
    if (execution.error_message) {
      console.log(`    ⚠️  Error: ${execution.error_message}`);
    }
  });
}

const client = new WitriumClient("your-api-token");

async function run() {
  const results = await client.runWorkflowAndWait("workflow-uuid", {
    args: { key1: "value1" },
    onProgress: monitorWorkflowProgress
  });
}
```

## API Reference

### WitriumClient

#### Initialization

```typescript
new WitriumClient(
  apiToken: string,         // API token for authentication
  baseUrl?: string,         // Optional base URL
  timeout?: number          // Request timeout in milliseconds (default: 60000)
)
```

#### Core Methods

##### runWorkflow()

Execute a workflow in the Witrium platform.

```typescript
async runWorkflow(
  workflowId: string,
  options: WorkflowRunExecuteOptions = {}
): Promise<WorkflowRunSubmitted>
```

**WorkflowRunExecuteOptions:**

```typescript
interface WorkflowRunExecuteOptions {
  args?: Record<string, string | number>; // Arguments to pass to the workflow
  files?: FileUpload[];                   // Files to upload
  use_states?: string[];                  // List of saved state names to restore
  preserve_state?: string;                // Name to save the browser state as
  no_intelligence?: boolean;              // Disable AI assistance
  record_session?: boolean;               // Record the browser session
  keep_session_alive?: boolean;           // Keep browser alive after completion
  use_existing_session?: string;          // Workflow run ID of existing session to use
}
```

- `preserve_state`: Save the browser state with this name after workflow completion. Other workflows can then restore this state using `use_states`.
- `use_states`: List of previously saved state names to restore at the start of this workflow.
- `keep_session_alive`: If true, keeps the browser instance running after workflow completion.
- `use_existing_session`: Run this workflow in an existing browser session (identified by workflow run ID).

##### runTalent()

Run a talent by ID.

```typescript
async runTalent(
  talentId: string,
  options: TalentExecuteSchema
): Promise<TalentResultSchema>
```

##### waitUntilState()

Wait for a workflow run to reach a specific status.

```typescript
async waitUntilState(
  runId: string,
  targetStatus: WorkflowStatus,
  options: {
    allInstructionsExecuted?: boolean; // Also wait for all executions to complete
    minWaitTime?: number;              // Minimum milliseconds to wait before polling starts
    pollingInterval?: number;          // Milliseconds between polling attempts
    timeout?: number;                  // Maximum milliseconds to wait
  } = {}
): Promise<WorkflowRunResults>
```

**Key Parameters:**

- `targetStatus`: Use `WorkflowRunStatus` constants (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
- `allInstructionsExecuted`: When true, also waits for all individual execution steps to complete
- `minWaitTime`: Useful for long-running workflows to reduce unnecessary polling

##### Other Methods

- `getWorkflowResults(runId)`: Get current results of a workflow run
- `runWorkflowAndWait(workflowId, options)`: Run a workflow and poll until completion
- `cancelRun(runId)`: Cancel a workflow run and clean up associated resources

### Status Constants

#### WorkflowRunStatus

```typescript
import { WorkflowRunStatus } from '@witrium/witrium';

WorkflowRunStatus.PENDING      // "P" - Workflow is queued
WorkflowRunStatus.RUNNING      // "R" - Workflow is executing
WorkflowRunStatus.COMPLETED    // "C" - Workflow finished successfully
WorkflowRunStatus.FAILED       // "F" - Workflow failed
WorkflowRunStatus.CANCELLED    // "X" - Workflow was cancelled
```

#### AgentExecutionStatus

```typescript
import { AgentExecutionStatus } from '@witrium/witrium';

AgentExecutionStatus.PENDING      // "P" - Execution step is queued
AgentExecutionStatus.RUNNING      // "R" - Execution step is running
AgentExecutionStatus.COMPLETED    // "C" - Execution step completed
AgentExecutionStatus.FAILED       // "F" - Execution step failed
AgentExecutionStatus.CANCELLED    // "X" - Execution step cancelled
```

### Response Interfaces

#### WorkflowRunSubmitted

```typescript
{
  workflow_id: string;
  run_id: string;  // Use this for polling and session management
  status: WorkflowStatus;
}
```

#### WorkflowRunResults

```typescript
{
  workflow_id: string;
  run_id: string;
  status: WorkflowStatus;
  started_at?: string;
  completed_at?: string;
  message?: string;
  executions?: AgentExecution[];  // Individual execution steps
  result?: Record<string, any> | any[]; // Final workflow result
  result_format?: string;
  error_message?: string;
}
```

#### TalentResultSchema

```typescript
{
  status: string;
  started_at: string | null;
  completed_at: string | null;
  message: string | null;
  result: any | null;              // Final talent result
  result_format: string | null;
  error_message: string | null;
}
```

### Exception Handling

```typescript
import { WitriumClient, WitriumClientException } from '@witrium/witrium';

try {
  const result = await client.runWorkflowAndWait("my-workflow", {
    args: { key: "value" }
  });
} catch (error) {
  if (error instanceof WitriumClientException) {
    console.error("Witrium API error:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Cancelling Workflow Runs

You can cancel a workflow run that is in progress:

```typescript
const client = new WitriumClient("your-api-token");

async function run() {
  // Start a workflow
  const response = await client.runWorkflow("long-running-workflow", {
    args: { parameter: "value" }
  });

  // Later, decide to cancel it
  const cancelResult = await client.cancelRun(response.run_id);
  console.log(`Workflow cancelled with status: ${cancelResult.status}`);
}
```

## Best Practices

### 1. Error Handling

Always wrap your API calls in try/catch blocks to handle potential network issues or API errors.

### 2. Choose the Right Session Management Pattern

```typescript
// ✅ For concurrent operations - use state preservation
for (const category of categories) {
  await client.runWorkflow("scraper", {
    args: { category },
    use_states: ["logged-in-state"] // Each runs in new browser
  });
}

// ✅ For sequential operations - use session persistence
const loginRun = await client.runWorkflow(..., { keep_session_alive: true });
await client.waitUntilState(loginRun.run_id, WorkflowRunStatus.RUNNING);
await client.runWorkflow(..., { use_existing_session: loginRun.run_id }); // Same browser
```

### 3. Use Appropriate Timeouts

When using `runWorkflowAndWait` or `waitUntilState`, adjust the timeout based on your workflow's complexity.

```typescript
// ✅ Adjust timeouts based on workflow complexity
await client.runWorkflowAndWait("simple-data-extraction", {
  timeout: 60000 // 1 minute
});

await client.runWorkflowAndWait("complex-multi-page-workflow", {
  timeout: 600000, // 10 minutes
  pollingInterval: 10000 // Poll less frequently
});
```

## License

[MIT](LICENSE)
