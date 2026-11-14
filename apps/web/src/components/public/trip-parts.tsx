import type { PackageBuilder, QuotePreview } from "./api";
import { formatCop } from "./money";
import { isValidAge, type WizardState } from "./wizard-state";

export function isManualReview(preview: QuotePreview): boolean {
  return preview.status !== "PRICED" || formatCop(preview.totalCents) === null;
}

/** Price block: never renders an amount unless the server priced the selection. */
export function PriceSummary({ preview }: Readonly<{ preview: QuotePreview }>) {
  if (isManualReview(preview)) {
    return (
      <div className="wz-price wz-price-manual" data-status="manual">
        <h3>Un asesor confirmará el valor</h3>
        <p>
          Aún no podemos calcular un valor automático para esta combinación. Un asesor confirmará el valor antes de
          cualquier compromiso.
        </p>
        {preview.reasons.length ? (
          <ul className="wz-list">
            {preview.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  return (
    <div className="wz-price" data-status="priced">
      <ul className="wz-lines">
        {preview.lines.map((line, index) => {
          const unit = formatCop(line.unitAmountCents);
          return (
            <li key={`${line.label}-${index}`}>
              <span>
                {line.label}
                {line.quantity > 1 && unit ? (
                  <small>
                    {" "}
                    {line.quantity} × {unit}
                  </small>
                ) : null}
              </span>
              <strong>{formatCop(line.totalCents) ?? "—"}</strong>
            </li>
          );
        })}
      </ul>
      <p className="wz-total">
        <span>Total estimado</span>
        <strong>{formatCop(preview.totalCents)}</strong>
      </p>
      <p className="wz-note">Valor estimado en pesos colombianos, sujeto a confirmación de un asesor.</p>
    </div>
  );
}

/** One labelled age select per child; the number of selects always equals `ages.length`. */
export function ChildAgeFields({
  ages,
  onChange,
}: Readonly<{ ages: string[]; onChange: (index: number, value: string) => void }>) {
  if (!ages.length) return null;
  return (
    <fieldset className="wz-fieldset">
      <legend>Edad de cada niño</legend>
      <div className="wz-ages">
        {ages.map((age, index) => (
          <label className="field" key={index}>
            Niño {index + 1}
            <select
              name={`childAge${index}`}
              value={age}
              required
              aria-invalid={age !== "" && !isValidAge(age)}
              onChange={(event) => onChange(index, event.target.value)}
            >
              <option value="">Elige la edad</option>
              {Array.from({ length: 18 }, (_, value) => (
                <option key={value} value={String(value)}>
                  {value === 1 ? "1 año" : `${value} años`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TripSummary({
  builder,
  state,
  showLists = true,
}: Readonly<{ builder: PackageBuilder; state: WizardState; showLists?: boolean }>) {
  const hotel = builder.hotels.find((item) => item.id === state.hotelId);
  const room = hotel?.roomTypes.find((item) => item.id === state.roomTypeId);
  const transport = builder.transportOptions.find((item) => item.id === state.transportOptionId);
  const tours = builder.optionalTours.filter((item) => state.optionalTourIds.includes(item.id));
  const addOns = builder.addOns.filter((item) => state.addOnIds.includes(item.id));
  const pkg = builder.package;
  const duration =
    pkg.durationDays !== null
      ? `${pkg.durationDays} días${pkg.durationNights !== null ? ` / ${pkg.durationNights} noches` : ""}`
      : null;
  const children = state.childAges.length
    ? `${state.childAges.length} ${state.childAges.length === 1 ? "niño" : "niños"} (edades: ${state.childAges.join(", ")})`
    : "sin niños";
  return (
    <div className="wz-summary">
      <dl>
        <div>
          <dt>Paquete</dt>
          <dd>
            {pkg.name} · {pkg.destinationName}
            {duration ? ` · ${duration}` : ""}
          </dd>
        </div>
        <div>
          <dt>Hotel</dt>
          <dd>{hotel ? `${hotel.name}${room ? ` · ${room.name}` : ""}` : "Sin hotel seleccionado"}</dd>
        </div>
        <div>
          <dt>Transporte</dt>
          <dd>{transport ? transport.label : "Sin transporte incluido"}</dd>
        </div>
        <div>
          <dt>Viajeros</dt>
          <dd>
            {state.adults} {state.adults === 1 ? "adulto" : "adultos"}, {children}
          </dd>
        </div>
        <div>
          <dt>Tours y adicionales</dt>
          <dd>{[...tours, ...addOns].map((item) => item.name).join(", ") || "Ninguno"}</dd>
        </div>
      </dl>
      {showLists ? (
        <div className="wz-lists">
          <section>
            <h3>Incluye</h3>
            {pkg.inclusions.length ? (
              <ul className="wz-list">
                {pkg.inclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="wz-note">Un asesor confirmará lo incluido.</p>
            )}
          </section>
          <section>
            <h3>No incluye</h3>
            {pkg.exclusions.length ? (
              <ul className="wz-list">
                {pkg.exclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="wz-note">Un asesor confirmará lo no incluido.</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
