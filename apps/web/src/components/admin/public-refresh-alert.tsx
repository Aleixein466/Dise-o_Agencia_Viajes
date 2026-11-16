"use client";

import { useEffect, useState } from "react";
import { PUBLIC_REFRESH_EVENT } from "@/lib/auth/client";

/**
 * Content and settings saves also ask the public site to refresh its cache. When that cannot be confirmed the change
 * is saved but the site may keep showing the old version for up to an hour, so the editor is told right away. The
 * notice clears itself after the next confirmed refresh.
 */
export function PublicRefreshAlert() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onRefresh = (event: Event) => setFailed((event as CustomEvent<{ ok: boolean }>).detail?.ok === false);
    window.addEventListener(PUBLIC_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PUBLIC_REFRESH_EVENT, onRefresh);
  }, []);
  if (!failed) return null;
  return (
    <p className="admin-refresh-alert" role="alert">
      El cambio quedó guardado, pero el sitio público no confirmó la actualización y puede mostrar la versión anterior
      hasta por 1 hora. Vuelve a guardar o publicar para reintentarlo.
    </p>
  );
}
