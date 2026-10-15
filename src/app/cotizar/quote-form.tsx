"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowUpRight, CalendarDays, Compass } from "lucide-react";

type Feedback = { ok: boolean; message: string; errors?: Record<string, string[]> };

function Form({ enabled }: { enabled: boolean }) {
  const params = useSearchParams();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const destination = params.get("destino") || "";
  const date = params.get("fecha") || "";
  const travelers = params.get("viajeros") || "2";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  if (!enabled) return <form className="form-panel planning-form" action="/destinos"><div className="planning-icon"><Compass size={27} /></div><span className="eyebrow">COTIZACIONES EN PREPARACIÓN</span><h2>Tu idea de viaje</h2><p>El canal para enviar datos personales está pendiente de la política de privacidad aprobada. Puedes explorar historias relacionadas con tus preferencias.</p><label className="field">Destino de interés<input name="q" defaultValue={destination} maxLength={120} placeholder="¿A dónde te gustaría ir?" /></label><div className="form-row"><label className="field">Fecha tentativa<input name="fecha" type="date" min={today} defaultValue={date} /></label><label className="field">Viajeros<input name="viajeros" type="number" min="1" max="30" defaultValue={travelers} /></label></div><div className="form-status" role="status"><CalendarDays size={17} /> No hay salidas, precios ni cupos confirmados en este momento.</div><button className="btn btn-primary" type="submit">Explorar experiencias <ArrowUpRight size={18} /></button></form>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as Feedback;
      setFeedback({ ok: response.ok, message: result.message || "No fue posible registrar tu solicitud.", errors: result.errors });
      if (response.ok) form.reset();
    } catch { setFeedback({ ok: false, message: "No se pudo conectar con el servidor. Intenta nuevamente." }); }
    finally { setLoading(false); }
  }

  const error = (name: string) => feedback?.errors?.[name]?.[0] ? <small className="field-error">{feedback.errors[name][0]}</small> : null;
  return <form className="form-panel" onSubmit={submit}><h2>Cuéntanos tu idea</h2><p>Los campos con * son obligatorios. Te responderemos por los datos de contacto que compartas.</p><div className="form-row"><label className="field">Nombre completo *<input name="name" required minLength={2} maxLength={120} autoComplete="name" aria-invalid={Boolean(error("name"))} />{error("name")}</label><label className="field">Correo electrónico *<input name="email" type="email" required maxLength={254} autoComplete="email" aria-invalid={Boolean(error("email"))} />{error("email")}</label></div><div className="form-row"><label className="field">WhatsApp *<input name="phone" type="tel" required minLength={7} maxLength={25} autoComplete="tel" aria-invalid={Boolean(error("phone"))} />{error("phone")}</label><label className="field">Destino de interés<input name="destination" defaultValue={destination} maxLength={120} />{error("destination")}</label></div><div className="form-row"><label className="field">Fecha tentativa<input name="travelDate" type="date" min={today} defaultValue={date} />{error("travelDate")}</label><label className="field">Viajeros *<input name="travelers" type="number" required min="1" max="30" defaultValue={travelers} />{error("travelers")}</label></div><label className="field">Presupuesto aproximado (opcional)<input name="budget" maxLength={80} placeholder="Prefiero conversarlo" /></label><label className="field">¿Cómo imaginas tu viaje?<textarea name="notes" maxLength={2000} placeholder="Cuéntanos qué te gustaría conocer o hacer" /></label><div className="honeypot" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label></div><label className="checkbox-field"><input name="dataConsent" type="checkbox" required value="true" /><span>Autorizo el tratamiento de mis datos para responder esta solicitud según la <a href="/privacidad">política de privacidad</a>. *</span></label><label className="checkbox-field"><input name="marketingConsent" type="checkbox" value="true" /><span>Deseo recibir novedades y ofertas de viaje. (Opcional)</span></label><button className="btn btn-primary" disabled={loading} type="submit">{loading ? "Enviando…" : "Enviar solicitud"} <ArrowUpRight size={18} /></button>{feedback && <p role="status" className={feedback.ok ? "form-status" : "form-status error"}>{feedback.message}</p>}</form>;
}

export function QuoteForm({ enabled }: { enabled: boolean }) { return <Suspense fallback={<div className="form-panel">Cargando formulario…</div>}><Form enabled={enabled} /></Suspense>; }
