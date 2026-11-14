export type AdminModule = {
  slug: string;
  href: string;
  label: string;
  /** Any one of these grants access. null = every signed-in staff member (dashboard). */
  permissions: readonly string[] | null;
};

function moduleFor(slug: string, label: string, resource: string): AdminModule {
  return { slug, href: `/admin/${slug}`, label, permissions: [`${resource}:read`, `${resource}:write`] };
}

export const DASHBOARD: AdminModule = { slug: "", href: "/admin", label: "Dashboard", permissions: null };

export const ADMIN_MODULES: readonly AdminModule[] = [
  moduleFor("destinos", "Destinos", "catalog"),
  moduleFor("paquetes", "Paquetes", "catalog"),
  moduleFor("hoteles", "Hoteles", "catalog"),
  moduleFor("transporte", "Transporte", "catalog"),
  moduleFor("tours", "Tours", "catalog"),
  moduleFor("galeria", "Galería", "catalog"),
  moduleFor("tarifas", "Tarifas y temporadas", "catalog"),
  moduleFor("cupos", "Cupos", "inventory"),
  moduleFor("cotizaciones", "Cotizaciones", "quotes"),
  moduleFor("reservas", "Reservas", "bookings"),
  moduleFor("clientes", "Clientes", "customers"),
  moduleFor("usuarios", "Usuarios", "staff"),
  moduleFor("finanzas", "Finanzas", "payments"),
  moduleFor("contenido", "Contenido y SEO", "content"),
  moduleFor("pqr", "PQR", "pqrs"),
  moduleFor("auditoria", "Auditoría", "audit"),
  moduleFor("configuracion", "Configuración", "settings"),
];

export function findModule(slug: string): AdminModule | undefined {
  return ADMIN_MODULES.find((item) => item.slug === slug);
}

/** Exact match, `resource:*` or `*`. */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes(required) || granted.includes("*")) return true;
  return granted.includes(`${required.split(":")[0]}:*`);
}

export function canAccessModule(granted: readonly string[], item: AdminModule): boolean {
  if (item.permissions === null) return true;
  return item.permissions.some((permission) => hasPermission(granted, permission));
}

export function visibleNav(granted: readonly string[]): AdminModule[] {
  return [DASHBOARD, ...ADMIN_MODULES].filter((item) => canAccessModule(granted, item));
}
