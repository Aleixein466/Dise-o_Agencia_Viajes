export type Money = string | null;

export type DestinationPackage = {
  id: string;
  slug: string;
  name: string;
  durationDays: number | null;
  durationNights: number | null;
};
export type Destination = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  packages: DestinationPackage[];
};
export type RoomType = { id: string; name: string; occupancy: number | null };
export type Hotel = { id: string; name: string; roomTypes: RoomType[] };
export type TransportOption = { id: string; mode: string; label: string };
export type OptionalTour = { id: string; name: string; description: string | null };
export type AddOn = { id: string; name: string };
export type PackageBuilder = {
  package: {
    id: string;
    slug: string;
    name: string;
    destinationName: string;
    durationDays: number | null;
    durationNights: number | null;
    inclusions: string[];
    exclusions: string[];
  };
  hotels: Hotel[];
  transportOptions: TransportOption[];
  optionalTours: OptionalTour[];
  addOns: AddOn[];
  pricingAvailable: boolean;
};

export type Selection = {
  packageId: string;
  hotelId?: string;
  roomTypeId?: string;
  transportOptionId?: string;
  adults: number;
  childAges: number[];
  optionalTourIds: string[];
  addOnIds: string[];
  /** YYYY-MM-DD; seasonal rates need it. */
  travelDate?: string;
  /** Entered by the customer; an unknown code only produces a notice. */
  promotionCode?: string;
};

export type PreviewLine = { label: string; quantity: number; unitAmountCents: Money; totalCents: Money };
export type QuotePreview = {
  status: "PRICED" | "REQUIRES_MANUAL_REVIEW";
  currency: string;
  totalCents: Money;
  lines: PreviewLine[];
  reasons: string[];
  travelDateRequired?: boolean;
  notices?: string[];
  promotion?: { code: string; name: string; discountCents: Money } | null;
};

export type Contact = { name: string; email: string; phone: string };
export type SubmitInput = {
  selection: Selection;
  contact: Contact;
  travelDate?: string;
  notes?: string;
  dataConsent: boolean;
  marketingConsent: boolean;
  website: string;
  idempotencyKey: string;
};

export type TrackResult = {
  reference: string;
  status: string;
  packageName: string | null;
  createdAt: string;
  travelDate: string | null;
  totalCents: Money;
  currency: string;
};

export type ErrorCode = "closed" | "rate" | "invalid" | "forbidden" | "network" | "server" | "notfound";
export type ApiFailure = { ok: false; code: ErrorCode; message: string };
export type ApiSuccess<T> = { ok: true; status: number; data: T };
export type ApiOutcome<T> = ApiSuccess<T> | ApiFailure;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  closed:
    "Las solicitudes aún no están habilitadas. Tu resumen sigue aquí y puedes volver más tarde, o escribirnos desde la página de contacto.",
  rate: "Hay demasiadas solicitudes en este momento. Espera un minuto e intenta de nuevo.",
  invalid: "Revisa los datos ingresados: alguno no es válido.",
  forbidden: "No pudimos validar el origen de la solicitud. Recarga la página e intenta de nuevo.",
  network: "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
  server: "Ocurrió un problema en el servidor. Intenta de nuevo en unos minutos.",
  notfound: "No encontramos información con esos datos.",
};

export function failure(code: ErrorCode, message?: string): ApiFailure {
  return { ok: false, code, message: message ?? ERROR_MESSAGES[code] };
}

export function codeForStatus(status: number): ErrorCode {
  if (status === 503) return "closed";
  if (status === 429) return "rate";
  if (status === 403) return "forbidden";
  if (status === 404) return "notfound";
  if (status >= 400 && status < 500) return "invalid";
  return "server";
}

type FetchLike = typeof fetch;

export async function requestPublic<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = { method: "GET" },
  fetchImpl: FetchLike = fetch,
): Promise<ApiOutcome<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: init.method,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
      headers: {
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    return failure("network");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) return failure(codeForStatus(response.status));
  return { ok: true, status: response.status, data: data as T };
}

export type SubmitSuccess = { reference: string; trackingCode: string | null; status: string; replay: boolean };

export function buildSubmitBody(input: SubmitInput) {
  const { selection, contact } = input;
  return {
    ...selection,
    ...(input.travelDate ? { travelDate: input.travelDate } : {}),
    contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    dataConsent: input.dataConsent,
    marketingConsent: input.marketingConsent,
    idempotencyKey: input.idempotencyKey,
    website: input.website,
  };
}

export async function submitQuoteRequest(
  input: SubmitInput,
  fetchImpl: FetchLike = fetch,
): Promise<ApiOutcome<SubmitSuccess>> {
  const result = await requestPublic<{ reference?: unknown; trackingCode?: unknown; status?: unknown } | null>(
    "/api/v1/public/quote-requests",
    { method: "POST", body: buildSubmitBody(input) },
    fetchImpl,
  );
  if (!result.ok) return result;
  const { reference, trackingCode, status } = result.data ?? {};
  if (typeof reference !== "string") return failure("server");
  return {
    ok: true,
    status: result.status,
    data: {
      reference,
      trackingCode: typeof trackingCode === "string" ? trackingCode : null,
      status: typeof status === "string" ? status : "",
      replay: result.status === 200,
    },
  };
}

/** Holds one idempotency key per attempt: reused on retry, renewed only after success or a rejected payload. */
export function createAttemptKeys(generate: () => string = () => crypto.randomUUID()) {
  let current: string | null = null;
  return {
    get(): string {
      current ??= generate();
      return current;
    },
    settle(outcome: ApiOutcome<unknown>) {
      if (outcome.ok || outcome.code === "invalid" || outcome.code === "forbidden") current = null;
    },
    peek: () => current,
  };
}
