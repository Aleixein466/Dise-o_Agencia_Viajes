import type { Metadata } from "next";
import { PqrsIntakeForm, PqrsTrackForm } from "@/components/pqrs/pqrs-public";

export const metadata: Metadata = {
  title: "PQRS",
  alternates: { canonical: "/pqrs" },
  robots: { index: false, follow: true },
};

export default function PQRS() {
  return (
    <div className="shell simple-page">
      <span className="eyebrow">ATENCIÓN AL CLIENTE</span>
      <h1>PQRS</h1>
      <p>
        Radica una petición, queja, reclamo o sugerencia, o consulta el estado de una PQRS ya radicada con tu referencia
        y tu código de seguimiento.
      </p>
      <PqrsIntakeForm />
      <PqrsTrackForm />
    </div>
  );
}
