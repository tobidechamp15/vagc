type LogLevel = "info" | "warn" | "error" | "debug";

type LogMeta = Record<string, unknown>;

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  debug: "\x1b[90m", // grey
};

const RESET = "\x1b[0m";

function timestamp(): string {
  return new Date().toISOString();
}

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return " " + JSON.stringify(meta, null, 0);
  } catch {
    return "";
  }
}

function log(level: LogLevel, message: string, meta?: LogMeta) {
  const color = LEVEL_COLORS[level];
  const prefix = `${timestamp()} [${level.toUpperCase()}]`;
  console.log(`${color}${prefix}${RESET} ${message}${formatMeta(meta)}`);
}

// ─── Public API ──────────────────────────────────────────────────

export const logger = {
  info: (message: string, meta?: LogMeta) => log("info", message, meta),
  warn: (message: string, meta?: LogMeta) => log("warn", message, meta),
  error: (message: string, meta?: LogMeta) => log("error", message, meta),
  debug: (message: string, meta?: LogMeta) => log("debug", message, meta),

  /** Log an incoming HTTP request with duration tracking. */
  request: (
    method: string,
    url: string,
    statusCode: number,
    durationMs: number,
    meta?: LogMeta,
  ) => {
    const color =
      statusCode >= 500
        ? "\x1b[31m"
        : statusCode >= 400
          ? "\x1b[33m"
          : "\x1b[32m";
    const prefix = `${timestamp()} [REQ]`;
    console.log(
      `${color}${prefix}${RESET} ${method} ${url} → ${statusCode} (${durationMs}ms)${formatMeta(meta)}`,
    );
  },
};
