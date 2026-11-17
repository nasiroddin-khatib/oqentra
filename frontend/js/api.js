/*
 * OQENTRA API CLIENT
 * ------------------------------------------------------------------
 * Centralizes all browser-to-backend HTTP communication.
 * Public form submissions use the Express API routes:
 *   POST /enquiries  -> project/contact enquiry
 *   POST /referrals  -> referral introduction
 * No admin token or secret is stored in this public frontend.
 */

const runtimeConfig = window.OQENTRA_CONFIG || {};
const API_BASE_URL = String(runtimeConfig.API_BASE_URL || "http://localhost:4000/api").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 12000;

/**
 * Represents a safe API error that the UI can display without exposing
 * internal stack traces or request payloads.
 */
export class ApiError extends Error {
  constructor(message, status = 0, requestId = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

/**
 * Sends a JSON request to the configured backend and normalizes responses.
 * A timeout prevents a form from appearing to submit forever on a slow link.
 * @param {string} path API path beginning with a slash.
 * @param {object} options Fetch options; `body` should be a plain object.
 * @returns {Promise<object>} Parsed JSON response.
 */
export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  let requestBody;
  if (options.body !== undefined && options.body !== null) {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
      credentials: "omit",
      cache: method === "GET" ? "no-store" : "no-store"
    });

    const contentType = response.headers.get("content-type") || "";
    const responseData = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : {};

    if (!response.ok) {
      const safeMessage = typeof responseData.error === "string"
        ? responseData.error
        : `The request could not be completed (HTTP ${response.status}).`;
      throw new ApiError(safeMessage, response.status, response.headers.get("x-request-id") || "");
    }

    return responseData;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") {
      throw new ApiError("The request took too long. Please try again.");
    }
    throw new ApiError("We couldn't connect to the OQENTRA service. Please try again shortly.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Submits a public project enquiry to the Express backend.
 * @param {{name:string, phone:string, email?:string, service:string, message:string}} payload
 */
export function submitEnquiry(payload) {
  return apiRequest("/enquiries", { method: "POST", body: payload });
}

/**
 * Submits a referral introduction and returns its server-generated reference.
 * @param {{referrer_name:string, referrer_phone:string, referred_name:string, referred_phone:string, service?:string, message?:string}} payload
 */
export function submitReferral(payload) {
  return apiRequest("/referrals", { method: "POST", body: payload });
}
