# Plazos de respuesta de PQRS

Estado: **configurable, PENDIENTE DE CONFIRMACIÓN legal**. El sistema no asume que el plazo legal es siempre de 15 días
hábiles. Calcula la fecha de vencimiento con la configuración que apruebe el asesor jurídico de la agencia.

## Cómo se calcula

- Se cuentan días hábiles en la hora de Colombia (UTC−5), desde el día siguiente a la radicación. La hora del día se
  conserva.
- Sábados y domingos nunca cuentan.
- Los festivos solo se excluyen si se activa `PQRS_HOLIDAYS=colombia`.
- `firstResponseDueAt = resolutionDueAt` = fecha calculada. Los tickets ya radicados conservan su fecha: cambiar la
  configuración solo afecta las PQRS nuevas.
- Código: `apps/api/src/pqrs/deadlines.ts`. Pruebas: `deadlines.test.ts`, con el calendario 2026 verificado.

## Variables (`apps/api/src/config/env.ts`)

| Variable                      | Defecto | Uso                                                                                                                    |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PQRS_RESPONSE_BUSINESS_DAYS` | `15`    | Plazo general (1–30 días hábiles).                                                                                     |
| `PQRS_RESPONSE_DAYS_BY_TYPE`  | vacío   | Plazo por tipo, p. ej. `PETITION=15,COMPLAINT=15,CLAIM=15,SUGGESTION=15`. Si un tipo no aparece, usa el plazo general. |
| `PQRS_HOLIDAYS`               | `none`  | `none`: solo fines de semana. `colombia`: añade los festivos nacionales (Ley 51 de 1983, Ley Emiliani).                |
| `PQRS_EXTRA_HOLIDAYS`         | vacío   | Días no hábiles adicionales `AAAA-MM-DD,…` (festivos decretados, cierres oficiales). Se aplican siempre.               |

Una configuración mal escrita impide que el API arranque (validación de entorno). Nunca se aplica en silencio.

## Calendario de festivos (`PQRS_HOLIDAYS=colombia`)

- **Fechas fijas:** 1 ene, 1 may, 20 jul, 7 ago, 8 dic y 25 dic.
- **Se trasladan al lunes siguiente:** 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov y 11 nov.
- **Según la Pascua:**
  - Jueves y Viernes Santo.
  - Ascensión (Pascua + 39, trasladada al lunes).
  - Corpus Christi (Pascua + 60, trasladada al lunes).
  - Sagrado Corazón (Pascua + 68, trasladada al lunes).
- **2026:** 1 ene, 12 ene, 23 mar, 2–3 abr, 1 may, 18 may, 8 jun, 15 jun, 29 jun, 20 jul, 7 ago, 17 ago, 12 oct, 2 nov,
  16 nov, 8 dic y 25 dic.
- Los festivos extraordinarios no se pueden predecir. Se agregan con `PQRS_EXTRA_HOLIDAYS`.

## Referencias normativas a confirmar por el abogado de la agencia

Son puntos de partida para la decisión. No son una conclusión jurídica.

- **Ley 1755 de 2015 (derecho de petición)**, también aplicable a particulares (art. 32):
  - Regla general: 15 días hábiles.
  - Solicitudes de documentos o de información: 10 días.
  - Consultas: 30 días.
  - Si la PQRS distingue estas modalidades, puede requerir tipos o subtipos adicionales.
- **Ley 1480 de 2011 (Estatuto del Consumidor):** reclamaciones directas del consumidor al proveedor. Hay que confirmar el
  plazo y la forma de respuesta exigidos.
- **Ley 1581 de 2012 (protección de datos personales):**
  - Consultas: 10 días hábiles, prorrogables 5.
  - Reclamos: 15 días hábiles, prorrogables 8.
  - Si la agencia recibe solicitudes de habeas data por este canal, conviene un tipo propio.
- **Prórrogas:** el sistema todavía no registra prórrogas con aviso al solicitante. Si el abogado las exige, se deben
  implementar antes de abrir el canal (registrar el motivo, la nueva fecha y la notificación).

## Configuración recomendada mientras no haya concepto legal

- Dejar `PQRS_INTAKE_ENABLED=false` (canal cerrado).
- Para pruebas: `PQRS_HOLIDAYS=colombia` y `PQRS_RESPONSE_BUSINESS_DAYS=15`. Es lo más conservador para el cliente, porque
  no adelanta el vencimiento interno.
