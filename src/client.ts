import axios, { AxiosInstance } from "axios";
import {
  WorkflowRunExecuteOptions,
  WorkflowRunSubmitted,
  WorkflowRunResults,
  WorkflowRun,
  WorkflowStatus,
} from "./types";
import { WitriumClientException } from "./errors";
import { AgentExecutionStatus, WorkflowRunStatus } from "./constants";

const DEFAULT_BASE_URL = "https://api.witrium.com";
const DEFAULT_TIMEOUT = 60000; // 60 seconds

export class WitriumClient {
  private client: AxiosInstance;

  constructor(
    apiToken: string,
    baseUrl: string = DEFAULT_BASE_URL,
    timeout: number = DEFAULT_TIMEOUT
  ) {
    this.client = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: timeout,
      headers: {
        "X-Witrium-Key": apiToken,
        "Content-Type": "application/json",
      },
    });
  }

  private async _extractErrorDetail(error: any): Promise<string> {
    if (axios.isAxiosError(error) && error.response) {
      const data = error.response.data;
      if (data && typeof data.detail === "string") {
        return data.detail;
      }
      return JSON.stringify(data);
    }
    return error.message || "Unknown error";
  }

  async runWorkflow(
    workflowId: string,
    options: WorkflowRunExecuteOptions = {}
  ): Promise<WorkflowRunSubmitted> {
    const url = `/v1/workflows/${workflowId}/run`;
    try {
      // Build payload, excluding undefined values to match Python behavior
      const payload: Record<string, any> = {};
      if (options.args !== undefined) payload.args = options.args;
      if (options.files !== undefined) payload.files = options.files;
      if (options.use_states !== undefined)
        payload.use_states = options.use_states;
      if (options.preserve_state !== undefined)
        payload.preserve_state = options.preserve_state;
      if (options.no_intelligence !== undefined)
        payload.no_intelligence = options.no_intelligence;
      if (options.record_session !== undefined)
        payload.record_session = options.record_session;
      if (options.keep_session_alive !== undefined)
        payload.keep_session_alive = options.keep_session_alive;
      if (options.use_existing_session !== undefined)
        payload.use_existing_session = options.use_existing_session;

      const response = await this.client.post(url, payload);
      return response.data;
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error running workflow: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async getWorkflowResults(runId: string): Promise<WorkflowRunResults> {
    const url = `/v1/runs/${runId}/results`;
    try {
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error getting workflow results: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async runWorkflowAndWait(
    workflowId: string,
    options: WorkflowRunExecuteOptions & {
      pollingInterval?: number;
      timeout?: number;
      returnIntermediateResults?: boolean;
      onProgress?: (results: WorkflowRunResults) => void;
    } = {}
  ): Promise<WorkflowRunResults | WorkflowRunResults[]> {
    const {
      pollingInterval = 5000,
      timeout = 300000,
      returnIntermediateResults = false,
      onProgress,
      ...runOptions
    } = options;

    const runResponse = await this.runWorkflow(workflowId, runOptions);
    const { run_id: runId } = runResponse;
    const startTime = Date.now();
    const intermediateResults: WorkflowRunResults[] = [];

    while (Date.now() - startTime < timeout) {
      const results = await this.getWorkflowResults(runId);

      if (returnIntermediateResults) {
        intermediateResults.push(results);
      }

      if (onProgress) {
        onProgress(results);
      }

      if (WorkflowRunStatus.TERMINAL_STATUSES.includes(results.status as any)) {
        return returnIntermediateResults ? intermediateResults : results;
      }

      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
    }

    throw new WitriumClientException(
      `Workflow execution timed out after ${timeout / 1000} seconds`
    );
  }

  async waitUntilState(
    runId: string,
    targetStatus: WorkflowStatus,
    options: {
      allInstructionsExecuted?: boolean;
      minWaitTime?: number;
      pollingInterval?: number;
      timeout?: number;
    } = {}
  ): Promise<WorkflowRunResults> {
    const {
      allInstructionsExecuted = false,
      minWaitTime = 0,
      pollingInterval = 2000,
      timeout = 60000,
    } = options;

    if (minWaitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, minWaitTime));
    }

    const startTime = Date.now();

    const checkAllExecutionsCompleted = (
      results: WorkflowRunResults
    ): boolean => {
      if (!results.executions || results.executions.length === 0) {
        return false;
      }
      return (
        results.executions[results.executions.length - 1].status ===
        AgentExecutionStatus.COMPLETED
      );
    };

    while (Date.now() - startTime < timeout) {
      const results = await this.getWorkflowResults(runId);

      const statusReached = results.status === targetStatus;
      const allExecutionsDone =
        !allInstructionsExecuted || checkAllExecutionsCompleted(results);

      if (statusReached && allExecutionsDone) {
        return results;
      }

      if (
        WorkflowRunStatus.TERMINAL_STATUSES.includes(results.status as any) &&
        results.status !== targetStatus
      ) {
        const currentStatusName = WorkflowRunStatus.getStatusName(
          results.status
        );
        const targetStatusName = WorkflowRunStatus.getStatusName(targetStatus);
        throw new WitriumClientException(
          `Workflow run reached terminal status '${currentStatusName}' before reaching target status '${targetStatusName}'`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
    }

    const targetStatusName = WorkflowRunStatus.getStatusName(targetStatus);
    let conditionMsg = `status '${targetStatusName}'`;
    if (allInstructionsExecuted) {
      conditionMsg += " and all instructions executed";
    }
    throw new WitriumClientException(
      `Workflow run did not reach ${conditionMsg} within ${timeout / 1000} seconds`
    );
  }

  async cancelRun(runId: string): Promise<WorkflowRun> {
    const url = `/v1/runs/${runId}/cancel`;
    try {
      const response = await this.client.post(url);
      return response.data;
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error cancelling workflow run: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }
}
