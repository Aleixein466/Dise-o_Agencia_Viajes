import { tmpdir } from "node:os";
import { join } from "node:path";

/** Per-instance directory set by scripts/run-cartagena-e2e.ps1 (-Instance ci uses its own). */
export const stateDir = process.env.E2E_STATE_DIR ?? join(tmpdir(), "ricaurte-e2e");

/** MFA-complete admin session saved by catalog-cartagena.spec.ts for later specs in the same isolated run. */
export const adminStatePath = join(stateDir, "admin-state.json");
/** MFA-complete session of the first FINANCE user (the abono registrar), saved by the same spec. */
export const financeStatePath = join(stateDir, "finance-state.json");
