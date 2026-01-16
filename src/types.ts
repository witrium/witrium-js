export type WorkflowStatus = "P" | "R" | "C" | "F" | "X";
export type AgentStatus = "P" | "R" | "C" | "F" | "X";

export interface FileUpload {
  filename: string;
  data: string; // base64 encoded file content
}

export interface WorkflowRunOptions {
  args?: Record<string, string | number>;
  files?: FileUpload[];
  useStates?: string[];
  preserveState?: string;
  noIntelligence?: boolean;
  recordSession?: boolean;
  browserSessionId?: string;
  skipGotoUrlInstruction?: boolean;
}

export interface TalentRunOptions {
  args?: Record<string, string | number>;
  files?: FileUpload[];
  useStates?: string[];
  preserveState?: string;
  browserSessionId?: string;
}

export interface WaitUntilStateOptions {
  allInstructionsExecuted?: boolean;
  minWaitTime?: number;
  pollingInterval?: number;
  timeout?: number;
}

export interface RunWorkflowAndWaitOptions extends WorkflowRunOptions {
  pollingInterval?: number;
  timeout?: number;
  returnIntermediateResults?: boolean;
  onProgress?: (results: WorkflowRunResult) => void;
}

export interface WorkflowRunSubmitted {
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
}

export interface AgentExecution {
  status: AgentStatus;
  instructionOrder: number;
  instruction: string;
  result?: Record<string, any> | any[];
  resultFormat?: string;
  errorMessage?: string;
}

export interface WorkflowRunExecution {
  instructionId: string;
  instruction: string;
  result?: Record<string, any> | any[];
  resultFormat?: string;
  message?: string;
  status: AgentStatus;
  errorMessage?: string;
}

export interface WorkflowRunResult {
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
  startedAt?: string;
  completedAt?: string;
  message?: string;
  executions?: AgentExecution[];
  result?: Record<string, any> | any[];
  resultFormat?: string;
  errorMessage?: string;
}

export interface Workflow {
  uuid: string;
  name: string;
  description?: string;
}

export interface WorkflowRun {
  uuid: string;
  sessionId?: string; // browser_session id
  workflow: Workflow;
  runType: string;
  triggeredBy: string;
  status: WorkflowStatus;
  sessionActive: boolean;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  executions?: WorkflowRunExecution[];
}

export interface TalentRunResult {
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
  result: any | null;
  resultFormat: string | null;
  errorMessage: string | null;
}

export interface BrowserSessionCreateOptions {
  provider?: string;
  useProxy?: boolean;
  proxyCountry?: string;
  proxyCity?: string;
  useStates?: string[];
}

export interface BrowserSession {
  uuid: string;
  provider: string;
  status: string;
  isBusy: boolean;
  userManaged: boolean;
  currentRunType: string | null;
  currentRunId: string | null;
  createdAt: string;
  startedAt: string | null;
  lastActivityAt: string | null;
  proxyCountry: string | null;
  proxyCity: string | null;
}

export interface ListBrowserSession {
  sessions: BrowserSession[];
  totalCount: number;
}

export interface CloseBrowserSession {
  status: string;
  message: string;
}
