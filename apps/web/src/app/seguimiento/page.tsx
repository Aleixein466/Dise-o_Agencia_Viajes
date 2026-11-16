import type { Metadata } from "next";
import { TrackForm } from "@/components/public/track-form";

export const metadata: Metadata = {
  title: "Seguimiento de solicitud",
  alternates: { canonical: "/seguimiento" },
  robots: { index: false, follow: true },
};

export default function Seguimiento() {
  return (
    <div className="shell form-page">
      <div className="form-intro wizard-intro">
        <span className="eyebrow">SEGUIMIENTO</span>
        <h1>
          ¿Cómo va tu <em>solicitud?</em>
        </h1>
        <p>Consulta el estado con tu referencia y tu código de seguimiento. No mostramos datos personales.</p>
      </div>
      <TrackForm />
    </div>
  );
}
