"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { portalErrorMessage } from "./portal-logic";
import { loadCustomerSession, portalPost, type CustomerSession, type SessionState } from "./portal-api";
import "../public/wizard.css";
import "./portal.css";

const GENERIC_CODE_MESSAGE =
  "Si el correo corresponde a una cuenta con solicitudes, te enviamos un código de 8 dígitos. Revisa tu bandeja de entrada y la carpeta de spam.";

function LoginForm({ onLoggedIn }: Readonly<{ onLoggedIn: (session: SessionState) => void }>) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    else emailRef.current?.focus();
  }, [step]);

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await portalPost("/customer-auth/request-code", { email: email.trim() });
    setPending(false);
    if (result.ok) {
      setInfo(GENERIC_CODE_MESSAGE);
      setStep("code");
      return;
    }
    setError(
      result.status === 400
        ? "Revisa que el correo electrónico sea válido."
        : portalErrorMessage(result.status, "No pudimos enviar el código. Inténtalo de nuevo en unos minutos."),
    );
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await portalPost("/customer-auth/verify", { email: email.trim(), code: code.trim() });
    if (result.ok) {
      onLoggedIn(await loadCustomerSession());
      return;
    }
    setPending(false);
    setCode("");
    setError(
      result.status === 400
        ? "El código no es válido o ya venció. Revisa el correo o solicita uno nuevo."
        : portalErrorMessage(result.status, "No pudimos verificar el código. Inténtalo de nuevo."),
    );
    codeRef.current?.focus();
  }

  return (
    <form
      className="form-panel wizard-panel"
      onSubmit={step === "email" ? requestCode : verify}
      aria-labelledby="portal-login-title"
      aria-busy={pending}
    >
      <h2 id="portal-login-title">{step === "email" ? "Ingresa a tu cuenta" : "Escribe tu código"}</h2>
      {step === "email" ? (
        <>
          <p>
            Te enviaremos un código de un solo uso al correo con el que hiciste tu solicitud. No necesitas contraseña.
          </p>
          <label className="field">
            Correo electrónico
            <input
              ref={emailRef}
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
            />
          </label>
        </>
      ) : (
        <>
          <p role="status">{info}</p>
          <label className="field">
            Código de 8 dígitos
            <input
              ref={codeRef}
              name="code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              spellCheck={false}
              aria-describedby="portal-code-hint"
            />
            <small id="portal-code-hint" className="wz-note">
              Solo números. El código vence pronto y solo sirve una vez.
            </small>
          </label>
        </>
      )}
      <div aria-live="assertive">
        {error ? (
          <p className="form-status error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="wz-nav">
        <button className="btn btn-primary" type="submit" disabled={pending || (step === "code" && code.length !== 8)}>
          {pending ? "Un momento…" : step === "email" ? "Enviar código" : "Ingresar"}
        </button>
        {step === "code" ? (
          <>
            <button
              type="button"
              className="wz-link"
              disabled={pending}
              onClick={() => {
                setCode("");
                void requestCode();
              }}
            >
              Reenviar código
            </button>
            <button
              type="button"
              className="wz-link"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Usar otro correo
            </button>
          </>
        ) : null}
      </div>
      <p className="wz-note portal-seguimiento">
        ¿Solo quieres ver el estado de una solicitud con tu código? Usa el <Link href="/seguimiento">seguimiento</Link>.
      </p>
    </form>
  );
}

function LogoutButton({ csrfToken, onLoggedOut }: Readonly<{ csrfToken: string; onLoggedOut: () => void }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    setPending(true);
    setError(false);
    const result = await portalPost("/auth/logout", {}, csrfToken);
    if (result.ok || result.status === 401) {
      onLoggedOut();
      router.replace("/mi-cuenta");
      return;
    }
    setPending(false);
    setError(true);
  }

  return (
    <div className="portal-logout">
      <button type="button" className="portal-btn-quiet" onClick={logout} disabled={pending}>
        {pending ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {error ? (
        <p role="alert" className="form-status error">
          No fue posible cerrar la sesión. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  );
}

/** Resolves the customer session; shows the login form when anonymous and renders children once signed in. */
export function PortalGate({ children }: Readonly<{ children: (session: CustomerSession) => ReactNode }>) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadCustomerSession().then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session.status === "loading") {
    return (
      <p className="portal-loading" role="status">
        Cargando tu cuenta…
      </p>
    );
  }
  if (session.status === "error") {
    return (
      <p className="form-status error" role="alert">
        No pudimos verificar tu sesión. Recarga la página en unos minutos.
      </p>
    );
  }
  if (session.status === "anonymous") return <LoginForm onLoggedIn={setSession} />;

  return (
    <>
      <div className="portal-bar">
        <p>
          Sesión iniciada
          {session.email ? (
            <>
              {" "}
              como <strong>{session.email}</strong>
            </>
          ) : null}
        </p>
        <LogoutButton csrfToken={session.csrfToken} onLoggedOut={() => setSession({ status: "anonymous" })} />
      </div>
      {children(session)}
    </>
  );
}
