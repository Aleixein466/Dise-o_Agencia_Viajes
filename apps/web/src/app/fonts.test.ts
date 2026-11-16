import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The brand fonts must stay self-hosted: a build or a dev server that depends on fonts.gstatic.com fails (or silently
// falls back to Arial) whenever Google is unreachable. Provenance and limits live in ./fonts/README.md.
const srcDir = fileURLToPath(new URL("..", import.meta.url));
const fontsDir = fileURLToPath(new URL("./fonts/", import.meta.url));
const read = (file: string) => readFileSync(file, "utf8");
const woff2Files = readdirSync(fontsDir)
  .filter((name) => name.endsWith(".woff2"))
  .sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("brand fonts are self-hosted", () => {
  it("no source file loads Google Fonts", () => {
    const offenders = sourceFiles(srcDir).filter((file) =>
      /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(read(file)),
    );
    expect(offenders.map((file) => relative(srcDir, file))).toEqual([]);
  });

  it("ships the three variable WOFF2 files", () => {
    expect(woff2Files).toEqual([
      "dm-sans-latin-wght-normal.woff2",
      "playfair-display-latin-wght-italic.woff2",
      "playfair-display-latin-wght-normal.woff2",
    ]);
    for (const name of woff2Files) {
      const bytes = readFileSync(join(fontsDir, name));
      expect(bytes.subarray(0, 4).toString("latin1"), `${name} signature`).toBe("wOF2");
      expect(bytes.length, `${name} size`).toBeGreaterThan(20_000);
    }
  });

  it("documents the SHA-256 of every file and keeps the licence texts", () => {
    const readme = read(join(fontsDir, "README.md"));
    for (const name of woff2Files) {
      const digest = createHash("sha256")
        .update(readFileSync(join(fontsDir, name)))
        .digest("hex");
      expect(readme, `${name} hash in README`).toContain(digest);
    }
    for (const licence of ["OFL-DM-Sans.txt", "OFL-Playfair-Display.txt"]) {
      expect(read(join(fontsDir, licence)), licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("the root layout loads exactly those files with next/font/local", () => {
    const layout = read(join(srcDir, "app", "layout.tsx"));
    expect(layout).toContain('from "next/font/local"');
    const referenced = [...layout.matchAll(/"\.\/fonts\/([^"]+\.woff2)"/g)].map((match) => match[1]);
    expect([...new Set(referenced)].sort()).toEqual(woff2Files);
  });
});
