"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson } from "@/lib/auth/client";

export function LogoutButton({ csrfToken }: Readonly<{ csrfToken: string }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const result = await postJson("/api/v1/auth/logout", {}, csrfToken);
    if (result.ok || result.status === 401) {
      router.replace("/ingresar");
      router.refresh();
      return;
    }
    setPending(false);
    setError(true);
  }

  return (
    <form method="post" action="/ingresar" onSubmit={onSubmit} className="admin-logout">
      <button type="submit" className="admin-btn admin-btn-quiet" disabled={pending}>
        <LogOut size={16} aria-hidden="true" />
        <span>{pending ? "Cerrando sesión…" : "Cerrar sesión"}</span>
      </button>
      {error ? (
        <p role="alert" className="admin-form-error">
          No fue posible cerrar la sesión. Inténtalo de nuevo.
        </p>
      ) : null}
    </form>
  );
}
