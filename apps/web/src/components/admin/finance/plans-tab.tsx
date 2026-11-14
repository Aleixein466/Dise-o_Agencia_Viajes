"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import { hasPermission } from "@/lib/auth/nav";
import type { AdminSession } from "@/lib/auth/types";
import {
  apiMessage,
  installmentStatusLabel,
  normalizePlan,
  pesosToPositiveCents,
  planStatusLabel,
  validateInstallments,
  validateReason,
  type InstallmentRow,
  type PlanView,
  customerRef,
} from "./finance-logic";
import { API, NoticeLine, day, money, type Notice } from "./finance-shared";

function PlanSchedule({ plan }: Readonly<{ plan: PlanView }>) {
  return (
    <>
      <p>
        Meta {money(plan.goalCents)} · Pagado {money(plan.paidCents)} · Saldo {money(plan.balanceCents)}
        {plan.nextDue ? ` · Próxima cuota: ${day(plan.nextDue.dueOn)} (${money(plan.nextDue.amountCents)})` : ""}
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cuota</th>
              <th>Vence</th>
              <th>Valor</th>
              <th>Pagado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {plan.installments.map((item) => (
              <tr key={item.sequence}>
                <td>{item.sequence}</td>
                <td>{day(item.dueOn)}</td>
                <td>{money(item.amountCents)}</td>
                <td>{money(item.paidCents)}</td>
                <td>{installmentStatusLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PlansTab({ session, csrf }: Readonly<{ session: AdminSession; csrf: string }>) {
  const canWrite = hasPermission(session.permissions, "payments:approve");
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [filterCustomer, setFilterCustomer] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const [detail, setDetail] = useState<PlanView | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [rows, setRows] = useState<InstallmentRow[]>([{ dueOn: "", amount: "" }]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCustomer.trim()) params.set("customerId", filterCustomer.trim());
    const result = await requestJson(`${API}/savings-plans?${params.toString()}`, "GET");
    if (result.ok) {
      const data = result.data as { items?: unknown[] } | unknown[] | null;
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setPlans(list.map(normalizePlan).filter((plan): plan is PlanView => plan !== null));
      setLoadError(false);
    } else setLoadError(true);
  }, [filterCustomer]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function open(id: string) {
    setNotice(null);
    setCancelReason("");
    const result = await requestJson(`${API}/savings-plans/${id}`, "GET");
    const plan = result.ok ? normalizePlan(result.data) : null;
    if (plan) setDetail(plan);
    else setNotice({ kind: "error", text: "No se pudo cargar el plan." });
  }

  function updateRow(index: number, patch: Partial<InstallmentRow>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!customerId.trim() || !name.trim())
      return setNotice({ kind: "error", text: "Indica el cliente y el nombre del plan." });
    const problem = validateInstallments(rows, goal);
    if (problem) return setNotice({ kind: "error", text: problem });
    setPending(true);
    setNotice(null);
    const result = await requestJson(
      `${API}/savings-plans`,
      "POST",
      {
        ...customerRef(customerId),
        name: name.trim(),
        goalCents: pesosToPositiveCents(goal),
        installments: rows.map((row) => ({ dueOn: row.dueOn, amountCents: pesosToPositiveCents(row.amount) })),
      },
      csrf,
    );
    setPending(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: "Plan de ahorro creado." });
      setCustomerId("");
      setName("");
      setGoal("");
      setRows([{ dueOn: "", amount: "" }]);
      await load();
    } else setNotice({ kind: "error", text: apiMessage(result.data, "No se pudo crear el plan.") });
  }

  async function cancel() {
    if (!detail || pending) return;
    const problem = validateReason(cancelReason, 10);
    if (problem) return setNotice({ kind: "error", text: problem });
    setPending(true);
    const result = await requestJson(
      `${API}/savings-plans/${detail.id}/cancel`,
      "POST",
      { reason: cancelReason.trim() },
      csrf,
    );
    setPending(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: "Plan cancelado. El dinero recibido queda en el libro para su devolución." });
      setCancelReason("");
      await Promise.all([open(detail.id), load()]);
    } else setNotice({ kind: "error", text: apiMessage(result.data, "No se pudo cancelar el plan.") });
  }

  return (
    <div className="admin-users">
      <NoticeLine notice={notice} />
      <p className="admin-hint">Los planes de ahorro no generan cobros automáticos.</p>
      {canWrite ? (
        <section className="admin-panel" aria-labelledby="plan-form-title">
          <h2 id="plan-form-title">Crear plan de ahorro</h2>
          <form className="admin-form" onSubmit={create} noValidate>
            <label className="admin-field">
              Correo del cliente
              <input
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                autoComplete="off"
                inputMode="email"
              />
            </label>
            <label className="admin-field">
              Nombre del plan
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="admin-field">
              Meta (COP)
              <input inputMode="numeric" value={goal} onChange={(event) => setGoal(event.target.value)} />
            </label>
            {rows.map((row, index) => (
              <fieldset key={index} className="admin-role-field">
                <legend>Cuota {index + 1}</legend>
                <label className="admin-field">
                  Fecha de la cuota {index + 1}
                  <input
                    type="date"
                    value={row.dueOn}
                    onChange={(event) => updateRow(index, { dueOn: event.target.value })}
                  />
                </label>
                <label className="admin-field">
                  Valor de la cuota {index + 1} (COP)
                  <input
                    inputMode="numeric"
                    value={row.amount}
                    onChange={(event) => updateRow(index, { amount: event.target.value })}
                  />
                </label>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-quiet"
                    onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
                  >
                    Quitar cuota<span className="sr-only"> {index + 1}</span>
                  </button>
                ) : null}
              </fieldset>
            ))}
            <div>
              <button
                type="button"
                className="admin-btn admin-btn-quiet"
                disabled={rows.length >= 60}
                onClick={() => setRows((current) => [...current, { dueOn: "", amount: "" }])}
              >
                Agregar cuota
              </button>
            </div>
            <button className="admin-btn admin-btn-primary" type="submit" disabled={pending}>
              Crear plan de ahorro
            </button>
          </form>
        </section>
      ) : null}

      <section className="admin-panel" aria-labelledby="plan-list-title">
        <h2 id="plan-list-title">Planes de ahorro</h2>
        <label className="admin-field">
          Filtrar por cliente
          <input type="search" value={filterCustomer} onChange={(event) => setFilterCustomer(event.target.value)} />
        </label>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            No se pudo cargar la lista de planes.
          </p>
        ) : null}
        {plans && plans.length === 0 ? <p className="admin-empty">No hay planes de ahorro.</p> : null}
        {plans && plans.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Meta</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        aria-label={`Ver plan ${plan.name}`}
                        onClick={() => void open(plan.id)}
                      >
                        {plan.name}
                      </button>
                    </td>
                    <td>{planStatusLabel(plan.status)}</td>
                    <td>{money(plan.goalCents)}</td>
                    <td>{money(plan.paidCents)}</td>
                    <td>{money(plan.balanceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {detail ? (
        <section className="admin-panel" aria-labelledby="plan-detail-title">
          <h2 id="plan-detail-title">
            {detail.name} · {planStatusLabel(detail.status)}
          </h2>
          <p className="admin-hint">ID del plan de ahorro: {detail.id}</p>
          <PlanSchedule plan={detail} />
          {canWrite && detail.status === "ACTIVE" ? (
            <div>
              <label className="admin-field">
                Motivo de la cancelación
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={2} />
              </label>
              <button
                type="button"
                className="admin-btn admin-btn-quiet"
                disabled={pending}
                onClick={() => void cancel()}
              >
                Cancelar plan
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
