import { useEffect, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { FieldOption } from "./form-fields";

/** Fresh CSRF token for mutations; starts from the one rendered with the page. */
export function useCsrf(initial: string): string {
  const [csrf, setCsrf] = useState(initial);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return csrf;
}

export type ScopeOptions = {
  destinations: FieldOption[];
  packages: FieldOption[];
  loaded: boolean;
  /** Human text for a row's scope: destination or package name. */
  label: (item: { scope: string; destinationId: string | null; packageId: string | null }) => string;
};

type NamedDestination = { id: string; name: string };
type NamedPackage = { id: string; title: string; destination?: { name?: string } | null };

/** Destinations and packages used to pick (and display) the scope of a rule. */
export function useScopeOptions(): ScopeOptions {
  const [state, setState] = useState<{ destinations: NamedDestination[]; packages: NamedPackage[]; loaded: boolean }>({
    destinations: [],
    packages: [],
    loaded: false,
  });
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([
        requestJson("/api/v1/catalog/destinations", "GET"),
        requestJson("/api/v1/catalog/packages?pageSize=50", "GET"),
      ]).then(([destinations, packages]) => {
        if (cancelled) return;
        const packageItems = (packages.data as { items?: NamedPackage[] } | null)?.items;
        setState({
          destinations: Array.isArray(destinations.data) ? (destinations.data as NamedDestination[]) : [],
          packages: Array.isArray(packageItems) ? packageItems : [],
          loaded: true,
        });
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return {
    loaded: state.loaded,
    destinations: state.destinations.map((item) => ({ value: item.id, label: item.name })),
    packages: state.packages.map((item) => ({
      value: item.id,
      label: item.destination?.name ? `${item.title} (${item.destination.name})` : item.title,
    })),
    label: (item) => {
      if (item.scope === "PACKAGE") {
        const found = state.packages.find((candidate) => candidate.id === item.packageId);
        return found ? `Paquete: ${found.title}` : "Paquete";
      }
      if (item.scope === "DESTINATION") {
        const found = state.destinations.find((candidate) => candidate.id === item.destinationId);
        return found ? `Destino: ${found.name}` : "Destino";
      }
      return "Global";
    },
  };
}
