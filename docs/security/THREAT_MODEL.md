# Modelo de amenazas preliminar (STRIDE) — v0, 2026-11-13

Alcance: arquitectura objetivo §13 (Next.js web + API NestJS + PostgreSQL + Wompi + correo + almacenamiento de medios). Hoy solo existe el sitio estático y `POST /api/quotes` cerrado. Referencia de verificación: OWASP ASVS 5.0.0 nivel 2 (matriz en `ASVS_MATRIX.md`, pendiente F9).

## Activos

Dinero (pagos, abonos, reembolsos, saldos) · PII de clientes y viajeros (incluye menores) · sesiones y cuentas de personal · secretos Wompi (privada, integridad, eventos) · catálogo/precios publicados · historial de auditoría · reputación (RNT, textos legales).

## Fronteras de confianza

1. Navegador ↔ web/API (internet). 2. Wompi → webhook `/api/v1/payments/wompi/events`. 3. API ↔ Wompi API (consulta de transacción). 4. API ↔ PostgreSQL (red privada). 5. Panel admin (personal) ↔ API. 6. CI/CD ↔ Docker Hub ↔ hosting.

## Amenazas y controles

| STRIDE | Amenaza | Control requerido | Fase |
| --- | --- | --- | --- |
| S | Webhook Wompi falsificado | Checksum SHA-256 de `signature.properties`+`timestamp`+secreto de eventos, comparación en tiempo constante; consulta de la transacción por API antes de aprobar | F7 |
| S | Robo de sesión / credential stuffing en panel | Argon2id, MFA TOTP obligatorio para personal, rate limit IP+cuenta, cookies `HttpOnly Secure SameSite`, rotación al autenticar | F2 |
| S | Enlace mágico reutilizado | Token aleatorio ≥128 bits, guardado como hash, TTL corto, un solo uso | F6 |
| T | Monto manipulado desde el navegador | Precio solo en servidor; firma de integridad generada en servidor; validar monto/moneda/referencia del evento contra `Payment` | F5/F7 |
| T | Edición de precios altera reservas pasadas | Snapshot inmutable de desglose y reglas en cotización/reserva | F5 |
| T | Mass assignment en DTO | Esquemas Zod estrictos (`.strict()`), allowlist de campos | F2 |
| R | Personal niega ajuste/reembolso | `AuditLog` append-only con actor, motivo, antes/después; doble aprobación por monto | F3/F7 |
| I | IDOR/BOLA en reservas, comprobantes, exports | RBAC + ownership en cada consulta, IDs no secuenciales, tests 403/404 | F2/F6 |
| I | PII en logs/errores | Logger con redacción (correo, teléfono, documento, tokens); errores genéricos | F2 |
| I | Secretos en imagen o `NEXT_PUBLIC_*` | Gestor de secretos, gitleaks, inspección de capas, nunca `NEXT_PUBLIC` para secretos | F1/F9 |
| D | Abuso de formularios/cotización | Turnstile server-side, rate limit, límite de cuerpo por stream | F1-07/F6 |
| D | Reintentos masivos de webhook | Idempotencia por id de evento (UNIQUE), respuesta rápida, procesamiento transaccional | F7 |
| E | Asesor ajusta cobros / financiero se vuelve admin | Permisos explícitos por acción; asignación de roles solo superadmin con MFA; tests BFLA | F2 |
| E | Archivo subido ejecutado (HTML/SVG) | Allowlist + magic bytes, nombre aleatorio, storage privado con URL firmada, `Content-Disposition: attachment` | F3/F6 |
| E | Compromiso de pipeline | Acciones fijadas por SHA, `permissions: contents: read`, sin secretos para forks, tokens Docker Hub con alcance mínimo | F1/F9 |

## Abuso de negocio a probar

Pago doble por doble clic · webhook duplicado/desordenado (APPROVED antes de PENDING) · pago aprobado sin cupo (protocolo de reembolso) · abono manual sin comprobante · promoción aplicada tras vencimiento · edad de niño manipulada para tarifa infantil (validación por destino + verificación operativa).
