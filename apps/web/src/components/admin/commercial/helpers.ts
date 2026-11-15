// Pure helpers for the commercial-rules admin (seasons, age bands, promotions, price-rule conditions).
// Contract: docs/orchestration/contracts/commercial-rules-admin.md. Money is always bigint-derived strings (cents).

export type RuleKind = "seasons" | "age-rules" | "promotions";
export type LifecycleStatus = "draft" | "approved" | "inactive";
export type ScopeKind = "GLOBAL" | "DESTINATION" | "PACKAGE";
export type FormValues = Record<string, string>;
export type FieldErrors = Record<string, string>;

export const STATUS_LABELS: Record<LifecycleStatus, string> = {
  draft: "Borrador",
  approved: "Aprobada",
  inactive: "Inactiva",
};
export const SCOPE_LABELS: Record<ScopeKind, string> = {
  GLOBAL: "Global",
  DESTINATION: "Destino",
  PACKAGE: "Paquete",
};
export const CATEGORY_LABELS: Record<string, string> = {
  CHILD: "Niño",
  INFANT: "Bebé",
  ADULT: "Adulto",
  SENIOR: "Adulto mayor",
};
export const UNIT_LABELS: Record<string, string> = {
  PER_PERSON: "Por persona",
  PER_BOOKING: "Por reserva",
  PER_PERSON_NIGHT: "Por persona y noche",
  PER_ROOM_NIGHT: "Por habitación y noche",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as LifecycleStatus] ?? status;
}

// ---------------------------------------------------------------------------------------------------------------
// Money: strings of cents in, grouped COP out. BigInt only, never Number.

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const MAX_DISCOUNT_CENTS = BigInt("999999999999");

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "123460000" -> "$ 1.234.600"; centavos shown only when the amount has them. Invalid input -> "—". */
export function formatCop(cents: string | null | undefined): string {
  if (cents == null || !/^-?\d+$/.test(cents)) return "—";
  const value = BigInt(cents);
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const pesos = groupThousands((abs / HUNDRED).toString());
  const rest = abs % HUNDRED;
  const decimals = rest === ZERO ? "" : `,${rest.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}$ ${pesos}${decimals}`;
}

export const MAX_AMOUNT_CENTS_DIGITS = 13;

/** Pesos typed by a person ("1.500.000", "1500000", "$ 99,50") -> cents string. Dots only as thousands separator. */
export function parsePesos(raw: string): { ok: true; cents: string } | { ok: false; error: string } {
  const text = raw
    .trim()
    .replace(/^\$\s*/, "")
    .replace(/\s/g, "");
  if (!text) return { ok: false, error: "Ingresa un valor en pesos." };
  const parts = text.split(",");
  if (parts.length > 2) return { ok: false, error: "Usa una sola coma para los centavos." };
  const [whole, fraction = ""] = parts;
  const grouped = /^\d{1,3}(\.\d{3})+$/.test(whole);
  if (!(/^\d+$/.test(whole) || grouped))
    return { ok: false, error: "Usa solo números; el punto separa miles (1.500.000) y la coma los centavos." };
  if (fraction && !/^\d{1,2}$/.test(fraction)) return { ok: false, error: "Los centavos van con uno o dos dígitos." };
  const cents = (BigInt(whole.replace(/\./g, "")) * HUNDRED + BigInt(fraction.padEnd(2, "0") || "0")).toString();
  if (cents.length > MAX_AMOUNT_CENTS_DIGITS) return { ok: false, error: "El valor es demasiado grande." };
  return { ok: true, cents };
}

/** Cents string -> editable pesos text ("123460000" -> "1234600"). */
export function centsToPesosInput(cents: string | null | undefined): string {
  if (cents == null || !/^\d+$/.test(cents)) return "";
  const value = BigInt(cents);
  const rest = value % HUNDRED;
  return rest === ZERO ? (value / HUNDRED).toString() : `${value / HUNDRED},${rest.toString().padStart(2, "0")}`;
}

/** "10" or "12,5" -> basis points 1000 / 1250. Null when out of 0.01–100 %. */
export function parsePercentToBps(raw: string): number | null {
  const text = raw.trim().replace(/\s*%$/, "");
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return bps >= 1 && bps <= 10_000 ? bps : null;
}

export function bpsToPercent(bps: number | null | undefined): string {
  if (bps == null || !Number.isInteger(bps)) return "";
  const rest = bps % 100;
  return `${Math.floor(bps / 100)}${rest ? `,${String(rest).padStart(2, "0").replace(/0$/, "")}` : ""}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Dates. Inputs are YYYY-MM-DD. Instants are pinned to Colombia time (UTC-5, no DST): a day runs 05:00Z..04:59:59Z.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dayStartInstant(date: string): string {
  return `${date}T05:00:00Z`;
}
export function dayEndInstant(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.toISOString().slice(0, 10)}T04:59:59Z`;
}
/** Instant -> the Colombian calendar day (YYYY-MM-DD); "" when absent or invalid. */
export function instantToDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : new Date(time - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}
/** YYYY-MM-DD -> DD/MM/YYYY (string slicing, no timezone shift). */
export function formatDate(date: string | null | undefined): string {
  if (!date || !isValidDate(date.slice(0, 10))) return "—";
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
export function formatInstantDate(iso: string | null | undefined): string {
  return formatDate(instantToDate(iso));
}
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(time));
}

// ---------------------------------------------------------------------------------------------------------------
// API errors -> Spanish.

export type ApiFailure = { status: number; data: unknown };
export type DescribedError = { code: string; message: string; field?: string };

const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "Revisa los datos: alguno no cumple el formato esperado.",
  DATE_RANGE_INVALID: "La fecha inicial debe ser anterior o igual a la final.",
  SCOPE_NOT_FOUND: "El destino o paquete elegido ya no existe.",
  SCOPE_INVALID: "El paquete elegido no pertenece a ese destino.",
  AGE_RANGE_INVALID: "La banda debe estar entre 0 y 17 años y la edad mínima no puede superar la máxima.",
  AGE_RULE_CATEGORY_INVALID: "Las bandas de edad son para menores de 18 años: elige Niño o Bebé.",
  AGE_RULE_BASIS_UNSUPPORTED: "La cotización pública solo admite bandas por edad en años.",
  DISCOUNT_INVALID:
    "Descuento inválido: un porcentaje va entre 0,01 y 100 sin monto; un monto fijo debe ser mayor que cero sin porcentaje.",
  PROMOTION_CODE_INVALID: "El código solo admite letras A-Z, números, guion y guion bajo (máximo 40).",
  MAX_REDEMPTIONS_INVALID: "El máximo de usos debe ser al menos 1 y no menor que los usos ya registrados.",
  TARGET_INVALID: "Esta tarifa no se puede editar desde aquí.",
  SEASON_NOT_FOUND: "La temporada elegida no existe.",
  SEASON_SCOPE_MISMATCH: "La temporada elegida no corresponde al ámbito de esta tarifa.",
  AGE_RULE_NOT_FOUND: "La banda de edad elegida no existe.",
  AGE_RULE_SCOPE_MISMATCH: "La banda de edad elegida no corresponde al ámbito de esta tarifa.",
  ROOM_TYPE_NOT_FOUND: "La acomodación elegida no existe.",
  ROOM_TYPE_SCOPE_MISMATCH: "La acomodación no pertenece a un hotel de este paquete.",
  TRAVELERS_RANGE_INVALID: "El mínimo de viajeros no puede superar el máximo.",
  AMOUNT_INVALID: "El valor debe ser mayor que cero (solo las bandas de bebé pueden valer cero).",
  NOT_FOUND: "El registro ya no existe. Recarga la lista.",
  STALE_UPDATE: "Otra persona modificó este registro. Se recargó la lista: revisa y vuelve a intentar.",
  NOT_DRAFT: "Solo se pueden editar o aprobar borradores. Desactívalo y crea uno nuevo.",
  ALREADY_INACTIVE: "Ya estaba desactivado.",
  PROMOTION_CODE_TAKEN: "Ese código ya existe (sin distinguir mayúsculas) y no se puede reutilizar. Elige otro.",
  SEASON_OVERLAP:
    "No se puede aprobar: se cruza con otra temporada aprobada del mismo ámbito. Desactiva la otra o cambia las fechas.",
  AGE_RULE_OVERLAP:
    "No se puede aprobar: se cruza con otra banda de edad aprobada del mismo ámbito. Desactiva la otra o cambia las edades.",
  SEASON_NOT_APPROVED: "La temporada ligada a la tarifa debe estar aprobada primero.",
  AGE_RULE_NOT_APPROVED: "La banda de edad ligada a la tarifa debe estar aprobada primero.",
  PRICE_RULE_AMBIGUOUS:
    "No se puede aprobar: otra tarifa aprobada del mismo ítem compite con esta en las mismas condiciones y prioridad. Cambia la prioridad o las condiciones.",
};

const STATUS_MESSAGES: Record<number, string> = {
  0: "No hay conexión con el servidor. Intenta de nuevo.",
  401: "Tu sesión expiró. Vuelve a ingresar.",
  403: "No tienes permiso para esta acción.",
  404: "El registro ya no existe. Recarga la lista.",
  409: "Otra persona modificó este registro. Recarga e intenta de nuevo.",
  429: "Demasiados intentos. Espera un momento.",
};

const ERROR_FIELDS: Record<string, string> = {
  DATE_RANGE_INVALID: "endsOn",
  SCOPE_NOT_FOUND: "scope",
  SCOPE_INVALID: "scope",
  AGE_RANGE_INVALID: "minValue",
  AGE_RULE_CATEGORY_INVALID: "category",
  PROMOTION_CODE_INVALID: "code",
  PROMOTION_CODE_TAKEN: "code",
  MAX_REDEMPTIONS_INVALID: "maxRedemptions",
  SEASON_NOT_FOUND: "seasonId",
  SEASON_SCOPE_MISMATCH: "seasonId",
  SEASON_NOT_APPROVED: "seasonId",
  AGE_RULE_NOT_FOUND: "ageRuleId",
  AGE_RULE_SCOPE_MISMATCH: "ageRuleId",
  AGE_RULE_NOT_APPROVED: "ageRuleId",
  ROOM_TYPE_NOT_FOUND: "roomTypeId",
  ROOM_TYPE_SCOPE_MISMATCH: "roomTypeId",
  TRAVELERS_RANGE_INVALID: "minTravelers",
  AMOUNT_INVALID: "amount",
};

/** Field a server error code points at (input `name`); the discount error follows the chosen discount type. */
export function errorField(code: string, values?: FormValues): string | undefined {
  if (code === "DISCOUNT_INVALID") return values?.discountType === "FIXED_AMOUNT" ? "amount" : "percent";
  return ERROR_FIELDS[code];
}

export function describeError(failure: ApiFailure, values?: FormValues): DescribedError {
  const body = failure.data && typeof failure.data === "object" ? (failure.data as Record<string, unknown>) : {};
  const code = typeof body.code === "string" ? body.code : "";
  let message =
    ERROR_MESSAGES[code] ?? STATUS_MESSAGES[failure.status] ?? "No se pudo completar la acción. Intenta de nuevo.";
  if (code === "PRICE_RULE_AMBIGUOUS" && typeof body.conflictId === "string")
    message += ` (Tarifa en conflicto: ${body.conflictId}.)`;
  return { code, message, field: errorField(code, values) };
}

// ---------------------------------------------------------------------------------------------------------------
// Scope (shared by seasons, age bands and promotions).

export function scopePayload(values: FormValues): { destinationId: string | null; packageId: string | null } {
  if (values.scope === "PACKAGE") return { destinationId: null, packageId: values.packageId || null };
  if (values.scope === "DESTINATION") return { destinationId: values.destinationId || null, packageId: null };
  return { destinationId: null, packageId: null };
}

function validateScope(values: FormValues, errors: FieldErrors) {
  if (values.scope === "DESTINATION" && !values.destinationId) errors.destinationId = "Elige un destino.";
  if (values.scope === "PACKAGE" && !values.packageId) errors.packageId = "Elige un paquete.";
}

export function blankScope(): FormValues {
  return { scope: "GLOBAL", destinationId: "", packageId: "" };
}
export function scopeValues(item: { scope?: string; destinationId?: string | null; packageId?: string | null }) {
  return { scope: item.scope ?? "GLOBAL", destinationId: item.destinationId ?? "", packageId: item.packageId ?? "" };
}

function validateName(value: string | undefined, max: number, errors: FieldErrors) {
  const name = (value ?? "").trim();
  if (name.length < 2) errors.name = "El nombre debe tener al menos 2 caracteres.";
  else if (name.length > max) errors.name = `El nombre admite máximo ${max} caracteres.`;
}

function intInRange(value: string | undefined, min: number, max: number): number | null {
  const text = (value ?? "").trim();
  if (!/^\d{1,6}$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Seasons

export function blankSeason(): FormValues {
  return { name: "", startsOn: "", endsOn: "", notes: "", ...blankScope() };
}
export function seasonValues(item: {
  name: string;
  startsOn: string;
  endsOn: string;
  notes?: string | null;
  scope?: string;
  destinationId?: string | null;
  packageId?: string | null;
}): FormValues {
  return {
    name: item.name,
    startsOn: item.startsOn,
    endsOn: item.endsOn,
    notes: item.notes ?? "",
    ...scopeValues(item),
  };
}
export function validateSeason(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  validateName(values.name, 120, errors);
  if (!isValidDate(values.startsOn ?? "")) errors.startsOn = "Ingresa la fecha inicial (AAAA-MM-DD).";
  if (!isValidDate(values.endsOn ?? "")) errors.endsOn = "Ingresa la fecha final (AAAA-MM-DD).";
  if (!errors.startsOn && !errors.endsOn && values.startsOn > values.endsOn)
    errors.endsOn = "La fecha final no puede ser anterior a la inicial.";
  if ((values.notes ?? "").length > 5000) errors.notes = "Las notas admiten máximo 5000 caracteres.";
  validateScope(values, errors);
  return errors;
}
export function seasonPayload(values: FormValues) {
  return {
    name: values.name.trim(),
    startsOn: values.startsOn,
    endsOn: values.endsOn,
    notes: values.notes.trim() || null,
    ...scopePayload(values),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Age bands (years only; the public quote does not use height bands)

export function blankAgeRule(): FormValues {
  return { name: "", category: "CHILD", minValue: "", maxValue: "", ...blankScope() };
}
export function ageRuleValues(item: {
  name: string;
  category: string;
  minValue: number | null;
  maxValue: number | null;
  scope?: string;
  destinationId?: string | null;
  packageId?: string | null;
}): FormValues {
  return {
    name: item.name,
    category: item.category,
    minValue: item.minValue == null ? "" : String(item.minValue),
    maxValue: item.maxValue == null ? "" : String(item.maxValue),
    ...scopeValues(item),
  };
}
export function validateAgeRule(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  validateName(values.name, 120, errors);
  if (!["CHILD", "INFANT", "ADULT"].includes(values.category ?? "")) errors.category = "Elige una categoría.";
  const min = intInRange(values.minValue, 0, 17);
  const max = intInRange(values.maxValue, 0, 17);
  if (min === null) errors.minValue = "La edad mínima es un número entero entre 0 y 17.";
  if (max === null) errors.maxValue = "La edad máxima es un número entero entre 0 y 17.";
  if (min !== null && max !== null && min > max) errors.minValue = "La edad mínima no puede superar la máxima.";
  validateScope(values, errors);
  return errors;
}
export function ageRulePayload(values: FormValues) {
  return {
    name: values.name.trim(),
    category: values.category,
    basis: "AGE_YEARS" as const,
    minValue: Number(values.minValue),
    maxValue: Number(values.maxValue),
    ...scopePayload(values),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Promotions

export function normalizePromotionCode(raw: string): string {
  return raw.trim().toUpperCase();
}
export function blankPromotion(): FormValues {
  return {
    code: "",
    name: "",
    description: "",
    discountType: "PERCENT",
    percent: "",
    amount: "",
    startsOn: "",
    endsOn: "",
    maxRedemptions: "",
    ...blankScope(),
  };
}
export function promotionValues(item: {
  code: string;
  name: string;
  description?: string | null;
  discountType: string;
  percentBps?: number | null;
  amountOffCents?: string | null;
  startsAt: string;
  endsAt: string;
  maxRedemptions?: number | null;
  scope?: string;
  destinationId?: string | null;
  packageId?: string | null;
}): FormValues {
  return {
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    discountType: item.discountType,
    percent: bpsToPercent(item.percentBps),
    amount: centsToPesosInput(item.amountOffCents),
    startsOn: instantToDate(item.startsAt),
    endsOn: instantToDate(item.endsAt),
    maxRedemptions: item.maxRedemptions == null ? "" : String(item.maxRedemptions),
    ...scopeValues(item),
  };
}
export function validatePromotion(values: FormValues, redemptionCount = 0): FieldErrors {
  const errors: FieldErrors = {};
  const code = normalizePromotionCode(values.code ?? "");
  if (!/^[A-Z0-9_-]{1,40}$/.test(code))
    errors.code = "Usa solo letras, números, guion y guion bajo (máximo 40, sin espacios).";
  validateName(values.name, 160, errors);
  if ((values.description ?? "").length > 5000) errors.description = "La descripción admite máximo 5000 caracteres.";
  if (values.discountType === "PERCENT") {
    if (parsePercentToBps(values.percent ?? "") === null)
      errors.percent = "Ingresa un porcentaje entre 0,01 y 100 (por ejemplo 10 o 12,5).";
  } else if (values.discountType === "FIXED_AMOUNT") {
    const parsed = parsePesos(values.amount ?? "");
    if (!parsed.ok) errors.amount = parsed.error;
    else if (BigInt(parsed.cents) <= ZERO) errors.amount = "El monto debe ser mayor que cero.";
    else if (BigInt(parsed.cents) > MAX_DISCOUNT_CENTS) errors.amount = "El monto es demasiado grande.";
  } else errors.discountType = "Elige el tipo de descuento.";
  if (!isValidDate(values.startsOn ?? "")) errors.startsOn = "Ingresa la fecha de inicio (AAAA-MM-DD).";
  if (!isValidDate(values.endsOn ?? "")) errors.endsOn = "Ingresa la fecha de fin (AAAA-MM-DD).";
  if (!errors.startsOn && !errors.endsOn && values.startsOn > values.endsOn)
    errors.endsOn = "La fecha de fin no puede ser anterior a la de inicio.";
  if ((values.maxRedemptions ?? "").trim()) {
    const max = intInRange(values.maxRedemptions, 1, 1_000_000);
    if (max === null)
      errors.maxRedemptions = "Ingresa un número entero de 1 en adelante, o déjalo vacío para no limitar.";
    else if (max < redemptionCount)
      errors.maxRedemptions = `Ya hay ${redemptionCount} usos: el máximo no puede ser menor.`;
  }
  validateScope(values, errors);
  return errors;
}
export function promotionPayload(values: FormValues) {
  const percent = values.discountType === "PERCENT" ? parsePercentToBps(values.percent) : null;
  const amount = values.discountType === "FIXED_AMOUNT" ? parsePesos(values.amount) : null;
  return {
    code: normalizePromotionCode(values.code),
    name: values.name.trim(),
    description: values.description.trim() || null,
    discountType: values.discountType,
    percentBps: percent,
    amountOffCents: amount?.ok ? amount.cents : null,
    startsAt: dayStartInstant(values.startsOn),
    endsAt: dayEndInstant(values.endsOn),
    maxRedemptions: values.maxRedemptions.trim() ? Number(values.maxRedemptions) : null,
    ...scopePayload(values),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Price-rule commercial fields (create / edit draft). Edits send only the fields the person changed.

export type PriceRuleSource = {
  name?: string | null;
  unit?: string | null;
  amountCents?: string | null;
  priority?: number | null;
  seasonId?: string | null;
  ageRuleId?: string | null;
  roomTypeId?: string | null;
  occupancy?: number | null;
  minTravelers?: number | null;
  maxTravelers?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  ruleSetVersion?: string | null;
  conditions?: Record<string, unknown> | null;
};

const num = (value: number | null | undefined) => (value == null ? "" : String(value));

export function blankPriceRule(): FormValues {
  return {
    name: "",
    unit: "PER_PERSON",
    amount: "",
    ruleSetVersion: "",
    priority: "",
    seasonId: "",
    ageRuleId: "",
    roomTypeId: "",
    occupancy: "",
    minTravelers: "",
    maxTravelers: "",
    validFrom: "",
    validTo: "",
  };
}
export function priceRuleValues(rule: PriceRuleSource): FormValues {
  const bound = typeof rule.conditions?.roomTypeId === "string" ? rule.conditions.roomTypeId : "";
  return {
    ...blankPriceRule(),
    name: rule.name ?? "",
    unit: rule.unit ?? "PER_PERSON",
    amount: centsToPesosInput(rule.amountCents),
    ruleSetVersion: rule.ruleSetVersion ?? "",
    priority: num(rule.priority),
    seasonId: rule.seasonId ?? "",
    ageRuleId: rule.ageRuleId ?? "",
    roomTypeId: rule.roomTypeId ?? bound,
    occupancy: num(rule.occupancy),
    minTravelers: num(rule.minTravelers),
    maxTravelers: num(rule.maxTravelers),
    validFrom: instantToDate(rule.validFrom),
    validTo: instantToDate(rule.validTo),
  };
}
export function validatePriceRule(values: FormValues, mode: "create" | "edit"): FieldErrors {
  const errors: FieldErrors = {};
  validateName(values.name, 160, errors);
  const amount = parsePesos(values.amount ?? "");
  if (!amount.ok) errors.amount = amount.error;
  if (mode === "create" && !/^[A-Za-z0-9._-]{1,40}$/.test(values.ruleSetVersion ?? ""))
    errors.ruleSetVersion = "Usa letras, números, punto, guion y guion bajo (máximo 40, sin espacios).";
  const priority = (values.priority ?? "").trim();
  if (priority && !/^-?\d{1,4}$/.test(priority)) errors.priority = "La prioridad es un entero entre -1000 y 1000.";
  else if (priority && Math.abs(Number(priority)) > 1000)
    errors.priority = "La prioridad es un entero entre -1000 y 1000.";
  const occupancy = (values.occupancy ?? "").trim();
  if (occupancy && intInRange(occupancy, 1, 50) === null) errors.occupancy = "La ocupación es un entero entre 1 y 50.";
  const min = (values.minTravelers ?? "").trim();
  const max = (values.maxTravelers ?? "").trim();
  if (min && intInRange(min, 1, 99) === null) errors.minTravelers = "El mínimo de viajeros es un entero entre 1 y 99.";
  if (max && intInRange(max, 1, 99) === null) errors.maxTravelers = "El máximo de viajeros es un entero entre 1 y 99.";
  if (!errors.minTravelers && !errors.maxTravelers && min && max && Number(min) > Number(max))
    errors.minTravelers = "El mínimo de viajeros no puede superar el máximo.";
  if (values.validFrom && !isValidDate(values.validFrom)) errors.validFrom = "Usa el formato AAAA-MM-DD.";
  if (values.validTo && !isValidDate(values.validTo)) errors.validTo = "Usa el formato AAAA-MM-DD.";
  if (!errors.validFrom && !errors.validTo && values.validFrom && values.validTo && values.validFrom > values.validTo)
    errors.validTo = "La fecha final no puede ser anterior a la inicial.";
  return errors;
}

const optionalInt = (value: string) => (value.trim() ? Number(value) : null);
const optionalId = (value: string) => value || null;
const PRICE_RULE_FIELDS: Record<string, (values: FormValues) => unknown> = {
  name: (v) => v.name.trim(),
  unit: (v) => v.unit,
  amount: (v) => {
    const parsed = parsePesos(v.amount);
    return parsed.ok ? parsed.cents : null;
  },
  priority: (v) => optionalInt(v.priority) ?? 0,
  seasonId: (v) => optionalId(v.seasonId),
  ageRuleId: (v) => optionalId(v.ageRuleId),
  roomTypeId: (v) => optionalId(v.roomTypeId),
  occupancy: (v) => optionalInt(v.occupancy),
  minTravelers: (v) => optionalInt(v.minTravelers),
  maxTravelers: (v) => optionalInt(v.maxTravelers),
  validFrom: (v) => (v.validFrom ? dayStartInstant(v.validFrom) : null),
  validTo: (v) => (v.validTo ? dayEndInstant(v.validTo) : null),
};
const API_KEY: Record<string, string> = { amount: "amountCents" };

/** Body for POST price-rules: required fields plus only the optional ones that are filled in. */
export function priceRuleCreatePayload(values: FormValues, packageId: string): Record<string, unknown> {
  const body: Record<string, unknown> = { packageId, ruleSetVersion: values.ruleSetVersion.trim() };
  for (const [key, build] of Object.entries(PRICE_RULE_FIELDS)) {
    if (key === "priority" && !values.priority.trim()) continue;
    const value = build(values);
    const required = key === "name" || key === "unit" || key === "amount";
    if (required || value !== null) body[API_KEY[key] ?? key] = value;
  }
  return body;
}
/** Body for PATCH price-rules/:id: only fields that differ from the values the form was opened with. */
export function priceRulePatchPayload(values: FormValues, initial: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, build] of Object.entries(PRICE_RULE_FIELDS))
    if ((values[key] ?? "") !== (initial[key] ?? "")) body[API_KEY[key] ?? key] = build(values);
  return body;
}

// ---------------------------------------------------------------------------------------------------------------
// History (audit rows)

export type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  created: "Creada como borrador",
  draft_created: "Creada como borrador",
  updated: "Borrador editado",
  draft_updated: "Borrador editado",
  approved: "Aprobada",
  deactivated: "Desactivada",
};
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  notes: "Notas",
  startsOn: "Inicio",
  endsOn: "Fin",
  category: "Categoría",
  minValue: "Edad mínima",
  maxValue: "Edad máxima",
  code: "Código",
  description: "Descripción",
  discountType: "Tipo de descuento",
  percentBps: "Porcentaje",
  amountOffCents: "Monto de descuento",
  startsAt: "Inicio",
  endsAt: "Fin",
  maxRedemptions: "Máximo de usos",
  status: "Estado",
  scope: "Alcance",
  amountCents: "Valor",
  unit: "Unidad",
  priority: "Prioridad",
  seasonId: "Temporada",
  ageRuleId: "Banda de edad",
  roomTypeId: "Acomodación",
  occupancy: "Ocupación",
  minTravelers: "Mínimo de viajeros",
  maxTravelers: "Máximo de viajeros",
  validFrom: "Venta desde",
  validTo: "Venta hasta",
};

export function actionLabel(action: string): string {
  const suffix = action.split(".").pop() ?? action;
  return ACTION_LABELS[suffix] ?? action;
}

function historyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "sin valor";
  if (key === "amountCents" || key === "amountOffCents")
    return typeof value === "string" ? formatCop(value) : String(value);
  if (key === "percentBps" && typeof value === "number") return `${bpsToPercent(value)} %`;
  if (key === "status") return statusLabel(String(value));
  if (key === "scope") return SCOPE_LABELS[value as ScopeKind] ?? String(value);
  if (key === "category") return CATEGORY_LABELS[String(value)] ?? String(value);
  if (key === "unit") return UNIT_LABELS[String(value)] ?? String(value);
  if (["startsAt", "endsAt", "validFrom", "validTo"].includes(key)) return formatInstantDate(String(value));
  if (key === "startsOn" || key === "endsOn") return formatDate(String(value));
  return String(value);
}

/** One line per field that changed between two audit snapshots ("Valor: $ 1.000 → $ 2.000"). */
export function summarizeChanges(row: Pick<AuditRow, "before" | "after">): string[] {
  const { before, after } = row;
  if (!before || !after) return [];
  const lines: string[] = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    lines.push(`${FIELD_LABELS[key]}: ${historyValue(key, a)} → ${historyValue(key, b)}`);
  }
  return lines;
}
