import { build } from "esbuild";

// Bundles the app plus the workspace packages (which ship TypeScript source) into one ESM file.
// Every other bare import stays external and is resolved from this package's node_modules at runtime.
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "externalize-registry-packages",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@ricaurte/") || args.path.startsWith("node:")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
