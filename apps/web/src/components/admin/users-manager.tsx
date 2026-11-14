"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";

const ROLES = ["ADVISOR", "FINANCE", "ADMIN"] as const;
type StaffRole = (typeof ROLES)[number];
type User = {
  id: string;
  email: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  roles: StaffRole[];
  mfaEnrolled: boolean;
};
type Audit = { id: string; action: string; createdAt: string; actorId: string | null };
const roleLabel: Record<StaffRole, string> = { ADVISOR: "Asesor", FINANCE: "Finanzas", ADMIN: "Administrador" };
const rolePermissions: Record<StaffRole, string> = {
  ADVISOR: "Catálogo, clientes, cotizaciones y reservas",
  FINANCE: "Lectura operativa y operaciones financieras",
  ADMIN: "Gestión de personal, permisos, catálogo y auditoría",
};

function responseMessage(status: number): string {
  if (status === 401) return "La sesión terminó. Ingresa de nuevo.";
  if (status === 403) return "No tienes autorización para esta acción.";
  if (status === 409) return "Ya existe una cuenta con esos datos.";
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}

export function UsersManager({ session }: Readonly<{ session: AdminSession }>) {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatusFilter] = useState<"ALL" | User["status"]>("ALL");
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activity, setActivity] = useState<{ name: string; rows: Audit[] } | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", roles: ["ADVISOR"] as StaffRole[] });
  const canAssignRoles = session.permissions.includes("roles:assign");
  const canAudit = session.permissions.includes("audit:read");

  const load = useCallback(async (search = "") => {
    setLoading(true);
    const result = await requestJson(`/api/v1/users${search ? `?q=${encodeURIComponent(search)}` : ""}`, "GET");
    setLoading(false);
    if (!result.ok || !Array.isArray(result.data)) {
      setError(responseMessage(result.status));
      return;
    }
    setUsers(result.data as User[]);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void fetchCsrfToken().then((result) => {
        if (result.csrfToken) setCsrf(result.csrfToken);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => users.filter((user) => status === "ALL" || user.status === status), [status, users]);
  function toggleRole(role: StaffRole) {
    setForm((value) => ({
      ...value,
      roles: value.roles.includes(role) ? value.roles.filter((item) => item !== role) : [...value.roles, role],
    }));
  }
  async function mutate(path: string, method: "POST" | "PATCH" | "PUT", body: unknown, success: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await requestJson(path, method, body, csrf);
    setSaving(false);
    if (!result.ok) {
      setError(responseMessage(result.status));
      return false;
    }
    setNotice(success);
    await load(query.trim());
    return true;
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssignRoles || form.roles.length === 0) return;
    if (!(await mutate("/api/v1/users", "POST", form, "Empleado creado. Debe configurar MFA al ingresar."))) return;
    setForm({ email: "", name: "", password: "", roles: ["ADVISOR"] });
  }
  async function updateUser(user: User) {
    const name = window.prompt("Nombre del empleado", user.name);
    if (!name || name.trim() === user.name) return;
    await mutate(`/api/v1/users/${user.id}`, "PATCH", { name: name.trim() }, "Información actualizada.");
  }
  async function toggleUserStatus(user: User) {
    const disabling = user.status === "ACTIVE";
    if (
      !window.confirm(
        `${disabling ? "Desactivar" : "Activar"} la cuenta de ${user.name}?${disabling ? " Se revocarán todas sus sesiones." : ""}`,
      )
    )
      return;
    await mutate(
      `/api/v1/users/${user.id}`,
      "PATCH",
      { status: disabling ? "DISABLED" : "ACTIVE" },
      disabling ? "Cuenta desactivada y sesiones revocadas." : "Cuenta activada.",
    );
  }
  async function editRoles(user: User) {
    const selected = window.prompt(`Roles separados por coma: ${ROLES.join(", ")}`, user.roles.join(","));
    if (selected === null) return;
    const roles = selected
      .split(",")
      .map((role) => role.trim().toUpperCase())
      .filter((role): role is StaffRole => ROLES.includes(role as StaffRole));
    if (!roles.length || !window.confirm("Cambiar roles revocará las sesiones activas. ¿Continuar?")) return;
    await mutate(`/api/v1/users/${user.id}/roles`, "PUT", { roles }, "Roles actualizados y sesiones revocadas.");
  }
  async function showActivity(user: User) {
    const result = await requestJson(`/api/v1/users/${user.id}/activity`, "GET");
    if (!result.ok || !Array.isArray(result.data)) {
      setError(responseMessage(result.status));
      return;
    }
    setActivity({ name: user.name, rows: result.data as Audit[] });
  }

  return (
    <div className="admin-users">
      <section className="admin-panel" aria-labelledby="create-user">
        <h2 id="create-user">Crear empleado</h2>
        {!canAssignRoles ? (
          <p className="admin-empty">Tu rol puede consultar personal, pero no crear cuentas ni asignar roles.</p>
        ) : null}
        <form className="admin-form admin-users-form" onSubmit={create}>
          <div className="admin-field">
            <label htmlFor="user-name">Nombre</label>
            <input
              id="user-name"
              required
              minLength={2}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="user-email">Correo</label>
            <input
              id="user-email"
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="user-password">Contraseña temporal</label>
            <input
              id="user-password"
              type="password"
              minLength={12}
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <p className="admin-hint">Mínimo 12 caracteres. Compártela por un canal seguro.</p>
          </div>
          <fieldset className="admin-role-field">
            <legend>Roles autorizados</legend>
            {ROLES.map((role) => (
              <label key={role}>
                <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />{" "}
                {roleLabel[role]}
              </label>
            ))}
          </fieldset>
          <button
            className="admin-btn admin-btn-primary"
            disabled={!canAssignRoles || saving || form.roles.length === 0}
          >
            {saving ? "Guardando…" : "Crear empleado"}
          </button>
        </form>
      </section>
      <section className="admin-panel" aria-labelledby="staff-list">
        <div className="admin-section-heading">
          <div>
            <h2 id="staff-list">Personal</h2>
            <p className="admin-hint">
              Los permisos efectivos son definidos por la API y se actualizan al iniciar sesión.
            </p>
          </div>
          <button className="admin-btn admin-btn-quiet" onClick={() => void load(query.trim())} disabled={loading}>
            Actualizar
          </button>
        </div>
        <div className="admin-users-filters">
          <label className="admin-field" htmlFor="staff-search">
            <span>Buscar</span>
            <input
              id="staff-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(query.trim());
              }}
              placeholder="Nombre o correo"
            />
          </label>
          <label className="admin-field" htmlFor="staff-status">
            <span>Estado</span>
            <select
              id="staff-status"
              value={status}
              onChange={(event) => setStatusFilter(event.target.value as typeof status)}
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="DISABLED">Desactivados</option>
            </select>
          </label>
        </div>
        {error ? (
          <p className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="admin-success" role="status">
            {notice}
          </p>
        ) : null}
        {loading ? (
          <p className="admin-empty" aria-live="polite">
            Cargando personal…
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Estado y MFA</th>
                  <th>Roles y permisos</th>
                  <th>Último acceso</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <br />
                      <span>{user.email}</span>
                    </td>
                    <td>
                      <span className={`admin-status admin-status-${user.status.toLowerCase()}`}>
                        {user.status === "ACTIVE" ? "Activa" : "Desactivada"}
                      </span>
                      <br />
                      <span>{user.mfaEnrolled ? "MFA configurado" : "MFA pendiente"}</span>
                    </td>
                    <td>
                      {user.roles.map((role) => (
                        <span className="admin-role" key={role} title={rolePermissions[role]}>
                          {roleLabel[role]}
                        </span>
                      ))}
                      <details>
                        <summary>Ver permisos</summary>
                        {user.roles.map((role) => (
                          <p key={role}>
                            <strong>{roleLabel[role]}:</strong> {rolePermissions[role]}
                          </p>
                        ))}
                      </details>
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(
                            new Date(user.lastLoginAt),
                          )
                        : "Sin acceso"}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="admin-link-button" onClick={() => void updateUser(user)} disabled={saving}>
                          Editar
                        </button>
                        <button
                          className="admin-link-button"
                          onClick={() => void toggleUserStatus(user)}
                          disabled={saving}
                        >
                          {user.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        </button>
                        {canAssignRoles ? (
                          <button className="admin-link-button" onClick={() => void editRoles(user)} disabled={saving}>
                            Roles
                          </button>
                        ) : null}
                        {canAudit ? (
                          <button className="admin-link-button" onClick={() => void showActivity(user)}>
                            Actividad
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="admin-empty">No hay empleados que coincidan con el filtro.</p>
            ) : null}
          </div>
        )}
      </section>
      {activity ? (
        <section className="admin-panel" aria-labelledby="activity-title">
          <div className="admin-section-heading">
            <h2 id="activity-title">Actividad de {activity.name}</h2>
            <button className="admin-btn admin-btn-quiet" onClick={() => setActivity(null)}>
              Cerrar
            </button>
          </div>
          {activity.rows.length ? (
            <ol className="admin-activity">
              {activity.rows.map((row) => (
                <li key={row.id}>
                  <strong>{row.action}</strong>
                  <br />
                  <time>
                    {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(row.createdAt),
                    )}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="admin-empty">No hay eventos de personal para esta cuenta.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
