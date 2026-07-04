/**
 * Structured logging (spec §3/§15). Logs go to stderr so they never interleave
 * with human-facing progress bars / results on stdout.
 */
import { pino } from "pino";

// Write to stderr so logs never interleave with stdout progress bars / results.
export const logger = pino(
  { level: process.env.MDB_LOG_LEVEL ?? "info" },
  process.stderr,
);

export type Logger = typeof logger;
