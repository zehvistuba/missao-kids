type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;
type LogMetadata = Record<string, LogValue | LogValue[]>;

const SENSITIVE_KEY = /(authorization|token|secret|password|email|user_?id|uid|subscription|payload|body|document|cpf|card|address)/i;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,80}$/;

export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const maxLength = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function sanitizeLogText(value: unknown, maxLength = 240): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, "$1?[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]{10,}\b/g, "[token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[payment]")
    .replace(/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g, "[document]")
    .replace(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeMetadata(metadata: LogMetadata): Record<string, string | number | boolean | null | Array<string | number | boolean | null>> {
  const safe: Record<string, string | number | boolean | null | Array<string | number | boolean | null>> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    if (Array.isArray(value)) {
      safe[key] = value.slice(0, 20).map((item) => typeof item === "string" ? sanitizeLogText(item, 80) : item ?? null);
      continue;
    }
    safe[key] = typeof value === "string" ? sanitizeLogText(value) : value ?? null;
  }
  return safe;
}

export function getRequestId(req: Request): string {
  const candidate = req.headers.get("x-request-id") ?? "";
  return SAFE_REQUEST_ID.test(candidate) ? candidate : crypto.randomUUID();
}

export function getErrorMetadata(error: unknown): LogMetadata {
  if (!error || typeof error !== "object") {
    return { error_name: "UnknownError", error_message: sanitizeLogText(error) };
  }
  const candidate = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  return {
    error_name: sanitizeLogText(candidate.name ?? "Error", 80),
    error_message: sanitizeLogText(candidate.message ?? "", 240),
    error_code: sanitizeLogText(candidate.code ?? "", 80),
    error_status: Number(candidate.status ?? candidate.statusCode) || null,
  };
}

export function createEdgeLogger(service: string, requestId: string) {
  const safeService = sanitizeLogText(service, 60) || "edge-function";
  const safeRequestId = sanitizeLogText(requestId, 80);

  const write = (level: LogLevel, event: string, metadata: LogMetadata = {}) => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: safeService,
      event: sanitizeLogText(event, 80) || "unknown",
      request_id: safeRequestId,
      ...sanitizeMetadata(metadata),
    });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.info(entry);
  };

  return {
    info: (event: string, metadata?: LogMetadata) => write("info", event, metadata),
    warn: (event: string, metadata?: LogMetadata) => write("warn", event, metadata),
    error: (event: string, metadata?: LogMetadata) => write("error", event, metadata),
  };
}
