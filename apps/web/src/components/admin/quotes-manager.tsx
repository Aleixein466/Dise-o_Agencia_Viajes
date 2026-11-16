"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";

type Package = { id: string; title: string; destination: { name: string } };
type Options = {
  title: string;
  durationDays: number | null;
  components: Array<{
    type: string;
    included: boolean;
    hotel: { id: string; name: string } | null;
    tour: { id: string; name: string } | null;
    addOn: { id: string; name: string } | null;
  }>;
  priceRules: Array<{ id: string; name: string; amountCents: string; unit: string }>;
};
type Preview = {
  state: "CALCULATED" | "REQUIRES_MANUAL_REVIEW";
  totalCents: string | null;
  reasons: string[];
  lines: Array<{ description: string; quantity: number; totalCents: string }>;
};
const cop = (value: string) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(BigInt(value) / BigInt(100)),
  );

export function QuotesManager({ session }: Readonly<{ session: AdminSession }>) {
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [packages, setPackages] = useState<Package[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [packageId, setPackageId] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [priceRuleId, setPriceRuleId] = useState("");
  const [adults, setAdults] = useState(1);
  const [childAges, setChildAges] = useState("");
  const [optionalTourIds, setOptionalTourIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [quotes, setQuotes] = useState<
    Array<{
      id: string;
      reference: string;
      status: string;
      totalCents: string | null;
      package: { title: string } | null;
    }>
  >([]);

  const load = useCallback(async () => {
    const [catalog, saved] = await Promise.all([
      requestJson("/api/v1/catalog/packages?pageSize=50", "GET"),
      requestJson("/api/v1/quotes?pageSize=20", "GET"),
    ]);
    if (
      catalog.ok &&
      typeof catalog.data === "object" &&
      catalog.data &&
      Array.isArray((catalog.data as { items?: unknown }).items)
    )
      setPackages((catalog.data as { items: Package[] }).items);
    if (
      saved.ok &&
      typeof saved.data === "object" &&
      saved.data &&
      Array.isArray((saved.data as { items?: unknown }).items)
    )
      setQuotes((saved.data as { items: typeof quotes }).items);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const selection = () => ({
    packageId,
    hotelId: hotelId || undefined,
    priceRuleId: priceRuleId || undefined,
    adults,
    childAges: childAges.trim() ? childAges.split(",").map((value) => Number(value.trim())) : [],
    optionalTourIds,
    addOnIds: [],
  });
  async function choosePackage(id: string) {
    setPackageId(id);
    setOptions(null);
    setHotelId("");
    setPriceRuleId("");
    setOptionalTourIds([]);
    setPreview(null);
    if (!id) return;
    const result = await requestJson(`/api/v1/quotes/catalog/${id}`, "GET");
    if (result.ok) {
      setOptions(result.data as Options);
      setStep(2);
    } else setMessage("No se pudo cargar la configuración autorizada del paquete.");
  }
  async function calculate() {
    setBusy(true);
    const result = await requestJson("/api/v1/quotes/preview", "POST", selection(), csrf);
    setBusy(false);
    if (result.ok) {
      setPreview(result.data as Preview);
      setStep(5);
    } else setMessage("No se pudo calcular. Revisa viajeros y configuración.");
  }
  async function save() {
    setBusy(true);
    const result = await requestJson("/api/v1/quotes", "POST", selection(), csrf);
    setBusy(false);
    if (result.ok) {
      setMessage("Cotización administrativa guardada.");
      await load();
      setStep(6);
    } else setMessage("No se pudo guardar la cotización.");
  }
  const hotels =
    options?.components.flatMap((component) =>
      component.type === "HOTEL" && component.hotel ? [component.hotel] : [],
    ) ?? [];
  const tours =
    options?.components.flatMap((component) =>
      component.type === "TOUR" && !component.included && component.tour ? [component.tour] : [],
    ) ?? [];

  return (
    <div className="admin-users">
      <section className="admin-panel">
        <h2>Constructor de cotizaciones</h2>
        <p className="admin-hint">
          Paso {step} de 6. Sólo se calculan reglas de borrador explícitas; las combinaciones incompletas requieren
          revisión comercial.
        </p>
        {message ? (
          <p className="admin-success" role="status">
            {message}
          </p>
        ) : null}
        <div className="admin-form">
          <label className="admin-field">
            1. Destino y paquete
            <select value={packageId} onChange={(event) => void choosePackage(event.target.value)} required>
              <option value="">Selecciona un paquete</option>
              {packages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.destination.name} · {item.title}
                </option>
              ))}
            </select>
          </label>
          {options ? (
            <>
              <p>
                <strong>{options.title}</strong> · {options.durationDays ?? "Duración por confirmar"} días
              </p>
              <label className="admin-field">
                2. Hotel
                <select
                  value={hotelId}
                  onChange={(event) => {
                    setHotelId(event.target.value);
                    setStep(3);
                  }}
                >
                  <option value="">Sin selección</option>
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                Regla base de borrador
                <select value={priceRuleId} onChange={(event) => setPriceRuleId(event.target.value)} required>
                  <option value="">Selecciona una regla explícita</option>
                  {options.priceRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} · {cop(rule.amountCents)} ({rule.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                3. Adultos
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={adults}
                  onChange={(event) => {
                    setAdults(Number(event.target.value));
                    setStep(3);
                  }}
                />
              </label>
              <label className="admin-field">
                Edades de niños, separadas por coma
                <input
                  value={childAges}
                  onChange={(event) => setChildAges(event.target.value)}
                  placeholder="Ej.: 6, 10"
                />
              </label>
              <fieldset className="admin-field">
                <legend>4. Tours opcionales</legend>
                {tours.length ? (
                  tours.map((tour) => (
                    <label key={tour.id}>
                      <input
                        type="checkbox"
                        checked={optionalTourIds.includes(tour.id)}
                        onChange={(event) =>
                          setOptionalTourIds((current) =>
                            event.target.checked ? [...current, tour.id] : current.filter((id) => id !== tour.id),
                          )
                        }
                      />{" "}
                      {tour.name}
                    </label>
                  ))
                ) : (
                  <span>No hay tours opcionales configurados.</span>
                )}
              </fieldset>
              <button
                className="admin-btn admin-btn-primary"
                disabled={busy || !priceRuleId}
                onClick={() => void calculate()}
              >
                5. Calcular desglose
              </button>
            </>
          ) : null}
        </div>
        {preview ? (
          <section className="admin-panel" aria-live="polite">
            <h3>Resumen</h3>
            {preview.state === "CALCULATED" ? (
              <p>
                <strong>Total: {preview.totalCents ? cop(preview.totalCents) : "—"}</strong>
              </p>
            ) : (
              <p>
                <strong>Requiere revisión comercial</strong>
              </p>
            )}
            <ul className="admin-activity">
              {preview.lines.map((line) => (
                <li key={line.description}>
                  {line.description} × {line.quantity}: {cop(line.totalCents)}
                </li>
              ))}
            </ul>
            {preview.reasons.length ? (
              <ul className="admin-activity">
                {preview.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <button className="admin-btn admin-btn-primary" disabled={busy} onClick={() => void save()}>
              6. Guardar cotización
            </button>
          </section>
        ) : null}
      </section>
      <section className="admin-panel">
        <h2>Cotizaciones guardadas</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Paquete</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>{quote.reference}</td>
                  <td>{quote.package?.title ?? "—"}</td>
                  <td>
                    <span className="admin-role">{quote.status}</span>
                  </td>
                  <td>{quote.totalCents ? cop(quote.totalCents) : "Revisión manual"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
