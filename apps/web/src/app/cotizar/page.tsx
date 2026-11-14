import type { Metadata } from "next";
import { TripWizard } from "@/components/public/trip-wizard";
export const metadata: Metadata = {
  title: "Prepara tu viaje",
  alternates: { canonical: "/cotizar" },
  robots: { index: false, follow: true },
};
export default function Cotizar() {
  return (
    <div className="shell form-page">
      <div className="form-intro wizard-intro">
        <span className="eyebrow">UNA IDEA PARA EL FUTURO</span>
        <h1>
          Empecemos por <em>imaginarlo.</em>
        </h1>
        <p>
          Elige un destino, un paquete y el tamaño de tu grupo. Si hay una tarifa aprobada verás un valor estimado; si
          no, un asesor confirmará el valor contigo.
        </p>
        <p>No se realizan reservas ni pagos desde esta página. Enviar una solicitud no garantiza cupos ni precios.</p>
      </div>
      <TripWizard />
    </div>
  );
}
