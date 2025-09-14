import { WorkflowStatus, AgentStatus } from "./types";

export const WorkflowRunStatus = {
  PENDING: "P" as const,
  RUNNING: "R" as const,
  COMPLETED: "C" as const,
  FAILED: "F" as const,
  CANCELLED: "X" as const,
  TERMINAL_STATUSES: ["C", "F", "X"] as const,
  STATUS_NAMES: {
    P: "pending",
    R: "running",
    C: "completed",
    F: "failed",
    X: "cancelled",
  },
  getStatusName(statusCode: WorkflowStatus): string {
    return this.STATUS_NAMES[statusCode] || statusCode;
  },
} as const;

export const AgentExecutionStatus = {
  PENDING: "P" as const,
  RUNNING: "R" as const,
  COMPLETED: "C" as const,
  FAILED: "F" as const,
  CANCELLED: "X" as const,
  STATUS_NAMES: {
    P: "pending",
    R: "running",
    C: "completed",
    F: "failed",
    X: "cancelled",
  },
  getStatusName(statusCode: AgentStatus): string {
    return this.STATUS_NAMES[statusCode] || statusCode;
  },
} as const;
