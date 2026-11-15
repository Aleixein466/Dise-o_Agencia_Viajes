import { describe, expect, it } from "vitest";
import {
  actorLabel,
  auditErrorMessage,
  buildAuditQuery,
  diffEntries,
  EMPTY_FILTERS,
  hasContent,
  prettyJson,
  validateFilters,
} from "./helpers";

describe("validateFilters", () => {
  it("accepts empty filters and valid values", () => {
    expect(validateFilters(EMPTY_FILTERS)).toEqual({});
    expect(
      validateFilters({
        ...EMPTY_FILTERS,
        actorId: "00000000-0000-4000-8000-000000000001",
        from: "2026-11-01",
        to: "2026-11-14",
      }),
    ).toEqual({});
  });
  it("flags a bad uuid, impossible dates and an inverted range", () => {
    expect(validateFilters({ ...EMPTY_FILTERS, actorId: "abc" }).actorId).toBeTruthy();
    expect(validateFilters({ ...EMPTY_FILTERS, from: "2026-02-31" }).from).toBeTruthy();
    expect(validateFilters({ ...EMPTY_FILTERS, from: "2026-11-14", to: "2026-11-01" }).to).toBeTruthy();
  });
});

describe("buildAuditQuery", () => {
  it("sends only filled filters, trimmed, with paging", () => {
    const query = new URLSearchParams(buildAuditQuery({ ...EMPTY_FILTERS, entity: "price_rule", entityId: " x " }, 3));
    expect(Object.fromEntries(query)).toEqual({ page: "3", pageSize: "20", entity: "price_rule", entityId: "x" });
  });
});

describe("diffEntries", () => {
  it("marks changed, added and removed keys and keeps unchanged ones", () => {
    const entries = diffEntries({ a: 1, b: "x", c: { n: 1 } }, { a: 2, b: "x", c: { n: 1 }, d: true });
    const byKey = Object.fromEntries(entries.map((entry) => [entry.key, entry]));
    expect(byKey.a?.changed).toBe(true);
    expect(byKey.b?.changed).toBe(false);
    expect(byKey.c?.changed).toBe(false);
    expect(byKey.d).toMatchObject({ changed: true, hasBefore: false, hasAfter: true });
  });
  it("handles a missing side and redacted values as-is", () => {
    expect(diffEntries(null, { email: "[oculto]" })).toEqual([
      { key: "email", before: undefined, after: "[oculto]", hasBefore: false, hasAfter: true, changed: true },
    ]);
    expect(diffEntries(null, null)).toEqual([]);
  });
});

describe("misc", () => {
  it("pretty prints JSON and detects empty snapshots", () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson(undefined)).toBe("—");
    expect(hasContent(null)).toBe(false);
    expect(hasContent({})).toBe(false);
    expect(hasContent({ a: 1 })).toBe(true);
  });
  it("labels actors and errors in Spanish", () => {
    expect(actorLabel({ actor: { id: "1", name: "Ana" }, actorRole: "ADMIN" })).toBe("Ana");
    expect(actorLabel({ actor: null, actorRole: "SYSTEM" })).toBe("Sistema");
    expect(actorLabel({ actor: null, actorRole: null })).toBe("Sin actor");
    expect(auditErrorMessage(403)).toMatch(/permiso/);
    expect(auditErrorMessage(0)).toMatch(/conexión/);
  });
});
