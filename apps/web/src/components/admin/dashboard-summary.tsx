"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/auth/client";

type Summary = {
  quotes?: { open: number; requiresReview: number };
  reservations?: { inProgress: number; pendingValidation: number };
  payments?: { abonosToApprove: number };
  pqrs?: { open: number; overdue: number };
};

type Card = { key: string; title: string; href: string; value: number; detail: string; alert: boolean };

export function dashboardCards(summary: Summary): Card[] {
  const cards: Card[] = [];
  if (summary.quotes)
    cards.push({
      key: "quotes",
      title: "Solicitudes abiertas",
      href: "/admin/solicitudes",
      value: summary.quotes.open,
      detail: `${summary.quotes.requiresReview} requieren revisión manual`,
      alert: summary.quotes.requiresReview > 0,
    });
  if (summary.reservations)
    cards.push({
      key: "reservations",
      title: "Reservas en curso",
      href: "/admin/reservas",
      value: summary.reservations.inProgress,
      detail: `${summary.reservations.pendingValidation} por validar`,
      alert: summary.reservations.pendingValidation > 0,
    });
  if (summary.payments)
    cards.push({
      key: "payments",
      title: "Abonos por aprobar",
      href: "/admin/finanzas",
      value: summary.payments.abonosToApprove,
      detail: "Comprobantes enviados por clientes",
      alert: summary.payments.abonosToApprove > 0,
    });
  if (summary.pqrs)
    cards.push({
      key: "pqrs",
      title: "PQRS abiertas",
      href: "/admin/pqrs",
      value: summary.pqrs.open,
      detail: `${summary.pqrs.overdue} vencidas`,
      alert: summary.pqrs.overdue > 0,
    });
  return cards;
}

export function DashboardSummary() {
  const [state, setState] = useState<{ status: "loading" | "error" | "ready"; cards: Card[] }>({
    status: "loading",
    cards: [],
  });

  useEffect(() => {
    let active = true;
    void requestJson("/api/v1/admin/dashboard", "GET").then((result) => {
      if (!active) return;
      setState(
        result.ok ? { status: "ready", cards: dashboardCards(result.data as Summary) } : { status: "error", cards: [] },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading")
    return (
      <p className="admin-hint" role="status">
        Cargando resumen…
      </p>
    );
  if (state.status === "error")
    return (
      <p className="admin-form-error" role="alert">
        No fue posible cargar el resumen. Recarga la página.
      </p>
    );
  if (state.cards.length === 0) return <p className="admin-empty">Tu rol no tiene indicadores asignados.</p>;
  return (
    <div className="admin-grid">
      {state.cards.map((card) => (
        <section key={card.key} className="admin-panel" aria-labelledby={`panel-${card.key}`}>
          <h2 id={`panel-${card.key}`}>{card.title}</h2>
          <p className="admin-stat">{card.value}</p>
          <p className={card.alert ? "admin-stat-detail admin-stat-alert" : "admin-stat-detail"}>{card.detail}</p>
          <Link href={card.href}>
            Abrir<span className="sr-only"> {card.title.toLowerCase()}</span>
          </Link>
        </section>
      ))}
    </div>
  );
}
