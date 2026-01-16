import axios, { AxiosInstance } from "axios";
import {
  WorkflowRunSubmitted,
  WorkflowRunResult,
  WorkflowRun,
  WorkflowStatus,
  TalentRunResult,
  WorkflowRunOptions,
  TalentRunOptions,
  WaitUntilStateOptions,
  RunWorkflowAndWaitOptions,
  BrowserSessionCreateOptions,
  BrowserSession,
  ListBrowserSession,
  CloseBrowserSession,
} from "./types";
import { WitriumClientException } from "./errors";
import { AgentExecutionStatus, WorkflowRunStatus } from "./constants";

const DEFAULT_BASE_URL = "https://api.witrium.com";
const DEFAULT_TIMEOUT = 60000; // 60 seconds

export class WitriumClient {
  private client: AxiosInstance;
  private _activeSessionId: string | null = null;

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

  /**
   * Get the current active session ID (set by withBrowserSession)
   */
  get sessionId(): string | null {
    return this._activeSessionId;
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

  private _toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private _transformKeysToCamelCase(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this._transformKeysToCamelCase(item));
    }
    if (typeof obj === "object" && obj.constructor === Object) {
      const transformed: Record<string, any> = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const camelKey = this._toCamelCase(key);
          transformed[camelKey] = this._transformKeysToCamelCase(obj[key]);
        }
      }
      return transformed;
    }
    return obj;
  }

  async runWorkflow(
    workflowId: string,
    options: WorkflowRunOptions = {}
  ): Promise<WorkflowRunSubmitted> {
    const url = `/v1/workflows/${workflowId}/run`;
    try {
      // Auto-inject active session ID if not explicitly provided
      const browserSessionId =
        options.browserSessionId ?? this._activeSessionId;

      // Build payload with snake_case keys for the server
      const payload: Record<string, any> = {};
      if (options.args !== undefined) payload.args = options.args;
      if (options.files !== undefined) payload.files = options.files;
      if (options.useStates !== undefined)
        payload.use_states = options.useStates;
      if (options.preserveState !== undefined)
        payload.preserve_state = options.preserveState;
      if (options.noIntelligence !== undefined)
        payload.no_intelligence = options.noIntelligence;
      if (options.recordSession !== undefined)
        payload.record_session = options.recordSession;
      if (browserSessionId !== undefined && browserSessionId !== null)
        payload.browser_session_id = browserSessionId;
      if (options.skipGotoUrlInstruction !== undefined)
        payload.skip_goto_url_instruction = options.skipGotoUrlInstruction;

      const response = await this.client.post(url, payload);
      return this._transformKeysToCamelCase(response.data);
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

  async getWorkflowResults(runId: string): Promise<WorkflowRunResult> {
    const url = `/v1/runs/${runId}/results`;
    try {
      const response = await this.client.get(url);
      return this._transformKeysToCamelCase(response.data);
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
    options: RunWorkflowAndWaitOptions = {}
  ): Promise<WorkflowRunResult | WorkflowRunResult[]> {
    const timeout = options.timeout ?? 300000;
    const pollingInterval = options.pollingInterval ?? 5000;
    const returnIntermediateResults =
      options.returnIntermediateResults ?? false;
    const onProgress = options.onProgress ?? (() => {});

    const runResponse = await this.runWorkflow(workflowId, {
      args: options.args,
      files: options.files,
      useStates: options.useStates,
      preserveState: options.preserveState,
      noIntelligence: options.noIntelligence,
      recordSession: options.recordSession,
      browserSessionId: options.browserSessionId,
      skipGotoUrlInstruction: options.skipGotoUrlInstruction,
    });
    const { runId } = runResponse;
    const startTime = Date.now();
    const intermediateResults: WorkflowRunResult[] = [];

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
    options: WaitUntilStateOptions = {}
  ): Promise<WorkflowRunResult> {
    const allInstructionsExecuted = options.allInstructionsExecuted ?? false;
    const minWaitTime = options.minWaitTime ?? 0;
    const pollingInterval = options.pollingInterval ?? 2000;
    const timeout = options.timeout ?? 60000;

    if (minWaitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, minWaitTime));
    }

    const startTime = Date.now();

    const checkAllExecutionsCompleted = (
      results: WorkflowRunResult
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
      return this._transformKeysToCamelCase(response.data);
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

  async runTalent(
    talentId: string,
    options: TalentRunOptions = {}
  ): Promise<TalentRunResult> {
    const url = `/v1/talents/${talentId}/run`;
    try {
      // Auto-inject active session ID if not explicitly provided
      const browserSessionId =
        options.browserSessionId ?? this._activeSessionId;

      // Build payload with snake_case keys for the server
      const payload: Record<string, any> = {};
      if (options.args !== undefined) payload.args = options.args;
      if (options.files !== undefined) payload.files = options.files;
      if (options.useStates !== undefined)
        payload.use_states = options.useStates;
      if (options.preserveState !== undefined)
        payload.preserve_state = options.preserveState;
      if (browserSessionId !== undefined && browserSessionId !== null)
        payload.browser_session_id = browserSessionId;

      const response = await this.client.post(url, payload);
      return this._transformKeysToCamelCase(response.data);
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error running talent: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async createBrowserSession(
    options: BrowserSessionCreateOptions = {}
  ): Promise<BrowserSession> {
    const url = "/v1/browser-sessions";
    try {
      // Build payload with snake_case keys for the server
      const payload: Record<string, any> = {};
      if (options.provider !== undefined) payload.provider = options.provider;
      if (options.useProxy !== undefined) payload.use_proxy = options.useProxy;
      if (options.proxyCountry !== undefined)
        payload.proxy_country = options.proxyCountry;
      if (options.proxyCity !== undefined)
        payload.proxy_city = options.proxyCity;
      if (options.useStates !== undefined)
        payload.use_states = options.useStates;

      const response = await this.client.post(url, payload);
      return this._transformKeysToCamelCase(response.data);
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error creating browser session: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async listBrowserSessions(): Promise<ListBrowserSession> {
    const url = "/v1/browser-sessions";
    try {
      const response = await this.client.get(url);
      return this._transformKeysToCamelCase(response.data);
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error listing browser sessions: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async getBrowserSession(sessionUuid: string): Promise<BrowserSession> {
    const url = `/v1/browser-sessions/${sessionUuid}`;
    try {
      const response = await this.client.get(url);
      return this._transformKeysToCamelCase(response.data);
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error getting browser session: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async closeBrowserSession(
    sessionUuid: string,
    force: boolean = false
  ): Promise<CloseBrowserSession> {
    const url = `/v1/browser-sessions/${sessionUuid}`;
    try {
      const response = await this.client.delete(url, {
        params: force ? { force: true } : {},
      });
      return this._transformKeysToCamelCase(response.data);
    } catch (error) {
      const errorDetail = await this._extractErrorDetail(error);
      const statusCode = axios.isAxiosError(error)
        ? error.response?.status
        : "unknown";
      throw new WitriumClientException(
        `Error closing browser session: ${errorDetail} (Status code: ${statusCode})`
      );
    }
  }

  async withBrowserSession<T>(
    callback: (sessionId: string) => Promise<T>,
    options: BrowserSessionCreateOptions = {}
  ): Promise<T> {
    const session = await this.createBrowserSession(options);
    const previousSessionId = this._activeSessionId;
    this._activeSessionId = session.uuid;

    try {
      return await callback(session.uuid);
    } finally {
      // Restore previous session ID (for nested calls)
      this._activeSessionId = previousSessionId;

      // Use force=true to ensure cleanup even if session is busy
      // Swallow errors during cleanup to not mask the original error
      try {
        await this.closeBrowserSession(session.uuid, true);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
