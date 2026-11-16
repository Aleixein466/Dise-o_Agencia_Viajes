// Pure helpers for the content admin (FAQ, pages, home blocks).
import { describeError as describeCommonError, type ApiFailure } from "../commercial/helpers";

export type PublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type StatusAction = "publish" | "unpublish" | "archive" | "restore";
export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export const APPROVAL_WARNING =
  "Las promociones, precios y condiciones deben estar aprobados por la agencia antes de publicarse. Lo publicado se muestra a los visitantes del sitio; los borradores no.";

export const CONTENT_TABS = [
  { key: "faq", label: "Preguntas frecuentes" },
  { key: "paginas", label: "Páginas" },
  { key: "inicio", label: "Inicio y banners" },
] as const;
export type ContentTab = (typeof CONTENT_TABS)[number]["key"];

/** ?tab= value (possibly repeated or unknown) -> a valid tab; defaults to the FAQ. */
export function resolveContentTab(value: string | string[] | undefined): ContentTab {
  const first = Array.isArray(value) ? value[0] : value;
  return CONTENT_TABS.find((tab) => tab.key === first)?.key ?? "faq";
}

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};
export const statusLabel = (status: string) => STATUS_LABELS[status as PublicationStatus] ?? status;
export const statusBadgeClass = (status: string) =>
  status === "PUBLISHED" ? "approved" : status === "DRAFT" ? "draft" : "inactive";

export const KIND_LABELS: Record<string, string> = { PAGE: "Página", ARTICLE: "Artículo", GUIDE: "Guía" };
export const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

/** Actions available for a status, in display order. */
export function availableActions(status: string): StatusAction[] {
  if (status === "DRAFT") return ["publish", "archive"];
  if (status === "PUBLISHED") return ["unpublish", "archive"];
  if (status === "ARCHIVED") return ["restore"];
  return [];
}
export const ACTION_LABELS: Record<StatusAction, string> = {
  publish: "Publicar",
  unpublish: "Despublicar",
  archive: "Archivar",
  restore: "Restaurar",
};
export const ACTION_DONE: Record<StatusAction, string> = {
  publish: "publicado",
  unpublish: "vuelto a borrador",
  archive: "archivado",
  restore: "restaurado como borrador",
};

export function confirmText(action: StatusAction, name: string): string {
  const quoted = `"${name}"`;
  if (action === "publish")
    return `¿Publicar ${quoted}? Será visible para todos los visitantes del sitio. ${APPROVAL_WARNING} Al confirmar declaras que lo aprobaste.`;
  if (action === "unpublish")
    return `¿Despublicar ${quoted}? Dejará de mostrarse en el sitio y volverá a borrador para poder editarlo.`;
  if (action === "archive")
    return `¿Archivar ${quoted}? Dejará de mostrarse en el sitio; podrás restaurarlo como borrador.`;
  return `¿Restaurar ${quoted}? Volverá como borrador, sin publicarse.`;
}

// Errors --------------------------------------------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  NOT_EDITABLE: "Solo se pueden editar borradores. Despublica el contenido para editarlo.",
  INVALID_TRANSITION: "Esa acción ya no aplica al estado actual. Se recargó la lista.",
  SLUG_TAKEN: "Ya existe una página con ese enlace. Elige otro.",
  APPROVAL_REQUIRED: "Confirma que el contenido está aprobado antes de publicar.",
  MEDIA_NOT_FOUND: "La imagen elegida ya no existe o no es pública.",
  DESTINATION_NOT_FOUND: "Un destino elegido ya no existe.",
  NO_DRAFT: "No hay borrador para publicar.",
  NOT_PUBLISHED: "Este bloque no está publicado.",
  STALE_UPDATE: "Otra persona modificó este contenido. Se recargó: revisa y vuelve a intentar.",
};
const ERROR_FIELDS: Record<string, string> = { SLUG_TAKEN: "slug", MEDIA_NOT_FOUND: "imageId" };

export function describeContentError(failure: ApiFailure): { code: string; message: string; field?: string } {
  const common = describeCommonError(failure);
  return {
    code: common.code,
    message: ERROR_MESSAGES[common.code] ?? common.message,
    field: ERROR_FIELDS[common.code],
  };
}

// Shared text rules ---------------------------------------------------------------------------------------------------

function lengthError(value: string, label: string, min: number, max: number): string | undefined {
  const size = value.trim().length;
  if (size < min) return min <= 1 ? `${label} es obligatorio.` : `${label} debe tener al menos ${min} caracteres.`;
  if (size > max) return `${label} admite máximo ${max} caracteres.`;
  return undefined;
}
function optionalLength(value: string, label: string, max: number): string | undefined {
  return value.trim().length > max ? `${label} admite máximo ${max} caracteres.` : undefined;
}

/** http(s) URL without credentials, or a site path such as "/destinos". Mirrors the API rule. */
export function isSafeHref(value: string): boolean {
  if (/^\/(?![/\\])\S*$/.test(value)) return true;
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
const HREF_ERROR = "Usa una ruta del sitio (/destinos) o una dirección que empiece por http:// o https://.";

function compact(errors: FormErrors): FormErrors {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

// FAQ -----------------------------------------------------------------------------------------------------------------

export function blankFaq(): FormValues {
  return { question: "", answer: "", topic: "", sortOrder: "0" };
}
export function faqValues(item: {
  question: string;
  answer: string;
  topic: string | null;
  sortOrder: number;
}): FormValues {
  return { question: item.question, answer: item.answer, topic: item.topic ?? "", sortOrder: String(item.sortOrder) };
}
export function validateFaq(values: FormValues): FormErrors {
  const order = (values.sortOrder ?? "").trim();
  return compact({
    question: lengthError(values.question ?? "", "La pregunta", 5, 300) ?? "",
    answer: lengthError(values.answer ?? "", "La respuesta", 2, 8000) ?? "",
    topic: optionalLength(values.topic ?? "", "El tema", 80) ?? "",
    sortOrder: order && !/^\d{1,6}$/.test(order) ? "El orden es un número entero desde 0." : "",
  });
}
export function faqPayload(values: FormValues) {
  return {
    question: values.question.trim(),
    answer: values.answer.trim(),
    topic: values.topic.trim() || null,
    sortOrder: Number((values.sortOrder ?? "").trim() || "0"),
  };
}

// Pages ---------------------------------------------------------------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Cómo reservar tu viaje" -> "como-reservar-tu-viaje". */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}
export function blankPage(): FormValues {
  return {
    slug: "",
    kind: "PAGE",
    title: "",
    excerpt: "",
    body: "",
    seoTitle: "",
    seoDescription: "",
    noindex: "false",
  };
}
export function pageValues(item: {
  slug: string;
  kind: string;
  title: string;
  excerpt: string | null;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
}): FormValues {
  return {
    slug: item.slug,
    kind: item.kind,
    title: item.title,
    excerpt: item.excerpt ?? "",
    body: item.body,
    seoTitle: item.seoTitle ?? "",
    seoDescription: item.seoDescription ?? "",
    noindex: item.noindex ? "true" : "false",
  };
}
export function validatePage(values: FormValues): FormErrors {
  const slug = (values.slug ?? "").trim();
  return compact({
    slug: !slug
      ? "El enlace es obligatorio."
      : slug.length < 2 || slug.length > 160 || !SLUG_PATTERN.test(slug)
        ? "El enlace usa minúsculas, números y guiones (2 a 160 caracteres), sin espacios ni tildes."
        : "",
    kind: ["PAGE", "ARTICLE", "GUIDE"].includes(values.kind ?? "") ? "" : "Elige un tipo de contenido.",
    title: lengthError(values.title ?? "", "El título", 2, 200) ?? "",
    excerpt: optionalLength(values.excerpt ?? "", "El resumen", 500) ?? "",
    body: lengthError(values.body ?? "", "El contenido", 1, 40000) ?? "",
    seoTitle: optionalLength(values.seoTitle ?? "", "El título SEO", 70) ?? "",
    seoDescription: optionalLength(values.seoDescription ?? "", "La descripción SEO", 170) ?? "",
  });
}
export function pagePayload(values: FormValues) {
  return {
    slug: values.slug.trim(),
    kind: values.kind,
    title: values.title.trim(),
    excerpt: values.excerpt.trim() || null,
    body: values.body.trim(),
    seoTitle: values.seoTitle.trim() || null,
    seoDescription: values.seoDescription.trim() || null,
    noindex: values.noindex === "true",
  };
}

// Home blocks ---------------------------------------------------------------------------------------------------------

export type BlockName = "hero" | "featuredDestinations" | "banners";
export const BLOCK_TITLES: Record<BlockName, string> = {
  hero: "Portada del inicio",
  featuredDestinations: "Destinos destacados",
  banners: "Avisos y banners",
};
export const MAX_FEATURED = 6;
export const MAX_BANNERS = 5;

export type BannerValues = { title: string; text: string; href: string; imageId: string };
export const blankBanner = (): BannerValues => ({ title: "", text: "", href: "", imageId: "" });

const str = (value: unknown) => (typeof value === "string" ? value : "");

export function heroValues(draft: Record<string, unknown> | null): FormValues {
  return {
    headline: str(draft?.headline),
    subheadline: str(draft?.subheadline),
    ctaLabel: str(draft?.ctaLabel),
    ctaHref: str(draft?.ctaHref),
    imageId: str(draft?.imageId),
  };
}
export function validateHero(values: FormValues): FormErrors {
  const label = (values.ctaLabel ?? "").trim();
  const href = (values.ctaHref ?? "").trim();
  return compact({
    headline: lengthError(values.headline ?? "", "El titular", 3, 120) ?? "",
    subheadline: optionalLength(values.subheadline ?? "", "El subtítulo", 300) ?? "",
    ctaLabel: optionalLength(label, "El texto del botón", 40) || (href && !label ? "Escribe el texto del botón." : ""),
    ctaHref: href && !isSafeHref(href) ? HREF_ERROR : label && !href ? "Escribe el enlace del botón." : "",
  });
}
export function heroPayload(values: FormValues) {
  return {
    headline: values.headline.trim(),
    subheadline: values.subheadline.trim() || null,
    ctaLabel: values.ctaLabel.trim() || null,
    ctaHref: values.ctaHref.trim() || null,
    imageId: values.imageId || null,
  };
}

export function featuredValues(draft: Record<string, unknown> | null): { title: string; ids: string[] } {
  const items = Array.isArray(draft?.items) ? (draft.items as { destinationId?: unknown }[]) : [];
  return {
    title: str(draft?.title),
    ids: items.map((item) => str(item.destinationId)).filter(Boolean),
  };
}
export function validateFeatured(values: { title: string; ids: string[] }): FormErrors {
  return compact({
    title: optionalLength(values.title, "El título", 120) ?? "",
    ids:
      values.ids.length < 1
        ? "Elige al menos un destino."
        : values.ids.length > MAX_FEATURED
          ? `Elige máximo ${MAX_FEATURED} destinos.`
          : "",
  });
}
export function featuredPayload(values: { title: string; ids: string[] }) {
  return { title: values.title.trim() || null, items: values.ids.map((destinationId) => ({ destinationId })) };
}

export function bannerValues(draft: Record<string, unknown> | null): BannerValues[] {
  const items = Array.isArray(draft?.items) ? (draft.items as Record<string, unknown>[]) : [];
  return items.map((item) => ({
    title: str(item.title),
    text: str(item.text),
    href: str(item.href),
    imageId: str(item.imageId),
  }));
}
/** Errors keyed `items.<index>.<field>`, plus `items` for the list as a whole. */
export function validateBanners(items: readonly BannerValues[]): FormErrors {
  const errors: FormErrors = {};
  if (items.length < 1) errors.items = "Agrega al menos un aviso.";
  if (items.length > MAX_BANNERS) errors.items = `Máximo ${MAX_BANNERS} avisos.`;
  items.forEach((item, index) => {
    const title = lengthError(item.title, "El título", 2, 100);
    const text = optionalLength(item.text, "El texto", 300);
    const href = item.href.trim() && !isSafeHref(item.href.trim()) ? HREF_ERROR : undefined;
    if (title) errors[`items.${index}.title`] = title;
    if (text) errors[`items.${index}.text`] = text;
    if (href) errors[`items.${index}.href`] = href;
  });
  return errors;
}
export function bannersPayload(items: readonly BannerValues[]) {
  return {
    items: items.map((item) => ({
      title: item.title.trim(),
      text: item.text.trim() || null,
      href: item.href.trim() || null,
      imageId: item.imageId || null,
    })),
  };
}

// History -------------------------------------------------------------------------------------------------------------

const HISTORY_ACTIONS: Record<string, string> = {
  created: "Creado",
  updated: "Editado",
  published: "Publicado",
  unpublished: "Despublicado",
  archived: "Archivado",
  restored: "Restaurado",
  draft_saved: "Borrador guardado",
  draft_discarded: "Borrador descartado",
};
export function historyActionLabel(action: string): string {
  const suffix = action.split(".").pop() ?? action;
  return HISTORY_ACTIONS[suffix] ?? action;
}

export const FAQ_FIELD_LABELS: Record<string, string> = {
  question: "Pregunta",
  answer: "Respuesta",
  topic: "Tema",
  sortOrder: "Orden",
  status: "Estado",
};
export const PAGE_FIELD_LABELS: Record<string, string> = {
  slug: "Enlace",
  kind: "Tipo",
  title: "Título",
  excerpt: "Resumen",
  body: "Contenido",
  seoTitle: "Título SEO",
  seoDescription: "Descripción SEO",
  noindex: "No indexar",
  status: "Estado",
};

function historyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "sin valor";
  if (key === "status") return statusLabel(String(value));
  if (key === "kind") return kindLabel(String(value));
  if (key === "noindex") return value ? "Sí" : "No";
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** One line per field that changed between two audit snapshots ("Estado: Borrador → Publicado"). */
export function summarizeChanges(
  row: { before: Record<string, unknown> | null; after: Record<string, unknown> | null },
  labels: Record<string, string>,
): string[] {
  const { before, after } = row;
  if (!before || !after) return [];
  const lines: string[] = [];
  for (const key of Object.keys(labels)) {
    if (JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) continue;
    lines.push(`${labels[key]}: ${historyValue(key, before[key])} → ${historyValue(key, after[key])}`);
  }
  return lines;
}

/** Block history: says which copy (draft or published) moved. */
export function summarizeBlockChanges(row: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): string[] {
  const { before, after } = row;
  if (!after) return [];
  const lines: string[] = [];
  const moved = (key: string) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after[key] ?? null);
  if (moved("draft")) lines.push("Cambió el borrador.");
  if (moved("published"))
    lines.push(after.published ? "Cambió la versión publicada." : "Se retiró la versión publicada.");
  return lines;
}
