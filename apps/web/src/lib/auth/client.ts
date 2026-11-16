export type ApiResult = { ok: boolean; status: number; data: unknown };

/** Fired on `window` after every content/settings write: `detail.ok` says whether the public site was refreshed. */
export const PUBLIC_REFRESH_EVENT = "public-content-refresh";
const REFRESH_RETRY_DELAYS_MS = [400, 1200];

/**
 * Public pages cache the published content; ask the web app to expire it after an admin change. Network errors and
 * 5xx answers are retried; a refusal (session, CSRF, permission) is final. Resolves true once the web app confirmed.
 */
async function refreshPublicContent(csrfToken?: string): Promise<boolean> {
  for (let attempt = 0; attempt <= REFRESH_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAYS_MS[attempt - 1]));
    try {
      const response = await fetch("/api/revalidate-content", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) return true;
      if (response.status < 500) return false;
    } catch {
      // Transport error: try again.
    }
  }
  return false;
}

export async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT",
  body?: unknown,
  csrfToken?: string,
): Promise<ApiResult> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok && method !== "GET" && /^\/api\/v1\/(content|settings)(\/|$|\?)/.test(path)) {
      const refreshed = await refreshPublicContent(csrfToken);
      // The write already succeeded; tell the editor when the public site could not be refreshed (admin shell alert).
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PUBLIC_REFRESH_EVENT, { detail: { ok: refreshed } }));
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** Browser helper: same-origin JSON POST to /api/v1. Never logs request bodies (passwords, codes). */
export async function postJson(path: string, body: unknown, csrfToken?: string): Promise<ApiResult> {
  return requestJson(path, "POST", body, csrfToken);
}

export async function fetchCsrfToken(): Promise<{ status: number; csrfToken?: string; mfaCompleted?: boolean }> {
  try {
    const response = await fetch("/api/v1/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { status: response.status };
    const data = (await response.json().catch(() => null)) as { csrfToken?: unknown; mfaCompleted?: unknown } | null;
    return {
      status: response.status,
      csrfToken: typeof data?.csrfToken === "string" ? data.csrfToken : undefined,
      mfaCompleted: data?.mfaCompleted === true,
    };
  } catch {
    return { status: 0 };
  }
}
