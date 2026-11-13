"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { safeNextPath } from "@/lib/auth/access";
import { fetchCsrfToken, postJson } from "@/lib/auth/client";

const RATE_LIMITED = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";

function formValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

function Field({
  id,
  label,
  hint,
  children,
}: Readonly<{ id: string; label: string; hint?: string; children: ReactNode }>) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="admin-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ id, message }: Readonly<{ id: string; message: string | null }>) {
  return (
    <div id={id} role="alert" className="admin-form-error-slot">
      {message ? <p className="admin-form-error">{message}</p> : null}
    </div>
  );
}

// method="post" keeps credentials out of the URL if the script has not loaded yet.
export function LoginForm({ next }: Readonly<{ next: string }>) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    const result = await postJson("/api/v1/auth/login", {
      email: formValue(form, "email").trim(),
      password: formValue(form, "password"),
    });
    if (result.ok) {
      const mfaRequired = (result.data as { mfaRequired?: unknown } | null)?.mfaRequired === true;
      const target = safeNextPath(next);
      router.replace(mfaRequired ? `/ingresar/mfa?next=${encodeURIComponent(target)}` : target);
      router.refresh();
      return;
    }
    if (passwordRef.current) passwordRef.current.value = "";
    setPending(false);
    if (result.status === 401) setError("Correo o contraseña incorrectos.");
    else if (result.status === 429) setError(RATE_LIMITED);
    else setError("No fue posible iniciar sesión. Inténtalo de nuevo en unos minutos.");
  }

  return (
    <form method="post" action="/ingresar" onSubmit={onSubmit} className="admin-form" aria-busy={pending}>
      <Field id="login-email" label="Correo electrónico">
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
        />
      </Field>
      <Field id="login-password" label="Contraseña">
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          ref={passwordRef}
          required
          maxLength={128}
        />
      </Field>
      <FormError id="login-error" message={error} />
      <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
      <p className="admin-form-links">
        <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
      </p>
    </form>
  );
}

export function MfaForm({ next }: Readonly<{ next: string }>) {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = safeNextPath(next);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    const csrf = await fetchCsrfToken();
    if (csrf.status === 401) {
      router.replace(`/ingresar?next=${encodeURIComponent(target)}`);
      return;
    }
    if (csrf.mfaCompleted) {
      router.replace(target);
      router.refresh();
      return;
    }
    if (!csrf.csrfToken) {
      setPending(false);
      setError("No fue posible verificar el código. Inténtalo de nuevo en unos minutos.");
      return;
    }
    const code = formValue(form, "code").trim();
    const result = await postJson(
      recovery ? "/api/v1/auth/mfa/recovery" : "/api/v1/auth/mfa/totp/verify",
      { code },
      csrf.csrfToken,
    );
    if (result.ok) {
      router.replace(target);
      router.refresh();
      return;
    }
    form.reset();
    setPending(false);
    if (result.status === 429) setError(RATE_LIMITED);
    else if (result.status >= 400 && result.status < 500) setError("Código no válido o vencido.");
    else setError("No fue posible verificar el código. Inténtalo de nuevo en unos minutos.");
  }

  return (
    <form method="post" action="/ingresar/mfa" onSubmit={onSubmit} className="admin-form" aria-busy={pending}>
      {recovery ? (
        <Field
          id="mfa-recovery"
          label="Código de recuperación"
          hint="Cada código de recuperación solo se puede usar una vez."
        >
          <input
            id="mfa-recovery"
            key="recovery"
            name="code"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={64}
            aria-describedby="mfa-recovery-hint"
          />
        </Field>
      ) : (
        <Field id="mfa-code" label="Código de la aplicación de autenticación" hint="Código de 6 dígitos.">
          <input
            id="mfa-code"
            key="totp"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            spellCheck={false}
            required
            maxLength={6}
            aria-describedby="mfa-code-hint"
          />
        </Field>
      )}
      <FormError id="mfa-error" message={error} />
      <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
        {pending ? "Verificando…" : "Verificar"}
      </button>
      <p className="admin-form-links">
        <button
          type="button"
          className="admin-link-button"
          onClick={() => {
            setRecovery((value) => !value);
            setError(null);
          }}
        >
          {recovery ? "Usar el código de la aplicación" : "Usar un código de recuperación"}
        </button>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    const result = await postJson("/api/v1/auth/password/forgot", { email: formValue(form, "email").trim() });
    setPending(false);
    if (result.ok) setSent(true);
    else if (result.status === 429) setError(RATE_LIMITED);
    else setError("No fue posible procesar la solicitud. Inténtalo de nuevo en unos minutos.");
  }

  if (sent) {
    return (
      <div role="status" className="admin-notice">
        <p>Si el correo corresponde a una cuenta, recibirás instrucciones para restablecer la contraseña.</p>
        <p>
          <Link href="/ingresar">Volver a ingresar</Link>
        </p>
      </div>
    );
  }

  return (
    <form method="post" action="/recuperar" onSubmit={onSubmit} className="admin-form" aria-busy={pending}>
      <Field id="forgot-email" label="Correo electrónico">
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
        />
      </Field>
      <FormError id="forgot-error" message={error} />
      <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
        {pending ? "Enviando…" : "Enviar instrucciones"}
      </button>
      <p className="admin-form-links">
        <Link href="/ingresar">Volver a ingresar</Link>
      </p>
    </form>
  );
}

export function ResetForm({ token }: Readonly<{ token: string }>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div role="status" className="admin-notice">
        <p>El enlace no es válido o venció.</p>
        <p>
          <Link href="/recuperar">Solicitar un enlace nuevo</Link>
        </p>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = formValue(form, "password");
    if (password !== formValue(form, "confirm")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await postJson("/api/v1/auth/password/reset", { token, password });
    setPending(false);
    if (result.ok) {
      form.reset();
      setDone(true);
    } else if (result.status === 429) setError(RATE_LIMITED);
    else
      setError(
        "No fue posible restablecer la contraseña. El enlace pudo vencer o la contraseña no cumple los requisitos.",
      );
  }

  if (done) {
    return (
      <div role="status" className="admin-notice">
        <p>Tu contraseña fue actualizada.</p>
        <p>
          <Link href="/ingresar">Ingresar</Link>
        </p>
      </div>
    );
  }

  return (
    <form method="post" action="/restablecer" onSubmit={onSubmit} className="admin-form" aria-busy={pending}>
      <Field id="reset-password" label="Nueva contraseña" hint="Entre 12 y 128 caracteres.">
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          aria-describedby="reset-password-hint"
        />
      </Field>
      <Field id="reset-confirm" label="Confirmar nueva contraseña">
        <input
          id="reset-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </Field>
      <FormError id="reset-error" message={error} />
      <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
