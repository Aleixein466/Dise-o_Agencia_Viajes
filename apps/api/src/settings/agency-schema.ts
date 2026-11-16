import { z } from "zod";
import { isHttpUrl, sanitizeText } from "../content/sanitize";

/** Agency profile. Only business data: credentials and API keys live in environment variables, never here. */
export const SECRET_KEY = /key|secret|token|password|passwd|credential/i;

const text = (max: number) =>
  z
    .union([z.null(), z.string().max(max * 4)])
    .optional()
    .transform((value) => (value === undefined ? undefined : sanitizeText(value ?? "") || null))
    .refine((value) => value === undefined || value === null || value.length <= max, "length");
const pattern = (max: number, regex: RegExp) =>
  text(max).refine((value) => value === undefined || value === null || regex.test(value), "format");
const phone = z
  .union([z.null(), z.string().max(40)])
  .optional()
  .transform((value) => (value === undefined ? undefined : (value ?? "").replace(/[\s().-]/g, "") || null))
  .refine((value) => value === undefined || value === null || /^\+?[0-9]{7,20}$/.test(value), "phone")
  .refine((value) => value === undefined || value === null || value.length <= 25, "length");
const email = z
  .union([z.null(), z.string().max(254)])
  .optional()
  .transform((value) => (value === undefined ? undefined : (value ?? "").trim().toLowerCase() || null))
  .refine((value) => value === undefined || value === null || z.email().safeParse(value).success, "email");
const url = z
  .union([z.null(), z.string().max(300)])
  .optional()
  .transform((value) => (value === undefined ? undefined : (value ?? "").trim() || null))
  .refine((value) => value === undefined || value === null || isHttpUrl(value), "url");
const date = z
  .union([z.null(), z.string()])
  .optional()
  .transform((value) => (value === undefined ? undefined : (value ?? "").trim() || null))
  .refine((value) => value === undefined || value === null || z.iso.date().safeParse(value).success, "date");

export const agencyFields = {
  tradeName: text(200),
  legalName: text(200),
  nit: pattern(30, /^[0-9][0-9.-]*$/),
  rnt: pattern(30, /^[0-9A-Za-z.-]+$/),
  rntValidUntil: date,
  address: text(250),
  city: text(100),
  phone,
  whatsapp: phone,
  contactEmail: email,
  bookingsEmail: email,
  businessHours: text(300),
  facebookUrl: url,
  instagramUrl: url,
  tiktokUrl: url,
  youtubeUrl: url,
  logoMediaId: z.union([z.null(), z.uuid()]).optional(),
};
export type AgencyField = keyof typeof agencyFields;
export const AGENCY_FIELDS = Object.keys(agencyFields) as AgencyField[];

export const agencyPatch = z
  .object({ ...agencyFields, expectedUpdatedAt: z.union([z.null(), z.iso.datetime().transform((v) => new Date(v))]) })
  .strict();

/** Fields safe to publish on the website (no internal bookings mailbox). */
export const PUBLIC_FIELDS = [
  "tradeName",
  "legalName",
  "nit",
  "rnt",
  "rntValidUntil",
  "address",
  "city",
  "phone",
  "whatsapp",
  "contactEmail",
  "businessHours",
  "facebookUrl",
  "instagramUrl",
  "tiktokUrl",
  "youtubeUrl",
] as const satisfies readonly AgencyField[];
