import { describe, expect, it } from "vitest";
import {
  abonoStatusLabel,
  canDecideAbono,
  installmentStatusLabel,
  signedPesosToCents,
  validateInstallments,
} from "./finance-logic";

describe("finance logic", () => {
  it("labels statuses", () => {
    expect(abonoStatusLabel("SUBMITTED")).toBe("Pendiente de aprobación");
    expect(abonoStatusLabel("REJECTED")).toBe("Rechazado");
    expect(installmentStatusLabel("OVERDUE")).toBe("Vencida");
    expect(installmentStatusLabel("PARTIAL")).toBe("Parcial");
  });
  it("converts signed pesos", () => {
    expect(signedPesosToCents("-50.000")).toBe("-5000000");
    expect(signedPesosToCents("1000")).toBe("100000");
    expect(signedPesosToCents("0")).toBeNull();
    expect(signedPesosToCents("-0")).toBeNull();
    expect(signedPesosToCents("12x5")).toBeNull();
    expect(signedPesosToCents("abc")).toBeNull();
  });
  it("checks the installment sum", () => {
    const rows = [
      { dueOn: "2027-01-01", amount: "400000" },
      { dueOn: "2027-02-01", amount: "600000" },
    ];
    expect(validateInstallments(rows, "1.000.000")).toBeNull();
    expect(validateInstallments(rows, "900000")).toMatch(/suma/);
    expect(validateInstallments([rows[1]!, rows[0]!], "1000000")).toMatch(/orden/);
    expect(validateInstallments([{ dueOn: "", amount: "1" }], "1")).toMatch(/fecha/);
  });
  it("blocks the registrar from deciding", () => {
    expect(canDecideAbono("u1", "u1")).toBe(false);
    expect(canDecideAbono("u1", "u2")).toBe(true);
  });
});
