"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowUpRight } from "lucide-react";

function Form({ enabled }: { enabled: boolean }) {
  const params = useSearchParams();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setStatus(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json(); setStatus({ ok: response.ok, message: result.message || "No fue posible registrar tu solicitud." }); if (response.ok) e.currentTarget.reset(); }
    catch { setStatus({ ok: false, message: "No se pudo conectar con el servidor. Intenta nuevamente." }); }
    finally { setLoading(false); }
  }
  return <form className="form-panel" onSubmit={submit}><h2>Cuéntanos tu idea</h2><p>Los campos con * son obligatorios. La información se usará solo para responder esta solicitud.</p>{!enabled && <p className="form-status error" role="status">Recepción de cotizaciones pendiente de activación. Puedes explorar el formulario, pero todavía no enviarlo.</p>}<div className="form-row"><label className="field">Nombre completo *<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label><label className="field">Correo electrónico *<input name="email" type="email" required maxLength={254} autoComplete="email" /></label></div><div className="form-row"><label className="field">WhatsApp *<input name="phone" type="tel" required minLength={7} maxLength={25} autoComplete="tel" /></label><label className="field">Destino de interés<input name="destination" defaultValue={params.get("destino") || ""} maxLength={120} /></label></div><div className="form-row"><label className="field">Fecha tentativa<input name="travelDate" type="date" defaultValue={params.get("fecha") || ""} /></label><label className="field">Viajeros *<input name="travelers" type="number" required min={1} max={30} defaultValue={params.get("viajeros") || "2"} /></label></div><label className="field">Presupuesto aproximado (opcional)<input name="budget" maxLength={80} placeholder="Ej. Prefiero conversarlo" /></label><label className="field">¿Cómo imaginas tu viaje?<textarea name="notes" maxLength={2000} placeholder="Cuéntanos qué te gustaría conocer o hacer" /></label><label className="checkbox-field"><input name="dataConsent" type="checkbox" required value="true" /><span>Autorizo el tratamiento de mis datos para responder esta solicitud, según la <a href="/privacidad" style={{textDecoration:"underline"}}>política de privacidad</a>. *</span></label><label className="checkbox-field"><input name="marketingConsent" type="checkbox" value="true" /><span>Deseo recibir novedades y ofertas de viaje. (Opcional)</span></label><button className="btn btn-lime" disabled={!enabled || loading} type="submit">{loading ? "Enviando…" : enabled ? "Enviar solicitud" : "Envío pendiente de activación"} <ArrowUpRight size={18} /></button>{status && <p role="status" className={status.ok ? "form-status" : "form-status error"}>{status.message}</p>}</form>;
}
export function QuoteForm({ enabled }: { enabled: boolean }) { return <Suspense fallback={<div className="form-panel">Cargando formulario…</div>}><Form enabled={enabled} /></Suspense>; }
