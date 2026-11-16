"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatCop } from "@/components/public/money";
import { installmentStatusLabel, normalizePlan, planStatusLabel } from "@/components/admin/finance/finance-logic";
import { formatDay, portalErrorMessage } from "./portal-logic";
import { useResource } from "./use-resource";

export function PortalSavingsDetail({ id }: Readonly<{ id: string }>) {
  const { state } = useResource(`/me/savings-plans/${encodeURIComponent(id)}`, normalizePlan);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = state.status === "ready";

  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);

  if (state.status === "loading") return <p role="status">Cargando plan de ahorro…</p>;
  if (state.status === "error") {
    return (
      <div>
        <p className="form-status error" role="alert">
          {portalErrorMessage(state.httpStatus, "No pudimos cargar este plan de ahorro.")}
        </p>
        <p>
          <Link href="/mi-cuenta" className="wz-link">
            Volver a mi cuenta
          </Link>
        </p>
      </div>
    );
  }

  const plan = state.data;
  const next = plan.nextDue;
  return (
    <div className="portal-dashboard">
      <p>
        <Link href="/mi-cuenta" className="wz-link">
          ← Volver a mi cuenta
        </Link>
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="portal-title">
        {plan.name}
      </h2>
      <p>
        <span className="portal-badge" data-status={plan.status}>
          {planStatusLabel(plan.status)}
        </span>
      </p>
      <section className="wz-summary portal-panel" aria-labelledby="savings-summary-title">
        <h3 id="savings-summary-title">Resumen del plan</h3>
        <dl className="portal-stats">
          <div>
            <dt>Meta</dt>
            <dd>{formatCop(plan.goalCents) ?? "—"}</dd>
          </div>
          <div>
            <dt>Pagado</dt>
            <dd>{formatCop(plan.paidCents) ?? "—"}</dd>
          </div>
          <div>
            <dt>Saldo</dt>
            <dd>{formatCop(plan.balanceCents) ?? "—"}</dd>
          </div>
          {next ? (
            <div>
              <dt>Próxima cuota</dt>
              <dd>
                {formatDay(next.dueOn) ?? "—"} · {formatCop(next.amountCents) ?? "—"}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
      <section aria-labelledby="savings-schedule-title" className="portal-panel">
        <h3 id="savings-schedule-title">Cronograma</h3>
        <div className="portal-table-wrap" role="region" aria-label="Cronograma de cuotas" tabIndex={0}>
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">Cuota</th>
                <th scope="col">Vence</th>
                <th scope="col">Valor</th>
                <th scope="col">Pagado</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {plan.installments.map((item) => (
                <tr key={item.sequence}>
                  <td>{item.sequence}</td>
                  <td>{formatDay(item.dueOn) ?? "—"}</td>
                  <td>{formatCop(item.amountCents) ?? "—"}</td>
                  <td>{formatCop(item.paidCents) ?? "—"}</td>
                  <td>{installmentStatusLabel(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="portal-meta">Para abonar comunícate con tu asesor</p>
        <p className="portal-meta">Los planes de ahorro no generan cobros automáticos.</p>
      </section>
    </div>
  );
}
