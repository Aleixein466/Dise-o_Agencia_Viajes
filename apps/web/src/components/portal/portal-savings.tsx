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
          Volver a mi cuenta
        </Link>
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="portal-title">
        {plan.name}
      </h2>
      <p className="portal-meta">Estado: {planStatusLabel(plan.status)}</p>
      <p className="portal-meta">
        Meta: {formatCop(plan.goalCents) ?? "—"} · Pagado: {formatCop(plan.paidCents) ?? "—"} · Saldo:{" "}
        {formatCop(plan.balanceCents) ?? "—"}
      </p>
      {next ? (
        <p className="portal-meta">
          Próxima cuota: {formatDay(next.dueOn) ?? "—"} · {formatCop(next.amountCents) ?? "—"}
        </p>
      ) : null}
      <section aria-labelledby="savings-schedule-title" className="portal-section">
        <h3 id="savings-schedule-title">Cronograma</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left" }}>
                  Cuota
                </th>
                <th scope="col" style={{ textAlign: "left" }}>
                  Vence
                </th>
                <th scope="col" style={{ textAlign: "left" }}>
                  Valor
                </th>
                <th scope="col" style={{ textAlign: "left" }}>
                  Pagado
                </th>
                <th scope="col" style={{ textAlign: "left" }}>
                  Estado
                </th>
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
