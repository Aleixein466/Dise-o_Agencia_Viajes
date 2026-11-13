import type { ReactNode } from "react";

export function AuthCard({ title, intro, children }: Readonly<{ title: string; intro?: string; children: ReactNode }>) {
  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="eyebrow">Ricaurte Tours · Acceso del personal</span>
      <h1 id="auth-title">{title}</h1>
      {intro ? <p className="auth-intro">{intro}</p> : null}
      {children}
    </section>
  );
}
