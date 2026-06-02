import fs from "fs";
import path from "path";

const SENSITIVE_KEY_RE = /(key|secret|signature|api[-_]?key|authorization|token|passphrase)/i;

const redactSensitive = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "***REDACTED***" : redactSensitive(v);
    }
    return out;
  }
  if (typeof value === "string") {
    return value
      .replace(/X-MBX-APIKEY["':=\s]+[A-Za-z0-9_-]+/gi, "X-MBX-APIKEY=***REDACTED***")
      .replace(/(api[-_]?key|secret|signature|authorization|token)["':=\s]+[^,\s"]+/gi, "$1=***REDACTED***");
  }
  return value;
};

export const safeStringifyForLogs = (value: unknown): string => {
  try {
    return JSON.stringify(redactSensitive(value), null, 2);
  } catch {
    return String(value);
  }
};

/**
 * Append one line to a log file.
 * Uses synchronous I/O so thousands of rapid calls (e.g. simulation + DEBUG)
 * do not queue concurrent async opens and hit EMFILE (too many open files) on Windows.
 */
export const logToFile = async (logFilePath: string, logMessage: string): Promise<void> => {
  try {
    const dir = path.dirname(logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, "", "utf8");
    }
    fs.appendFileSync(logFilePath, `${logMessage}\n`, "utf8");
  } catch (err) {
    console.error("Error writing to log file:", logFilePath, err);
    /* Do not rethrow: avoids unhandled rejections when callers fire-and-forget, and prevents
       log-to-error.log cascades when the log file itself cannot be opened. */
  }
  return Promise.resolve();
};
