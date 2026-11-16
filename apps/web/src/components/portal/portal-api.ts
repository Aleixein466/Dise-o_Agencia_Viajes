import { requestJson, type ApiResult } from "@/lib/auth/client";

export type ReservationRef = { id?: string; code: string; status: string };

export type QuoteSummary = {
  id: string;
  reference: string;
  status: string;
  packageName: string | null;
  destinationName: string | null;
  travelDate: string | null;
  adults: number;
  children: number;
  totalCents: string | null;
  currency: string;
  createdAt: string;
  reservation: ReservationRef | null;
};

export type QuoteLine = {
  label: string;
  quantity?: number;
  unitAmountCents?: string | null;
  totalCents?: string | null;
};

export type QuoteDetail = QuoteSummary & {
  revision: number;
  lines: QuoteLine[];
  inclusions: string[];
  exclusions: string[];
  hotelName: string | null;
  roomTypeName: string | null;
  reviewReasons: string[];
};

export type ReservationSummary = {
  id: string;
  code: string;
  status: string;
  packageName: string | null;
  startsOn: string | null;
  adults: number;
  children: number;
  totalCents: string | null;
  currency: string;
  availabilityValidatedAt: string | null;
  createdAt: string;
};

export type ReservationDetail = ReservationSummary & {
  version: number;
  travelers: { fullName: string; category: string; ageYears: number | null }[];
  history: { toStatus: string; at: string }[];
  conditions: { inclusions: string[]; exclusions: string[] };
};

export type CustomerSession = { csrfToken: string; displayName: string; email: string };
export type SessionState =
  { status: "loading" } | { status: "anonymous" } | { status: "error" } | ({ status: "ready" } & CustomerSession);

const API = "/api/v1";

export async function loadCustomerSession(): Promise<SessionState> {
  const result = await requestJson(`${API}/auth/session`, "GET");
  if (result.status === 401) return { status: "anonymous" };
  if (!result.ok) return { status: "error" };
  const data = result.data as {
    csrfToken?: unknown;
    roles?: unknown;
    user?: { email?: unknown; displayName?: unknown };
  } | null;
  const isCustomer = Array.isArray(data?.roles) && data.roles.includes("CUSTOMER");
  if (!isCustomer || typeof data?.csrfToken !== "string") return { status: "anonymous" };
  return {
    status: "ready",
    csrfToken: data.csrfToken,
    email: typeof data.user?.email === "string" ? data.user.email : "",
    displayName: typeof data.user?.displayName === "string" ? data.user.displayName : "",
  };
}

export const portalGet = (path: string): Promise<ApiResult> => requestJson(`${API}${path}`, "GET");
export const portalPost = (path: string, body: unknown, csrfToken?: string): Promise<ApiResult> =>
  requestJson(`${API}${path}`, "POST", body, csrfToken);

export function asList<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeQuoteDetail(data: unknown): QuoteDetail | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<QuoteDetail>;
  if (typeof raw.id !== "string") return null;
  return {
    ...(raw as QuoteDetail),
    lines: asList<QuoteLine>(raw.lines),
    inclusions: toStrings(raw.inclusions),
    exclusions: toStrings(raw.exclusions),
    reviewReasons: toStrings(raw.reviewReasons),
    hotelName: raw.hotelName ?? null,
    roomTypeName: raw.roomTypeName ?? null,
    reservation: raw.reservation ?? null,
  };
}

export function normalizeReservationDetail(data: unknown): ReservationDetail | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<ReservationDetail>;
  if (typeof raw.id !== "string") return null;
  return {
    ...(raw as ReservationDetail),
    travelers: asList(raw.travelers),
    history: asList(raw.history),
    conditions: {
      inclusions: toStrings(raw.conditions?.inclusions),
      exclusions: toStrings(raw.conditions?.exclusions),
    },
  };
}
