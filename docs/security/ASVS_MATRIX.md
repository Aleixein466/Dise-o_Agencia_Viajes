# Matriz de trazabilidad OWASP ASVS 5.0.0 nivel 2 — v0, 2026-11-13

Alcance: sitio público Next.js y `POST /api/quotes` (único endpoint hoy), más la arquitectura objetivo (API NestJS, PostgreSQL, Wompi, panel admin, medios). Referencia: OWASP ASVS 5.0.0, niveles 1 y 2, solo requisitos relevantes para esta aplicación. Amenazas: `THREAT_MODEL.md`. Riesgos: `docs/orchestration/RISK_REGISTER.md` (R01–R17).

## Cómo actualizar

1. Cambiar el estado solo con evidencia verificable (archivo o prueba existente en el repositorio); una ruta inexistente invalida la fila.
2. Los IDs oficiales se completan al contrastar con el estándar: mientras tanto la columna ID indica el capítulo y «ID por confirmar». No inventar numeración.
3. Al cerrar un lote, recontar la tabla de resumen y actualizar la fecha del título.

Estados: **Cumple** (evidencia en código o prueba), **Parcial** (control parcial o solo en el alcance actual), **No cumple** (debería existir hoy y no existe), **No aplica** (fuera de alcance), **Pendiente de módulo** (depende de un lote futuro). Lotes: Auth, Admin, Catálogo, Reservas, Pagos Wompi, PQR, Infra.

## Resumen

| Estado              | Filas |
| ------------------- | ----- |
| Cumple              | 26    |
| Parcial             | 17    |
| No cumple           | 3     |
| No aplica           | 3     |
| Pendiente de módulo | 34    |
| **Total**           | 83    |

## V1 Codificación y saneamiento

| ID                  | Requisito                                                    | Estado              | Evidencia                                                                          | Lote  | Riesgo |
| ------------------- | ------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------- | ----- | ------ |
| V1 ID por confirmar | Salida codificada según contexto; sin HTML crudo del usuario | Parcial             | React escapa por defecto; sin `dangerouslySetInnerHTML` en `src` (búsqueda manual) | Infra | —      |
| V1 ID por confirmar | Consultas parametrizadas / ORM, sin SQL concatenado          | Parcial             | `src/lib/db.ts`, `prisma/schema.prisma` (Prisma); sin pruebas dedicadas            | Infra | R04    |
| V1 ID por confirmar | Saneamiento de contenido enriquecido del admin               | Pendiente de módulo | —                                                                                  | Admin | —      |
| V1 ID por confirmar | Codificación UTF-8 consistente                               | Cumple              | `src/encoding.test.ts`; `src/lib/http/read-json-limited.test.ts`                   | Infra | —      |

## V2 Validación y lógica de negocio

| ID                  | Requisito                                                     | Estado              | Evidencia                                                                                                                                     | Lote        | Riesgo |
| ------------------- | ------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| V2 ID por confirmar | Validación de entrada en servidor con esquema                 | Cumple              | `src/app/api/quotes/route.ts` (Zod); `src/app/api/quotes/route.test.ts` («rejects a body without data consent with 400»)                      | Infra       | R04    |
| V2 ID por confirmar | Esquemas estrictos (rechazo de campos extra, mass assignment) | Parcial             | `src/app/api/quotes/route.ts` (`z.object` sin `.strict()`; solo se mapean campos conocidos)                                                   | Infra       | —      |
| V2 ID por confirmar | Límite de tamaño de cuerpo; rechazo de JSON/UTF-8 inválido    | Cumple              | `src/lib/http/read-json-limited.ts`; `src/lib/http/read-json-limited.test.ts`                                                                 | Infra       | —      |
| V2 ID por confirmar | Anti-automatización en formularios (rate limit, honeypot)     | Parcial             | `src/lib/http/rate-limit.ts`; `src/app/api/quotes/route.test.ts` («limits the sixth request…», «acknowledges honeypot…»); Turnstile pendiente | Infra       | —      |
| V2 ID por confirmar | Transiciones de estado de negocio válidas                     | Cumple              | `src/domain/reservations/state-machine.test.ts`; `src/domain/payments/state-machine.test.ts`                                                  | Reservas    | R05    |
| V2 ID por confirmar | Importes enteros (centavos COP), sin punto flotante           | Parcial             | `src/domain/shared/money.ts` (`assertCents`); sin regla de lint                                                                               | Pagos Wompi | R07    |
| V2 ID por confirmar | Prevención de sobreventa y condiciones de carrera             | Pendiente de módulo | —                                                                                                                                             | Reservas    | R06    |
| V2 ID por confirmar | Idempotencia en operaciones críticas (pago, webhook)          | Pendiente de módulo | —                                                                                                                                             | Pagos Wompi | R05    |
| V2 ID por confirmar | Consentimiento registrado antes de recolectar PII             | Cumple              | `src/app/api/quotes/route.ts` (`dataConsent` literal); `src/lib/env.test.ts`; `prisma/schema.prisma` (`dataConsentAt`)                        | Infra       | R04    |

## V3 Seguridad del frontend web

| ID                  | Requisito                                                    | Estado              | Evidencia                                                                                      | Lote  | Riesgo |
| ------------------- | ------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------- | ----- | ------ |
| V3 ID por confirmar | CSP que restringe framing, base-uri, object-src, form-action | Cumple              | `next.config.ts`; `e2e/security.spec.ts` («security headers on /»)                             | Infra | —      |
| V3 ID por confirmar | CSP con control de scripts y estilos (nonce o hashes)        | No cumple           | `next.config.ts` (comentario: backlog F1-09)                                                   | Infra | —      |
| V3 ID por confirmar | `X-Content-Type-Options: nosniff`                            | Cumple              | `next.config.ts`; `e2e/security.spec.ts`                                                       | Infra | —      |
| V3 ID por confirmar | Anti-clickjacking (`frame-ancestors`, `X-Frame-Options`)     | Cumple              | `next.config.ts`; `e2e/security.spec.ts`                                                       | Infra | —      |
| V3 ID por confirmar | `Referrer-Policy` restrictiva                                | Cumple              | `next.config.ts`                                                                               | Infra | —      |
| V3 ID por confirmar | Aislamiento de origen (COOP) y `Permissions-Policy`          | Cumple              | `next.config.ts`                                                                               | Infra | —      |
| V3 ID por confirmar | Sin secretos en `NEXT_PUBLIC_*` ni en el bundle              | Parcial             | `src/lib/env.ts` (solo `NEXT_PUBLIC_SITE_URL` público); gitleaks en `.github/workflows/ci.yml` | Infra | R13    |
| V3 ID por confirmar | Cookies con `HttpOnly`, `Secure`, `SameSite`                 | Pendiente de módulo | —                                                                                              | Auth  | —      |

## V4 API y servicios web

| ID                  | Requisito                                                   | Estado              | Evidencia                                                                                                                                | Lote        | Riesgo |
| ------------------- | ----------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| V4 ID por confirmar | Validación de `Content-Type` en endpoints JSON              | Cumple              | `src/app/api/quotes/route.test.ts` («rejects non-JSON content with 415»)                                                                 | Infra       | —      |
| V4 ID por confirmar | CSRF en solicitudes con efectos (verificación de Origin)    | Cumple              | `src/app/api/quotes/route.test.ts` («rejects a bad origin with 403»)                                                                     | Infra       | —      |
| V4 ID por confirmar | Respuestas de error genéricas y códigos HTTP coherentes     | Parcial             | `src/app/api/quotes/route.ts`; `src/app/api/quotes/route.test.ts`                                                                        | Infra       | —      |
| V4 ID por confirmar | Rate limit con almacén distribuido y cliente verificado     | Parcial             | `docs/adr/0002-ip-confiable-y-limitador-distribuido.md`; `src/lib/http/client-ip.test.ts`; almacén `postgres` sin pruebas de integración | Infra       | R09    |
| V4 ID por confirmar | Autenticación del webhook de Wompi (firma + consulta a API) | Pendiente de módulo | —                                                                                                                                        | Pagos Wompi | R05    |
| V4 ID por confirmar | Versionado y contrato de API documentados                   | Parcial             | `docs/adr/0001-evolucion-monorepo-api.md`                                                                                                | Infra       | R08    |

## V5 Manejo de archivos

| ID                  | Requisito                                               | Estado              | Evidencia                                           | Lote     | Riesgo |
| ------------------- | ------------------------------------------------------- | ------------------- | --------------------------------------------------- | -------- | ------ |
| V5 ID por confirmar | Allowlist de tipos y magic bytes en cargas              | Pendiente de módulo | —                                                   | Admin    | R03    |
| V5 ID por confirmar | Nombres aleatorios, almacenamiento privado, URL firmada | Pendiente de módulo | —                                                   | Admin    | R03    |
| V5 ID por confirmar | Límites de tamaño y cuota de archivos                   | Pendiente de módulo | —                                                   | Admin    | —      |
| V5 ID por confirmar | Descarga con `Content-Disposition: attachment`          | Pendiente de módulo | —                                                   | Reservas | —      |
| V5 ID por confirmar | Inventario y consentimiento de imágenes de menores      | No cumple           | `docs/orchestration/RISK_REGISTER.md` (R03 abierto) | Catálogo | R03    |

## V6 Autenticación

| ID                  | Requisito                                                              | Estado              | Evidencia | Lote | Riesgo |
| ------------------- | ---------------------------------------------------------------------- | ------------------- | --------- | ---- | ------ |
| V6 ID por confirmar | Política de contraseñas (longitud, lista de comprometidas)             | Pendiente de módulo | —         | Auth | —      |
| V6 ID por confirmar | Hash adaptativo de contraseñas (Argon2id)                              | Pendiente de módulo | —         | Auth | —      |
| V6 ID por confirmar | MFA obligatorio para personal                                          | Pendiente de módulo | —         | Auth | —      |
| V6 ID por confirmar | Anti-fuerza bruta por cuenta e IP                                      | Pendiente de módulo | —         | Auth | —      |
| V6 ID por confirmar | Enlace mágico / recuperación (token ≥128 bits, hash, un solo uso, TTL) | Pendiente de módulo | —         | Auth | —      |
| V6 ID por confirmar | Mensajes que no revelan si la cuenta existe                            | Pendiente de módulo | —         | Auth | —      |

## V7 Gestión de sesiones

| ID                  | Requisito                                          | Estado              | Evidencia | Lote | Riesgo |
| ------------------- | -------------------------------------------------- | ------------------- | --------- | ---- | ------ |
| V7 ID por confirmar | Tokens de sesión aleatorios, rotados al autenticar | Pendiente de módulo | —         | Auth | —      |
| V7 ID por confirmar | Expiración por inactividad y absoluta              | Pendiente de módulo | —         | Auth | —      |
| V7 ID por confirmar | Cierre de sesión invalida la sesión en servidor    | Pendiente de módulo | —         | Auth | —      |
| V7 ID por confirmar | Revocación de sesiones al cambiar credenciales     | Pendiente de módulo | —         | Auth | —      |

## V8 Autorización

| ID                  | Requisito                                                         | Estado              | Evidencia                                                         | Lote     | Riesgo |
| ------------------- | ----------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- | -------- | ------ |
| V8 ID por confirmar | Control de acceso en servidor en cada solicitud (RBAC)            | Pendiente de módulo | —                                                                 | Auth     | —      |
| V8 ID por confirmar | Propiedad del recurso (anti-IDOR/BOLA) en reservas y comprobantes | Pendiente de módulo | —                                                                 | Reservas | —      |
| V8 ID por confirmar | Permisos por función (anti-BFLA); roles solo por superadmin       | Pendiente de módulo | —                                                                 | Admin    | —      |
| V8 ID por confirmar | Denegación por defecto; sin endpoints administrativos públicos    | Parcial             | `src/app/api/quotes/route.ts` (único endpoint, cerrado por flags) | Infra    | R04    |
| V8 ID por confirmar | Identificadores no secuenciales                                   | Cumple              | `prisma/schema.prisma` (`@id @default(uuid())`)                   | Reservas | —      |

## V9 Tokens autocontenidos

| ID                  | Requisito                                       | Estado    | Evidencia                                                         | Lote | Riesgo |
| ------------------- | ----------------------------------------------- | --------- | ----------------------------------------------------------------- | ---- | ------ |
| V9 ID por confirmar | Validación de firma, algoritmo y expiración JWT | No aplica | Se prevén sesiones opacas de servidor (registrar decisión en ADR) | Auth | —      |

## V10 OAuth y OIDC

| ID                   | Requisito                                 | Estado    | Evidencia                                        | Lote | Riesgo |
| -------------------- | ----------------------------------------- | --------- | ------------------------------------------------ | ---- | ------ |
| V10 ID por confirmar | Flujos OAuth/OIDC como cliente o servidor | No aplica | Sin inicio de sesión federado en el alcance v2.0 | Auth | —      |

## V11 Criptografía

| ID                   | Requisito                                           | Estado              | Evidencia | Lote        | Riesgo |
| -------------------- | --------------------------------------------------- | ------------------- | --------- | ----------- | ------ |
| V11 ID por confirmar | Algoritmos aprobados; sin MD5/SHA-1 para seguridad  | Pendiente de módulo | —         | Auth        | —      |
| V11 ID por confirmar | Comparación en tiempo constante de firmas (webhook) | Pendiente de módulo | —         | Pagos Wompi | R05    |
| V11 ID por confirmar | Aleatoriedad criptográfica para tokens e IDs        | Pendiente de módulo | —         | Auth        | —      |
| V11 ID por confirmar | Gestión y rotación de secretos (Wompi, sesión)      | Pendiente de módulo | —         | Infra       | R13    |

## V12 Comunicación segura

| ID                   | Requisito                                            | Estado              | Evidencia                                                             | Lote  | Riesgo |
| -------------------- | ---------------------------------------------------- | ------------------- | --------------------------------------------------------------------- | ----- | ------ |
| V12 ID por confirmar | HSTS con `includeSubDomains`                         | Cumple              | `next.config.ts`; `e2e/security.spec.ts`                              | Infra | —      |
| V12 ID por confirmar | TLS 1.2+ hacia el cliente                            | Parcial             | `vercel.json` (TLS lo termina la plataforma; sin verificación propia) | Infra | —      |
| V12 ID por confirmar | TLS en la conexión a PostgreSQL                      | Pendiente de módulo | —                                                                     | Infra | —      |
| V12 ID por confirmar | BD no expuesta públicamente (loopback en desarrollo) | Cumple              | `docker-compose.yml` (`127.0.0.1:5432`, contraseña obligatoria)       | Infra | R01    |

## V13 Configuración

| ID                   | Requisito                                                       | Estado              | Evidencia                                                                                              | Lote  | Riesgo |
| -------------------- | --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ | ----- | ------ |
| V13 ID por confirmar | Configuración validada al arranque; falla cerrada               | Cumple              | `src/lib/env.ts`; `src/lib/env.test.ts`; `src/app/api/quotes/route.test.ts` («fails closed with 503…») | Infra | R04    |
| V13 ID por confirmar | Sin credenciales por defecto                                    | Cumple              | `docker-compose.yml` (`POSTGRES_PASSWORD` obligatoria)                                                 | Infra | R01    |
| V13 ID por confirmar | Archivos `.env` fuera del control de versiones                  | Cumple              | `.gitignore` (`.env`, `.env.*`)                                                                        | Infra | R13    |
| V13 ID por confirmar | Sin cabeceras que revelen tecnología                            | Cumple              | `next.config.ts` (`poweredByHeader: false`)                                                            | Infra | —      |
| V13 ID por confirmar | Detección de secretos en CI                                     | Cumple              | `.github/workflows/ci.yml` (gitleaks)                                                                  | Infra | R13    |
| V13 ID por confirmar | Gestor de secretos para producción                              | Pendiente de módulo | —                                                                                                      | Infra | R13    |
| V13 ID por confirmar | Indexación y funciones desactivadas por defecto hasta autorizar | Cumple              | `src/lib/env.ts` (`SITE_INDEXING`, `QUOTE_INTAKE_ENABLED`); `src/lib/seo.test.ts`                      | Infra | R02    |

## V14 Protección de datos

| ID                   | Requisito                                      | Estado              | Evidencia                                                                                                | Lote  | Riesgo |
| -------------------- | ---------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- | ----- | ------ |
| V14 ID por confirmar | Inventario y clasificación de datos personales | Parcial             | `docs/security/THREAT_MODEL.md` (activos); sin inventario formal                                         | Infra | R04    |
| V14 ID por confirmar | Recolección de PII solo con política aprobada  | Cumple              | `src/lib/env.ts` (`PRIVACY_POLICY_APPROVED`); `src/app/api/quotes/route.test.ts` («keeps the 503 gate…») | Infra | R04    |
| V14 ID por confirmar | Política de retención y borrado                | Pendiente de módulo | —                                                                                                        | PQR   | R11    |
| V14 ID por confirmar | Datos sensibles fuera de URL, logs y errores   | Parcial             | `src/app/api/quotes/route.ts` (no registra el cuerpo); redacción de logger pendiente                     | Infra | —      |
| V14 ID por confirmar | Cifrado en reposo de datos sensibles           | Pendiente de módulo | —                                                                                                        | Infra | —      |
| V14 ID por confirmar | Textos de privacidad aprobados por la agencia  | No cumple           | `src/app/privacidad/page.tsx` (marcador `[PENDIENTE CLIENTE]`)                                           | PQR   | R11    |

## V15 Codificación segura y arquitectura

| ID                   | Requisito                                                  | Estado              | Evidencia                                                                                          | Lote     | Riesgo |
| -------------------- | ---------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- | -------- | ------ |
| V15 ID por confirmar | Análisis de vulnerabilidades de dependencias               | Parcial             | `.github/workflows/ci.yml` (`npm audit --omit=dev --audit-level=high`); sin Dependabot             | Infra    | R12    |
| V15 ID por confirmar | Pipeline con permisos mínimos y acciones fijadas por SHA   | Cumple              | `.github/workflows/ci.yml` (`permissions: contents: read`, acciones por SHA)                       | Infra    | —      |
| V15 ID por confirmar | Revisión obligatoria antes de integrar a `main`            | Parcial             | `.husky/pre-commit`, `.husky/pre-push` (bloqueo local); protección de rama en GitHub sin verificar | Infra    | R10    |
| V15 ID por confirmar | Pruebas automatizadas de seguridad en CI                   | Parcial             | `e2e/security.spec.ts`; `.github/workflows/e2e.yml`; sin pruebas adversarias de pago               | Infra    | R05    |
| V15 ID por confirmar | Modelo de amenazas documentado                             | Cumple              | `docs/security/THREAT_MODEL.md`                                                                    | Infra    | —      |
| V15 ID por confirmar | Escaneo de imágenes y cadena de suministro de contenedores | Pendiente de módulo | —                                                                                                  | Infra    | R14    |
| V15 ID por confirmar | Lógica de dominio aislada y probada                        | Cumple              | `src/domain/README.md`; `src/domain/payments/state-machine.test.ts`                                | Reservas | R05    |

## V16 Registro de seguridad y manejo de errores

| ID                   | Requisito                                                     | Estado              | Evidencia                                                                                                     | Lote  | Riesgo |
| -------------------- | ------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| V16 ID por confirmar | Eventos de seguridad registrados (acceso, permisos, pagos)    | Pendiente de módulo | —                                                                                                             | Admin | —      |
| V16 ID por confirmar | Registro con redacción de PII y tokens                        | Pendiente de módulo | —                                                                                                             | Infra | —      |
| V16 ID por confirmar | Auditoría append-only (actor, motivo, antes/después)          | Pendiente de módulo | —                                                                                                             | Admin | —      |
| V16 ID por confirmar | Errores sin filtrar detalles internos                         | Parcial             | `src/app/api/quotes/route.ts`; `src/app/api/quotes/route.test.ts` (503 genérico)                              | Infra | —      |
| V16 ID por confirmar | Fallo cerrado ante error de dependencias (limitador, entorno) | Cumple              | `src/app/api/quotes/route.test.ts` («fails closed with 503 when the configured limiter store is unavailable») | Infra | —      |

## V17 WebRTC

| ID                   | Requisito                            | Estado    | Evidencia                        | Lote  | Riesgo |
| -------------------- | ------------------------------------ | --------- | -------------------------------- | ----- | ------ |
| V17 ID por confirmar | Controles de WebRTC (TURN/DTLS/SRTP) | No aplica | Sin uso de WebRTC en el producto | Infra | —      |

## Pendiente de verificación manual

No cuenta como «Cumple»: protección de la rama `main` en GitHub (R10), cabeceras reales en el despliegue y pruebas con PostgreSQL real (R09).
