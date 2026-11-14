"use client";

import { PortalDashboard } from "./portal-dashboard";
import { PortalGate } from "./portal-gate";
import { PortalQuoteDetail } from "./portal-quote-detail";
import { PortalReservationDetail } from "./portal-reservation-detail";
import { PortalSavingsDetail } from "./portal-savings";

export function PortalHomePage() {
  return <PortalGate>{() => <PortalDashboard />}</PortalGate>;
}

export function PortalQuotePage({ id }: Readonly<{ id: string }>) {
  return <PortalGate>{(session) => <PortalQuoteDetail id={id} csrfToken={session.csrfToken} />}</PortalGate>;
}

export function PortalReservationPage({ id }: Readonly<{ id: string }>) {
  return <PortalGate>{(session) => <PortalReservationDetail id={id} csrfToken={session.csrfToken} />}</PortalGate>;
}

export function PortalSavingsPage({ id }: Readonly<{ id: string }>) {
  return <PortalGate>{() => <PortalSavingsDetail id={id} />}</PortalGate>;
}
