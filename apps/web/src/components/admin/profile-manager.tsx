"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";

const BASE = "/api/v1/auth/me";

type Profile = {
  user: { email: string; name: string; roles: string[]; createdAt: string; lastLoginAt: string | null };
  mfa: { enrolled: boolean; confirmedAt: string | null; lastUsedAt: string | null };
  recoveryCodesRemaining: number;
  sessions: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string | null;
    expiresAt: string;
    current: boolean;
    mfaVerified: boolean;
  }>;
};

type Activity = { id: string; action: string; createdAt: string };

const actionLabels: Record<string, string> = {
  "auth.login_succeeded": "Inicio de sesión correcto",
  "auth.mfa_verified": "Segundo factor verificado",
  "auth.password_changed": "Contraseña actualizada",
  "auth.email_change_requested": "Cambio de correo solicitado",
  "auth.email_changed": "Correo de acceso actualizado",
  "auth.recovery_codes_regenerated": "Códigos de recuperación regenerados",
  "auth.sessions_revoked_others": "Otras sesiones cerradas",
  "users.profile_name_changed": "Nombre del perfil actualizado",
};

function date(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Sin registro";
}

export function profileErrorMessage(result: { status: number; data: unknown }): string {
  const code = (result.data as { code?: unknown } | null)?.code;
  const messages: Record<string, string> = {
    INVALID_CURRENT_PASSWORD: "La contraseña actual no es correcta.",
    PASSWORD_UNCHANGED: "La nueva contraseña debe ser diferente.",
    PASSWORD_TOO_SHORT: "La nueva contraseña no cumple la longitud mínima.",
    PASSWORD_CONTAINS_IDENTITY: "La contraseña no debe contener tu nombre o correo.",
    EMAIL_UNCHANGED: "Ese ya es tu correo de acceso.",
    EMAIL_TAKEN: "Ese correo ya pertenece a otra cuenta.",
    INVALID_CODE: "El código es incorrecto o ya venció.",
    MAIL_DISABLED: "El cambio de correo estará disponible cuando se configure el correo de pruebas.",
    MAIL_FAILED: "No se pudo enviar el código. Inténtalo nuevamente.",
    MFA_NOT_ENROLLED: "Primero debes configurar y verificar MFA.",
  };
  if (typeof code === "string" && messages[code]) return messages[code];
  if (result.status === 429) return "Demasiados intentos. Espera unos minutos antes de volver a intentar.";
  if (result.status === 401) return "La sesión terminó. Vuelve a ingresar.";
  if (result.status === 403) return "La verificación de seguridad de la sesión no es válida.";
  return "No se pudo completar la operación.";
}

function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  inputMode,
}: Readonly<{
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "email" | "numeric" | "text";
}>) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} inputMode={inputMode} required />
    </div>
  );
}

export function ProfileManager({ session }: Readonly<{ session: AdminSession }>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const [me, trail] = await Promise.all([requestJson(BASE, "GET"), requestJson(`${BASE}/activity`, "GET")]);
    if (!me.ok) {
      setLoadError(profileErrorMessage(me));
      return;
    }
    setProfile(me.data as Profile);
    setActivity(Array.isArray(trail.data) ? (trail.data as Activity[]) : []);
    setLoadError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(
    key: string,
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    success: string,
  ) {
    event.preventDefault();
    setBusy(key);
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const result = await requestJson(`${BASE}${path}`, method, payload, session.csrfToken);
    setBusy(null);
    if (!result.ok) {
      setError(profileErrorMessage(result));
      return;
    }
    if (key === "email-request") setEmailPending(true);
    if (key === "email-confirm") setEmailPending(false);
    if (key === "recovery") {
      const codes = (result.data as { recoveryCodes?: unknown } | null)?.recoveryCodes;
      setRecoveryCodes(Array.isArray(codes) ? codes.filter((item): item is string => typeof item === "string") : []);
    }
    form.reset();
    setNotice(success);
    await load();
  }

  async function revokeSessions() {
    setBusy("sessions");
    setError(null);
    const result = await requestJson(`${BASE}/sessions/revoke-others`, "POST", {}, session.csrfToken);
    setBusy(null);
    if (!result.ok) setError(profileErrorMessage(result));
    else {
      const count = (result.data as { revoked?: number } | null)?.revoked ?? 0;
      setNotice(count ? `${count} sesión(es) cerrada(s).` : "No había otras sesiones activas.");
      await load();
    }
  }

  if (loadError)
    return (
      <p className="admin-form-error" role="alert">
        {loadError}
      </p>
    );
  if (!profile) return <p className="admin-empty">Cargando perfil seguro…</p>;

  return (
    <div className="admin-profile">
      <div className="admin-profile-feedback" aria-live="polite">
        <p className="admin-success" role="status">
          {notice}
        </p>
        {error ? (
          <p className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="admin-panel admin-profile-summary" aria-labelledby="profile-summary-title">
        <div>
          <p className="admin-profile-eyebrow">Cuenta protegida</p>
          <h2 id="profile-summary-title">{profile.user.name}</h2>
          <p>{profile.user.email}</p>
        </div>
        <dl className="admin-profile-facts">
          <div>
            <dt>Roles</dt>
            <dd>{profile.user.roles.join(", ")}</dd>
          </div>
          <div>
            <dt>MFA</dt>
            <dd>{profile.mfa.enrolled ? "Configurado" : "Pendiente"}</dd>
          </div>
          <div>
            <dt>Códigos disponibles</dt>
            <dd>{profile.recoveryCodesRemaining}</dd>
          </div>
          <div>
            <dt>Último acceso</dt>
            <dd>{date(profile.user.lastLoginAt)}</dd>
          </div>
        </dl>
      </section>

      <div className="admin-profile-grid">
        <section className="admin-panel" aria-labelledby="profile-name-title">
          <h2 id="profile-name-title">Información personal</h2>
          <form
            className="admin-form"
            onSubmit={(event) => void submit("name", event, "", "PATCH", "Nombre actualizado.")}
          >
            <Field id="profile-name" name="name" label="Nombre visible" autoComplete="name" />
            <button className="admin-btn admin-btn-primary" disabled={busy !== null}>
              Guardar nombre
            </button>
          </form>
        </section>

        <section className="admin-panel" aria-labelledby="profile-password-title">
          <h2 id="profile-password-title">Cambiar contraseña</h2>
          <form
            className="admin-form"
            onSubmit={(event) =>
              void submit(
                "password",
                event,
                "/password",
                "POST",
                "Contraseña actualizada; las otras sesiones fueron cerradas.",
              )
            }
          >
            <Field
              id="password-current"
              name="currentPassword"
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
            />
            <Field
              id="password-new"
              name="newPassword"
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
            />
            <p className="admin-hint">Mínimo 12 caracteres; evita tu nombre, correo y claves reutilizadas.</p>
            <button className="admin-btn admin-btn-primary" disabled={busy !== null}>
              Actualizar contraseña
            </button>
          </form>
        </section>

        <section className="admin-panel" aria-labelledby="profile-email-title">
          <h2 id="profile-email-title">Cambiar correo de acceso</h2>
          {!emailPending ? (
            <form
              className="admin-form"
              onSubmit={(event) =>
                void submit("email-request", event, "/email/request", "POST", "Código enviado al nuevo correo.")
              }
            >
              <Field
                id="email-new"
                name="newEmail"
                label="Nuevo correo"
                type="email"
                autoComplete="email"
                inputMode="email"
              />
              <Field
                id="email-password"
                name="currentPassword"
                label="Contraseña actual"
                type="password"
                autoComplete="current-password"
              />
              <button className="admin-btn admin-btn-primary" disabled={busy !== null}>
                Enviar código
              </button>
            </form>
          ) : (
            <form
              className="admin-form"
              onSubmit={(event) =>
                void submit("email-confirm", event, "/email/confirm", "POST", "Correo de acceso actualizado.")
              }
            >
              <Field id="email-code" name="code" label="Código de 6 dígitos" inputMode="numeric" />
              <button className="admin-btn admin-btn-primary" disabled={busy !== null}>
                Confirmar correo
              </button>
            </form>
          )}
        </section>

        <section className="admin-panel" aria-labelledby="profile-recovery-title">
          <h2 id="profile-recovery-title">Recuperación y sesiones</h2>
          <p className="admin-hint">Regenerar invalida todos los códigos de recuperación anteriores.</p>
          <form
            className="admin-form"
            onSubmit={(event) =>
              void submit("recovery", event, "/recovery-codes", "POST", "Guarda ahora los nuevos códigos.")
            }
          >
            <Field
              id="recovery-password"
              name="currentPassword"
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
            />
            <button className="admin-btn admin-btn-primary" disabled={busy !== null}>
              Regenerar códigos
            </button>
          </form>
          {recoveryCodes ? (
            <div className="admin-profile-codes" role="region" aria-label="Nuevos códigos de recuperación">
              <strong>Se muestran una sola vez</strong>
              <code>{recoveryCodes.join("  ")}</code>
            </div>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            disabled={busy !== null}
            onClick={() => void revokeSessions()}
          >
            Cerrar otras sesiones
          </button>
        </section>
      </div>

      <section className="admin-panel" aria-labelledby="profile-sessions-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="profile-sessions-title">Sesiones activas</h2>
            <p className="admin-hint">Solo se muestran metadatos de seguridad; nunca tokens ni direcciones IP.</p>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-profile-table">
            <thead>
              <tr>
                <th>Sesión</th>
                <th>Creada</th>
                <th>Última actividad</th>
                <th>Vence</th>
                <th>MFA</th>
              </tr>
            </thead>
            <tbody>
              {profile.sessions.map((item) => (
                <tr key={item.id}>
                  <td>{item.current ? "Esta sesión" : "Otro dispositivo"}</td>
                  <td>{date(item.createdAt)}</td>
                  <td>{date(item.lastSeenAt)}</td>
                  <td>{date(item.expiresAt)}</td>
                  <td>{item.mfaVerified ? "Verificado" : "Pendiente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel" aria-labelledby="profile-activity-title">
        <h2 id="profile-activity-title">Actividad de seguridad reciente</h2>
        {activity.length ? (
          <ol className="admin-activity">
            {activity.map((item) => (
              <li key={item.id}>
                <strong>{actionLabels[item.action] ?? item.action}</strong>
                <br />
                <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-empty">No hay actividad reciente para mostrar.</p>
        )}
      </section>
    </div>
  );
}
