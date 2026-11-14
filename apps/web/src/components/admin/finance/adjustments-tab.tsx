"use client";

import { useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import { apiMessage, signedPesosToCents, validateReason } from "./finance-logic";
import { API, NoticeLine, TargetFields, targetBody, type Notice } from "./finance-shared";

export function AdjustmentsTab({ csrf }: Readonly<{ csrf: string }>) {
  const [reservationId, setReservationId] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const target = targetBody(reservationId, planId);
    const cents = signedPesosToCents(amount);
    if (!target)
      return setNotice({ kind: "error", text: "Indica el ID de la reserva o el del plan de ahorro, solo uno." });
    if (!cents) return setNotice({ kind: "error", text: "El ajuste debe ser un valor en pesos distinto de cero." });
    const problem = validateReason(reason, 10);
    if (problem) return setNotice({ kind: "error", text: problem });
    setPending(true);
    setNotice(null);
    const result = await requestJson(
      `${API}/adjustments`,
      "POST",
      { ...target, amountCents: cents, reason: reason.trim() },
      csrf,
    );
    setPending(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: "Ajuste registrado." });
      setAmount("");
      setReason("");
    } else setNotice({ kind: "error", text: apiMessage(result.data, "No se pudo registrar el ajuste.") });
  }

  return (
    <section className="admin-panel" aria-labelledby="adj-title">
      <h2 id="adj-title">Ajustes</h2>
      <NoticeLine notice={notice} />
      <form className="admin-form" onSubmit={submit} noValidate>
        <TargetFields
          reservationId={reservationId}
          planId={planId}
          onReservation={setReservationId}
          onPlan={setPlanId}
        />
        <label className="admin-field">
          Valor del ajuste (COP, negativo para restar)
          <input value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="admin-field">
          Motivo del ajuste
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
        </label>
        <button className="admin-btn admin-btn-primary" type="submit" disabled={pending}>
          Registrar ajuste
        </button>
      </form>
    </section>
  );
}
