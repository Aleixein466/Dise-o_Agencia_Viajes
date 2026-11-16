"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import { FormFields, type FieldDef, type FieldOption } from "./form-fields";
import {
  UNIT_LABELS,
  blankPriceRule,
  describeError,
  formatDate,
  priceRuleCreatePayload,
  priceRulePatchPayload,
  priceRuleValues,
  validatePriceRule,
  type FieldErrors,
  type FormValues,
  type PriceRuleSource,
} from "./helpers";

export type EditableRate = PriceRuleSource & { id: string; updatedAt?: string };
type Named = { id: string; name: string; startsOn?: string; endsOn?: string; minValue?: number; maxValue?: number };
type Hotel = { id: string; name: string; roomTypes?: { id: string; name: string; maxOccupancy?: number }[] };

const NONE = (label: string): FieldOption => ({ value: "", label });

/** Create a draft price rule for a package, or edit the commercial conditions of a draft one. */
export function PriceRuleForm({
  csrf,
  packageId,
  destinationId,
  hotelIds,
  rate,
  onSaved,
  onCancel,
}: Readonly<{
  csrf: string;
  packageId: string;
  destinationId?: string;
  hotelIds: readonly string[];
  rate: EditableRate | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}>) {
  const prefix = useId();
  const hotelKey = hotelIds.join(",");
  const editing = rate !== null;
  const [ready, setReady] = useState(false);
  const [seasons, setSeasons] = useState<Named[]>([]);
  const [ageRules, setAgeRules] = useState<Named[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [initial, setInitial] = useState<FormValues>(blankPriceRule());
  const [values, setValues] = useState<FormValues>(blankPriceRule());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [baselineMissing, setBaselineMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const focusTarget = useRef("summary");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const hotelQuery = destinationId ? `?pageSize=50&destinationId=${destinationId}` : "?pageSize=50";
      void Promise.all([
        requestJson("/api/v1/catalog/seasons?status=approved&pageSize=50", "GET"),
        requestJson("/api/v1/catalog/age-rules?status=approved&pageSize=50", "GET"),
        requestJson(`/api/v1/catalog/hotels${hotelQuery}`, "GET"),
        rate ? requestJson(`/api/v1/catalog/price-rules/${rate.id}/history`, "GET") : Promise.resolve(null),
      ]).then(([seasonResult, ageResult, hotelResult, historyResult]) => {
        if (cancelled) return;
        const list = <T,>(data: unknown): T[] => {
          const items = (data as { items?: unknown } | null)?.items;
          return Array.isArray(items) ? (items as T[]) : [];
        };
        setSeasons(list<Named>(seasonResult.data));
        setAgeRules(list<Named>(ageResult.data));
        setHotels(list<Hotel>(hotelResult.data).filter((hotel) => hotelKey.split(",").includes(hotel.id)));
        if (rate) {
          const rows = Array.isArray(historyResult?.data)
            ? (historyResult.data as { after?: PriceRuleSource | null }[])
            : [];
          const snapshot = rows.find((row) => row.after && typeof row.after.unit === "string")?.after ?? null;
          const defined = Object.fromEntries(Object.entries(rate).filter(([, value]) => value !== undefined));
          const start = priceRuleValues({ ...snapshot, ...defined });
          // The API now lists the commercial fields; the audit snapshot is only a fallback for older payloads.
          setBaselineMissing(!snapshot && typeof (rate as { unit?: unknown }).unit !== "string");
          setInitial(start);
          setValues(start);
        }
        setReady(true);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rate, destinationId, hotelKey]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!focusTick) return;
    const target = focusTarget.current;
    if (target !== "summary") document.getElementById(`${prefix}-${target}`)?.focus();
    else summaryRef.current?.focus();
  }, [focusTick, prefix]);

  const roomOptions = hotels.flatMap((hotel) =>
    (hotel.roomTypes ?? []).map((room) => ({
      value: room.id,
      label: `${hotel.name} · ${room.name}${room.maxOccupancy ? ` (máx. ${room.maxOccupancy})` : ""}`,
    })),
  );
  const current = (options: FieldOption[], id: string) =>
    id && !options.some((option) => option.value === id) ? [...options, { value: id, label: "Valor actual" }] : options;

  const fields: FieldDef[] = [
    { name: "name", label: "Nombre de la tarifa", required: true, maxLength: 160, wide: true },
    {
      name: "unit",
      label: "Unidad de cobro",
      type: "select",
      required: true,
      options: Object.entries(UNIT_LABELS).map(([value, label]) => ({ value, label })),
      hint: "Las unidades por noche se guardan, pero la cotización pública todavía no las usa.",
    },
    {
      name: "amount",
      label: "Valor (COP)",
      required: true,
      inputMode: "decimal",
      maxLength: 18,
      hint: "En pesos, sin símbolo. Ejemplo: 500000 o 500.000.",
    },
    ...(editing
      ? []
      : ([
          {
            name: "ruleSetVersion",
            label: "Versión del conjunto de tarifas",
            required: true,
            maxLength: 40,
            hint: "Identificador libre de la versión (letras, números, punto, guion). Ejemplo: 2026-1.",
          },
        ] satisfies FieldDef[])),
    {
      name: "seasonId",
      label: "Temporada",
      type: "select",
      options: current(
        [
          NONE("Sin temporada (todo el año)"),
          ...seasons.map((season) => ({
            value: season.id,
            label: `${season.name} (${formatDate(season.startsOn)} al ${formatDate(season.endsOn)})`,
          })),
        ],
        values.seasonId,
      ),
      hint: "Solo temporadas aprobadas. Con temporada, el cliente debe indicar la fecha de viaje.",
    },
    {
      name: "ageRuleId",
      label: "Banda de edad",
      type: "select",
      options: current(
        [
          NONE("Sin banda (tarifa de adultos)"),
          ...ageRules.map((rule) => ({
            value: rule.id,
            label: `${rule.name} (${rule.minValue} a ${rule.maxValue} años)`,
          })),
        ],
        values.ageRuleId,
      ),
      hint: "Solo bandas aprobadas. Sin banda, la tarifa es de adultos.",
    },
    {
      name: "roomTypeId",
      label: "Acomodación",
      type: "select",
      options: current([NONE("Cualquier acomodación"), ...roomOptions], values.roomTypeId),
      hint: "Habitaciones de los hoteles del paquete.",
    },
    {
      name: "occupancy",
      label: "Ocupación (personas por habitación)",
      type: "number",
      maxLength: 2,
      hint: "Opcional. Debe igualar el tamaño del grupo.",
    },
    { name: "minTravelers", label: "Mínimo de viajeros", type: "number", maxLength: 2, hint: "Opcional (1 a 99)." },
    { name: "maxTravelers", label: "Máximo de viajeros", type: "number", maxLength: 2, hint: "Opcional (1 a 99)." },
    {
      name: "priority",
      label: "Prioridad",
      type: "number",
      maxLength: 5,
      hint: "Entero de -1000 a 1000. Ante igual especificidad gana la mayor; vacío = valor por defecto.",
    },
    { name: "validFrom", label: "Venta desde", type: "date", hint: "Opcional. Ventana de venta de la tarifa." },
    { name: "validTo", label: "Venta hasta", type: "date", hint: "Opcional." },
  ];

  function fail(found: FieldErrors, summary: string, target?: string) {
    setErrors(found);
    setFormError(summary);
    focusTarget.current = target ?? "summary";
    setFocusTick((tick) => tick + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validatePriceRule(values, editing ? "edit" : "create");
    if (Object.keys(found).length) {
      fail(
        found,
        "Revisa los campos marcados.",
        fields.map((field) => field.name).find((name) => found[name]),
      );
      return;
    }
    setErrors({});
    setFormError(null);
    let result;
    if (rate) {
      const patch = priceRulePatchPayload(values, initial);
      if (!Object.keys(patch).length) {
        fail({}, "No hay cambios que guardar.");
        return;
      }
      setSaving(true);
      result = await requestJson(
        `/api/v1/catalog/price-rules/${rate.id}`,
        "PATCH",
        { ...patch, expectedUpdatedAt: rate.updatedAt },
        csrf,
      );
    } else {
      setSaving(true);
      result = await requestJson(
        "/api/v1/catalog/price-rules",
        "POST",
        priceRuleCreatePayload(values, packageId),
        csrf,
      );
    }
    setSaving(false);
    if (!result.ok) {
      const described = describeError(result, values);
      fail(described.field ? { [described.field]: described.message } : {}, described.message, described.field);
      return;
    }
    onSaved(editing ? "Condiciones comerciales guardadas como borrador." : "Tarifa creada como borrador.");
  }

  return (
    <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
      <h3 id={`${prefix}-title`} ref={headingRef} tabIndex={-1}>
        {editing ? `Condiciones comerciales: ${rate.name ?? "tarifa"}` : "Nueva tarifa del paquete"}
      </h3>
      <p className="admin-hint">
        Se guarda como borrador: no se usa en cotizaciones hasta que se apruebe. Los campos con * son obligatorios. Al
        aprobar, la temporada y la banda elegidas deben estar aprobadas y no puede haber otra tarifa aprobada en
        conflicto.
      </p>
      {baselineMissing ? (
        <p className="admin-hint">
          No se pudieron leer las condiciones comerciales actuales de esta tarifa: solo se enviarán los campos que
          cambies.
        </p>
      ) : null}
      {formError ? (
        <p ref={summaryRef} tabIndex={-1} role="alert" className="admin-form-error">
          {formError}
        </p>
      ) : null}
      <form className="admin-form admin-commercial-form" noValidate onSubmit={(event) => void submit(event)}>
        <FormFields
          prefix={prefix}
          fields={fields}
          values={values}
          errors={errors}
          disabled={!ready}
          onChange={(name, value) => setValues((state) => ({ ...state, [name]: value }))}
        />
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !ready}>
            {saving ? "Guardando…" : editing ? "Guardar condiciones" : "Crear tarifa en borrador"}
          </button>
          <button type="button" className="admin-btn admin-btn-quiet" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
