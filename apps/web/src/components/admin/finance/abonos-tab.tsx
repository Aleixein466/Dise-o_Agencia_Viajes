"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import { hasPermission } from "@/lib/auth/nav";
import type { AdminSession } from "@/lib/auth/types";
import { abonoStatusLabel, apiMessage, canDecideAbono, pesosToPositiveCents, validateReason } from "./finance-logic";
import { API, NoticeLine, TargetFields, day, money, targetBody, today, type Notice } from "./finance-shared";

type Person = { id: string; name: string };
type Abono = {
  id: string;
  status: string;
  amountCents: string;
  method: string;
  bankReference: string | null;
  paidAt: string;
  target: { type: string; id: string; code: string };
  customerName: string | null;
  registeredBy: Person;
  approvedBy: Person | null;
  rejectionReason: string | null;
  createdAt: string;
};

const METHOD_LABELS: Record<string, string> = { BANK_TRANSFER: "Transferencia bancaria", CASH: "Efectivo" };

export function AbonosTab({ session, csrf }: Readonly<{ session: AdminSession; csrf: string }>) {
  const canRegister = hasPermission(session.permissions, "payments:register_abono");
  const canApprove = hasPermission(session.permissions, "payments:approve");
  const [items, setItems] = useState<Abono[] | null>(null);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [bankReference, setBankReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const result = await requestJson(`${API}/abonos?${params.toString()}`, "GET");
    if (result.ok) {
      const data = result.data as { items?: Abono[] } | Abono[] | null;
      setItems(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
      setLoadError(false);
    } else setLoadError(true);
  }, [status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function register(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const target = targetBody(reservationId, planId);
    const cents = pesosToPositiveCents(amount);
    if (!target)
      return setNotice({ kind: "error", text: "Indica el ID de la reserva o el del plan de ahorro, solo uno." });
    if (!cents) return setNotice({ kind: "error", text: "El valor debe ser en pesos, solo números." });
    if (method === "BANK_TRANSFER" && !bankReference.trim())
      return setNotice({ kind: "error", text: "La referencia bancaria es obligatoria en transferencias." });
    if (!paidAt || paidAt > today()) return setNotice({ kind: "error", text: "Indica la fecha del pago (no futura)." });
    if (!file) return setNotice({ kind: "error", text: "Adjunta el comprobante." });
    const form = new FormData();
    form.set("receipt", file);
    for (const [key, value] of Object.entries(target)) form.set(key, value);
    form.set("amountCents", cents);
    form.set("method", method);
    if (bankReference.trim()) form.set("bankReference", bankReference.trim());
    form.set("paidAt", paidAt);
    setPending(true);
    setNotice(null);
    let ok = false;
    let message = "No se pudo registrar el abono.";
    try {
      // No content-type header: the browser sets the multipart boundary.
      const response = await fetch(`${API}/abonos`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "x-csrf-token": csrf },
        body: form,
      });
      ok = response.ok;
      message = apiMessage(await response.json().catch(() => null), message);
    } catch {
      message = "No pudimos conectar con el servidor.";
    }
    setPending(false);
    if (ok) {
      setNotice({ kind: "ok", text: "Abono registrado. Queda pendiente de aprobación." });
      setReservationId("");
      setPlanId("");
      setAmount("");
      setBankReference("");
      setPaidAt("");
      setFile(null);
      setFileKey((value) => value + 1);
      await load();
    } else setNotice({ kind: "error", text: message });
  }

  async function decide(id: string, action: "approve" | "reject") {
    if (pending) return;
    if (action === "reject") {
      const problem = validateReason(rejectReason, 3);
      if (problem) return setNotice({ kind: "error", text: problem });
    }
    setPending(true);
    setNotice(null);
    const result = await requestJson(
      `${API}/abonos/${id}/${action}`,
      "POST",
      action === "reject" ? { reason: rejectReason.trim() } : {},
      csrf,
    );
    setPending(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: action === "approve" ? "Abono aprobado." : "Abono rechazado." });
      setRejecting(null);
      setRejectReason("");
    } else setNotice({ kind: "error", text: apiMessage(result.data, "No se pudo completar la acción.") });
    await load();
  }

  return (
    <div className="admin-users">
      <NoticeLine notice={notice} />
      {canRegister ? (
        <section className="admin-panel" aria-labelledby="abono-form-title">
          <h2 id="abono-form-title">Registrar abono</h2>
          <form className="admin-form" onSubmit={register} noValidate>
            <TargetFields
              reservationId={reservationId}
              planId={planId}
              onReservation={setReservationId}
              onPlan={setPlanId}
            />
            <label className="admin-field">
              Valor (COP)
              <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="admin-field">
              Método
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="BANK_TRANSFER">Transferencia bancaria</option>
                <option value="CASH">Efectivo</option>
              </select>
            </label>
            <label className="admin-field">
              Referencia bancaria
              <input
                value={bankReference}
                maxLength={120}
                onChange={(event) => setBankReference(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="admin-field">
              Fecha del pago
              <input type="date" value={paidAt} max={today()} onChange={(event) => setPaidAt(event.target.value)} />
            </label>
            <label className="admin-field">
              Comprobante
              <input
                key={fileKey}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="admin-hint">PDF, JPG, PNG o WebP de hasta 5 MB.</p>
            <button className="admin-btn admin-btn-primary" type="submit" disabled={pending}>
              Registrar abono
            </button>
          </form>
        </section>
      ) : null}

      <section className="admin-panel" aria-labelledby="abono-list-title">
        <h2 id="abono-list-title">Abonos registrados</h2>
        <label className="admin-field">
          Estado
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            <option value="SUBMITTED">{abonoStatusLabel("SUBMITTED")}</option>
            <option value="APPROVED">{abonoStatusLabel("APPROVED")}</option>
            <option value="REJECTED">{abonoStatusLabel("REJECTED")}</option>
          </select>
        </label>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            No se pudo cargar la lista de abonos.
          </p>
        ) : null}
        {items && items.length === 0 ? <p className="admin-empty">No hay abonos para este filtro.</p> : null}
        {items && items.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Destino</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Fecha del pago</th>
                  <th>Estado</th>
                  <th>Registrado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((abono) => {
                  const own = !canDecideAbono(abono.registeredBy.id, session.user.id);
                  return (
                    <tr key={abono.id}>
                      <td>
                        {abono.target.type === "SAVINGS_PLAN" ? "Plan " : "Reserva "}
                        {abono.target.code}
                      </td>
                      <td>{abono.customerName ?? "—"}</td>
                      <td>{money(abono.amountCents)}</td>
                      <td>
                        {METHOD_LABELS[abono.method] ?? abono.method}
                        {abono.bankReference ? ` · ${abono.bankReference}` : ""}
                      </td>
                      <td>{day(abono.paidAt)}</td>
                      <td>
                        <span className="admin-role">{abonoStatusLabel(abono.status)}</span>
                        {abono.rejectionReason ? <p className="admin-hint">{abono.rejectionReason}</p> : null}
                      </td>
                      <td>{abono.registeredBy.name}</td>
                      <td>
                        <a
                          className="admin-link-button"
                          href={`${API}/abonos/${abono.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver comprobante
                        </a>
                        {abono.status === "SUBMITTED" && canApprove ? (
                          own ? (
                            <p className="admin-hint">Registrado por ti: otra persona de Finanzas debe aprobarlo</p>
                          ) : rejecting === abono.id ? (
                            <div>
                              <label className="admin-field">
                                Motivo del rechazo
                                <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
                              </label>
                              <button
                                type="button"
                                className="admin-btn admin-btn-primary"
                                disabled={pending}
                                onClick={() => void decide(abono.id, "reject")}
                              >
                                Rechazar abono
                              </button>{" "}
                              <button
                                type="button"
                                className="admin-btn admin-btn-quiet"
                                onClick={() => setRejecting(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div>
                              <button
                                type="button"
                                className="admin-btn admin-btn-primary"
                                disabled={pending}
                                onClick={() => void decide(abono.id, "approve")}
                              >
                                Aprobar abono
                              </button>{" "}
                              <button
                                type="button"
                                className="admin-btn admin-btn-quiet"
                                onClick={() => {
                                  setRejecting(abono.id);
                                  setRejectReason("");
                                }}
                              >
                                Rechazar abono
                              </button>
                            </div>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
