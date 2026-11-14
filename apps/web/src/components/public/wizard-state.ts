import type { PackageBuilder, Selection } from "./api";

export const STEPS = [
  { id: "destino", title: "Elige tu destino" },
  { id: "paquete", title: "Elige un paquete" },
  { id: "hotel", title: "Hotel y acomodación" },
  { id: "transporte", title: "Transporte" },
  { id: "viajeros", title: "Viajeros" },
  { id: "extras", title: "Tours y adicionales" },
  { id: "resumen", title: "Resumen de tu viaje" },
  { id: "precio", title: "Valor estimado" },
  { id: "contacto", title: "Tus datos de contacto" },
  { id: "listo", title: "Solicitud enviada" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export const MAX_ADULTS = 30;
export const MAX_CHILDREN = 20;
export const MAX_EXTRAS = 20;

export type WizardState = {
  step: StepId;
  destinationId: string;
  packageId: string;
  hotelId: string;
  roomTypeId: string;
  transportOptionId: string;
  adults: number;
  /** One entry per child; "" until an age is chosen. */
  childAges: string[];
  optionalTourIds: string[];
  addOnIds: string[];
  travelDate: string;
};

export const INITIAL_STATE: WizardState = {
  step: "destino",
  destinationId: "",
  packageId: "",
  hotelId: "",
  roomTypeId: "",
  transportOptionId: "",
  adults: 2,
  childAges: [],
  optionalTourIds: [],
  addOnIds: [],
  travelDate: "",
};

export function resizeChildAges(ages: string[], count: number): string[] {
  const size = Math.max(0, Math.min(MAX_CHILDREN, Math.trunc(count) || 0));
  return Array.from({ length: size }, (_, index) => ages[index] ?? "");
}

export function clampAdults(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_ADULTS, Math.trunc(value)));
}

export function isValidAge(value: string): boolean {
  return /^\d{1,2}$/.test(value) && Number(value) >= 0 && Number(value) <= 17;
}

export function toggleId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((item) => item !== id);
  return ids.length >= MAX_EXTRAS ? ids : [...ids, id];
}

/** Steps shown for the current package; transport is skipped when the package has no options. */
export function activeSteps(builder: PackageBuilder | null): StepId[] {
  return STEPS.map((step) => step.id).filter(
    (id) => !(id === "transporte" && builder && !builder.transportOptions.length),
  );
}

export function nextStep(current: StepId, builder: PackageBuilder | null, direction: 1 | -1): StepId {
  const steps = activeSteps(builder);
  const index = steps.indexOf(current);
  const target = steps[Math.max(0, Math.min(steps.length - 1, index + direction))];
  return target ?? current;
}

export function toSelection(state: WizardState): Selection | null {
  if (!state.packageId || !state.childAges.every(isValidAge)) return null;
  return {
    packageId: state.packageId,
    ...(state.hotelId ? { hotelId: state.hotelId } : {}),
    ...(state.roomTypeId ? { roomTypeId: state.roomTypeId } : {}),
    ...(state.transportOptionId ? { transportOptionId: state.transportOptionId } : {}),
    adults: clampAdults(state.adults),
    childAges: state.childAges.map(Number),
    optionalTourIds: state.optionalTourIds,
    addOnIds: state.addOnIds,
  };
}

/** Why the user cannot leave this step yet, or null when they can. */
export function stepBlocker(state: WizardState, builder: PackageBuilder | null): string | null {
  switch (state.step) {
    case "destino":
      return state.destinationId ? null : "Elige un destino para continuar.";
    case "paquete":
      return state.packageId ? null : "Elige un paquete para continuar.";
    case "hotel": {
      if (!builder) return "Espera a que carguen las opciones.";
      if (builder.hotels.length && !state.hotelId) return "Elige un hotel para continuar.";
      const hotel = builder.hotels.find((item) => item.id === state.hotelId);
      if (hotel?.roomTypes.length && !state.roomTypeId) return "Elige una acomodación para continuar.";
      return null;
    }
    case "viajeros":
      if (state.adults < 1 || state.adults > MAX_ADULTS) return "Indica entre 1 y 30 adultos.";
      return state.childAges.every(isValidAge) ? null : "Indica la edad de cada niño.";
    default:
      return null;
  }
}

const STORAGE_KEY = "ricaurte.trip-wizard.v1";

/** Only trip choices are persisted; contact data never leaves component memory. */
export function loadState(storage: Pick<Storage, "getItem"> | undefined): WizardState | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    const step = STEPS.some((item) => item.id === parsed.step) ? (parsed.step as StepId) : "destino";
    const str = (value: unknown) => (typeof value === "string" ? value : "");
    const list = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, MAX_EXTRAS) : [];
    const ages = list(parsed.childAges);
    return {
      step: step === "listo" ? "destino" : step,
      destinationId: str(parsed.destinationId),
      packageId: str(parsed.packageId),
      hotelId: str(parsed.hotelId),
      roomTypeId: str(parsed.roomTypeId),
      transportOptionId: str(parsed.transportOptionId),
      adults: clampAdults(Number(parsed.adults ?? 2)),
      childAges: resizeChildAges(ages, ages.length),
      optionalTourIds: list(parsed.optionalTourIds),
      addOnIds: list(parsed.addOnIds),
      travelDate: str(parsed.travelDate),
    };
  } catch {
    return null;
  }
}

export function saveState(storage: Pick<Storage, "setItem" | "removeItem"> | undefined, state: WizardState | null) {
  try {
    if (!storage) return;
    if (state) storage.setItem(STORAGE_KEY, JSON.stringify(state));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: wizard keeps working without resume */
  }
}
