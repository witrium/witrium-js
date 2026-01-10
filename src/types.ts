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
  keepSessionAlive?: boolean;
  useExistingSession?: string;
}

export interface TalentRunOptions {
  args?: Record<string, string | number>;
  files?: FileUpload[];
  useStates?: string[];
  preserveState?: string;
  keepSessionAlive?: boolean;
  useExistingSession?: string;
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
