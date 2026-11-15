// Pure helpers for manual cupos (GET/POST/PATCH /api/v1/catalog/departures, /:id/hold, /:id/release, /:id/history).
import {
  describeError as describeCommonError,
  dayStartInstant,
  instantToDate,
  isValidDate,
  type ApiFailure,
} from "../commercial/helpers";

export type Availability = "AVAILABLE" | "SOLD_OUT" | "TO_CONFIRM";
export type DepartureValues = Record<string, string>;
export type DepartureErrors = Record<string, string>;

export const MAX_SEATS = 10_000;
export const REASON_MAX = 300;
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  TO_CONFIRM: "Por confirmar",
  AVAILABLE: "Disponible",
  SOLD_OUT: "Agotada",
};
export const AVAILABILITIES = Object.keys(AVAILABILITY_LABELS) as Availability[];
export const availabilityLabel = (value: string) => AVAILABILITY_LABELS[value as Availability] ?? value;

export function blankDeparture(): DepartureValues {
  return { startsOn: "", endsOn: "", capacity: "", availabilityStatus: "TO_CONFIRM", reason: "" };
}
export function departureValues(item: {
  startsAt: string;
  endsAt: string;
  capacity: number;
  availabilityStatus: string;
}): DepartureValues {
  return {
    startsOn: instantToDate(item.startsAt),
    endsOn: instantToDate(item.endsAt),
    capacity: String(item.capacity),
    availabilityStatus: item.availabilityStatus,
    reason: "",
  };
}

/** Whole number of seats in 0..MAX (or 1..MAX for holds); null when the text is not one. */
export function parseSeats(raw: string, min = 0): number | null {
  const text = raw.trim();
  if (!/^\d{1,5}$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= MAX_SEATS ? value : null;
}

export function validateDeparture(
  values: DepartureValues,
  current?: { capacity: number; heldSeats: number; soldSeats: number },
): DepartureErrors {
  const errors: DepartureErrors = {};
  if (!isValidDate(values.startsOn)) errors.startsOn = "Elige la fecha de salida.";
  if (!isValidDate(values.endsOn)) errors.endsOn = "Elige la fecha de regreso.";
  else if (!errors.startsOn && values.endsOn < values.startsOn)
    errors.endsOn = "La fecha de regreso no puede ser anterior a la de salida.";
  const capacity = parseSeats(values.capacity);
  if (capacity === null) errors.capacity = `Escribe un número entero de cupos entre 0 y ${MAX_SEATS}.`;
  else if (current) {
    const committed = current.heldSeats + current.soldSeats;
    if (capacity < committed) errors.capacity = `No puede ser menor que los cupos retenidos y vendidos (${committed}).`;
    else if (capacity !== current.capacity) {
      const reason = values.reason.trim();
      if (reason.length < 3) errors.reason = "Indica el motivo del cambio de capacidad (mínimo 3 caracteres).";
      else if (reason.length > REASON_MAX) errors.reason = `El motivo admite máximo ${REASON_MAX} caracteres.`;
    }
  }
  if (!AVAILABILITIES.includes(values.availabilityStatus as Availability))
    errors.availabilityStatus = "Elige el estado de disponibilidad.";
  return errors;
}

export function createPayload(values: DepartureValues, packageId: string) {
  return {
    packageId,
    startsAt: dayStartInstant(values.startsOn),
    endsAt: dayStartInstant(values.endsOn),
    capacity: parseSeats(values.capacity) ?? 0,
    availabilityStatus: values.availabilityStatus,
  };
}

/** Only changed fields; the reason travels only with a capacity change. Empty object = nothing to save. */
export function editPayload(values: DepartureValues, initial: DepartureValues): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  if (values.startsOn !== initial.startsOn) patch.startsAt = dayStartInstant(values.startsOn);
  if (values.endsOn !== initial.endsOn) patch.endsAt = dayStartInstant(values.endsOn);
  if (values.availabilityStatus !== initial.availabilityStatus) patch.availabilityStatus = values.availabilityStatus;
  const capacity = parseSeats(values.capacity);
  if (capacity !== null && capacity !== parseSeats(initial.capacity)) {
    patch.capacity = capacity;
    patch.reason = values.reason.trim();
  }
  return patch;
}

export function validateSeatChange(seats: string, reason: string, limit: number, kind: "hold" | "release") {
  const errors: DepartureErrors = {};
  const value = parseSeats(seats, 1);
  if (value === null) errors.seats = "Escribe un número entero de cupos mayor que cero.";
  else if (value > limit)
    errors.seats =
      kind === "hold" ? `Solo quedan ${limit} cupos disponibles.` : `Solo hay ${limit} cupos retenidos para liberar.`;
  const text = reason.trim();
  if (text.length < 3) errors.reason = "Indica el motivo (mínimo 3 caracteres).";
  else if (text.length > REASON_MAX) errors.reason = `El motivo admite máximo ${REASON_MAX} caracteres.`;
  return errors;
}

const ERROR_MESSAGES: Record<string, string> = {
  OVERBOOKING: "No hay cupos suficientes: otra persona pudo retener cupos al mismo tiempo. Se recargó la salida.",
  RELEASE_EXCEEDS_HELD: "No hay tantos cupos retenidos para liberar. Se recargó la salida.",
  CAPACITY_BELOW_COMMITTED: "La capacidad no puede ser menor que los cupos retenidos y vendidos.",
  REASON_REQUIRED: "Indica el motivo del cambio de capacidad.",
  DEPARTURE_EXISTS: "Ya existe una salida de este paquete en esa fecha.",
  PACKAGE_NOT_FOUND: "El paquete elegido ya no existe.",
  DATE_RANGE_INVALID: "La fecha de regreso no puede ser anterior a la de salida.",
  STALE_UPDATE: "Otra persona modificó esta salida. Se recargó la lista: revisa y vuelve a intentar.",
};
const ERROR_FIELDS: Record<string, string> = {
  OVERBOOKING: "seats",
  RELEASE_EXCEEDS_HELD: "seats",
  CAPACITY_BELOW_COMMITTED: "capacity",
  REASON_REQUIRED: "reason",
  DEPARTURE_EXISTS: "startsOn",
  DATE_RANGE_INVALID: "endsOn",
};

export function describeDepartureError(failure: ApiFailure): { code: string; message: string; field?: string } {
  const common = describeCommonError(failure);
  const body = failure.data && typeof failure.data === "object" ? (failure.data as Record<string, unknown>) : {};
  if (common.code === "OVERBOOKING" && typeof body.available === "number")
    return {
      code: common.code,
      message: `No hay cupos suficientes: quedan ${body.available} disponibles. Se recargó la salida.`,
      field: "seats",
    };
  return {
    code: common.code,
    message: ERROR_MESSAGES[common.code] ?? common.message,
    field: ERROR_FIELDS[common.code],
  };
}

// History ------------------------------------------------------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  CREATED: "Salida creada",
  CAPACITY: "Capacidad modificada",
  HOLD: "Cupos retenidos",
  RELEASE: "Cupos liberados",
};
export const changeKindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

/** "+3", "−2" (typographic minus); creation shows the initial capacity. */
export function describeDelta(kind: string, delta: number): string {
  if (kind === "CREATED") return `Capacidad inicial ${delta}`;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const amount = `${sign}${Math.abs(delta)}`;
  return kind === "CAPACITY" ? `${amount} en capacidad` : `${amount} ${Math.abs(delta) === 1 ? "cupo" : "cupos"}`;
}

export function seatsSummary(row: { capacityAfter: number; heldAfter: number; soldAfter: number }): string {
  const free = Math.max(0, row.capacityAfter - row.heldAfter - row.soldAfter);
  return `Capacidad ${row.capacityAfter} · retenidos ${row.heldAfter} · vendidos ${row.soldAfter} · libres ${free}`;
}
