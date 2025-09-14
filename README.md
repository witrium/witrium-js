# Witrium JS/TS Client SDK

[![npm version](https://badge.fury.io/js/%40witrium%2Fwitrium.svg)](https://badge.fury.io/js/%40witrium%2Fwitrium)

The official JavaScript/TypeScript client for the Witrium API.

## Installation

You can install the package using npm or yarn:

```bash
npm install @witrium/witrium
```

```bash
yarn add @witrium/witrium
```

## Usage

### Initializing the Client

First, import and initialize the client with your API token.

```typescript
import { WitriumClient } from '@witrium/witrium';

const client = new WitriumClient('YOUR_API_TOKEN');
```

### Running a Workflow

To run a workflow, you need its ID. You can also pass arguments and other options.

```typescript
async function runWorkflow() {
  try {
    const workflowId = 'your-workflow-id';
    const response = await client.runWorkflow(workflowId, {
      args: {
        param1: 'value1',
        param2: 123,
      },
    });
    console.log('Workflow run submitted:', response);
    // { workflow_id: '...', run_id: '...', status: 'P' }
    return response.run_id;
  } catch (error) {
    console.error('Error running workflow:', error);
  }
}
```

### Getting Workflow Results

You can fetch the results of a workflow run using its `run_id`.

```typescript
async function getResults(runId: string) {
  try {
    const results = await client.getWorkflowResults(runId);
    console.log('Workflow results:', results);
  } catch (error) {
    console.error('Error getting results:', error);
  }
}
```

### Run a Workflow and Wait for Results

A convenience method is available to run a workflow and poll for its results until it reaches a terminal state (Completed, Failed, or Cancelled).

```typescript
async function runAndWait() {
  try {
    const workflowId = 'your-workflow-id';
    const finalResults = await client.runWorkflowAndWait(workflowId, {
      args: {
        query: 'What is the capital of France?',
      },
      onProgress: (intermediateResults) => {
        console.log('Progress update:', intermediateResults.status);
      },
    });
    console.log('Final workflow results:', finalResults);
  } catch (error) {
    console.error('Error running workflow and waiting:', error);
  }
}
```

### Waiting for a Specific State

If you need to wait for a workflow run to reach a particular status before proceeding, you can use `waitUntilState`.

```typescript
import { WorkflowRunStatus } from '@witrium/witrium';

async function waitForRunningState(runId: string) {
  try {
    console.log('Waiting for workflow to start running...');
    const results = await client.waitUntilState(runId, WorkflowRunStatus.RUNNING);
    console.log('Workflow is now running:', results);
  } catch (error) {
    console.error('Error waiting for state:', error);
  }
}
```

### Cancelling a Workflow Run

You can cancel a running workflow.

```typescript
async function cancelWorkflow(runId: string) {
  try {
    const response = await client.cancelRun(runId);
    console.log('Workflow run cancellation requested:', response);
  } catch (error) {
    console.error('Error cancelling workflow:', error);
  }
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)