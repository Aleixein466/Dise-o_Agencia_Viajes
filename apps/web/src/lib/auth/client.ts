export type ApiResult = { ok: boolean; status: number; data: unknown };

/** Browser helper: same-origin JSON POST to /api/v1. Never logs request bodies (passwords, codes). */
export async function postJson(path: string, body: unknown, csrfToken?: string): Promise<ApiResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
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
