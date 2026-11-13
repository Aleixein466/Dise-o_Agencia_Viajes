import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards against double-encoded UTF-8 (U+00C3 U+00A1 instead of U+00E1 "a acute"), which an agent once introduced.
const MOJIBAKE = /Ã[\u0080-¿]|Â[\u0080-¿]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return /\.(ts|tsx|css|md)$/.test(entry.name) ? [path] : [];
  });
}

describe("source encoding", () => {
  it("has no double-encoded UTF-8 in src", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) => MOJIBAKE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
