import { tmpdir } from "node:os";
import { join } from "node:path";

/** MFA-complete admin session saved by catalog-cartagena.spec.ts for later specs in the same isolated run. */
export const adminStatePath = join(tmpdir(), "ricaurte-e2e", "admin-state.json");
