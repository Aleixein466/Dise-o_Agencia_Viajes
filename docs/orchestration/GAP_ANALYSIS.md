# Gap analysis — requisitos v2.0 vs. `main` (99844b7)

Estados: **I** implementado · **P** parcial · **A** ausente · **BC** bloqueado por cliente (sección 26 / PC).

| Área (req.) | Estado | Evidencia | Falta |
| --- | --- | --- | --- |
| Sitio público §5 | P | `src/app/page.tsx`, `destinos/*` | Categorías comerciales (terrestres, aéreos, internacionales, pasadías, especiales), quiénes somos, mapa, WhatsApp contextual (BC: número), modo oscuro, `lang=es-CO` |
| Histórico vs. oferta | I | `demo-data.ts` etiqueta «Viaje realizado» | Mantener al crear catálogo real; nunca migrar a `TourPackage` |
| Categorías/catálogo §4 | A (esquema P) | `Destination`, `TourPackage` | `DestinationCategory`, `TransportMode`, `Hotel`, `RoomType`, `Tour`, `AddOn`, compatibilidades; contenido BC |
| Constructor §6 | A | — | Todo |
| Motor de precios §7 | A | `basePrice Decimal` | `PricingService` puro, reglas, snapshots; PC-4 (Excel) BC |
| Moneda §8 | P | `currency @default("COP")` | Formateador centralizado, USD informativo, `ExchangeRate` |
| Disponibilidad §9 | P (esquema) | `Departure.capacity/heldSeats` | Transacciones/locks, estados, retenciones; reglas BC |
| Cotizaciones §10.1 | P | `api/quotes` cerrada, `Quote` | Snapshot, consentimiento versionado (`ConsentRecord`), correo, antispam (Turnstile), rate limit; PC-6 BC |
| Reservas §10 | P (esquema) | `Booking`, `BookingStatus` | Estados del requisito (12) ≠ esquema (8); máquina de estados, historial, invitado + enlace mágico |
| Pagos Wompi §11 | P (esquema) | `Payment`, `PaymentEvent` | `PaymentStatus` incompleto (falta ANULADO/ERROR/RECHAZADO), adaptador, firma, webhook, conciliación; PC-5 BC |
| Abonos §11.4 | P (esquema) | `PaymentPlan`, `SavingsPlan` | Ledger, manual auditado, saldo |
| Admin §12 | A | — | Auth, RBAC, CRUD, dashboard, auditoría (`AuditLog` existe) |
| Roles §12.5 | P | enum `UserRole` | Rol financiero, permisos explícitos, MFA |
| Arquitectura §13 | P | Next monolito npm | NestJS API, monorepo pnpm/Turborepo → ADR-0001 |
| Core de diseño §13.5 | P | tokens CSS en `globals.css` | `brand.config.ts`, tema oscuro, componentes base |
| Seguridad §16 | P | Zod, honeypot, flags | Cabeceras (F1-02), CSP nonce, rate limit, CSRF, Argon2id, MFA, logs |
| Legal §17 | BC | páginas de espera | RNT, ESCNNA, términos, privacidad, retracto — PC-6 |
| SEO §18 | P | metadata, `noindex` | sitemap, robots, canonical, JSON-LD con datos reales, OG |
| Playwright §21 | A | — | PC-2 (Docker vs local) |
| Calidad §22 | A | `typecheck` | lint, test, CI (F1-03), Husky, Prettier, commitlint |
| Pruebas §23 | A | — | unidad/integración/E2E/axe |
| Despliegue §24 | A | compose solo DB | Dockerfiles, staging, backups, Sentry, health |
| Docker Hub | A | 5 repos ajenos | Repo `ricaurte-tours` por crear vía CI (requiere token) |

## Hallazgos de auditoría estática (seguridad)

1. `docker-compose.yml`: contraseña `change-me` y `5432` expuesto en todas las interfaces — **Alta** (local) → F1-01.
2. Sin cabeceras de seguridad ni `poweredByHeader: false` — **Media** → F1-02.
3. `api/quotes`: límite por `Content-Length` (cabecera falsificable/ausente; `request.json()` lee todo) — **Media**, mitigado porque está cerrada → F1-07.
4. `api/quotes`: sin rate limit, CSRF/origin check ni Turnstile — **Media**, cerrada → F1-07/F6.
5. `/cotizar` es estática (○): los flags se leen en **build**; activar intake exige rebuild. Riesgo operativo, documentar → F1-07.
6. `tsconfig.tsbuildinfo` versionado — Baja → F1-01.
7. `fast-uri` moderada en cadena dev de Prisma — Baja; seguir actualización de Prisma.
8. Sin secretos en código: `grep process.env` solo flags y `DATABASE_URL`; sin `dangerouslySetInnerHTML` en `src`. Escaneo histórico gitleaks pendiente de CI.
9. Imágenes con posibles menores sin consentimiento documentado — **Alta legal** → BC/PC-6.
