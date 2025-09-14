export type WorkflowStatus = "P" | "R" | "C" | "F" | "X";
export type AgentStatus = "P" | "R" | "C" | "F" | "X";

export interface WorkflowRunExecuteOptions {
  args?: Record<string, string | number>;
  use_states?: string[];
  preserve_state?: string;
  no_intelligence?: boolean;
  record_session?: boolean;
  keep_session_alive?: boolean;
  use_existing_session?: string;
}

export interface WorkflowRunSubmitted {
  workflow_id: string;
  run_id: string;
  status: WorkflowStatus;
}

export interface AgentExecution {
  status: AgentStatus;
  instruction_order: number;
  instruction: string;
  result?: Record<string, any> | any[];
  result_format?: string;
  error_message?: string;
}

export interface WorkflowRunExecution {
  instruction_id: string;
  instruction: string;
  result?: Record<string, any> | any[];
  status: AgentStatus;
  error_message?: string;
}

export interface WorkflowRunResults {
  workflow_id: string;
  run_id: string;
  status: WorkflowStatus;
  started_at?: string;
  completed_at?: string;
  message?: string;
  executions: AgentExecution[];
  result?: Record<string, any> | any[];
  result_format?: string;
  error_message?: string;
}

export interface Workflow {
  uuid: string;
  name: string;
  description?: string;
}

export interface WorkflowRun {
  uuid: string;
  session_id: string;
  workflow: Workflow;
  run_type: string;
  triggered_by: string;
  status: WorkflowStatus;
  session_active: boolean;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  executions: WorkflowRunExecution[];
}
