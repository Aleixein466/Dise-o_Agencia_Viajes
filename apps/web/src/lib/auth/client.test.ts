import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";

const reply = (status: number) => new Response("{}", { status });
const REFRESH = "/api/revalidate-content";

let fetchMock: ReturnType<typeof vi.fn>;
let refreshed: boolean[];

beforeEach(() => {
  vi.useFakeTimers();
  refreshed = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    dispatchEvent: (event: Event) => {
      refreshed.push((event as CustomEvent<{ ok: boolean }>).detail.ok);
      return true;
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function save(path = "/api/v1/content/faq", method: "GET" | "POST" = "POST") {
  const pending = requestJson(path, method, method === "GET" ? undefined : { a: 1 }, "csrf");
  await vi.runAllTimersAsync();
  return pending;
}
const refreshCalls = () => fetchMock.mock.calls.filter(([url]) => url === REFRESH).length;

describe("public content refresh after an admin write", () => {
  it("asks the web app to refresh once and reports success", async () => {
    fetchMock.mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
    expect((await save()).ok).toBe(true);
    expect(refreshCalls()).toBe(1);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", headers: { "x-csrf-token": "csrf" } });
    expect(refreshed).toEqual([true]);
  });

  it("retries a 5xx or a network error and reports success once confirmed", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200))
      .mockResolvedValueOnce(reply(503))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(reply(200));
    expect((await save("/api/v1/settings/agency")).ok).toBe(true);
    expect(refreshCalls()).toBe(3);
    expect(refreshed).toEqual([true]);
  });

  it("gives up after repeated 5xx answers and tells the editor", async () => {
    fetchMock.mockResolvedValueOnce(reply(200)).mockResolvedValue(reply(503));
    expect((await save()).ok).toBe(true);
    expect(refreshCalls()).toBe(3);
    expect(refreshed).toEqual([false]);
  });

  it("does not retry a refusal (session, CSRF, permission)", async () => {
    fetchMock.mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(403));
    await save();
    expect(refreshCalls()).toBe(1);
    expect(refreshed).toEqual([false]);
  });

  it("stays silent for reads, other modules and failed writes", async () => {
    fetchMock.mockResolvedValue(reply(200));
    await save("/api/v1/content/faq", "GET");
    await save("/api/v1/quotes");
    fetchMock.mockResolvedValue(reply(409));
    await save("/api/v1/content/faq");
    expect(refreshCalls()).toBe(0);
    expect(refreshed).toEqual([]);
  });
});
