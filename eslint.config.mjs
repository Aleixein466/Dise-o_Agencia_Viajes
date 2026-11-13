import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Shared by every workspace except apps/web, which keeps its own Next.js config.
export default defineConfig([
  ...tseslint.configs.recommended,
  globalIgnores(["**/dist/**", "**/coverage/**", "**/src/generated/**", "**/.next/**", ".claude/**"]),
]);
