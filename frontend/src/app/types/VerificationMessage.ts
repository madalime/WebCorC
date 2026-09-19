/**
 * One message on a verification job's WebSocket (`/ws/verify/{jobId}`), discriminated by
 * `type`. Mirrors the backend's typed envelope
 * (`openapi/schema/verification/message.yml`): a free-text log line tagged with which
 * Verifier — or functional verification ({@link FUNCTIONAL_VERIFIER_ID}) — produced it, one
 * `done` per Verifier as it finishes (carrying that Verifier's aggregate `proven` verdict),
 * and one final `complete` once everything has, which is the signal to fetch the job's
 * result and close the socket.
 */
export type VerificationMessage = LogMessage | DoneMessage | CompleteMessage;

export interface LogMessage {
  type: "log";
  verifier: string;
  message: string;
}

export interface DoneMessage {
  type: "done";
  verifier: string;
  proven: boolean;
}

export interface CompleteMessage {
  type: "complete";
}
