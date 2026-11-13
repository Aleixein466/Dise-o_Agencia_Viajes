import { describe, expect, it } from "vitest";
import { readJsonLimited } from "./read-json-limited";

describe("readJsonLimited", () => {
  it("parses valid JSON", async () => {
    expect(await readJsonLimited(new Request("http://example.test", { method: "POST", body: '{"ok":true}' }))).toEqual({
      ok: true,
      value: { ok: true },
    });
  });
  it("rejects invalid UTF-8 and JSON", async () => {
    const invalidUtf8 = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    });
    expect(
      await readJsonLimited(
        new Request("http://example.test", { method: "POST", body: invalidUtf8, duplex: "half" } as RequestInit),
      ),
    ).toEqual({ ok: false, status: 400 });
    expect(await readJsonLimited(new Request("http://example.test", { method: "POST", body: "{" }))).toEqual({
      ok: false,
      status: 400,
    });
  });
  it("stops when the byte limit is exceeded", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(5));
      },
      cancel() {
        canceled = true;
      },
    });
    expect(
      await readJsonLimited(
        new Request("http://example.test", { method: "POST", body: stream, duplex: "half" } as RequestInit),
        4,
      ),
    ).toEqual({ ok: false, status: 413 });
    expect(canceled).toBe(true);
  });
});
