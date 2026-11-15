import type { ApiEnv } from "../config/env";
import { SandboxTestGateway, type PaymentGateway } from "./sandbox-gateway";
import { WompiSandboxGateway, type WompiFetch } from "./wompi-gateway";

/** Injection token for the active payment gateway (one per process, chosen by PAYMENT_ADAPTER). */
export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

/** "disabled" yields a SandboxTestGateway whose enabled() is false, so every payment route answers 404/503. */
export function createPaymentGateway(env: ApiEnv, fetchImpl?: WompiFetch): PaymentGateway {
  return env.PAYMENT_ADAPTER === "wompi_sandbox"
    ? WompiSandboxGateway.fromEnv(env, fetchImpl)
    : new SandboxTestGateway(env);
}
