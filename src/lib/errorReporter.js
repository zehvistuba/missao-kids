import { supabase } from "./supabase.js";
import {
  createReportKey,
  normalizeReportField,
  sanitizeErrorText,
} from "./errorSanitizer.js";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";
const CLIENT_DEDUPE_MS = 30_000;
const recentReports = new Map();
let globalListenersInstalled = false;

function normalizeError(error) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error("Erro desconhecido");
  }
}

function buildPayload({
  error,
  kind = "automatic",
  source = "application",
  action = "unknown",
  screen = "unknown",
  componentStack = "",
}) {
  const normalized = normalizeError(error);
  const safeSource = normalizeReportField(source) || "application";
  const safeAction = normalizeReportField(action) || "unknown";
  const safeScreen = normalizeReportField(screen) || "unknown";
  const errorName = normalizeReportField(normalized.name || "Error", 60) || "error";
  const message = sanitizeErrorText(normalized.message || "Erro desconhecido", 500);
  const stackHash = createReportKey([normalized.stack || "", componentStack]);
  const reportKey = createReportKey([safeSource, safeAction, safeScreen, errorName, message, stackHash]);

  return {
    p_report_key: reportKey,
    p_kind: kind === "user" ? "user" : "automatic",
    p_source: safeSource,
    p_action: safeAction,
    p_screen: safeScreen,
    p_error_name: errorName,
    p_message: message || "Erro desconhecido",
    p_stack_hash: stackHash,
    p_app_version: sanitizeErrorText(APP_VERSION, 40) || "unknown",
  };
}

async function sendReport(input, throwOnError) {
  const payload = buildPayload(input);
  const now = Date.now();
  if (!throwOnError && now - (recentReports.get(payload.p_report_key) || 0) < CLIENT_DEDUPE_MS) {
    return null;
  }
  recentReports.set(payload.p_report_key, now);

  try {
    const { data, error } = await supabase.rpc("report_app_error", payload);
    if (error) throw error;
    return data;
  } catch (error) {
    if (throwOnError) throw error;
    return null;
  }
}

export function reportAppError(input) {
  return sendReport(input, false);
}

export function reportUserIssue({ category, description, screen = "parent_settings" }) {
  return sendReport({
    error: new Error(description),
    kind: "user",
    source: "user_report",
    action: category,
    screen,
  }, true);
}

export function installGlobalErrorReporting() {
  if (globalListenersInstalled || typeof window === "undefined") return;
  globalListenersInstalled = true;

  window.addEventListener("error", (event) => {
    void reportAppError({
      error: event.error || event.message,
      source: "window",
      action: "error",
      screen: window.location.pathname,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    void reportAppError({
      error: event.reason,
      source: "window",
      action: "unhandled_rejection",
      screen: window.location.pathname,
    });
  });
}
