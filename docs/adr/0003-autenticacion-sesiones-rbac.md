# ADR-0003 — Autenticación, sesiones, MFA y autorización (RBAC + propiedad)

Estado: **Aceptado por el orquestador** dentro de ADR-0001 (no cambia stack) · Fecha: 2026-11-13 · ASVS V6, V7, V8

## Contexto

- Roles del requisito: CUSTOMER, ADVISOR, FINANCE, ADMIN (+ SYSTEM interno). Esquema v2 ya tiene `Role`, `Permission`, `Session`, `MfaFactor`, `MfaRecoveryCode`, `OneTimeToken` (solo hashes).
- La API vive en `apps/api` (NestJS + Fastify). La web (`apps/web`) debe usarla sin cookies de terceros ni CORS abierto.
- La recepción de datos personales sigue **deshabilitada** (PC-6): el registro público de clientes nace apagado por bandera.

## Decisión

1. **Mismo origen:** la web reenvía `/api/v1/*` a la API (rewrite de Next en producción, proxy en desarrollo). Cookies de primera parte; la API no expone CORS.
2. **Contraseñas:** Argon2id (`@node-rs/argon2`), m=19 MiB, t=2, p=1 (mínimo OWASP); longitud 12–128, lista de contraseñas comprometidas local, sin reglas de composición. Rehash si cambian parámetros.
3. **Sesiones opacas:** token aleatorio de 256 bits; en BD solo `SHA-256(token)`. Cookie `__Host-rt_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Personal: inactividad 30 min, absoluta 12 h. Cliente: inactividad 7 días, absoluta 30 días. Rotación al iniciar sesión, elevar privilegio y completar MFA. Cierre de sesión revoca en servidor; "cerrar todas" disponible.
4. **MFA:** TOTP obligatorio para ADVISOR, FINANCE y ADMIN antes de cualquier acción del panel; secreto cifrado AES-256-GCM con `MFA_ENCRYPTION_KEY` (entorno, nunca en Git); 10 códigos de recuperación de un solo uso, hasheados.
5. **CSRF:** `SameSite=Lax` + verificación de `Origin` en toda mutación + token sincronizado por sesión en cabecera `x-csrf-token`.
6. **Fuerza bruta:** límite por cuenta y por IP confiable (ADR-0002), retardo progresivo y bloqueo temporal; mensajes genéricos ("credenciales inválidas"); sin enumeración en registro ni recuperación.
7. **Tokens de un solo uso** (`OneTimeToken`): recuperación de contraseña, verificación de correo y enlace mágico de reserva invitada; 256 bits, hash, propósito y sujeto ligados, 15 min (enlace mágico: 30 min), `usedAt` atómico (UPDATE … WHERE used_at IS NULL).
8. **Autorización:** permisos con formato `recurso:acción` (p. ej. `catalog:write`, `payments:approve`) asignados a roles por seed versionado. Guard de Nest exige permiso declarado por ruta (denegar por defecto). **Propiedad** en `packages/domain` (`canAccessReservation(actor, reservation)` etc.); toda consulta de cliente filtra por `customerId` en la propia query. Pruebas IDOR obligatorias por recurso.
9. **Restricciones de rol:** ADVISOR no modifica pagos aprobados, permisos ni roles; solo FINANCE aprueba abonos/reembolsos; solo ADMIN gestiona personal y permisos; un usuario no se autoasigna roles.
10. **Auditoría:** inicio/cierre de sesión, fallos, MFA, cambios de rol/permiso y acciones financieras van a `AuditLog` sin secretos ni tokens.
11. **Altas:** personal solo por ADMIN o por CLI de seed en entornos no productivos. Registro de clientes tras `CUSTOMER_SIGNUP_ENABLED=true`, que exige `PRIVACY_POLICY_APPROVED=true` (fallo en arranque si no).

## Alternativas descartadas

- JWT en `localStorage`: expuesto a XSS y sin revocación.
- Auth.js/NextAuth en la web: ubicaría la autoridad fuera de la API (contradice ADR-0001).
- Proveedor externo (Auth0, Clerk): costo, datos personales fuera de Colombia y dependencia; reconsiderable.

## Pruebas mínimas

Unitarias (hash, expiraciones, rotación, permisos), integración con PostgreSQL (sesión, token de un solo uso concurrente), E2E (login, MFA de personal, 401/403, IDOR entre dos clientes ficticios).
