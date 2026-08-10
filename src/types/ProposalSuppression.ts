/**
 * A "never suggest this again" blocklist entry as the CC mobile endpoint
 * returns it (`GET /api/v0/mobile/proposal-suppressions`). Each row records one
 * agent-proposed action card the household user has blocked from being
 * suggested again. The management screen lists these newest-first and lets the
 * user un-block (delete) any of them.
 */
export interface ProposalSuppression {
  id: string;
  /** The command whose proposals are suppressed (e.g. "send_message"). */
  command: string;
  /** The proposal's stable identity key, or null. */
  source_key: string | null;
  /** Human-readable description of what was suppressed, or null. */
  descriptor: string | null;
  /** When it was suppressed, ISO-8601. */
  created_at: string;
}
