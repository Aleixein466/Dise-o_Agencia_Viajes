# Lista para activar el sitio con clientes reales

Información que debe entregar el propietario (o quien designe) antes de recibir clientes reales. Cada punto dice
**qué** se necesita, **para qué** y **dónde se configura**. Nada de esto se inventa ni se completa con valores de ejemplo.
Marca cada punto al entregarlo.

## A. Comercial (tarifas y producto) — PC-4

- [ ] **Matriz de tarifas** vigente por paquete, hotel, tipo de habitación y ocupación (sencilla, doble, triple…),
      en COP, con su vigencia de venta (desde/hasta). Se carga como `PriceRule`, que pasa de DRAFT a aprobado con
      revisión de dos personas.
- [ ] **Temporadas** por destino, con fechas exactas de viaje (alta, media, baja, festivos y puentes) y la tarifa de
      cada una (`Season` + `PriceRule.seasonId`).
- [ ] **Política de niños e infantes** por paquete o destino:
  - rangos de edad, con límites incluidos o no;
  - tarifa de cada rango;
  - si el infante no paga, confirmarlo por escrito (`AgeRule` + `PriceRule.ageRuleId`; solo un INFANT puede valer 0).
- [ ] **Transporte, tours opcionales y adicionales**: precio por persona o por reserva y qué incluye cada uno.
- [ ] **Promociones autorizadas**:
  - código;
  - porcentaje o valor fijo;
  - vigencia;
  - alcance (paquete, destino o todos);
  - cupo máximo de redenciones;
  - quién las autoriza.
- [ ] **Política de anticipo y saldo**: porcentaje o valor del anticipo, fecha límite del saldo y qué pasa si no se paga.
- [ ] **Políticas de cancelación, cambios y reembolsos** por tipo de producto (también es texto legal).
- [ ] **Contenido de catálogo definitivo**: descripciones, incluye y no incluye, itinerarios y fotos con derechos de uso.
      El portafolio `docs/input/Portafolio_Ricaurte_Tours.docx` sigue fuera de Git y no se publica.

## B. Legal y cumplimiento — PC-6

- [ ] **Razón social, NIT, RNT** (Registro Nacional de Turismo vigente), domicilio y representante legal.
- [ ] **Política de tratamiento de datos personales** (Ley 1581 de 2012) y aviso de privacidad. Se aprueban como
      `LegalDocument` DATA_TREATMENT_AUTHORIZATION. Sin ella, las solicitudes públicas y las PQRS responden 503.
- [ ] **Términos y condiciones** del servicio y de la compra en línea, incluidos derecho de retracto y reversión del
      pago (Ley 1480 de 2011) y cláusula de responsabilidad del operador o agencia.
- [ ] **Concepto sobre plazos de PQRS**: término por tipo, festivos, prórrogas y canal habeas data. Ver
      `PQRS_PLAZOS.md`; se configura con `PQRS_RESPONSE_DAYS_BY_TYPE`, `PQRS_HOLIDAYS` y `PQRS_EXTRA_HOLIDAYS`.
- [ ] **Responsable de PQRS y de datos personales**: nombre del cargo y correo oficial.
- [ ] **Registro de bases de datos ante la SIC (RNBD)**, si aplica a la agencia.
- [ ] **Facturación electrónica (DIAN)**: proveedor y flujo. Hoy el sistema no emite facturas.
- [ ] **Cláusula de prevención de ESCNNA** y demás avisos obligatorios para prestadores turísticos.

## C. Pagos — PC-5

- [ ] **Cuenta de comercio Wompi** a nombre de la empresa.
- [ ] Primero, las **llaves de SANDBOX**: `pub_test_`, `prv_test_`, `test_events_`, `test_integrity_`. Se entregan por un
      canal seguro, nunca por chat ni en el repositorio. Ver `WOMPI_SANDBOX.md`.
- [ ] **URL de eventos registrada** en el dashboard de Wompi (modo pruebas) apuntando al API de staging.
- [ ] Prueba de punta a punta en sandbox. Después, **autorización escrita** para producción, llaves de producción y
      cuenta bancaria de dispersión configuradas por el titular. El equipo técnico no configura cobros reales.
- [ ] **Datos bancarios para abonos manuales** (transferencia) que se muestran al cliente, y quiénes son los dos
      aprobadores de FINANZAS (cuatro ojos).

## D. Comunicaciones

- [ ] **Dominio de correo** del remitente (p. ej. `reservas@<dominio>`) con SPF, DKIM y DMARC configurados.
- [ ] **Proveedor transaccional** (SMTP o API) y **autorización escrita** para enviar correos reales. Activa
      `MAIL_REAL_DELIVERY_APPROVED=true`.
- [ ] **Canales oficiales**: teléfono, WhatsApp, dirección física y horario. Aparecen en el pie, en contacto y en los
      correos.

## E. Técnico e infraestructura

- [ ] **Dominio de producción y de staging**, con acceso al DNS.
- [ ] **Hosting del API y PostgreSQL**: proveedor, región (preferible América) y responsable de la cuenta. Ver
      `STAGING.md` y `deploy/staging/`.
- [ ] **Titular de la cuenta de Vercel**:
  - separar variables por entorno;
  - activar Deployment Protection en staging;
  - asignar dominios.
- [ ] **Política de respaldos**: frecuencia, retención y responsable de probar la restauración.
- [ ] **Usuarios internos iniciales**: nombre, correo y rol (ADMIN, ADVISOR, FINANCE…). Cada uno enrola MFA en su
      primer ingreso.
- [ ] **Identidad visual definitiva**: logo en vector, colores y tipografías. Es PC-1/PC-3; el logo actual es
      provisional.
- [ ] **Analítica y cookies**: si se desea medir, qué herramienta usar y con qué banner de consentimiento. Hoy no se
      carga ninguna.

## F. Decisiones de activación (las toma el propietario)

- [ ] Abrir solicitudes públicas: `PUBLIC_QUOTE_REQUESTS_ENABLED=true`, tras B.
- [ ] Abrir PQRS: `PQRS_INTAKE_ENABLED=true`, tras B y el concepto de plazos.
- [ ] Indexación en buscadores: `SITE_INDEXING=true`, solo en producción y tras B.
- [ ] Pagos en línea en producción, tras C.
- [ ] Correos reales, tras D.
- [ ] Promoción manual del despliegue a producción (`DEPLOYMENT.md`).
