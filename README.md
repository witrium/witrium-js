# Witrium Client

A JavaScript/TypeScript client library for interacting with the Witrium API. Witrium is a cloud-based browser automation platform that allows you to create and execute web automations through a visual interface and control them programmatically via this client.

## How Witrium Works

Witrium operates by spinning up browser instances in the cloud to execute predefined automations that you create through the Witrium UI. Here's the typical workflow:

1. **Create Automations via UI**: You use the Witrium web interface to record and define your automations (workflows)
2. **Execute via API**: You use this client to trigger those automations programmatically
3. **Cloud Execution**: Witrium runs your automation in a real browser instance in the cloud
4. **Retrieve Results**: You poll for results and handle the automation outcomes

Each workflow is identified by a unique `workflowId` and can accept arguments to customize its execution.

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
import { WitriumClient } from '@witrium/witrium';

// 1. Provide your API token (export as env-var in production)
const apiToken = "YOUR_WITRIUM_API_TOKEN"; // Obtain from dashboard

// 2. Use callback pattern for automatic browser session management
const client = new WitriumClient(apiToken);

async function main() {
  await client.withBrowserSession(async (sessionId) => {
    // Browser session is automatically created
    // All workflows/talents automatically use this session
    
    // 3. Run workflows (browserSessionId is automatically injected)
    await client.runWorkflowAndWait("login-workflow-id", {
      args: { username: "user@example.com", password: "secretPass!" },
    });
    
    // 4. Run another workflow in the same browser session
    const scrape = await client.runWorkflowAndWait("dashboard-scrape-workflow-id", {
      args: { section: "sales" },
      skipGotoUrlInstruction: true,
    });
    
    // 5. Browser session is automatically closed when callback completes
    console.log("Sales data:", scrape.result);
  });
}

main();
```

---

## Browser Session Management

Witrium SDK provides a callback-based pattern that automatically handles browser lifecycle for you. This is the **recommended approach** for running workflows and/or talents that need to share browser state.

### Automatic Session Management (Recommended)

When you use `withBrowserSession()`, a browser session is automatically created when entering and closed when exiting. **All workflows and talents executed within the callback automatically use this session** - no need to pass `browserSessionId` explicitly:

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  await client.withBrowserSession(async (sessionId) => {
    // Browser session automatically created
    console.log(`Session ID: ${sessionId}`);
    console.log(`Client session ID: ${client.sessionId}`); // Same as sessionId
    
    // All workflows/talents automatically use this session (browserSessionId auto-injected)
    const result1 = await client.runWorkflowAndWait("workflow-1");
    const result2 = await client.runTalent("talent-1");
    
    // You can still override if needed:
    const result3 = await client.runWorkflowAndWait("workflow-2", {
      browserSessionId: "different-session-id", // Explicit override
    });
    
    // Session automatically closed on exit
  });
}
```

### Custom Session Options

Configure the browser session with specific settings (These are options similar to the ones you'll find in the dashboard):

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

await client.withBrowserSession(async (sessionId) => {
  // Browser session created with UK proxy and restored state
  // browserSessionId is automatically set to sessionId
  const result = await client.runWorkflowAndWait("workflow-id");
}, {
  provider: "omega",
  useProxy: true,
  proxyCountry: "uk",
  useStates: ["my-saved-state"], // Restore browser state
});
```

### Manual Session Management

For advanced use cases, manage browser sessions explicitly:

```typescript
const client = new WitriumClient("your-api-token");

async function run() {
  // Create a browser session
  const session = await client.createBrowserSession({
    useProxy: true,
  });
  console.log(`Created session: ${session.uuid}`);

  // List all active sessions
  const sessions = await client.listBrowserSessions();
  console.log(`Active sessions: ${sessions.totalCount}`);

  // Get session details
  const details = await client.getBrowserSession(session.uuid);
  console.log(`Session status: ${details.status}`);

  // Use session explicitly
  const result = await client.runWorkflowAndWait("workflow-id", {
    browserSessionId: session.uuid,
  });

  // Close session when done
  await client.closeBrowserSession(session.uuid);
}
```

### Important: Automatic Session Injection & `useStates` Behavior

**When using `withBrowserSession()`, the session ID is automatically injected into all workflow and talent runs.** You can access it via `client.sessionId`.

**When using a browser session, `useStates` is set at the session level, not the individual run level.**

```typescript
// use_states in session options applies to ALL runs
await client.withBrowserSession(async (sessionId) => {
  // browserSessionId is automatically set to sessionId
  // No need to pass it explicitly!
  const result = await client.runWorkflowAndWait("workflow-id", {
    useStates: ["ignored"], // ❌ This is IGNORED when using a session
  });
}, {
  useStates: ["state-from-session"], // ✅ This will be used
});
```

If you need different `useStates` for different runs, create separate browser sessions.

### Available Browser Session Methods

- `createBrowserSession(options)` - Create a new browser session
- `listBrowserSessions()` - List all active sessions
- `getBrowserSession(sessionUuid)` - Get session details
- `closeBrowserSession(sessionUuid, force?)` - Close a session
- `withBrowserSession(callback, options?)` - Run callback with auto-managed session

---

## Workflow Lifecycle & Polling Essentials

`client.runWorkflow(...)` **only submits** a job – the real browser work happens asynchronously in the cloud. Keep these steps in mind whenever you design multi-step automations:

1. **Submit** – your call returns instantly with a `runId`.
2. **Poll / Wait** – use `waitUntilState()` (or `runWorkflowAndWait()`) to block until the run reaches:
   • `WorkflowRunStatus.RUNNING` – the browser has spun-up and is ready.
   • `WorkflowRunStatus.COMPLETED` – the workflow has finished executing.
3. **Chain or Fetch Results** – once the target state is reached you can either run another workflow (chaining sessions) or read the data via `getWorkflowResults()`.

### When to wait for which state?

| Scenario | Recommended `targetStatus` |
|----------|-----------------------------|
| You want to wait till the workflow run has completed | `COMPLETED` |
| You want to wait till the workflow has just started its run | `RUNNING` |

### Parallel vs. Serial Execution

• **Parallel Execution** – You can run the same workflow or talent in different `withBrowserSession()` calls and each will spin up a different browser for true parallelism.
• **Serial Execution** – All workflows in the same `withBrowserSession()` callback share **one** browser session. They are to be run serially.

---

## Common Use Cases and Session Management

### The Authentication Challenge

A common pattern in web automation involves authentication: you need to log into a service first, then perform actions in the authenticated session. Witrium provides several approaches:

#### Approach 1: State Preservation (Parallel-Friendly)
- **Best for:** Running multiple post-login automations concurrently
- **How it works:** Save browser state after login, then restore it in new browser instances
- **Advantages:** Horizontal scaling, isolation between runs

#### Approach 2: Shared Browser Session (Recommended)
- **Best for:** Sequential automations that need to share the exact same browser session
- **How it works:** Use `withBrowserSession()` to manage a browser session for multiple workflows
- **Advantages:** Resource-efficient, automatic cleanup, simple API

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
  await client.withBrowserSession(async (sessionId) => {
    // browserSessionId automatically injected
    await client.runWorkflowAndWait("login-workflow-id", {
      args: { username: "user@example.com", password: "secure123" },
      preserveState: "authenticated-session", // Save state with this name
    });
  });

  // Step 2: Run multiple post-login workflows concurrently
  // Each will spawn a new browser but restore the authenticated state

  const [dashboardResults, profileResults] = await Promise.all([
    // Workflow A: Extract data from dashboard
    client.withBrowserSession(async (sessionId) => {
      // browserSessionId automatically injected
      return await client.runWorkflowAndWait("dashboard-scraping-workflow-id", {
        args: { report_type: "monthly" },
      });
    }, {
      useStates: ["authenticated-session"], // Restore the saved state
    }),
    
    // Workflow B: Update user profile (can run concurrently)
    client.withBrowserSession(async (sessionId) => {
      // browserSessionId automatically injected
      return await client.runWorkflowAndWait("profile-update-workflow-id", {
        args: { new_email: "newemail@example.com" },
      });
    }, {
      useStates: ["authenticated-session"], // Same state, different browser instance
    }),
  ]);

  // Both workflows ran concurrently in separate browser instances
  // but both had access to the authenticated session
}
```

### Pattern 2: Shared Browser Session (Recommended)

This approach uses same browser instance across workflows. The browser session is created when entering and closed when exiting the callback.

**Advantages:**
- Simple and clean API
- Automatic resource cleanup
- Resource-efficient (reuses same browser instance)
- No manual session lifecycle management

**Use Case Example:**

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  await client.withBrowserSession(async (sessionId) => {
    // Browser session automatically created
    // browserSessionId automatically set for all workflows/talents

    // Step 1: Run login workflow (navigates to login page and authenticates)
    await client.runWorkflowAndWait("login-workflow-id", {
      args: { username: "user@example.com", password: "secure123" },
    });
    console.log("Login completed");

    // Step 2: Run subsequent workflows - they automatically use the same session
    // Use skipGotoUrlInstruction=true since the browser is already on the right page
    
    // Workflow A: Extract data from dashboard
    const dashboardResults = await client.runWorkflowAndWait("dashboard-scraping-workflow-id", {
      args: { report_type: "monthly" },
      skipGotoUrlInstruction: true, // Already on the dashboard after login
    });
    console.log(`Dashboard data: ${dashboardResults.result}`);

    // Workflow B: Update user profile
    const profileResults = await client.runWorkflowAndWait("profile-update-workflow-id", {
      args: { new_email: "newemail@example.com" },
      skipGotoUrlInstruction: true, // Previous workflow left us on the right page
    });
    console.log("Profile updated");

    // Browser session automatically closed on exit
  });
}
```

### Choosing the Right Pattern

| Factor | State Preservation | Shared Browser Session |
|--------|-------------------|------------------------|
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
  return await client.withBrowserSession(async (sessionId) => {
    try {
      // browserSessionId automatically injected
      const results = await client.runWorkflowAndWait("category-scraper-workflow", {
        args: { category },
      });

      return { category, data: results.result };
    } catch (error) {
      console.error(`Failed to extract ${category}:`, error);
      return { category, error: String(error) };
    }
  }, {
    useStates: [stateName],
  });
}

async function run() {
  console.log("Logging into e-commerce platform...");
  
  // Step 1: Login and save state
  await client.withBrowserSession(async (sessionId) => {
    // browserSessionId automatically injected
    await client.runWorkflowAndWait("ecommerce-login-workflow", {
      args: { email: "seller@example.com", password: "secure123" },
      preserveState: "ecommerce-authenticated",
    });
  });
  console.log("Login completed, state preserved");

  // Step 2: Extract data from multiple categories concurrently
  const categories = ["electronics", "clothing", "home-garden", "books", "sports"];

  const results = await Promise.all(
    categories.map(category => extractCategoryData(category, "ecommerce-authenticated"))
  );

  console.log(`Extracted data from ${results.length} categories`);
  results.forEach(result => {
    if ('error' in result) {
      console.error(`Error in ${result.category}: ${result.error}`);
    } else {
      console.log(`${result.category}: extracted successfully`);
    }
  });
}
```

### Example 2: Banking Workflow (Shared Browser Session)

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  await client.withBrowserSession(async (sessionId) => {
    // Browser session automatically created
    // browserSessionId automatically set for all workflows
    console.log(`Browser session created: ${sessionId}`);
    
    // Step 1: Secure login with 2FA
    console.log("Initiating secure banking login...");
    await client.runWorkflowAndWait("bank-login-with-2fa-workflow", {
      args: {
        username: "customer123",
        password: "secure456",
        phone_number: "+1234567890", // For 2FA
      },
    });
    console.log("Secure login completed");

    // Step 2: Check account balances
    // Skip initial navigation - login workflow already brought us to the dashboard
    console.log("Checking account balances...");
    const balanceResults = await client.runWorkflowAndWait("check-balances-workflow", {
      args: { account_types: ["checking", "savings", "credit"] },
      skipGotoUrlInstruction: true,
    });
    console.log(`Account balances retrieved: ${balanceResults.result}`);

    // Step 3: Download transaction history
    console.log("Downloading transaction history...");
    await client.runWorkflowAndWait("download-transactions-workflow", {
      args: {
        date_range: "last_30_days",
        format: "csv",
        accounts: ["checking", "savings"],
      },
      skipGotoUrlInstruction: true,
    });
    console.log("Transaction history downloaded");

    // Step 4: Generate financial report
    console.log("Generating financial report...");
    await client.runWorkflowAndWait("generate-financial-report-workflow", {
      args: {
        report_type: "monthly_summary",
        include_charts: true,
      },
      skipGotoUrlInstruction: true,
    });

    console.log("Financial report generated successfully");
    console.log("All banking operations completed in the same secure session");
    // Browser session automatically closed on exit
  });
}
```

## Running Talents

In addition to workflows, you can execute "Talents" directly. Talents are pre-defined capabilities or simpler automation units that can be executed with specific arguments. When using `withBrowserSession()`, talents automatically use the managed browser session.

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  await client.withBrowserSession(async (sessionId) => {
    // Browser session automatically created
    // browserSessionId automatically injected for all talents
    
    // Run a talent by ID with options
    const result = await client.runTalent("talent-uuid", {
      args: { key: "value" },
    });

    // The result is a TalentRunResult object
    console.log(`Status: ${result.status}`);
    console.log(`Result data: ${result.result}`);
    if (result.errorMessage) {
      console.log(`Error: ${result.errorMessage}`);
    }
    // Browser session automatically closed and cleaned up
  });
}
```

### Combining Workflows and Talents in the Same Session

A common use case is running both workflows and talents in the same browser session context. This allows you to chain a workflow (e.g., login or navigation) with talent execution that operates on the resulting browser state.

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  await client.withBrowserSession(async (sessionId) => {
    // Browser session automatically created
    // browserSessionId automatically injected for all workflows/talents
    console.log(`Session ID: ${sessionId}`);

    // Step 1: Run a workflow to set up the browser state (e.g., login, navigate)
    console.log("Running setup workflow...");
    const workflowResult = await client.runWorkflowAndWait("setup-workflow-id", {
      args: { username: "user@example.com", password: "secure123" },
    });
    console.log(`Workflow completed: ${workflowResult.status}`);

    // Step 2: Run a talent in the same browser session
    // The talent will operate on the browser state left by the workflow
    console.log("Running talent...");
    const talentResult = await client.runTalent("data-extraction-talent-id", {
      args: { product_id: "ABC123", include_reviews: true },
    });
    console.log(`Talent result: ${talentResult.result}`);

    // Step 3: Run another workflow using the same session
    // Use skipGotoUrlInstruction since we're already on the relevant page
    console.log("Running follow-up workflow...");
    const followupResult = await client.runWorkflowAndWait("cleanup-workflow-id", {
      skipGotoUrlInstruction: true, // Browser is already where we need it
    });
    console.log(`Follow-up completed: ${followupResult.status}`);

    // Check session details at any point
    const session = await client.getBrowserSession(sessionId);
    console.log(`Session status: ${session.status}, Busy: ${session.isBusy}`);
  });
  // Browser session automatically closed on exit
  console.log("Session closed");
}
```

This pattern is useful when:
- A workflow handles complex multi-step setup (login, navigation, form filling)
- A talent extracts specific data or performs a focused action
- You need to chain multiple operations that depend on shared browser state

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
  console.log(`Workflow run started: ${response.runId}`);

  // Get results later
  const laterResults = await client.getWorkflowResults(response.runId);

  // Wait for workflow to start running
  const runningState = await client.waitUntilState(
    response.runId,
    WorkflowRunStatus.RUNNING
  );
  console.log(`Workflow is now running: ${runningState.status}`);
}
```

## Progress Tracking and Monitoring

### Real-time Progress Tracking

```typescript
import { WitriumClient, WorkflowRunResult } from '@witrium/witrium';

const client = new WitriumClient("your-api-token");

async function run() {
  try {
    // Run workflow with progress tracking
    const result = await client.runWorkflowAndWait("workflow-uuid", {
      args: { key1: "value1" },
      onProgress: (intermediateResults: WorkflowRunResult) => {
        console.log(`Status: ${intermediateResults.status}`);
        intermediateResults.executions?.forEach(execution => {
          if (execution.status === "C") {
            console.log(`✅ ${execution.instruction}`);
          } else if (execution.status === "F") {
            console.error(`❌ ${execution.instruction}: ${execution.errorMessage}`);
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
import { WitriumClient, WorkflowRunResult } from '@witrium/witrium';

// Define a custom progress callback
function monitorWorkflowProgress(result: WorkflowRunResult) {
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
    
    if (execution.errorMessage) {
      console.log(`    ⚠️  Error: ${execution.errorMessage}`);
    }
  });
}

const client = new WitriumClient("your-api-token");

async function run() {
  const results = await client.runWorkflowAndWait("workflow-uuid", {
    args: { key1: "value1" },
    onProgress: monitorWorkflowProgress,
  });
}
```

## API Reference

### WitriumClient

#### Initialization

```typescript
new WitriumClient(
  apiToken: string,         // API token for authentication
  baseUrl?: string,         // Optional base URL (default: "https://api.witrium.com")
  timeout?: number          // Request timeout in milliseconds (default: 60000)
)
```

#### Properties

**`sessionId`** (read-only)

Returns the current active session ID set by `withBrowserSession()`, or `null` if not in a session context.

```typescript
await client.withBrowserSession(async (sessionId) => {
  console.log(client.sessionId === sessionId); // true
});
console.log(client.sessionId); // null
```

#### Core Methods

##### runWorkflow()

Execute a workflow in the Witrium platform.

```typescript
async runWorkflow(
  workflowId: string,
  options?: WorkflowRunOptions
): Promise<WorkflowRunSubmitted>
```

**WorkflowRunOptions:**

```typescript
interface WorkflowRunOptions {
  args?: Record<string, string | number>;
  files?: FileUpload[];
  useStates?: string[];
  preserveState?: string;
  noIntelligence?: boolean;
  recordSession?: boolean;
  browserSessionId?: string;
  skipGotoUrlInstruction?: boolean;
}
```

**Parameters:**

- `workflowId`: The UUID of the workflow to execute
- `options`: (Optional) Configuration options for the workflow run
  - `args`: Arguments to pass to the workflow
  - `files`: Files to upload (array of `{ filename: string, data: string }` where data is base64 encoded)
  - `useStates`: List of saved state names to restore (ignored if browserSessionId is set)
  - `preserveState`: Name to save the browser state as after workflow completion
  - `noIntelligence`: Disable AI assistance
  - `recordSession`: Record the browser session
  - `browserSessionId`: Browser session UUID to use
  - `skipGotoUrlInstruction`: Skip the initial URL navigation step (useful when chaining workflows)

**Session Management:**

- `browserSessionId`: UUID of the browser session to use. **When using `withBrowserSession()`, this is automatically set to the active session ID** - no need to pass it explicitly. You can override by explicitly providing a different session ID.
- `preserveState`: Save the browser state with this name after workflow completion. Other workflows can restore this state using `useStates`.
- `useStates`: List of previously saved state names to restore. **Note:** This is ignored if `browserSessionId` is provided - the session's use_states takes precedence.

##### runTalent()

Run a talent by ID.

```typescript
async runTalent(
  talentId: string,
  options?: TalentRunOptions
): Promise<TalentRunResult>
```

**TalentRunOptions:**

```typescript
interface TalentRunOptions {
  args?: Record<string, string | number>;
  files?: FileUpload[];
  useStates?: string[];
  preserveState?: string;
  browserSessionId?: string;
}
```

**Parameters:**

- `talentId`: The UUID of the talent to execute
- `options`: (Optional) Configuration options for the talent run
  - `args`: Arguments to pass to the talent
  - `files`: Files to upload
  - `useStates`: List of saved state names to restore (ignored if browserSessionId is set)
  - `preserveState`: Name to save the browser state as
  - `browserSessionId`: Browser session UUID to use. **Automatically set when using `withBrowserSession()`**

##### waitUntilState()

Wait for a workflow run to reach a specific status.

```typescript
async waitUntilState(
  runId: string,
  targetStatus: WorkflowStatus,
  options?: WaitUntilStateOptions
): Promise<WorkflowRunResult>
```

**WaitUntilStateOptions:**

```typescript
interface WaitUntilStateOptions {
  allInstructionsExecuted?: boolean;
  minWaitTime?: number;
  pollingInterval?: number;
  timeout?: number;
}
```

**Parameters:**

- `runId`: The workflow run ID to wait for
- `targetStatus`: Use `WorkflowRunStatus` constants (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
- `options`: (Optional) Configuration options for waiting
  - `allInstructionsExecuted`: When true, also waits for all individual execution steps to complete
  - `minWaitTime`: Minimum milliseconds to wait before polling starts
  - `pollingInterval`: Milliseconds between polling attempts (default: 2000)
  - `timeout`: Maximum milliseconds to wait (default: 60000)

##### runWorkflowAndWait()

Run a workflow and wait for it to complete (or reach a terminal status).

```typescript
async runWorkflowAndWait(
  workflowId: string,
  options?: RunWorkflowAndWaitOptions
): Promise<WorkflowRunResult | WorkflowRunResult[]>
```

**RunWorkflowAndWaitOptions:**

```typescript
interface RunWorkflowAndWaitOptions extends WorkflowRunOptions {
  pollingInterval?: number;
  timeout?: number;
  returnIntermediateResults?: boolean;
  onProgress?: (results: WorkflowRunResult) => void;
}
```

**Parameters:**

- `workflowId`: The UUID of the workflow to execute
- `options`: (Optional) Configuration options (includes all `WorkflowRunOptions` plus):
  - `pollingInterval`: Milliseconds between polling attempts (default: 5000)
  - `timeout`: Maximum milliseconds to wait (default: 300000)
  - `returnIntermediateResults`: If true, returns array of all intermediate results (default: false)
  - `onProgress`: Callback function called on each polling iteration with current results

##### Browser Session Methods

**createBrowserSession()**

Create a standalone browser session.

```typescript
async createBrowserSession(
  options?: BrowserSessionCreateOptions
): Promise<BrowserSession>
```

**BrowserSessionCreateOptions:**

```typescript
interface BrowserSessionCreateOptions {
  provider?: string;        // default: "omega"
  useProxy?: boolean;       // default: false
  proxyCountry?: string;    // default: "us"
  proxyCity?: string;       // default: "New York"
  useStates?: string[];     // default: undefined
}
```

**listBrowserSessions()**

List all active browser sessions.

```typescript
async listBrowserSessions(): Promise<ListBrowserSession>
```

**getBrowserSession()**

Get details of a specific browser session.

```typescript
async getBrowserSession(sessionUuid: string): Promise<BrowserSession>
```

**closeBrowserSession()**

Close a browser session.

```typescript
async closeBrowserSession(
  sessionUuid: string,
  force?: boolean  // default: false
): Promise<CloseBrowserSession>
```

**withBrowserSession()**

Run a callback with an automatically managed browser session. **All workflows and talents executed within the callback automatically use this session** - the session ID is auto-injected into `browserSessionId` unless explicitly overridden.

```typescript
async withBrowserSession<T>(
  callback: (sessionId: string) => Promise<T>,
  options?: BrowserSessionCreateOptions
): Promise<T>
```

**Automatic Session Injection:**
- Sets `client.sessionId` to the created session UUID
- All `runWorkflow()` and `runTalent()` calls automatically use this session
- Session is automatically closed on exit (even on error)
- Previous session ID is restored after exit (supports nesting)

##### Other Methods

- `getWorkflowResults(runId: string)`: Get current results of a workflow run
- `cancelRun(runId: string)`: Cancel a workflow run and clean up associated resources

### Status Constants

#### WorkflowRunStatus

```typescript
import { WorkflowRunStatus } from '@witrium/witrium';

WorkflowRunStatus.PENDING      // "P" - Workflow is queued
WorkflowRunStatus.RUNNING      // "R" - Workflow is executing
WorkflowRunStatus.COMPLETED    // "C" - Workflow finished successfully
WorkflowRunStatus.FAILED       // "F" - Workflow failed
WorkflowRunStatus.CANCELLED    // "X" - Workflow was cancelled

// Helper lists
WorkflowRunStatus.TERMINAL_STATUSES  // [COMPLETED, FAILED, CANCELLED]
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
  workflowId: string;
  runId: string;  // Use this for polling and session management
  status: WorkflowStatus;
}
```

#### WorkflowRunResult

```typescript
{
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
  startedAt?: string;
  completedAt?: string;
  message?: string;
  executions?: AgentExecution[];  // Individual execution steps
  result?: Record<string, any> | any[]; // Final workflow result
  resultFormat?: string;
  errorMessage?: string;
}
```

#### AgentExecution

```typescript
{
  status: AgentStatus;
  instructionOrder: number;
  instruction: string;
  result?: Record<string, any> | any[];
  resultFormat?: string;
  errorMessage?: string;
}
```

#### TalentRunResult

```typescript
{
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
  result: any | null;              // Final talent result
  resultFormat: string | null;
  errorMessage: string | null;
}
```

#### BrowserSession

```typescript
{
  uuid: string;
  provider: string;
  status: string;  // "active" or "closed"
  isBusy: boolean;
  userManaged: boolean;
  currentRunType: string | null;  // "workflow", "talent", or null
  currentRunId: string | null;
  createdAt: string;
  startedAt: string | null;
  lastActivityAt: string | null;
  proxyCountry: string | null;
  proxyCity: string | null;
}
```

#### ListBrowserSession

```typescript
{
  sessions: BrowserSession[];
  totalCount: number;
}
```

#### CloseBrowserSession

```typescript
{
  status: string;
  message: string;
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
  const cancelResult = await client.cancelRun(response.runId);
  console.log(`Workflow cancelled with status: ${cancelResult.status}`);
}
```

This is particularly useful for:
- Long-running workflows that are no longer needed
- Error recovery scenarios
- Resource management (freeing up browser sessions)
- User-initiated cancellations in interactive applications

## Best Practices

### 1. Always Use Automatic Session Management

```typescript
// ✅ Good - Automatically closes session and injects sessionId
await client.withBrowserSession(async (sessionId) => {
  // browserSessionId is automatically injected!
  const results = await client.runWorkflowAndWait("workflow-id");
});

// ❌ Bad - Manual cleanup required
const session = await client.createBrowserSession();
const results = await client.runWorkflowAndWait("workflow-id", {
  browserSessionId: session.uuid,
});
await client.closeBrowserSession(session.uuid); // Easy to forget!
```

### 2. Choose the Right Session Management Pattern

```typescript
// ✅ For most use cases - use a shared browser session (recommended)
await client.withBrowserSession(async (sessionId) => {
  // All workflows automatically share the same browser session
  // browserSessionId is automatically injected!
  const result1 = await client.runWorkflowAndWait("login-workflow");
  const result2 = await client.runWorkflowAndWait("scrape-workflow", {
    skipGotoUrlInstruction: true,
  });
  // Session automatically cleaned up
});

// ✅ For concurrent operations - use state preservation
const categories = ["electronics", "clothing", "books"];
await Promise.all(
  categories.map(category =>
    client.withBrowserSession(async (sessionId) => {
      // browserSessionId is automatically injected!
      return await client.runWorkflowAndWait("scraper", {
        args: { category },
      });
    }, {
      useStates: ["logged-in-state"], // Each runs in new browser
    })
  )
);
```

### 3. Implement Proper Error Handling

```typescript
import { WitriumClientException } from '@witrium/witrium';

async function runWorkflowWithRetry(
  client: WitriumClient,
  workflowId: string,
  args: Record<string, any>,
  maxRetries: number = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.runWorkflowAndWait(workflowId, {
        args,
        timeout: 300000,
      });
    } catch (error) {
      if (error instanceof WitriumClientException) {
        if (attempt === maxRetries - 1) throw error;
        console.warn(`Attempt ${attempt + 1} failed: ${error.message}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      } else {
        throw error;
      }
    }
  }
}
```

### 4. Use Appropriate Timeouts

```typescript
// ✅ Default: Reasonable timeout (5 minutes)
await client.runWorkflowAndWait("workflow-id", {
  timeout: 300000,
});

// ✅ Adjust timeouts based on workflow complexity
await client.runWorkflowAndWait("simple-data-extraction", {
  timeout: 60000, // 1 minute
});

await client.runWorkflowAndWait("complex-multi-page-workflow", {
  timeout: 600000, // 10 minutes
  pollingInterval: 10000, // Poll less frequently
});
```

### 5. Monitor Progress for Long-Running Workflows

```typescript
// ✅ Use callbacks for visibility into long-running processes
const logProgress = (result: WorkflowRunResult) => {
  const completed = result.executions?.filter(ex => ex.status === "C").length || 0;
  const total = result.executions?.length || 0;
  console.log(`Progress: ${completed}/${total} steps completed`);
};

await client.runWorkflowAndWait("long-running-workflow", {
  onProgress: logProgress,
  pollingInterval: 10000, // Poll less frequently
});
```

## License

[MIT](LICENSE)
