"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { useDialog } from "../use-dialog";
import { FormFields, type FieldDef } from "../commercial/form-fields";
import { formatDateTime } from "../commercial/helpers";
import { useCsrf } from "../commercial/use-commercial-data";
import {
  APPROVAL_WARNING,
  BLOCK_TITLES,
  MAX_BANNERS,
  MAX_FEATURED,
  bannerValues,
  bannersPayload,
  blankBanner,
  confirmText,
  describeContentError,
  featuredPayload,
  featuredValues,
  heroPayload,
  heroValues,
  historyActionLabel,
  summarizeBlockChanges,
  validateBanners,
  validateFeatured,
  validateHero,
  type BannerValues,
  type BlockName,
  type FormErrors,
  type FormValues,
} from "./helpers";
import { HistoryPanel, type AuditRow } from "./history-panel";

type Block = {
  block: BlockName;
  draft: Record<string, unknown> | null;
  published: Record<string, unknown> | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  updatedAt: string | null;
};
type Media = { id: string; altText: string };
type Destination = { id: string; name: string };
type Message = { kind: "notice" | "failure"; text: string };
type Confirm = ReturnType<typeof useDialog>["confirm"];

const BASE = "/api/v1/content";
const DESCRIPTIONS: Record<BlockName, string> = {
  hero: "Titular, subtítulo, botón e imagen de la portada. Sin inventar descuentos ni cifras.",
  featuredDestinations: "Hasta 6 destinos del catálogo que se destacan en el inicio.",
  banners: "Hasta 5 avisos. Si mencionan promociones o condiciones, deben estar aprobados antes de publicar.",
};

export function BlocksManager({ session }: Readonly<{ session: AdminSession }>) {
  const { confirm, dialog } = useDialog();
  const csrf = useCsrf(session.csrfToken);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Partial<Record<BlockName, Message>>>({});
  const report = useCallback(
    (name: BlockName, message?: Message) => setMessages((current) => ({ ...current, [name]: message })),
    [],
  );

  const load = useCallback(async () => {
    const result = await requestJson(`${BASE}/blocks`, "GET");
    if (result.ok && Array.isArray(result.data)) {
      setBlocks(result.data as Block[]);
      setLoadError(null);
    } else setLoadError(describeContentError(result).message);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void requestJson(`${BASE}/media`, "GET").then((result) => {
        if (Array.isArray(result.data)) setMedia(result.data as Media[]);
      });
      void requestJson("/api/v1/catalog/destinations", "GET").then((result) => {
        if (Array.isArray(result.data)) setDestinations(result.data as Destination[]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="admin-users">
      {dialog}
      <section className="admin-panel" aria-labelledby="blocks-intro">
        <h2 id="blocks-intro">Inicio y banners</h2>
        <p className="admin-hint">
          Cada bloque tiene un borrador y una copia publicada. Guardar el borrador no cambia el sitio: solo «Publicar»
          copia el borrador a lo publicado. Las imágenes se eligen de la galería pública.
        </p>
        <p className="admin-hint" role="note">
          <strong>Aprobación: </strong>
          {APPROVAL_WARNING}
        </p>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        {!blocks && !loadError ? <p className="admin-empty">Cargando…</p> : null}
      </section>
      {blocks?.map((block) => (
        <BlockSection
          key={`${block.block}-${block.updatedAt ?? "new"}`}
          block={block}
          media={media}
          destinations={destinations}
          csrf={csrf}
          confirm={confirm}
          reload={load}
          message={messages[block.block]}
          report={report}
        />
      ))}
    </div>
  );
}

function BlockSection({
  block,
  media,
  destinations,
  csrf,
  confirm,
  reload,
  message,
  report,
}: Readonly<{
  block: Block;
  media: Media[];
  destinations: Destination[];
  csrf: string;
  confirm: Confirm;
  reload: () => Promise<void>;
  message?: Message;
  report: (name: BlockName, message?: Message) => void;
}>) {
  const name = block.block;
  const prefix = useId();
  // Editing starts from the draft, or from what is live when there is no draft yet.
  const start = block.draft ?? block.published;
  const [hero, setHero] = useState<FormValues>(heroValues(start));
  const [featured, setFeatured] = useState(featuredValues(start));
  const [banners, setBanners] = useState<BannerValues[]>(bannerValues(start));
  const [errors, setErrors] = useState<FormErrors>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const notice = message?.kind === "notice" ? message.text : null;
  const failure = message?.kind === "failure" ? message.text : null;
  const setNotice = (text: string | null) => report(name, text ? { kind: "notice", text } : undefined);
  const setFailure = (text: string | null) => report(name, text ? { kind: "failure", text } : undefined);
  const [history, setHistory] = useState<AuditRow[] | null | undefined>(undefined);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    if (focusTick) summaryRef.current?.focus();
  }, [focusTick]);

  const mediaOptions = [
    { value: "", label: "Sin imagen" },
    ...media.map((item) => ({ value: item.id, label: item.altText })),
  ];
  const heroFields: FieldDef[] = [
    { name: "headline", label: "Titular", required: true, maxLength: 120, wide: true },
    { name: "subheadline", label: "Subtítulo", type: "textarea", maxLength: 300, wide: true, hint: "Opcional." },
    { name: "ctaLabel", label: "Texto del botón", maxLength: 40, hint: "Opcional. Va junto con el enlace." },
    {
      name: "ctaHref",
      label: "Enlace del botón",
      maxLength: 300,
      hint: "Ruta del sitio (/cotizar) o dirección https://.",
    },
    { name: "imageId", label: "Imagen", type: "select", options: mediaOptions, wide: true },
  ];
  const bannerFields: FieldDef[] = [
    { name: "title", label: "Título", required: true, maxLength: 100, wide: true },
    { name: "text", label: "Texto", type: "textarea", maxLength: 300, wide: true, hint: "Opcional." },
    { name: "href", label: "Enlace", maxLength: 300, hint: "Opcional. Ruta del sitio o dirección https://." },
    { name: "imageId", label: "Imagen", type: "select", options: mediaOptions },
  ];

  function build(): { errors: FormErrors; payload: Record<string, unknown> } {
    if (name === "hero") return { errors: validateHero(hero), payload: heroPayload(hero) };
    if (name === "featuredDestinations")
      return { errors: validateFeatured(featured), payload: featuredPayload(featured) };
    return { errors: validateBanners(banners), payload: bannersPayload(banners) };
  }
  const touch = () => {
    setDirty(true);
    setNotice(null);
  };

  async function save() {
    const built = build();
    setErrors(built.errors);
    if (Object.keys(built.errors).length) {
      setFailure("Revisa los campos marcados.");
      setFocusTick((tick) => tick + 1);
      return;
    }
    setFailure(null);
    setBusy(true);
    const result = await requestJson(
      `${BASE}/blocks/${name}`,
      "PUT",
      { expectedUpdatedAt: block.updatedAt, draft: built.payload },
      csrf,
    );
    setBusy(false);
    if (!result.ok) {
      const described = describeContentError(result);
      setFailure(described.message);
      setFocusTick((tick) => tick + 1);
      if (described.code === "STALE_UPDATE") await reload();
      return;
    }
    setNotice("Borrador guardado. El sitio no cambia hasta publicarlo.");
    setDirty(false);
    await reload();
  }

  async function act(action: "publish" | "unpublish" | "discard") {
    const title = BLOCK_TITLES[name];
    const accepted = await confirm(
      action === "discard"
        ? `¿Descartar el borrador de "${title}"? Volverá a la versión publicada (o quedará vacío si no hay).`
        : confirmText(action, title),
      {
        confirmLabel: action === "publish" ? "Publicar" : action === "unpublish" ? "Retirar" : "Descartar",
        danger: action !== "publish",
      },
    );
    if (!accepted) return;
    setFailure(null);
    setNotice(null);
    setBusy(true);
    const result = await requestJson(
      `${BASE}/blocks/${name}/${action}`,
      "POST",
      { expectedUpdatedAt: block.updatedAt, ...(action === "publish" ? { confirmApproved: true } : {}) },
      csrf,
    );
    setBusy(false);
    if (!result.ok) {
      setFailure(describeContentError(result).message);
      if (result.status === 409 || result.status === 404) await reload();
      return;
    }
    setNotice(
      action === "publish"
        ? "Publicado: ya se muestra en el sitio."
        : action === "unpublish"
          ? "Retirado del sitio. El borrador se conserva."
          : "Borrador descartado.",
    );
    await reload();
  }

  async function showHistory() {
    setHistory(null);
    const result = await requestJson(`${BASE}/blocks/${name}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(undefined);
      setFailure("No se pudo consultar el historial.");
      return;
    }
    setHistory(result.data as AuditRow[]);
  }

  const title = BLOCK_TITLES[name];
  const state = block.published
    ? block.hasUnpublishedChanges
      ? "Publicado, con cambios en borrador sin publicar"
      : "Publicado"
    : block.draft
      ? "Solo borrador: no se muestra en el sitio"
      : "Sin contenido: no se muestra en el sitio";
  const canPublish = !!block.draft && !dirty && block.hasUnpublishedChanges && !busy;

  return (
    <section className="admin-panel" aria-labelledby={`${prefix}-heading`}>
      <h2 id={`${prefix}-heading`}>{title}</h2>
      <p className="admin-hint">{DESCRIPTIONS[name]}</p>
      <p>
        <span className={`admin-badge admin-badge-${block.published ? "approved" : "draft"}`}>{state}</span>
        {block.publishedAt ? (
          <span className="admin-hint">
            {" "}
            · Publicado el <time dateTime={block.publishedAt}>{formatDateTime(block.publishedAt)}</time>
          </span>
        ) : null}
      </p>
      <div role="status" className="admin-success admin-status-slot">
        {notice}
      </div>
      {failure ? (
        <p ref={summaryRef} tabIndex={-1} role="alert" className="admin-form-error">
          {failure}
        </p>
      ) : null}
      <form
        className="admin-form admin-commercial-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {name === "hero" ? (
          <FormFields
            prefix={prefix}
            fields={heroFields}
            values={hero}
            errors={errors}
            onChange={(field, value) => {
              touch();
              setHero((current) => ({ ...current, [field]: value }));
            }}
          />
        ) : null}
        {name === "featuredDestinations" ? (
          <>
            <FormFields
              prefix={prefix}
              fields={[{ name: "title", label: "Título de la sección", maxLength: 120, wide: true, hint: "Opcional." }]}
              values={{ title: featured.title }}
              errors={errors}
              onChange={(_field, value) => {
                touch();
                setFeatured((current) => ({ ...current, title: value }));
              }}
            />
            <fieldset className="admin-field" aria-describedby={errors.ids ? `${prefix}-ids-error` : undefined}>
              <legend>Destinos (máximo {MAX_FEATURED})</legend>
              {destinations.length ? (
                destinations.map((destination) => {
                  const checked = featured.ids.includes(destination.id);
                  return (
                    <label key={destination.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && featured.ids.length >= MAX_FEATURED}
                        onChange={(event) => {
                          touch();
                          setFeatured((current) => ({
                            ...current,
                            ids: event.target.checked
                              ? [...current.ids, destination.id]
                              : current.ids.filter((id) => id !== destination.id),
                          }));
                        }}
                      />{" "}
                      {destination.name}
                    </label>
                  );
                })
              ) : (
                <p className="admin-hint">No hay destinos en el catálogo.</p>
              )}
              {errors.ids ? (
                <p id={`${prefix}-ids-error`} className="admin-field-error">
                  {errors.ids}
                </p>
              ) : null}
            </fieldset>
          </>
        ) : null}
        {name === "banners" ? (
          <>
            {errors.items ? (
              <p className="admin-field-error" role="alert">
                {errors.items}
              </p>
            ) : null}
            {banners.map((banner, index) => {
              const itemErrors: FormErrors = {};
              for (const key of ["title", "text", "href"])
                if (errors[`items.${index}.${key}`]) itemErrors[key] = errors[`items.${index}.${key}`];
              return (
                <fieldset key={index} className="admin-field">
                  <legend>Aviso {index + 1}</legend>
                  <FormFields
                    prefix={`${prefix}-b${index}`}
                    fields={bannerFields}
                    values={banner}
                    errors={itemErrors}
                    onChange={(field, value) => {
                      touch();
                      setBanners((current) =>
                        current.map((item, at) => (at === index ? { ...item, [field]: value } : item)),
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="admin-link-button"
                    aria-label={`Quitar aviso ${index + 1}`}
                    onClick={() => {
                      touch();
                      setBanners((current) => current.filter((_item, at) => at !== index));
                    }}
                  >
                    Quitar aviso
                  </button>
                </fieldset>
              );
            })}
            <div>
              <button
                type="button"
                className="admin-btn admin-btn-quiet"
                disabled={banners.length >= MAX_BANNERS}
                onClick={() => {
                  touch();
                  setBanners((current) => [...current, blankBanner()]);
                }}
              >
                Agregar aviso
              </button>
            </div>
          </>
        ) : null}
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            disabled={!canPublish}
            aria-label={`Publicar ${title}`}
            onClick={() => void act("publish")}
          >
            Publicar
          </button>
          {block.published ? (
            <button
              type="button"
              className="admin-btn admin-btn-quiet"
              disabled={busy}
              aria-label={`Retirar ${title} del sitio`}
              onClick={() => void act("unpublish")}
            >
              Retirar del sitio
            </button>
          ) : null}
          {block.draft ? (
            <button
              type="button"
              className="admin-btn admin-btn-quiet"
              disabled={busy}
              aria-label={`Descartar borrador de ${title}`}
              onClick={() => void act("discard")}
            >
              Descartar borrador
            </button>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            aria-label={`Historial de ${title}`}
            onClick={() => void showHistory()}
          >
            Historial
          </button>
        </div>
        {dirty ? <p className="admin-hint">Hay cambios sin guardar: guarda el borrador para poder publicar.</p> : null}
        {!block.draft ? <p className="admin-hint">Guarda un borrador para poder publicarlo.</p> : null}
      </form>
      {history !== undefined ? (
        <HistoryPanel
          title={title}
          rows={history}
          actionLabel={historyActionLabel}
          summarize={summarizeBlockChanges}
          onClose={() => setHistory(undefined)}
        />
      ) : null}
    </section>
  );
}
