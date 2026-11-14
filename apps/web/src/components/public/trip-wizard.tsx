"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import {
  createAttemptKeys,
  requestPublic,
  submitQuoteRequest,
  type ApiFailure,
  type Destination,
  type PackageBuilder,
  type QuotePreview,
  type SubmitSuccess,
} from "./api";
import { ChildAgeFields, PriceSummary, TripSummary } from "./trip-parts";
import {
  INITIAL_STATE,
  MAX_ADULTS,
  MAX_CHILDREN,
  STEPS,
  activeSteps,
  loadState,
  nextStep,
  resizeChildAges,
  saveState,
  stepBlocker,
  toSelection,
  toggleId,
  type StepId,
  type WizardState,
} from "./wizard-state";
import "./wizard.css";

type Loaded<T> = { id: string; status: "ok"; data: T } | { id: string; status: "error"; message: string };
type ContactForm = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  dataConsent: boolean;
  marketingConsent: boolean;
  website: string;
};
const EMPTY_CONTACT: ContactForm = {
  name: "",
  email: "",
  phone: "",
  notes: "",
  dataConsent: false,
  marketingConsent: false,
  website: "",
};

const tomorrowInBogota = () =>
  new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export function validateContact(form: ContactForm, travelDate: string, minDate: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  if (name.length < 2 || name.length > 120) errors.name = "Escribe tu nombre completo (2 a 120 caracteres).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Escribe un correo electrónico válido.";
  const phone = form.phone.trim();
  if (phone.length < 7 || phone.length > 25) errors.phone = "Escribe un teléfono o WhatsApp de 7 a 25 caracteres.";
  if (travelDate && travelDate < minDate) errors.travelDate = "La fecha tentativa debe ser futura.";
  if (form.notes.length > 2000) errors.notes = "Las notas admiten máximo 2000 caracteres.";
  if (!form.dataConsent) errors.dataConsent = "Debes autorizar el tratamiento de tus datos para enviar la solicitud.";
  return errors;
}

function Choice({
  type,
  name,
  checked,
  onChange,
  children,
}: Readonly<{
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}>) {
  return (
    <label className={checked ? "wz-choice wz-choice-on" : "wz-choice"}>
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

function Notice({ error, onRetry }: Readonly<{ error: string; onRetry?: () => void }>) {
  return (
    <div className="form-status error" role="alert">
      {error}{" "}
      {onRetry ? (
        <button type="button" className="wz-link" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function TripWizard() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [destinations, setDestinations] = useState<Loaded<Destination[]> | null>(null);
  const [destTry, setDestTry] = useState(0);
  const [builderLoad, setBuilderLoad] = useState<Loaded<PackageBuilder> | null>(null);
  const [builderTry, setBuilderTry] = useState(0);
  const [previewLoad, setPreviewLoad] = useState<Loaded<QuotePreview> | null>(null);
  const [previewTry, setPreviewTry] = useState(0);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blocker, setBlocker] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiFailure | null>(null);
  const [result, setResult] = useState<SubmitSuccess | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [minDate] = useState(tomorrowInBogota);
  const [keys] = useState(() => createAttemptKeys());
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadState(window.sessionStorage);
      if (saved) setState(saved);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated && state.step !== "listo") saveState(window.sessionStorage, state);
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    void requestPublic<Destination[]>("/api/v1/public/destinations", { method: "GET", signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return;
        setDestinations(
          response.ok
            ? { id: "all", status: "ok", data: Array.isArray(response.data) ? response.data : [] }
            : { id: "all", status: "error", message: response.message },
        );
      },
    );
    return () => controller.abort();
  }, [hydrated, destTry]);

  const packageId = state.packageId;
  useEffect(() => {
    if (!hydrated || !packageId) return;
    const controller = new AbortController();
    void requestPublic<PackageBuilder>(`/api/v1/public/packages/${encodeURIComponent(packageId)}/builder`, {
      method: "GET",
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted) return;
      setBuilderLoad(
        response.ok
          ? { id: packageId, status: "ok", data: response.data }
          : {
              id: packageId,
              status: "error",
              message:
                response.code === "notfound" ? "Este paquete ya no está disponible. Elige otro." : response.message,
            },
      );
    });
    return () => controller.abort();
  }, [hydrated, packageId, builderTry]);

  const selection = toSelection(state);
  const selectionKey = selection ? JSON.stringify(selection) : "";
  const wantsPreview = state.step === "precio" && selectionKey !== "";
  useEffect(() => {
    if (!wantsPreview) return;
    const controller = new AbortController();
    void requestPublic<QuotePreview>("/api/v1/public/quote-preview", {
      method: "POST",
      body: JSON.parse(selectionKey) as unknown,
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted) return;
      setPreviewLoad(
        response.ok
          ? { id: selectionKey, status: "ok", data: response.data }
          : { id: selectionKey, status: "error", message: response.message },
      );
    });
    return () => controller.abort();
  }, [wantsPreview, selectionKey, previewTry]);

  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [state.step]);

  const builderEntry = builderLoad && builderLoad.id === packageId ? builderLoad : null;
  const builder = builderEntry?.status === "ok" ? builderEntry.data : null;
  const previewEntry = previewLoad && previewLoad.id === selectionKey ? previewLoad : null;
  const preview = previewEntry?.status === "ok" ? previewEntry.data : null;
  const steps: StepId[] = activeSteps(builder).filter((id) => id !== "listo");
  const stepIndex = steps.indexOf(state.step);
  const stepInfo = STEPS.find((item) => item.id === state.step) ?? STEPS[0];
  const patch = (changes: Partial<WizardState>) => setState((current) => ({ ...current, ...changes }));

  function go(direction: 1 | -1) {
    if (direction === 1) {
      const reason = stepBlocker(state, builder);
      setBlocker(reason);
      if (reason) return;
    } else setBlocker(null);
    setSubmitError(null);
    patch({ step: nextStep(state.step, builder, direction) });
  }

  function chooseDestination(id: string) {
    if (id === state.destinationId) return;
    patch({
      destinationId: id,
      packageId: "",
      hotelId: "",
      roomTypeId: "",
      transportOptionId: "",
      optionalTourIds: [],
      addOnIds: [],
    });
  }
  function choosePackage(id: string) {
    if (id === state.packageId) return;
    patch({ packageId: id, hotelId: "", roomTypeId: "", transportOptionId: "", optionalTourIds: [], addOnIds: [] });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !selection) return;
    const found = validateContact(contact, state.travelDate, minDate);
    setErrors(found);
    if (Object.keys(found).length) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const outcome = await submitQuoteRequest({
      selection,
      contact: { name: contact.name, email: contact.email, phone: contact.phone },
      travelDate: state.travelDate || undefined,
      notes: contact.notes,
      dataConsent: contact.dataConsent,
      marketingConsent: contact.marketingConsent,
      website: contact.website,
      idempotencyKey: keys.get(),
    });
    keys.settle(outcome);
    inFlight.current = false;
    setSubmitting(false);
    if (outcome.ok) {
      saveState(window.sessionStorage, null);
      setContact(EMPTY_CONTACT);
      setResult(outcome.data);
      patch({ step: "listo" });
    } else setSubmitError(outcome);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  function restart() {
    saveState(window.sessionStorage, null);
    setState(INITIAL_STATE);
    setResult(null);
    setCopied(null);
    setBuilderLoad(null);
    setPreviewLoad(null);
  }

  const builderGate = (content: (data: PackageBuilder) => ReactNode) => {
    if (!packageId) return <p className="wz-note">Primero elige un paquete.</p>;
    if (builderEntry?.status === "error")
      return (
        <Notice
          error={builderEntry.message}
          onRetry={() => {
            setBuilderLoad(null);
            setBuilderTry((n) => n + 1);
          }}
        />
      );
    if (!builder)
      return (
        <p className="wz-note" role="status">
          Cargando opciones…
        </p>
      );
    return content(builder);
  };

  function body(): ReactNode {
    switch (state.step) {
      case "destino": {
        if (!destinations)
          return (
            <p className="wz-note" role="status">
              Cargando destinos…
            </p>
          );
        if (destinations.status === "error")
          return (
            <Notice
              error={destinations.message}
              onRetry={() => {
                setDestinations(null);
                setDestTry((n) => n + 1);
              }}
            />
          );
        if (!destinations.data.length)
          return <p className="wz-note">Todavía no hay destinos publicados para armar tu viaje. Vuelve pronto.</p>;
        return (
          <fieldset className="wz-fieldset">
            <legend>Destino</legend>
            {destinations.data.map((item) => (
              <Choice
                key={item.id}
                type="radio"
                name="destination"
                checked={state.destinationId === item.id}
                onChange={() => chooseDestination(item.id)}
              >
                <strong>{item.name}</strong>
                {item.summary ? <small>{item.summary}</small> : null}
              </Choice>
            ))}
          </fieldset>
        );
      }
      case "paquete": {
        if (destinations?.status !== "ok")
          return <p className="wz-note">Vuelve al paso anterior para elegir un destino.</p>;
        const destination = destinations.data.find((item) => item.id === state.destinationId);
        if (!destination?.packages.length)
          return <p className="wz-note">Este destino aún no tiene paquetes publicados. Elige otro destino.</p>;
        return (
          <fieldset className="wz-fieldset">
            <legend>Paquetes en {destination.name}</legend>
            {destination.packages.map((item) => (
              <Choice
                key={item.id}
                type="radio"
                name="package"
                checked={state.packageId === item.id}
                onChange={() => choosePackage(item.id)}
              >
                <strong>{item.name}</strong>
                {item.durationDays !== null ? (
                  <small>
                    {item.durationDays} días{item.durationNights !== null ? ` / ${item.durationNights} noches` : ""}
                  </small>
                ) : null}
              </Choice>
            ))}
          </fieldset>
        );
      }
      case "hotel":
        return builderGate((data) => {
          if (!data.hotels.length)
            return (
              <p className="wz-note">Este paquete no tiene hoteles para elegir. Continúa con el siguiente paso.</p>
            );
          const hotel = data.hotels.find((item) => item.id === state.hotelId);
          return (
            <>
              <fieldset className="wz-fieldset">
                <legend>Hotel</legend>
                {data.hotels.map((item) => (
                  <Choice
                    key={item.id}
                    type="radio"
                    name="hotel"
                    checked={state.hotelId === item.id}
                    onChange={() => patch({ hotelId: item.id, roomTypeId: "" })}
                  >
                    <strong>{item.name}</strong>
                  </Choice>
                ))}
              </fieldset>
              {hotel?.roomTypes.length ? (
                <fieldset className="wz-fieldset">
                  <legend>Acomodación en {hotel.name}</legend>
                  {hotel.roomTypes.map((room) => (
                    <Choice
                      key={room.id}
                      type="radio"
                      name="room"
                      checked={state.roomTypeId === room.id}
                      onChange={() => patch({ roomTypeId: room.id })}
                    >
                      <strong>{room.name}</strong>
                      {room.occupancy !== null ? <small>Ocupación: {room.occupancy} personas</small> : null}
                    </Choice>
                  ))}
                </fieldset>
              ) : null}
            </>
          );
        });
      case "transporte":
        return builderGate((data) => (
          <fieldset className="wz-fieldset">
            <legend>Transporte</legend>
            <Choice
              type="radio"
              name="transport"
              checked={state.transportOptionId === ""}
              onChange={() => patch({ transportOptionId: "" })}
            >
              <strong>Sin transporte incluido</strong>
              <small>Lo coordino por mi cuenta</small>
            </Choice>
            {data.transportOptions.map((item) => (
              <Choice
                key={item.id}
                type="radio"
                name="transport"
                checked={state.transportOptionId === item.id}
                onChange={() => patch({ transportOptionId: item.id })}
              >
                <strong>{item.label}</strong>
              </Choice>
            ))}
          </fieldset>
        ));
      case "viajeros":
        return (
          <>
            <div className="form-row">
              <label className="field">
                Adultos
                <select
                  name="adults"
                  value={state.adults}
                  onChange={(event) => patch({ adults: Number(event.target.value) })}
                >
                  {Array.from({ length: MAX_ADULTS }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Niños (0 a 17 años)
                <select
                  name="children"
                  value={state.childAges.length}
                  onChange={(event) =>
                    patch({ childAges: resizeChildAges(state.childAges, Number(event.target.value)) })
                  }
                >
                  {Array.from({ length: MAX_CHILDREN + 1 }, (_, index) => (
                    <option key={index} value={index}>
                      {index}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ChildAgeFields
              ages={state.childAges}
              onChange={(index, value) =>
                patch({ childAges: state.childAges.map((age, position) => (position === index ? value : age)) })
              }
            />
          </>
        );
      case "extras":
        return builderGate((data) => (
          <>
            {data.optionalTours.length ? (
              <fieldset className="wz-fieldset">
                <legend>Tours opcionales</legend>
                {data.optionalTours.map((item) => (
                  <Choice
                    key={item.id}
                    type="checkbox"
                    name="tours"
                    checked={state.optionalTourIds.includes(item.id)}
                    onChange={() => patch({ optionalTourIds: toggleId(state.optionalTourIds, item.id) })}
                  >
                    <strong>{item.name}</strong>
                    {item.description ? <small>{item.description}</small> : null}
                  </Choice>
                ))}
              </fieldset>
            ) : null}
            {data.addOns.length ? (
              <fieldset className="wz-fieldset">
                <legend>Adicionales</legend>
                {data.addOns.map((item) => (
                  <Choice
                    key={item.id}
                    type="checkbox"
                    name="addons"
                    checked={state.addOnIds.includes(item.id)}
                    onChange={() => patch({ addOnIds: toggleId(state.addOnIds, item.id) })}
                  >
                    <strong>{item.name}</strong>
                  </Choice>
                ))}
              </fieldset>
            ) : null}
            {!data.optionalTours.length && !data.addOns.length ? (
              <p className="wz-note">
                Este paquete no tiene tours ni adicionales opcionales. Continúa con el siguiente paso.
              </p>
            ) : null}
          </>
        ));
      case "resumen":
        return builderGate((data) => (
          <>
            <TripSummary builder={data} state={state} />
            {!data.pricingAvailable ? (
              <p className="wz-note">Este paquete aún no tiene tarifas publicadas: un asesor confirmará el valor.</p>
            ) : null}
          </>
        ));
      case "precio": {
        if (!selection) return <p className="wz-note">Completa los pasos anteriores para ver el valor estimado.</p>;
        if (previewEntry?.status === "error")
          return (
            <Notice
              error={previewEntry.message}
              onRetry={() => {
                setPreviewLoad(null);
                setPreviewTry((n) => n + 1);
              }}
            />
          );
        if (!preview)
          return (
            <p className="wz-note" role="status">
              Calculando el valor estimado…
            </p>
          );
        return <PriceSummary preview={preview} />;
      }
      case "contacto":
        return builderGate((data) => (
          <ContactStep
            builder={data}
            state={state}
            preview={preview}
            contact={contact}
            setContact={setContact}
            travelDate={state.travelDate}
            setTravelDate={(value) => patch({ travelDate: value })}
            minDate={minDate}
            errors={errors}
            submitting={submitting}
            submitError={submitError}
            onSubmit={submit}
          />
        ));
      case "listo":
        return result ? (
          <div className="wz-done">
            <p>
              {result.replay
                ? "Esta solicitud ya estaba registrada."
                : "Recibimos tu solicitud. Un asesor te contactará."}
            </p>
            <dl>
              <div>
                <dt>Referencia</dt>
                <dd className="wz-code">{result.reference}</dd>
              </div>
              {result.trackingCode ? (
                <div>
                  <dt>Código de seguimiento</dt>
                  <dd className="wz-code">{result.trackingCode}</dd>
                </div>
              ) : null}
            </dl>
            {result.trackingCode ? (
              <>
                <p className="form-status" role="status">
                  Guarda este código ahora: solo se muestra una vez y lo necesitas, junto con la referencia, para
                  consultar tu solicitud.
                </p>
                <button type="button" className="btn btn-text" onClick={() => void copyCode(result.trackingCode ?? "")}>
                  {copied === "ok" ? <Check size={16} /> : <Copy size={16} />} Copiar código
                </button>
                <span role="status" className="wz-note">
                  {copied === "ok"
                    ? " Código copiado."
                    : copied === "fail"
                      ? " No se pudo copiar; cópialo manualmente."
                      : ""}
                </span>
              </>
            ) : (
              <p className="form-status">
                El código de seguimiento solo se muestra al enviar la solicitud por primera vez.
              </p>
            )}
            <div className="wz-nav">
              <Link className="btn btn-primary" href="/seguimiento">
                Consultar mi solicitud
              </Link>
              <button type="button" className="btn btn-text" onClick={restart}>
                Armar otro viaje
              </button>
            </div>
          </div>
        ) : (
          <p className="wz-note">No hay una solicitud reciente.</p>
        );
    }
  }

  if (!hydrated)
    return (
      <section className="form-panel wizard-panel" aria-busy="true">
        <p className="wz-note" role="status">
          Cargando…
        </p>
      </section>
    );

  const done = state.step === "listo";
  const nextLabel =
    state.step === "resumen" ? "Ver valor estimado" : state.step === "precio" ? "Continuar con mis datos" : "Siguiente";
  return (
    <section className="form-panel wizard-panel" aria-labelledby="wizard-title">
      <p className="wz-progress">
        {done ? "Listo" : `Paso ${stepIndex + 1} de ${steps.length}`}
        <span className="wz-bar" aria-hidden="true">
          <span style={{ width: `${done ? 100 : ((stepIndex + 1) / steps.length) * 100}%` }} />
        </span>
      </p>
      <p className="wz-sr" aria-live="polite" role="status">
        {done ? stepInfo.title : `Paso ${stepIndex + 1} de ${steps.length}: ${stepInfo.title}`}
      </p>
      <h2 id="wizard-title" ref={headingRef} tabIndex={-1}>
        {stepInfo.title}
      </h2>
      <div className="wz-body">{body()}</div>
      {blocker ? (
        <p className="form-status error" role="alert">
          {blocker}
        </p>
      ) : null}
      {done ? null : state.step === "contacto" ? (
        <div className="wz-nav">
          <button type="button" className="btn btn-text" onClick={() => go(-1)} disabled={submitting}>
            <ArrowLeft size={16} /> Atrás
          </button>
        </div>
      ) : (
        <div className="wz-nav">
          {stepIndex > 0 ? (
            <button type="button" className="btn btn-text" onClick={() => go(-1)}>
              <ArrowLeft size={16} /> Atrás
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => go(1)}>
            {nextLabel} <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}

function ContactStep({
  builder,
  state,
  preview,
  contact,
  setContact,
  travelDate,
  setTravelDate,
  minDate,
  errors,
  submitting,
  submitError,
  onSubmit,
}: Readonly<{
  builder: PackageBuilder;
  state: WizardState;
  preview: QuotePreview | null;
  contact: ContactForm;
  setContact: (next: ContactForm) => void;
  travelDate: string;
  setTravelDate: (value: string) => void;
  minDate: string;
  errors: Record<string, string>;
  submitting: boolean;
  submitError: ApiFailure | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => setContact({ ...contact, [key]: value });
  const fieldError = (name: string) =>
    errors[name] ? (
      <small className="field-error" id={`err-${name}`}>
        {errors[name]}
      </small>
    ) : null;
  const described = (name: string) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `err-${name}` } : {});
  return (
    <>
      <details className="wz-compact">
        <summary>Tu viaje</summary>
        <TripSummary builder={builder} state={state} showLists={false} />
        {preview ? <PriceSummary preview={preview} /> : null}
      </details>
      <form onSubmit={onSubmit} noValidate>
        <div className="form-row">
          <label className="field">
            Nombre completo *
            <input
              name="name"
              value={contact.name}
              onChange={(event) => set("name", event.target.value)}
              autoComplete="name"
              maxLength={120}
              required
              {...described("name")}
            />
            {fieldError("name")}
          </label>
          <label className="field">
            Correo electrónico *
            <input
              name="email"
              type="email"
              value={contact.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="email"
              maxLength={254}
              required
              {...described("email")}
            />
            {fieldError("email")}
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            WhatsApp o teléfono *
            <input
              name="phone"
              type="tel"
              value={contact.phone}
              onChange={(event) => set("phone", event.target.value)}
              autoComplete="tel"
              maxLength={25}
              required
              {...described("phone")}
            />
            {fieldError("phone")}
          </label>
          <label className="field">
            Fecha tentativa (opcional)
            <input
              name="travelDate"
              type="date"
              min={minDate}
              value={travelDate}
              onChange={(event) => setTravelDate(event.target.value)}
              {...described("travelDate")}
            />
            {fieldError("travelDate")}
          </label>
        </div>
        <label className="field">
          Notas (opcional)
          <textarea
            name="notes"
            value={contact.notes}
            onChange={(event) => set("notes", event.target.value)}
            maxLength={2000}
            {...described("notes")}
          />
          {fieldError("notes")}
        </label>
        <div className="honeypot" aria-hidden="true">
          <label>
            Sitio web
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={contact.website}
              onChange={(event) => set("website", event.target.value)}
            />
          </label>
        </div>
        <label className="checkbox-field">
          <input
            name="dataConsent"
            type="checkbox"
            checked={contact.dataConsent}
            onChange={(event) => set("dataConsent", event.target.checked)}
            required
            {...described("dataConsent")}
          />
          <span>
            Autorizo el tratamiento de mis datos para responder esta solicitud según la{" "}
            <a href="/privacidad" target="_blank" rel="noopener">
              política de privacidad
            </a>
            . *
          </span>
        </label>
        {fieldError("dataConsent")}
        <label className="checkbox-field">
          <input
            name="marketingConsent"
            type="checkbox"
            checked={contact.marketingConsent}
            onChange={(event) => set("marketingConsent", event.target.checked)}
          />
          <span>Deseo recibir novedades y ofertas de viaje. (Opcional)</span>
        </label>
        {submitError ? (
          <div className="form-status error" role="alert">
            {submitError.message}
            {submitError.code === "closed" ? null : " Puedes intentar de nuevo con el mismo botón."}
          </div>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Enviando…" : submitError ? "Reintentar envío" : "Enviar solicitud"}
        </button>
      </form>
    </>
  );
}
