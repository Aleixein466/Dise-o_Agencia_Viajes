"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCop } from "@/components/public/money";
import { portalPost } from "./portal-api";
import { PortalGate } from "./portal-gate";
import { paymentStatusLabel, portalErrorMessage } from "./portal-logic";
import { useResource } from "./use-resource";

type Checkout = { reference: string; amountCents: string; currency: string; status: string; reservationId: string };

function parseCheckout(data: unknown): Checkout | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<Checkout>;
  if (typeof raw.reference !== "string" || typeof raw.reservationId !== "string") return null;
  return raw as Checkout;
}

function CheckoutBody({ reference, csrfToken }: Readonly<{ reference: string; csrfToken: string }>) {
  const { state, reload } = useResource(`/payments/sandbox/${encodeURIComponent(reference)}`, parseCheckout);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  if (state.status === "loading") return <p role="status">Cargando pago…</p>;
  if (state.status === "error") {
    return (
      <p className="form-status error" role="alert">
        {portalErrorMessage(state.httpStatus, "No pudimos cargar este pago de prueba.")}
      </p>
    );
  }
  const checkout = state.data;
  const status = outcome ?? checkout.status;
  const done = outcome !== null || checkout.status !== "PENDING";

  async function decide(value: "APPROVED" | "DECLINED") {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await portalPost(
      `/payments/sandbox/${encodeURIComponent(reference)}/decision`,
      { outcome: value },
      csrfToken,
    );
    setPending(false);
    if (result.ok) {
      const next = (result.data as { status?: unknown } | null)?.status;
      setOutcome(typeof next === "string" ? next : value);
      reload();
    } else {
      setError(portalErrorMessage(result.status));
    }
  }

  return (
    <article className="portal-detail">
      <p className="portal-test-banner">Entorno de prueba — no se realiza ningún cobro</p>
      <h2 className="portal-title">Pago de prueba</h2>
      <dl className="portal-panel">
        <div>
          <dt>Referencia</dt>
          <dd>{checkout.reference}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{formatCop(checkout.amountCents) ?? "—"}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{paymentStatusLabel(status)}</dd>
        </div>
      </dl>
      <div aria-live="polite">
        {error ? (
          <p className="form-status error" role="alert">
            {error}
          </p>
        ) : null}
        {outcome ? <p className="form-status">Resultado del pago: {paymentStatusLabel(status)}.</p> : null}
      </div>
      {done ? null : (
        <div className="wz-nav">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void decide("APPROVED")}>
            Simular pago aprobado
          </button>
          <button type="button" className="portal-btn-quiet" disabled={pending} onClick={() => void decide("DECLINED")}>
            Simular pago rechazado
          </button>
        </div>
      )}
      <p>
        <Link href={`/mi-cuenta/reservas/${encodeURIComponent(checkout.reservationId)}`} className="wz-link">
          Volver a mi reserva
        </Link>
      </p>
    </article>
  );
}

export function SandboxCheckoutPage({ reference }: Readonly<{ reference: string }>) {
  return <PortalGate>{(session) => <CheckoutBody reference={reference} csrfToken={session.csrfToken} />}</PortalGate>;
}
