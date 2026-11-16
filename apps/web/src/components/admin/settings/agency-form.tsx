"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { FormFields, type FieldDef } from "../commercial/form-fields";
import { formatDateTime } from "../commercial/helpers";
import { useCsrf } from "../commercial/use-commercial-data";
import { HistoryPanel, type AuditRow } from "../content/history-panel";
import {
  AGENCY_FIELDS,
  GROUP_TITLES,
  SECRETS_NOTICE,
  blankSettings,
  describeSettingsError,
  settingsActionLabel,
  settingsPayload,
  settingsValues,
  summarizeSettingsChanges,
  validateSettings,
  type SettingsErrors,
  type SettingsValues,
} from "./helpers";

const BASE = "/api/v1/settings/agency";
type Media = { id: string; altText: string };
type Loaded = { updatedAt: string | null };

export function AgencyForm({ session }: Readonly<{ session: AdminSession }>) {
  const csrf = useCsrf(session.csrfToken);
  const prefix = useId();
  const [values, setValues] = useState<SettingsValues>(blankSettings());
  const [stamp, setStamp] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<AuditRow[] | null | undefined>(undefined);
  const [focusTick, setFocusTick] = useState(0);
  const focusTarget = useRef<string>("summary");
  const summaryRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    const result = await requestJson(BASE, "GET");
    const data = result.data as (Loaded & Record<string, unknown>) | null;
    if (result.ok && data && typeof data === "object") {
      setValues(settingsValues(data));
      setStamp(data.updatedAt);
      setLoadError(null);
      setLoaded(true);
    } else setLoadError(describeSettingsError(result).message);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void requestJson(`${BASE}/media`, "GET").then((result) => {
        if (Array.isArray(result.data)) setMedia(result.data as Media[]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!focusTick) return;
    const target = focusTarget.current;
    if (target !== "summary") document.getElementById(`${prefix}-${target}`)?.focus();
    else summaryRef.current?.focus();
  }, [focusTick, prefix]);

  const fieldDefs = (group: keyof typeof GROUP_TITLES): FieldDef[] =>
    AGENCY_FIELDS.filter((f) => f.group === group).map((f) => ({
      name: f.name,
      label: f.label,
      maxLength: f.maxLength,
      hint: f.hint,
      wide: f.wide,
      type: f.textarea ? "textarea" : "text",
      inputMode: f.kind === "phone" ? "numeric" : undefined,
    }));
  const logoField: FieldDef = {
    name: "logoMediaId",
    label: "Logo",
    type: "select",
    wide: true,
    hint: "Se elige de la galería pública. Sin logo, el sitio no muestra ninguno.",
    options: [{ value: "", label: "Sin logo" }, ...media.map((item) => ({ value: item.id, label: item.altText }))],
  };

  function fail(message: string, field?: string) {
    setFormError(message);
    focusTarget.current = field ?? "summary";
    setFocusTick((tick) => tick + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const found = validateSettings(values);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = [...AGENCY_FIELDS.map((f) => f.name)].find((name) => found[name]);
      fail("Revisa los campos marcados.", first);
      return;
    }
    setFormError(null);
    setSaving(true);
    const result = await requestJson(BASE, "PATCH", { ...settingsPayload(values), expectedUpdatedAt: stamp }, csrf);
    setSaving(false);
    if (!result.ok) {
      const described = describeSettingsError(result);
      if (described.field) setErrors({ [described.field]: described.message });
      fail(described.message, described.field);
      if (described.code === "STALE_UPDATE") await load();
      return;
    }
    const data = result.data as Loaded & Record<string, unknown>;
    setValues(settingsValues(data));
    setStamp(data.updatedAt);
    setNotice("Configuración guardada.");
  }

  async function showHistory() {
    setHistory(null);
    const result = await requestJson(`${BASE}/history`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setHistory(undefined);
      fail("No se pudo consultar el historial.");
      return;
    }
    setHistory(result.data as AuditRow[]);
  }

  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby={`${prefix}-title`}>
        <h2 id={`${prefix}-title`}>Perfil de la agencia</h2>
        <p className="admin-hint" role="note">
          <strong>Sin secretos: </strong>
          {SECRETS_NOTICE}
        </p>
        <p className="admin-hint">
          Todos los campos son opcionales y se dejan vacíos hasta que la agencia los entregue: nada se inventa. Los
          datos del perfil, salvo el correo de reservas, pueden mostrarse en el sitio.
          {stamp ? (
            <>
              {" "}
              Última modificación: <time dateTime={stamp}>{formatDateTime(stamp)}</time>.
            </>
          ) : null}
        </p>
        {loadError ? (
          <p className="admin-form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        <div role="status" className="admin-success admin-status-slot">
          {notice}
        </div>
        {formError ? (
          <p ref={summaryRef} tabIndex={-1} role="alert" className="admin-form-error">
            {formError}
          </p>
        ) : null}
        {!loaded && !loadError ? <p className="admin-empty">Cargando…</p> : null}
        {loaded ? (
          <form
            className="admin-form admin-commercial-form admin-settings-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            {(Object.keys(GROUP_TITLES) as (keyof typeof GROUP_TITLES)[]).map((group) => (
              <fieldset key={group} className="admin-form admin-commercial-form">
                <legend>{GROUP_TITLES[group]}</legend>
                <FormFields
                  prefix={prefix}
                  fields={group === "identity" ? [...fieldDefs(group), logoField] : fieldDefs(group)}
                  values={values}
                  errors={errors}
                  onChange={(name, value) => {
                    setNotice(null);
                    setValues((current) => ({ ...current, [name]: value }));
                  }}
                />
              </fieldset>
            ))}
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? "Guardando…" : "Guardar configuración"}
              </button>
              <button type="button" className="admin-btn admin-btn-quiet" onClick={() => void showHistory()}>
                Historial
              </button>
            </div>
          </form>
        ) : null}
      </section>
      {history !== undefined ? (
        <HistoryPanel
          title="Configuración de la agencia"
          rows={history}
          actionLabel={settingsActionLabel}
          summarize={summarizeSettingsChanges}
          onClose={() => setHistory(undefined)}
        />
      ) : null}
    </div>
  );
}
