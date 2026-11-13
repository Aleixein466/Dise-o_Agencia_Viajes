# Registro de riesgos

Escala: Prob. (B/M/A) × Impacto (B/M/A/C). Estado: abierto · mitigado (en rama) · aceptado.

| ID | Riesgo | Prob. | Imp. | Mitigación | Dueño | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | PostgreSQL local expuesto en LAN con `change-me` | M | A | Bind 127.0.0.1 + contraseña obligatoria (F1-01) | Dev | mitigado |
| R02 | Viajes históricos percibidos como oferta vigente | M | A | Etiquetas «Viaje realizado», nunca migrar a `TourPackage`; F1-10 | Producto | abierto |
| R03 | Publicar fotos de menores sin autorización | M | C | Inventario de imágenes + consentimiento antes de lanzamiento | Agencia | abierto (BC) |
| R04 | Recolectar PII sin política aprobada | B | C | API cerrada por 3 flags; tests (F1-03); PC-6 | Agencia/Dev | mitigado parcial |
| R05 | Pago marcado aprobado por URL de retorno o webhook falso | — | C | Diseño §11.3: firma eventos + consulta API + idempotencia; tests adversarios F7 | Dev | abierto (no implementado) |
| R06 | Sobreventa de cupos concurrente | — | A | Transacción + `SELECT … FOR UPDATE`/check constraint en F6 | Dev | abierto |
| R07 | Uso de float en dinero | B | A | Enteros de centavos COP; lint/regla de revisión | Dev | abierto |
| R08 | Migración a monorepo rompe URLs/SEO | M | M | ADR-0001: migración incremental, redirecciones, CI verde | Arquitectura | abierto |
| R09 | Sin Docker local: no hay pruebas de integración con BD | A | M | Instalar Docker Desktop o usar servicio Postgres en CI | Usuario | abierto |
| R10 | Sin acceso `gh`: no se puede proteger `main` ni ver CI | A | M | `gh auth login` por el usuario | Usuario | abierto |
| R11 | Textos legales/RNT inventados | B | C | Marcadores `[PENDIENTE CLIENTE]`; PC-6 | Agencia | abierto |
| R12 | Dependencias vulnerables (fast-uri moderada) | M | B | `npm audit` en CI, Dependabot (F1-05) | Dev | abierto |
| R13 | Secretos filtrados en git/imagen/NEXT_PUBLIC | B | C | gitleaks en CI, `.env.*` ignorados, revisión de imagen | Dev | mitigado parcial |
| R14 | Docker Hub: imágenes públicas sin escaneo | M | M | Push solo desde CI por digest, Trivy, repo nuevo `ricaurte-tours` privado hasta lanzamiento | Dev | abierto |
| R15 | Retiro de Docker Hub Automated Builds (anunciado 2027-04-01) | B | B | No usarlos; CI en GitHub Actions | Dev | aceptado |
| R16 | Logo no definitivo / identidad sin aprobar | M | M | PC-1/PC-3 antes de rediseño | Agencia | abierto |
| R17 | Sandbox de Codex sin red/refs git | A | B | Ejecutar Codex con permisos de worktree o hacer trabajo en Claude | Orquestador | abierto |
