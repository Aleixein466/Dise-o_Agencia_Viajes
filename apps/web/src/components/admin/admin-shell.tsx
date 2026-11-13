import type { ReactNode } from "react";
import { visibleNav } from "@/lib/auth/nav";
import type { AdminSession } from "@/lib/auth/types";
import { AdminNav } from "./admin-nav";
import { LogoutButton } from "./logout-button";

export function AdminShell({ session, children }: Readonly<{ session: AdminSession; children: ReactNode }>) {
  const items = visibleNav(session.permissions).map(({ href, label }) => ({ href, label }));
  return (
    <div className="admin-root">
      <a className="admin-skip" href="#admin-contenido">
        Saltar al contenido del panel
      </a>
      <header className="admin-header">
        <p className="admin-brand">
          Ricaurte Tours <span>Panel interno</span>
        </p>
        <div className="admin-user">
          <span className="admin-user-name">{session.user.displayName}</span>
          <LogoutButton csrfToken={session.csrfToken} />
        </div>
      </header>
      <div className="admin-body">
        <AdminNav items={items} />
        <div id="admin-contenido" tabIndex={-1} className="admin-content">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AdminNotice({ title, children }: Readonly<{ title: string; children?: ReactNode }>) {
  return (
    <div className="admin-root admin-root-bare">
      <section className="admin-notice-page" aria-labelledby="admin-notice-title">
        <h1 id="admin-notice-title">{title}</h1>
        {children}
      </section>
    </div>
  );
}
