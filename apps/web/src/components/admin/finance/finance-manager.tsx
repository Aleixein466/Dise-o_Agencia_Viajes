"use client";

import { useEffect, useState } from "react";
import { fetchCsrfToken } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";
import { AbonosTab } from "./abonos-tab";
import { AdjustmentsTab } from "./adjustments-tab";
import { PlansTab } from "./plans-tab";

type Tab = "abonos" | "planes" | "ajustes";

const TABS: { id: Tab; label: string }[] = [
  { id: "abonos", label: "Abonos" },
  { id: "planes", label: "Planes de ahorro" },
  { id: "ajustes", label: "Ajustes" },
];

export function FinanceManager({ session }: Readonly<{ session: AdminSession }>) {
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [tab, setTab] = useState<Tab>("abonos");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="admin-users">
      <div role="group" aria-label="Secciones de finanzas" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "admin-btn admin-btn-primary" : "admin-btn admin-btn-quiet"}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "abonos" ? <AbonosTab session={session} csrf={csrf} /> : null}
      {tab === "planes" ? <PlansTab session={session} csrf={csrf} /> : null}
      {tab === "ajustes" ? <AdjustmentsTab csrf={csrf} /> : null}
    </div>
  );
}
