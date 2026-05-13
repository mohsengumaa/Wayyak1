import { getToken } from "./auth";
import { requestDeleteConfirm } from "./deleteConfirm";

/** Default `/api` uses Next rewrites → Django on this machine (works with Network URL too). Set NEXT_PUBLIC_API_URL to bypass. */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api";

const FALLBACK_API_BASES =
  API_BASE === "/api"
    ? ["http://127.0.0.1:8000/api", "http://localhost:8000/api"]
    : [];

/** Same as `API_BASE`; kept for call sites that need a function (e.g. import/export URLs). */
export function getApiBase(): string {
  return API_BASE;
}

type ApiOptions = RequestInit & { isJson?: boolean };
type DeleteOptions = { skipConfirm?: boolean; confirmMessage?: string };

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: HeadersInit = options.headers || {};
  const token = getToken();
  if (token) {
    // @ts-expect-error allow object-style headers in runtime
    headers.Authorization = `Token ${token}`;
  }

  if (options.isJson !== false) {
    // @ts-expect-error allow object-style headers in runtime
    headers["Content-Type"] = "application/json";
  }

  const request = (base: string, reqPath: string) =>
    fetch(`${base}${reqPath}`, {
      ...options,
      headers,
    });

  const fetchWithBaseFallbacks = async (reqPath: string): Promise<Response> => {
    let lastNetworkError = "";
    try {
      return await request(API_BASE, reqPath);
    } catch (error) {
      lastNetworkError = error instanceof Error ? error.message : "Failed to fetch";
      for (const fallbackBase of FALLBACK_API_BASES) {
        try {
          return await request(fallbackBase, reqPath);
        } catch (fallbackError) {
          lastNetworkError =
            fallbackError instanceof Error ? fallbackError.message : "Failed to fetch";
        }
      }
      throw new Error(`Network error (${lastNetworkError}). API: ${API_BASE}`);
    }
  };

  let response: Response = await fetchWithBaseFallbacks(path);
  if (response.status === 404 && path.length > 1 && path.endsWith("/")) {
    response = await fetchWithBaseFallbacks(path.slice(0, -1));
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    const message =
      contentType.includes("application/json") && raw
        ? (() => {
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              const fromDetail = parsed.detail;
              if (typeof fromDetail === "string") return fromDetail;
              if (Array.isArray(fromDetail)) {
                return fromDetail
                  .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
                  .join(" ");
              }
              const nfe = parsed.non_field_errors;
              if (Array.isArray(nfe)) {
                return nfe
                  .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
                  .join(" ");
              }
              const fieldParts: string[] = [];
              for (const [key, val] of Object.entries(parsed)) {
                if (key === "detail") continue;
                if (Array.isArray(val)) {
                  for (const item of val) {
                    if (typeof item === "string") fieldParts.push(item);
                  }
                }
              }
              if (fieldParts.length) return fieldParts.join(" ");
              return raw;
            } catch {
              return raw;
            }
          })()
        : raw;
    const normalizedMessage = String(message || "").trim().toLowerCase();
    if (response.status === 404 && (!normalizedMessage || normalizedMessage === "not found.")) {
      throw new Error(`المسار غير موجود (404): ${path}`);
    }
    throw new Error(message || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, init: Omit<ApiOptions, "method" | "body"> = {}) =>
    apiFetch<T>(path, { method: "GET", ...init }),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: DeleteOptions) => {
    const shouldConfirm = !options?.skipConfirm && typeof window !== "undefined";
    if (!shouldConfirm) return apiFetch<T>(path, { method: "DELETE" });
    return requestDeleteConfirm(options?.confirmMessage || "هل تريد تأكيد الحذف؟").then(
      (accepted) => {
        if (!accepted) throw new Error("DELETE_CANCELLED_BY_USER");
        return apiFetch<T>(path, { method: "DELETE" });
      }
    );
  },
};
