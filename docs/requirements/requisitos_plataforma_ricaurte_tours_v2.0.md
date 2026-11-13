# Especificación funcional y técnica — Plataforma web de Ricaurte Tours

**Cliente:** Agencia de Viajes Ricaurte Tours
**Nombre del aplicativo:** Ricaurte Tours
**Red social de referencia:** https://www.facebook.com/ricaurtetours
**Versión:** 2.0 · **Fecha:** noviembre de 2026 · **Estado:** documento base para investigación, diseño, desarrollo y verificación
**Moneda operativa inicial:** pesos colombianos (COP)
**Pasarela de pago decidida:** Wompi

> Este documento lo usarán tanto el equipo humano como el asistente de IA que acompaña el desarrollo. Las secciones marcadas con **🛑 PUNTO DE CONTROL** obligan a detenerse y preguntar al usuario antes de seguir.

---

## 0. Cómo usar este documento

1. Leer completo antes de escribir código.
2. Ejecutar las fases en orden (sección 25). Cada fase termina con su **verificación** (sección 23) y no se pasa a la siguiente si la verificación falla.
3. Lo que dependa del cliente (sección 26) **no se inventa**: se deja como dato configurable o con un marcador visible (`[PENDIENTE CLIENTE]`).
4. Las decisiones técnicas ya tomadas están en la sección 27. Cambiarlas requiere acordarlo con el equipo.

### 0.1 Puntos de control obligatorios con el usuario

| # | Momento | Qué pedir o preguntar |
|---|---------|-----------------------|
| PC-1 | Antes de iniciar la investigación (Fase 1) | **Pedir el logo real** de Ricaurte Tours (PNG/SVG en la mejor resolución disponible). Revisarlo, extraer colores exactos y describir lo observado antes de proponer identidad. |
| PC-2 | Antes de tomar capturas o correr pruebas en navegador | **Preguntar si el usuario ya tiene Playwright instalado localmente** o si se monta en contenedor Docker. Recomendación: contenedor Docker (sección 21). |
| PC-3 | Al terminar la investigación | Presentar el informe de referencias y 2–3 direcciones visuales; el usuario elige una antes de diseñar. |
| PC-4 | Antes de implementar el motor de precios | Confirmar que ya se recibió la matriz Excel de costos. Sin ella solo se construye la estructura con datos de prueba marcados como ficticios. |
| PC-5 | Antes de pasar Wompi a producción | Confirmar llaves de producción, URL de eventos configurada y prueba completa en sandbox. |
| PC-6 | Antes de publicar textos legales | Confirmar que la agencia (y su asesor) aprobó términos, políticas y avisos. |

---

## 1. Resumen del proyecto

Ricaurte Tours es una agencia de viajes con público principal en Colombia y Ecuador. La plataforma le permitirá presentar su oferta, captar clientes y vender paquetes nacionales e internacionales en línea.

La funcionalidad central es un **constructor de paquetes**: el visitante elige destino y, dentro de las opciones que la agencia habilita, selecciona modalidad de transporte, hotel, tours y complementos (por ejemplo, seguro de viaje). Indica los viajeros (adultos, niños y edades), ve el precio calculado y puede **solicitar cotización** o **reservar y pagar** en línea con Wompi.

Un **panel administrativo** permitirá gestionar catálogo, tarifas, promociones, disponibilidad, reservas, pagos, abonos, imágenes y contenido sin intervención técnica.

La plataforma **no** es una web solo informativa ni un motor conectado automáticamente a inventarios de proveedores: la disponibilidad se valida manualmente en la primera versión.

### 1.1 Lo que dijo el cliente (resumen de la reunión)

- Pestañas separadas de planes nacionales e internacionales; en lo nacional hay planes terrestres y aéreos (Medellín puede ser ambos).
- "Pasadías": planes que van y vuelven el mismo día (Carrizal, Guanábana Republic; quiere incluir "Nariño Encantador": Las Lajas, Laguna de La Cocha, Museo del Carnaval en Pasto).
- Flujo: destino → hotel → tours → seguro de viaje (opcional) → número de personas → precio por persona y total.
- Necesita saber cuántos adultos, cuántos niños y la edad de cada niño; los rangos de edad cambian por destino (Santa Marta 5–10, Cartagena 5–12, Eje Cafetero por estatura).
- Galería por destino con fotos de hoteles y tours. Prefiere fotos reales.
- Reserva con calendario, pago en línea y pagos por cuotas / ahorro programado acordado con la agencia. Interés futuro en crédito con entidad aliada.
- Panel con usuario y contraseña para cambiar precios, promociones, hoteles, imágenes.
- Contacto principalmente por WhatsApp y correo; formulario que llegue al correo; Google Maps; PQR.
- Redes: Instagram y Facebook; TikTok en creación.
- Idioma: español (traductor del navegador basta por ahora).
- Referencia de competencia mencionada: **Turismo Andino**.
- El cliente entregará: información de planes en Word, matriz Excel de costos, hoteles por destino, fotos (vía Drive), misión/visión y "quiénes somos" más adelante.

---

## 2. Objetivos

**De negocio**
- Llevar el tráfico de redes sociales y de Google a la página y convertirlo en cotizaciones y reservas pagadas.
- Posicionar la marca Ricaurte Tours en búsquedas de planes y destinos relevantes (sección 18).
- Reducir trabajo manual de cotización por WhatsApp.

**Funcionales**
- Presentar agencia, destinos, planes, hoteles y tours.
- Ofrecer paquetes prediseñados y personalizables.
- Calcular precios con las reglas reales de la agencia.
- Registrar viajeros y edades para aplicar tarifas.
- Gestionar cotizaciones, reservas, pagos y abonos.
- Operar todo desde un panel administrativo seguro.

**Técnicos**
- Seguro para producción desde el día uno.
- Rápido (Core Web Vitals en "bueno") y bien indexable.
- Código tipado, modular y con un *core* de diseño centralizado para que un cambio de marca sea sencillo.
- Verificable: lint, tipado, pruebas y validación visual automatizada.

---

## 3. Alcance

### 3.1 Incluido en la primera versión

- Sitio público en español, responsive, con **modo claro y oscuro**.
- Catálogo nacional e internacional con categorías: terrestres, aéreos nacionales, internacionales, pasadías y planes especiales.
- Destinos con una o varias modalidades de transporte.
- Paquetes prediseñados y personalizables.
- Constructor de paquetes con cálculo dinámico de precios.
- Registro de viajeros y edades.
- **Solicitud de cotización** (sin pago) y **reserva con pago** (Wompi).
- Reservas como invitado o usuario registrado; área "Mis reservas".
- Gestión manual de disponibilidad.
- COP como moneda de cálculo y cobro; equivalencia informativa en USD.
- Abonos / ahorro programado administrado por la agencia.
- Panel administrativo con roles.
- Contacto, WhatsApp con mensaje contextual, correo, mapa, redes y PQR.
- Información legal obligatoria del sector (sección 17).
- SEO técnico y de contenido (sección 18).
- Pruebas automatizadas y verificación visual con Playwright.

### 3.2 Fuera del alcance inicial

- Integración automática con inventarios de hoteles, aerolíneas u operadores.
- Cobro o liquidación en USD.
- Crédito propio o integrado con entidad financiera (hasta que exista convenio).
- Débitos automáticos recurrentes.
- App móvil nativa.
- Multidioma con traducciones editoriales.
- Microservicios.
- Blog con gestor editorial avanzado (en v1 basta un módulo simple de guías/artículos; ver 18.5).

---

## 4. Categorías y catálogo turístico

### 4.1 Categorías

| Categoría | Descripción | Ejemplos de la reunión |
|-----------|-------------|------------------------|
| Planes terrestres | Transporte por carretera | Eje Cafetero, Medellín |
| Planes aéreos nacionales | Con vuelo dentro de Colombia | Santa Marta, Cartagena, San Andrés, Medellín |
| Planes internacionales | Fuera de Colombia (aéreos) | `[PENDIENTE CLIENTE]` |
| Pasadías | Ida y regreso el mismo día | Carrizal, Guanábana Republic |
| Planes especiales | Recorridos con propuesta propia | Nariño Encantador (Las Lajas, Laguna de La Cocha, Museo del Carnaval) |

Son referencias iniciales; el catálogo definitivo lo entrega la agencia. Las categorías deben ser **configurables desde el panel**, no fijas en el código.

### 4.2 Destino y modalidad son conceptos separados

Un destino puede venderse por más de una modalidad (Medellín terrestre y aéreo). No se duplica el destino: se relaciona `Destination` ↔ `TransportMode` mediante `DestinationTransport`, con precio y condiciones propias por modalidad.

### 4.3 Paquetes prediseñados y personalizables

1. **Prediseñado:** combinación publicada por la agencia con componentes, condiciones y precio definidos. Puede venderse cerrado o permitir personalización.
2. **Personalizable:** el visitante arma la combinación con las opciones habilitadas.

La agencia define qué hoteles, tours, transportes y servicios son combinables. No se permiten combinaciones incompatibles.

---

## 5. Sitio público

### 5.1 Navegación propuesta

- Inicio
- Destinos
- Planes nacionales (submenú: terrestres, aéreos)
- Planes internacionales
- Pasadías
- Arma tu viaje (constructor)
- Galería
- Quiénes somos
- Contacto (incluye PQR)
- Mis reservas / Ingresar

Encabezado fijo con logo, menú, selector de tema (claro/oscuro), selector de moneda visual (COP/USD) y botón destacado de WhatsApp. En móvil: menú tipo *drawer* y botón flotante de WhatsApp.

Pie de página con: datos de contacto, redes, enlaces legales, **número de RNT** y **aviso de la Ley 679 de 2001** (sección 17).

### 5.2 Inicio

- *Hero* con imagen real de destino y buscador rápido (destino, fechas, viajeros) que lleva al constructor o al listado.
- Destinos destacados (los que más vende la agencia).
- Categorías (terrestres, aéreos, internacionales, pasadías).
- Promociones vigentes (gestionadas desde el panel, con fecha de fin).
- Por qué Ricaurte Tours (beneficios reales, sin inventar cifras).
- Prueba social: reseñas reales (Google / Facebook) — nunca testimonios inventados.
- Llamados a cotizar por WhatsApp o armar el viaje.

### 5.3 Quiénes somos

Descripción, misión, visión, valores, eslogan y fotos. **La agencia entregará misión y visión después**; mientras tanto la sección existe con contenido editable desde el panel y marcadores `[PENDIENTE CLIENTE]` que no se publican en producción.

### 5.4 Destinos, planes y detalle

Cada destino: nombre, *slug*, descripción, ubicación, fotos, categorías, modalidades, hoteles, tours, paquetes relacionados, preguntas frecuentes y estado de publicación.

El detalle de un plan muestra, según la información disponible: destino, modalidad, duración, itinerario, **inclusiones y exclusiones** (obligatorio por normativa, sección 17), alojamiento, tours, complementos, condiciones, políticas de cancelación, precio "desde" y acciones (personalizar, cotizar, reservar, preguntar por WhatsApp). No se inventan características ni condiciones.

### 5.5 Galería y fotografías

- Organizada por destino → hotel / tour / experiencia.
- **Prioridad: fotos reales** de la agencia, de sus hoteles aliados (con permiso) o de bancos con licencia comercial.
- Imágenes generadas con IA solo con aprobación de la agencia y nunca presentadas como foto documental de un lugar u hotel real.
- Fotos de Pinterest o de sitios de pago **no se usan** sin licencia: Pinterest sirve solo como referencia visual.
- El cliente subirá su material a una carpeta compartida de Drive; el equipo lo optimiza (WebP/AVIF, tamaños responsivos) y lo carga en el almacenamiento de medios.

### 5.6 Contacto y PQR

- Formulario de contacto / cotización que envía correo a la agencia y guarda el mensaje en el panel.
- WhatsApp con enlace `wa.me` y **mensaje prellenado según contexto** (por ejemplo: "Hola, me interesa el plan Cartagena 4 días para 2 adultos y 1 niño").
- Correo, teléfonos, dirección, mapa (inserción de Google Maps o enlace; ver 20), redes sociales.
- PQR en sección diferenciada dentro de Contacto: tipo (petición, queja, reclamo, sugerencia), datos del solicitante, descripción, adjunto opcional, número de radicado y acuse por correo.
- Protección antispam (Cloudflare Turnstile o equivalente) y *rate limiting*.

---

## 6. Constructor de paquetes

### 6.1 Flujo principal

1. Seleccionar destino.
2. Elegir modalidad de transporte (si hay más de una).
3. Elegir fechas (calendario; respeta temporadas, cupos y anticipación mínima).
4. Indicar viajeros: adultos, niños y edad de cada niño.
5. Elegir hotel entre los habilitados (y tipo de habitación si aplica).
6. Agregar o quitar tours y actividades.
7. Agregar complementos (seguro de viaje, etc.).
8. Ver resumen con desglose, precio por persona y total.
9. Elegir: **solicitar cotización**, **reservar y pagar** o **consultar por WhatsApp**.

> Se ubica "viajeros" antes de hotel y tours porque las edades cambian el precio y la disponibilidad de habitaciones; así el precio mostrado en cada paso ya es real.

El visitante puede volver a cualquier paso sin perder selecciones. El resumen es persistente (barra lateral en escritorio, barra inferior expandible en móvil). El estado del constructor se conserva en la URL o en almacenamiento local para no perderlo al recargar.

### 6.2 Compatibilidad de opciones

- La agencia configura relaciones entre destinos, modalidades, hoteles, tours y servicios.
- Puede restringir por destino, modalidad, paquete, fecha o condición comercial.
- Solo se muestran opciones activas y compatibles.
- Desactivar una opción no afecta reservas ya confirmadas.

### 6.3 Viajeros y edades

- Se registran adultos, niños y la edad de cada niño cuando la regla tarifaria lo requiera.
- **No existe un rango infantil universal**: los rangos se configuran por destino o producto (`AgeRule`).
- Debe soportar criterio por **estatura** (Eje Cafetero) como regla alternativa.
- `[PENDIENTE CLIENTE]` Definir si la edad se evalúa a la fecha de reserva o a la fecha de viaje. No asumir.

### 6.4 Resumen

Antes de continuar se muestra: destino, modalidad, fechas, hotel, tours, complementos, viajeros y edades, desglose, total, precio por persona, moneda de cobro (COP) y condiciones relevantes. Se diferencia con claridad **precio estimado** de **reserva confirmada**.

---

## 7. Motor de precios

El cálculo definitivo **siempre** lo hace el backend. El frontend solo presenta.

### 7.1 Componentes posibles

Precio base del plan, transporte, hotel y habitación, tours, complementos, categoría/edad del viajero, temporada, promociones, impuestos y cargos, cantidad de viajeros, ocupación y suplementos.

No todos están confirmados: se implementan según la matriz real.

### 7.2 Diseño del motor

- Reglas declarativas almacenadas en base de datos (`PriceRule`, `PriceComponent`), evaluadas por un servicio puro y probado (`PricingService`).
- Cada cálculo produce un **desglose** línea por línea y una versión de reglas aplicadas.
- Importes en **enteros de centavos COP** (coincide con `amount_in_cents` de Wompi) o `Decimal` de Prisma; nunca `float`.
- Redondeo definido por la agencia `[PENDIENTE CLIENTE]` y aplicado en un único lugar.
- Pruebas unitarias con casos tomados de la matriz Excel real (pruebas "doradas").

### 7.3 Reglas de integridad

- Se valida que cada selección esté activa y sea compatible.
- No se confía en precios enviados por el navegador.
- Se recalcula al cambiar opciones, viajeros o fechas.
- Antes del pago se recalcula y se compara; si cambió, se avisa al usuario.
- La reserva guarda un **snapshot** del desglose y reglas aplicadas.
- Cambios posteriores del catálogo no alteran reservas existentes.
- Una cotización tiene vigencia configurable `[PENDIENTE CLIENTE]`.

🛑 **PC-4:** sin la matriz Excel solo se construye la estructura con datos ficticios marcados.

---

## 8. Moneda

- Moneda operativa y de cobro: **COP**. Precios almacenados y calculados en COP.
- Equivalencia **informativa** en USD (útil para visitantes de Ecuador), con tasa configurable desde el panel o fuente aprobada, indicando fecha y que es aproximada.
- La ubicación aproximada puede sugerir la moneda visual, pero el usuario la cambia manualmente; nunca bloquea el sitio.
- Checkout: aviso claro de que el cobro se hará en COP. Wompi Colombia procesa en COP.
- La reserva guarda: total y desglose en COP, moneda visual mostrada, tasa y fecha usadas.
- `[VERIFICAR CON WOMPI]` aceptación de tarjetas emitidas en Ecuador y conversión que aplica el banco emisor.

---

## 9. Disponibilidad y operación

### 9.1 Primera versión: gestión manual

La agencia actualiza cupos y disponibilidad desde el panel (por producto, fecha o temporada). El sistema distingue: solicitud recibida, pendiente de validación, pago recibido y reserva confirmada. **No se promete disponibilidad confirmada** sin validación.

### 9.2 Reglas por definir con la agencia

Quién valida cupos; cuándo se confirma; si se bloquea temporalmente un cupo durante el pago y por cuánto tiempo; qué pasa si se paga y no hay disponibilidad (reembolso, cambio de fecha, alternativa); anticipación mínima por producto.

La arquitectura deja un puerto (`AvailabilityProvider`) para integrar proveedores en el futuro.

---

## 10. Cotizaciones y reservas

### 10.1 Cotización (nuevo)

En la reunión se habló de "reserva o cotización". Se modelan por separado:

- **Cotización:** el visitante envía su selección sin pagar. Se genera un número, se guarda el snapshot de precio, se notifica a la agencia por correo y se ofrece continuar por WhatsApp. La agencia puede responder, ajustar y enviar un **enlace de pago** para convertirla en reserva.
- **Reserva:** selección + datos del responsable + aceptación de condiciones + pago (total o primer abono).

### 10.2 Acceso

Reserva como invitado o con cuenta. La cuenta no es obligatoria; se ofrece crearla en la confirmación (patrón recomendado por estudios de usabilidad de checkout). Un invitado consulta su reserva con número + correo y un enlace mágico.

### 10.3 Datos

Responsable (nombre, documento solo si la operación lo exige, correo, teléfono, país), destino, modalidad, fechas, hotel, opciones, viajeros y edades, desglose, condiciones aceptadas (con versión del documento legal aceptado), estado y pagos. `[PENDIENTE CLIENTE]` confirmar campos obligatorios y si se requieren datos de cada viajero (nombre y documento para vuelos/hoteles).

No se piden datos sensibles sin finalidad definida.

### 10.4 Estados sugeridos

Reserva: `BORRADOR`, `SOLICITUD_RECIBIDA`, `PENDIENTE_VALIDACION`, `PENDIENTE_PAGO`, `PAGO_PARCIAL`, `PAGADA`, `CONFIRMADA`, `RECHAZADA`, `CANCELADA`, `REEMBOLSO_PENDIENTE`, `REEMBOLSADA`, `COMPLETADA`.

Pago (separado): `PENDIENTE`, `APROBADO`, `RECHAZADO`, `ANULADO`, `ERROR`, `REEMBOLSADO`.

Transiciones implementadas como **máquina de estados** en el dominio (transiciones permitidas explícitas, probadas). Cada cambio queda en historial con usuario, fecha y motivo. Al visitante se le muestran estados simplificados.

### 10.5 Notificaciones

Correos transaccionales: cotización recibida, reserva recibida, pago aprobado/rechazado, reserva confirmada, recordatorio de abono, recordatorio previo al viaje. Copia interna a la agencia.

---

## 11. Pagos con Wompi

### 11.1 Decisión

**Wompi** (Bancolombia) es la pasarela elegida. Antes de producción confirmar con Wompi: tarifas vigentes (no se codifican como valores fijos), medios disponibles (tarjetas, PSE, Nequi, Bancolombia, etc.), tarjetas internacionales y de Ecuador, tiempos de desembolso, reembolsos/anulaciones, contracargos y soporte.

### 11.2 Integración desacoplada

`PaymentProvider` (interfaz) → `WompiAdapter` (implementación). El módulo de reservas nunca llama a Wompi directamente. Así se puede añadir otro proveedor sin reescribir reservas.

### 11.3 Flujo técnico recomendado

1. El backend crea un `Payment` en estado `PENDIENTE` con una **referencia única** (por ejemplo `RT-2026-000123-P1`) y el monto en centavos COP calculado por el servidor.
2. El backend genera la **firma de integridad**: SHA-256 de `referencia + montoEnCentavos + moneda (+ fecha de expiración si se usa) + secreto de integridad`. El secreto **nunca** sale del servidor.
3. El frontend abre el **Widget** o **Web Checkout** de Wompi con llave pública, referencia, monto, moneda, firma y URL de redirección.
4. Wompi notifica el resultado a la **URL de eventos** (`POST /api/v1/payments/wompi/events`).
5. El backend valida el evento: toma las propiedades listadas en `signature.properties`, las concatena en orden, añade `timestamp` y el **secreto de eventos**, calcula SHA-256 y lo compara con `X-Event-Checksum` / `signature.checksum` (comparación en tiempo constante). Si no coincide, se descarta.
6. Para mayor seguridad, el backend **consulta la transacción** en la API de Wompi por su id antes de marcar el pago como aprobado.
7. Procesamiento **idempotente**: se guarda cada evento (`PaymentWebhookEvent`) con su id/firma; un evento repetido no duplica efectos.
8. Se valida que monto, moneda y referencia del evento coincidan con el `Payment` local.
9. La página de retorno solo **consulta** el estado al backend; nunca marca pagos como aprobados por sí misma.
10. Se responde 200 rápido al webhook y se procesa el efecto de negocio en una transacción de base de datos.

Variables de entorno: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_ENV` (`sandbox`/`production`), `WOMPI_API_URL`. Llaves de pruebas y producción separadas por ambiente.

### 11.4 Pago completo, abonos y ahorro programado

- **Pago completo:** por Wompi, sujeto a validación de disponibilidad y condiciones.
- **Abonos / ahorro programado** (administrado por la agencia): plan de pagos con valor y fechas pactadas; cada abono puede pagarse con un enlace Wompi generado desde el panel o registrarse manualmente (transferencia, efectivo) con comprobante; se muestra saldo; se identifica cuándo se completa; historial completo. No se asumen débitos automáticos.
- Una reserva admite **varios pagos**.

### 11.5 Crédito externo

Fuera de v1. La plataforma no otorga ni aprueba crédito.

### 11.6 Seguridad y trazabilidad

No almacenar datos de tarjeta ni CVV (Wompi los maneja). Registrar intentos, aprobaciones, rechazos, reembolsos e ids de transacción. Separar estados de pago y de reserva. Conciliación periódica contra reportes de Wompi desde el panel financiero.

🛑 **PC-5** antes de producción.

---

## 12. Panel administrativo

Ruta separada (`/admin`), con autenticación propia, `noindex` y layout independiente.

### 12.1 Dashboard
Reservas recientes, pendientes de validación, cotizaciones sin responder, pagos pendientes, saldos por cobrar, próximos viajes, ventas por periodo (solo datos reales).

### 12.2 Catálogo y contenido
- Destinos, categorías, modalidades por destino.
- Hoteles (datos, destino, fotos, características, habitaciones, tarifas).
- Tours (descripción, fotos, destino, modalidad, compatibilidad, tarifas).
- Complementos (seguro de viaje, etc.).
- Paquetes prediseñados y reglas de personalización.
- Medios: carga, recorte, texto alternativo obligatorio, organización por destino.
- Contenido: inicio, quiénes somos, contacto, redes, promociones, preguntas frecuentes, guías/artículos, metadatos SEO por página.
- **Configuración general:** nombre comercial, NIT, RNT, dirección, teléfonos, WhatsApp, correos, horarios, redes, tasa USD informativa, textos legales versionados.

### 12.3 Tarifas y disponibilidad
Tarifas, vigencias, temporadas, categorías de viajeros, reglas de edad/estatura, promociones (con fecha de inicio/fin), cupos y estado (disponible, agotado, por confirmar). Vista previa de cálculo ("simulador") para probar una combinación antes de publicar.

### 12.4 Reservas, cotizaciones, clientes y pagos
Filtros, detalle, validación de disponibilidad, cambio de estado según permisos, notas internas, historial, pagos y saldos, plan de abonos, comprobantes, generación de enlace de pago, exportación CSV.

### 12.5 Usuarios y roles
- **Administrador:** todo.
- **Operador:** catálogo, disponibilidad, cotizaciones y reservas.
- **Financiero:** pagos, abonos, conciliación.

Permisos verificados en backend. Acciones importantes auditadas (quién, qué, cuándo, antes/después). 2FA (TOTP) recomendado para administradores.

---

## 13. Arquitectura técnica

### 13.1 Estilo
**Monolito modular** con frontend y backend separados. Suficiente para el alcance, sin la complejidad de microservicios.

> En la reunión se mencionó WordPress. Se descarta porque el constructor con reglas de precio, la máquina de estados de reservas y la integración segura de pagos requieren lógica a la medida que en WordPress terminaría dependiendo de varios plugins difíciles de mantener y asegurar.

### 13.2 Diagrama lógico

```text
Visitantes y administradores
            |
            v
Frontend — Next.js (App Router, SSR/SSG/ISR)
Sitio público | Constructor | Cuenta | Panel admin
            |
       REST API /api/v1 (HTTPS)
            |
            v
Backend — NestJS + Fastify
Auth | Catálogo | Pricing | Cotizaciones | Reservas | Pagos | Admin | Contenido
            |
   ------------------------------------------
   |            |             |              |
   v            v             v              v
PostgreSQL  Cloudinary/S3   Correo       Wompi (checkout + eventos)
                           transaccional  Google Maps · WhatsApp (enlace)
```

### 13.3 Stack

| Capa | Tecnología | Uso |
|------|-----------|-----|
| Lenguaje | TypeScript (modo `strict`) | Todo el proyecto |
| Runtime | Node.js LTS vigente | Frontend y backend |
| Frontend | Next.js (versión estable vigente) + App Router | Sitio, constructor, cuenta, panel |
| UI | Tailwind CSS + shadcn/ui (Radix) | Componentes accesibles |
| Tema | `next-themes` + variables CSS | Claro/oscuro |
| Iconos | Lucide | Iconografía |
| Formularios | React Hook Form + Zod | Validación cliente |
| Datos (panel) | TanStack Query | Caché y mutaciones |
| Backend | NestJS + Fastify | API y dominio |
| Validación API | Zod (esquemas compartidos) o class-validator en DTOs; elegir uno | Entrada de datos |
| Documentación API | OpenAPI/Swagger | Contratos |
| Base de datos | PostgreSQL | Datos y transacciones |
| ORM | Prisma | Persistencia y migraciones |
| Imágenes | Cloudinary (o S3 compatible) | Medios y transformaciones |
| Correo | Proveedor transaccional (Resend, Amazon SES o similar) | Notificaciones |
| Antispam | Cloudflare Turnstile | Formularios |
| Monorepo | pnpm workspaces + Turborepo | Organización |
| Contenedores | Docker + Docker Compose | Entornos reproducibles |
| Pruebas | Vitest (unidad), Supertest (API), Playwright (E2E y visual), axe-core (accesibilidad) | Verificación |
| Calidad | ESLint, Prettier, Husky + lint-staged, Commitlint | Estándares |
| Errores | Sentry (o similar) | Monitoreo |

Versiones: usar las estables vigentes al iniciar y fijarlas en `package.json`; no actualizar mayores a mitad de fase.

No se introduce Python: no hay necesidad que lo justifique.

### 13.4 Frontend

- Sitio público y panel en la misma app Next.js con *route groups* `(public)`, `(account)`, `(admin)` y layouts separados.
- Páginas de catálogo renderizadas en servidor y cacheadas (SSG/ISR) con **revalidación bajo demanda** cuando el panel cambia contenido (SEO + velocidad).
- Constructor como componente cliente con estado local (`useReducer`) sincronizado con la URL; sin gestor global salvo necesidad clara.
- `next/image` para imágenes responsivas; `next/font` para fuentes autoalojadas.

### 13.5 Core de diseño (sistema centralizado)

Objetivo: si el cliente cambia identidad de marca, se modifica **un solo lugar**.

- `packages/ui` (o `apps/web/src/core/ui`): componentes reutilizables tipados (Button, Card, Badge, Input, Select, DatePicker, Stepper, PriceTag, DestinationCard, PlanCard, Gallery, EmptyState, Skeleton, Toast, Dialog…).
- **Design tokens** en variables CSS (colores semánticos, tipografía, radios, sombras, espaciado) con valores para `:root` (claro) y `.dark` (oscuro). Tailwind consume los tokens; los componentes **nunca** usan colores literales.
- Nombres semánticos: `--color-primary`, `--color-accent`, `--color-surface`, `--color-foreground`, `--color-muted`, `--color-success`, `--color-warning`, `--color-danger`, `--color-border`, etc.
- `brand.config.ts`: nombre, logo, eslogan, redes y textos base de marca.
- Variantes con `class-variance-authority`; utilidades `cn()`.
- Formateadores centralizados: moneda (`Intl.NumberFormat('es-CO', { currency: 'COP' })`), fechas (`es-CO`), teléfonos.
- Catálogo visual de componentes (página interna `/admin/design-system` o Storybook si el tiempo lo permite) para revisar claro/oscuro.

### 13.6 Backend

NestJS + Fastify, API REST versionada `/api/v1`, módulos por dominio. Controladores delgados; reglas en servicios de dominio/aplicación; acceso a datos en repositorios. Errores con formato uniforme (código, mensaje, detalles). Logs estructurados (pino) sin datos sensibles.

### 13.7 Persistencia

PostgreSQL + Prisma. Migraciones versionadas, índices, restricciones (`UNIQUE` en referencias de pago, slugs), transacciones para cambios de estado y pagos. Importes en enteros (centavos) o `Decimal`. Snapshots de precio en reservas. *Seeds* separados: datos de desarrollo (ficticios, marcados) y datos base de producción (roles, configuración).

### 13.8 Archivos, caché y tareas

Cloudinary/S3 para binarios; PostgreSQL guarda metadatos. Redis y BullMQ **opcionales**: incorporarlos solo si hacen falta colas (correos masivos, recordatorios de abonos, conciliación). En v1 los recordatorios pueden resolverse con una tarea programada simple (`@nestjs/schedule`).

### 13.9 Monorepo

```text
ricaurte-tours/
├── apps/
│   ├── web/                    # Next.js: público, cuenta y admin
│   └── api/                    # NestJS + Fastify
├── packages/
│   ├── ui/                     # Core de diseño: tokens + componentes
│   ├── shared/                 # Tipos, enums de estados, utilidades
│   ├── validation/             # Esquemas Zod compartidos
│   └── config/                 # ESLint, TS, Prettier compartidos
├── e2e/                        # Pruebas Playwright y capturas
├── docs/
│   ├── research/               # Informe de investigación y capturas
│   ├── brand/                  # Guía de marca y tokens
│   └── adr/                    # Decisiones de arquitectura
├── docker-compose.yml          # postgres, api, web, (playwright)
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 14. Módulos de backend

| Módulo | Responsabilidad |
|--------|-----------------|
| auth | Sesiones, login, recuperación, 2FA admin |
| users | Cuentas y perfiles de clientes |
| admin-users | Usuarios internos, roles, permisos |
| settings | Configuración general (RNT, contacto, tasa USD, legales) |
| destinations | Destinos y categorías |
| transport | Modalidades por destino |
| hotels | Hoteles y habitaciones |
| tours | Tours y actividades |
| addons | Complementos (seguro, etc.) |
| packages | Paquetes y reglas de personalización |
| pricing | Tarifas, reglas, edades y cálculo |
| availability | Cupos manuales |
| quotes | Cotizaciones |
| reservations | Reservas, viajeros, estados |
| payments | Pagos, abonos, reembolsos, conciliación |
| integrations/wompi | Adaptador Wompi |
| promotions | Promociones |
| media | Imágenes |
| content | Contenido institucional, FAQ, guías, SEO por página |
| contact | Contacto y PQR |
| notifications | Correos |
| audit | Auditoría |
| currency | Equivalencia COP/USD |

Módulos lógicos del monolito, no servicios separados.

---

## 15. Modelo de datos inicial

El esquema final depende de las matrices de la agencia.

- **Catálogo:** `Destination`, `DestinationCategory`, `TransportMode`, `DestinationTransport`, `Hotel`, `RoomType`, `Tour`, `AddOn`, `Package`, `PackageComponent`, `PackageOption`, `CompatibilityRule`, `MediaAsset`.
- **Tarifas:** `PriceRule`, `PriceComponent`, `TravelerCategory`, `AgeRule` (por edad o estatura), `Season`, `Promotion`, `ExchangeRate`.
- **Cotizaciones y reservas:** `Quote`, `QuoteItem`, `Reservation`, `ReservationItem`, `ReservationTraveler`, `ReservationPriceSnapshot`, `ReservationStatusHistory`, `AvailabilityRecord`, `AdminNote`.
- **Pagos:** `Payment`, `PaymentAttempt`, `PaymentPlan`, `PaymentInstallment`, `Refund`, `PaymentWebhookEvent`, `PaymentReconciliation`.
- **Clientes:** `User`, `CustomerProfile`.
- **Administración y contenido:** `Role`, `Permission`, `AuditLog`, `SiteSettings`, `LegalDocument` (versionado), `ConsentRecord`, `PageSeo`, `Faq`, `Article`, `SocialLink`, `ContactMessage`, `PQRRequest`, `NotificationLog`.

Convenciones: ids UUID/CUID, `createdAt`/`updatedAt`, borrado lógico (`deletedAt`) en catálogo, `slug` único por entidad pública.

---

## 16. Seguridad

Aplicar como referencia el **OWASP Top 10** y el **OWASP ASVS nivel 2** para las partes de autenticación, pagos y panel.

- Sesiones en cookies `HttpOnly`, `Secure`, `SameSite=Lax/Strict`; protección CSRF en mutaciones.
- Contraseñas con **Argon2id**; política mínima razonable; bloqueo progresivo tras intentos fallidos.
- Recuperación con enlaces de un solo uso y vencimiento corto.
- 2FA para cuentas administrativas.
- Roles y permisos verificados en backend (guards de NestJS).
- Validación de toda entrada (Zod/DTO) y salida tipada.
- *Rate limiting* (`@fastify/rate-limit`) en login, formularios, cotizaciones y webhook.
- Cabeceras de seguridad (`@fastify/helmet` y en Next.js): CSP (permitiendo dominios de Wompi, Cloudinary, Maps, Turnstile), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`.
- CORS restringido al dominio del frontend.
- HTTPS en todos los ambientes públicos.
- Secretos en variables de entorno o gestor de secretos; `.env` fuera del repositorio; `.env.example` documentado.
- Subida de archivos: validar tipo real (MIME), extensión y tamaño; subir directo al almacenamiento con firma; nunca ejecutar.
- Prevención de inyección (Prisma parametriza), XSS (escape por defecto en React; sanitizar HTML enriquecido del panel) y abuso de endpoints.
- Dependencias: `pnpm audit` y Dependabot/Renovate.
- Logs sin contraseñas, tokens ni datos personales innecesarios.
- Pagos: ver 11.3 y 11.6.

---

## 17. Requisitos legales y normativos (Colombia)

> Lista de verificación para el equipo técnico. **Los textos definitivos los aprueba la agencia con su asesor** (🛑 PC-6). No es asesoría legal.

1. **Registro Nacional de Turismo (RNT):** toda agencia debe tenerlo vigente (se renueva anualmente) y la normativa de agencias de viajes exige informar el número de RNT en la publicidad de los planes. Mostrar el RNT en el pie de página, en cada detalle de plan y en confirmaciones. Campo editable en `SiteSettings`.
2. **Información de los planes (Decreto 2438 de 2010 y normas compiladas en el Decreto 1074 de 2015):** informar claramente lo que incluye y **lo que no incluye** cada plan, duración, transporte, servicios complementarios, condiciones, restricciones y documentación de viaje requerida. El modelo de datos ya contempla inclusiones/exclusiones.
3. **Prevención de ESCNNA (Ley 679 de 2001 y Ley 1336 de 2009):** los prestadores turísticos deben adoptar un código de conducta y advertir a los turistas que la explotación y el abuso sexual de menores son sancionados por la ley. Incluir el aviso en el pie de página y en las condiciones. Texto exacto `[PENDIENTE CLIENTE / ASESOR]`.
4. **Estatuto del Consumidor (Ley 1480 de 2011):** información clara de precio total, condiciones, políticas de cambios, cancelación y reembolso. Para ventas por comercio electrónico existe el **derecho de retracto** (art. 47): el asesor debe definir cómo aplica a cada tipo de servicio turístico y el texto que se mostrará. Mostrar identificación del proveedor (razón social, NIT, dirección, contacto).
5. **Protección de datos (Ley 1581 de 2012 y Decreto 1377 de 2013, compilados en el Decreto 1074 de 2015):** política de tratamiento, aviso de privacidad, autorización expresa en formularios (casilla no premarcada, guardada en `ConsentRecord` con fecha y versión), canal para consultas y reclamos, conservación de datos y encargados (Wompi, correo, hosting). Si se usan cookies de analítica, banner de consentimiento.
6. **PQR:** procedimiento y tiempos de respuesta definidos por la agencia.
7. **Facturación electrónica (DIAN):** `[PENDIENTE CLIENTE]` confirmar si la agencia ya factura con un proveedor; en v1 basta registrar el número de factura en la reserva. Integración automática, fase futura.
8. **Términos y condiciones, política de cancelación y política de cookies:** páginas propias, versionadas; la reserva guarda qué versión aceptó el cliente.

---

## 18. SEO (posicionamiento en buscadores)

Principio rector, según la propia documentación de Google: el contenido debe estar hecho **para las personas**, no para manipular el ranking; el SEO suma cuando se aplica sobre contenido útil y real.

### 18.1 Expectativa realista

Ejemplo del cliente: que al buscar "viaje de Medellín a Cali" aparezca Ricaurte Tours. Eso se logra si existe una **página real de ese producto** (plan, ruta o paquete que la agencia venda), con contenido útil, rápida, enlazada internamente y respaldada por la autoridad de la marca (perfil de Google, reseñas, menciones). No se crean cientos de páginas casi iguales por combinación origen-destino: Google lo considera *doorway pages* (páginas puerta) y lo penaliza. Una página por ruta/plan **solo si el producto existe**.

`[PENDIENTE CLIENTE]` Ciudad de la sede y orígenes desde los que salen los planes terrestres (clave para las búsquedas tipo "planes desde [ciudad]").

### 18.2 Investigación de palabras clave (Fase 1)

- Herramientas gratuitas: Google Search Console (cuando esté el sitio), Google Keyword Planner, Google Trends (estacionalidad: vacaciones de mitad de año, diciembre, Semana Santa), autocompletado y "otras preguntas de los usuarios" de Google.
- Clasificar por intención:
  - **Transaccional:** "plan Cartagena todo incluido", "paquete San Andrés desde Pasto", "pasadía Carrizal precio".
  - **Comercial:** "mejores planes Eje Cafetero en familia".
  - **Informativa:** "qué hacer en Guatapé", "cuándo ir a San Andrés".
  - **Local / marca:** "agencia de viajes en [ciudad]", "Ricaurte Tours".
- Priorizar *long tail* (frases específicas) donde una agencia pequeña puede competir contra Despegar o Booking.
- Entregable: hoja de palabras clave → página destino asignada (una intención principal por página, sin canibalización).

### 18.3 Arquitectura y on-page

- URLs legibles y estables:
  - `/destinos/cartagena`
  - `/planes/nacionales/aereos/cartagena-4-dias-3-noches`
  - `/pasadias/carrizal`
  - `/planes/internacionales/[slug]`
  - `/guias/que-hacer-en-guatape`
- Un `<h1>` por página con la intención principal; jerarquía `h2/h3` lógica.
- `title` único (≈50–60 caracteres) y `meta description` única y persuasiva, editables desde el panel con valores por defecto generados.
- Enlazado interno: destino ↔ planes ↔ hoteles ↔ tours ↔ guías; *breadcrumbs* visibles.
- Imágenes: nombre de archivo descriptivo, `alt` obligatorio y real, formatos modernos, dimensiones declaradas.
- Contenido original de la agencia (no copiar descripciones de hoteles u otros sitios).
- Preguntas frecuentes por destino (útiles para usuarios y buscadores, aunque Google ya no muestre FAQ como resultado enriquecido para la mayoría de sitios).

### 18.4 SEO técnico (Next.js)

- Renderizado en servidor/estático para páginas públicas (HTML completo indexable).
- Metadata API de Next.js: `title`, `description`, `canonical`, Open Graph y Twitter cards (imagen por plan para compartir en WhatsApp/Facebook).
- `sitemap.xml` dinámico (destinos, planes, guías) y `robots.txt`; excluir `/admin`, `/cuenta`, checkout y resultados filtrados.
- Etiqueta `noindex` en panel, cuenta, checkout y páginas de prueba; ambiente staging protegido con contraseña y `noindex`.
- Datos estructurados JSON-LD que reflejen exactamente lo visible: `TravelAgency`/`LocalBusiness` y `Organization` (logo, contacto, redes en `sameAs`), `BreadcrumbList`, `WebSite`. Para planes se puede describir con `TouristTrip`/`Offer` como información semántica, sin prometer resultados enriquecidos. Validar con la Prueba de resultados enriquecidos de Google.
- Redirecciones 301 si cambia un slug (tabla de redirecciones gestionada desde el panel).
- Página 404 útil con enlaces a destinos.
- `lang="es-CO"`.
- **Core Web Vitals** en "bueno" (percentil 75 de usuarios reales): **LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1**. Medidas: imagen *hero* priorizada, fuentes autoalojadas, dimensiones de imágenes reservadas, JS mínimo en páginas públicas, widgets de terceros (Maps, Wompi) cargados solo donde se usan. Google aclara que su peso en el ranking es pequeño, pero afectan la conversión.

### 18.5 Contenido

- Guías de destino escritas con conocimiento real de la agencia (experiencia propia, consejos prácticos, temporadas, qué llevar), enlazadas a los planes. Empezar con los destinos que más vende.
- Calendario editorial simple alineado a temporadas.
- Reutilizar contenido de TikTok/Instagram/YouTube (videos embebidos en guías y planes).

### 18.6 SEO local y autoridad

- Crear/verificar **Perfil de Empresa de Google** (Google Business Profile): categoría "Agencia de viajes", horarios, fotos reales, enlace al sitio, productos/servicios.
- **NAP consistente** (nombre, dirección, teléfono idénticos) en web, Google, Facebook, Instagram, TikTok y directorios turísticos.
- Pedir reseñas a clientes tras cada viaje (correo automático post-viaje con enlace a Google).
- Menciones y enlaces de: hoteles aliados, ANATO (si es afiliada), oficinas de turismo locales, medios regionales.
- Enlazar redes al sitio y el sitio a redes.

### 18.7 Medición

- Google Search Console (propiedad de dominio) con sitemap enviado desde el lanzamiento.
- Google Analytics 4 o alternativa respetuosa con la privacidad, con consentimiento.
- Eventos de conversión: inicio de constructor, cotización enviada, clic en WhatsApp, pago aprobado.
- Revisión mensual: consultas, CTR, páginas con impresiones y sin clics (mejorar títulos), Core Web Vitals.

### 18.8 Fuentes de referencia para SEO

Priorizar fuentes oficiales y de alta reputación:
- Google Search Central: Guía de SEO para principiantes, guía de contenido útil centrado en personas, políticas de spam, documentación de datos estructurados (Google Search Central también tiene canal de YouTube).
- web.dev (Core Web Vitals).
- Ahrefs (blog y canal de YouTube; tiene guías específicas de SEO para agencias de viajes y operadores turísticos).
- Moz (guía SEO para principiantes).
- En español: Romuald Fons (fundador de la agencia BIGSEO, canal de YouTube con gran comunidad hispana).

Regla: un consejo de un creador se aplica si es coherente con la documentación oficial de Google.

---

## 19. Investigación inicial y marca (Fase 1 — detallada)

🛑 **PC-1: antes de empezar, pedir al usuario el logo real.** Al recibirlo: describirlo (el usuario indica que es un avión con colores naranja/tomate y azul), extraer los HEX exactos, revisar legibilidad en fondos claros y oscuros y si existen versiones horizontal/vertical/ícono. Si solo hay un formato raster de baja calidad, recomendar vectorizarlo.

🛑 **PC-2: preguntar por Playwright** (local vs. contenedor; ver sección 21) antes de tomar capturas.

### 19.1 Objetivo

Encontrar lo mejor de sitios turísticos reales para inspirar (no copiar) estructura, componentes, flujo de reserva y estilo, y definir una identidad visual a partir del logo, que es el único activo de marca existente.

### 19.2 Sitios a analizar

**Colombia y región (contexto local):**
- Turismo Andino (referencia del cliente).
- Aviatur, Despegar (flujo de paquetes y checkout local).
- Colombia.travel (marca país; fotografía y storytelling).
- 2–3 agencias medianas colombianas o de Nariño/Ecuador encontradas en búsqueda.

**Internacional (patrones de alta calidad):**
- GetYourGuide, Viator (fichas de tours, filtros, reseñas, precio "desde").
- Booking.com, Airbnb (búsqueda, selección de fechas y huéspedes, galería).
- Intrepid Travel, G Adventures (páginas de itinerario y paquetes).
- 2–3 sitios premiados de turismo en Awwwards o similares (dirección visual).

**Inspiración visual:** Pinterest, Dribbble, Behance, Mobbin (patrones móviles). Solo como referencia; nada se copia ni se reutiliza su imagen.

### 19.3 Qué revisar en cada sitio (plantilla)

- Captura de inicio en escritorio (1440) y móvil (390).
- Estructura del menú y categorías.
- *Hero* y buscador.
- Tarjetas de destino/plan (información que muestran, precio, badges).
- Página de detalle (itinerario, inclusiones/exclusiones, galería, CTA).
- Selector de viajeros y edades de niños.
- Resumen de precio y checkout.
- Confianza: reseñas, sellos, RNT, políticas.
- Paleta, tipografías, fotografía, iconografía, uso de espacio.
- Qué tomar / qué evitar.

### 19.4 Investigación de color y diseño

- Base académica: el estudio de Labrecque y Milne (Journal of the Academy of Marketing Science) muestra que el color influye en la personalidad percibida de una marca; asocia el azul con **competencia/confianza** y los tonos cálidos (rojo/naranja) con **emoción/entusiasmo**. Esto encaja con el logo: **azul como color principal de confianza** (navegación, encabezados, superficies de marca) y **naranja como acento de acción** (CTAs, precios destacados, promociones).
- Complementar con neutros cálidos (arena) y quizá un verde/turquesa de naturaleza solo si la investigación lo justifica.
- Revisar estudios de usabilidad de Baymard Institute sobre sitios de reservas de tours y alojamiento (búsqueda, galerías, checkout, checkout como invitado).
- Validar **contraste WCAG 2.2 AA** (4,5:1 texto normal, 3:1 texto grande y componentes) en claro y oscuro; el naranja sobre blanco suele fallar para texto pequeño → usar tono más oscuro para texto o texto blanco sobre naranja oscuro.

### 19.5 Entregables de la Fase 1

1. `docs/research/informe-referencias.md` con capturas organizadas y conclusiones por sitio.
2. Matriz comparativa de componentes (qué patrón se adopta y por qué).
3. `docs/research/palabras-clave.md` (sección 18.2).
4. Moodboard y **2–3 direcciones visuales** (🛑 PC-3: el usuario elige).
5. `docs/brand/guia-de-marca.md`: logo y usos, paleta claro/oscuro con HEX y contrastes verificados, tipografías (por ejemplo, una display con carácter para títulos y una sans muy legible para texto, ambas de Google Fonts autoalojadas), estilo fotográfico, tono de voz, iconografía.
6. `packages/ui/tokens` con los tokens finales.

### 19.6 Limitaciones conocidas

- Facebook bloquea la lectura automatizada de su página; la información de la página del cliente (descripción, fotos, contacto) se pedirá directamente al cliente o se copiará manualmente con su autorización.
- Pinterest y algunos sitios requieren sesión o bloquean bots: tomar capturas manuales si es necesario.
- Respetar `robots.txt` y términos de cada sitio; capturas solo para análisis interno.

---

## 20. Integraciones

- **Wompi:** sección 11.
- **Correo transaccional:** dominio propio con SPF, DKIM y DMARC configurados para no caer en spam.
- **WhatsApp:** enlace `wa.me/<número>` con mensaje prellenado contextual. No se requiere WhatsApp Business API en v1. Nunca se completa un pago por WhatsApp sin pasar por el sistema.
- **Google Maps:** en v1 basta una inserción (*embed*) de la ubicación o un enlace; cargarla de forma diferida solo en Contacto. La API de Maps solo si se necesitan mapas dinámicos por destino.
- **Redes sociales:** Facebook (https://www.facebook.com/ricaurtetours), Instagram, TikTok cuando exista. Enlaces configurables; opcional mostrar publicaciones embebidas en una sección, con carga diferida.
- **Drive del cliente:** solo como canal de entrega de fotos y documentos; no se integra al sistema.

---

## 21. Entorno de navegador automatizado (Playwright)

### 21.1 Para qué se usa

1. **Investigación (Fase 1):** abrir sitios de referencia, tomar capturas en varios tamaños.
2. **Verificación del frontend propio:** recorrer flujos reales (constructor, cotización, reserva en sandbox), capturas por *breakpoint*, claro/oscuro, pruebas E2E y de accesibilidad.

### 21.2 Instalación — 🛑 PC-2

Preguntar al usuario:
- **Opción A (recomendada): contenedor Docker** con la imagen oficial `mcr.microsoft.com/playwright:<versión>-noble`. No instala nada en el equipo local y fija la versión de navegadores. La versión de la imagen debe coincidir con la versión de `@playwright/test` del proyecto.
- **Opción B:** si el usuario ya tiene Playwright instalado localmente y funcionando, usarlo directamente.

Servicio sugerido en `docker-compose.yml` (perfil `tools` para que no arranque siempre):

```yaml
  playwright:
    image: mcr.microsoft.com/playwright:vX.Y.Z-noble   # igualar a la versión del proyecto
    profiles: ["tools"]
    working_dir: /work
    volumes:
      - ./:/work
    ipc: host
    init: true
    user: pwuser
    extra_hosts:
      - "host.docker.internal:host-gateway"   # para probar la app que corre en el host
    environment:
      - BASE_URL=http://host.docker.internal:3000
    command: ["npx", "playwright", "test"]
```

Notas de la documentación oficial de Playwright: la imagen está pensada para pruebas y desarrollo; para navegar sitios externos (investigación) se recomienda ejecutar con el usuario no root `pwuser` y el perfil *seccomp* que publican. Usar `--init` e `--ipc=host` para estabilidad de Chromium.

### 21.3 Convenciones de capturas

- Carpeta: `e2e/screenshots/<fecha>/<flujo>/<breakpoint>-<tema>.png`.
- Breakpoints: 375 (móvil), 768 (tablet), 1280 (portátil), 1440 (escritorio).
- Temas: claro y oscuro.
- Las capturas de referencias externas van en `docs/research/screenshots/` y no se publican.

---

## 22. Estándares de código y flujo de trabajo

- TypeScript `strict`, sin `any` salvo justificación comentada.
- ESLint + Prettier compartidos en `packages/config`.
- Componentes pequeños, reutilizables, tipados; nada de estilos o colores sueltos fuera del core.
- Nombres de dominio en español o inglés, **pero consistentes** (recomendado: código en inglés, textos de UI en español).
- Git: rama `main` protegida, ramas `feat/…`, `fix/…`; Pull Requests revisados por el otro integrante; **Conventional Commits** (commitlint).
- **Husky + lint-staged** en *pre-commit*: lint y formato de archivos cambiados; *pre-push*: typecheck y pruebas unitarias.
- CI (GitHub Actions o similar) en cada PR: `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build`, E2E críticos.
- Decisiones relevantes registradas como ADR en `docs/adr/`.
- `README.md` con cómo levantar todo con un comando (`docker compose up` + `pnpm dev`).

Comandos estándar (en la raíz, vía Turborepo):

```bash
pnpm lint          # ESLint en todo el monorepo
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest (unidad e integración)
pnpm test:e2e      # Playwright
pnpm build         # build de producción
```

**Regla:** antes de cada commit y al terminar una sesión grande de trabajo se ejecutan `pnpm lint`, `pnpm typecheck` y `pnpm test`. No se hace commit con errores.

---

## 23. Verificación y pruebas

### 23.1 Pirámide de pruebas

| Tipo | Herramienta | Qué cubre |
|------|------------|-----------|
| Unidad | Vitest | Motor de precios (casos dorados de la matriz), reglas de edad, máquina de estados, firmas Wompi, formateadores |
| Integración API | Vitest/Jest + Supertest + PostgreSQL de pruebas (contenedor) | Endpoints, permisos, transacciones, webhook idempotente |
| Contrato | OpenAPI generado vs. tipos del frontend | Que front y back hablen el mismo idioma |
| E2E | Playwright | Flujos completos en navegador |
| Accesibilidad | @axe-core/playwright | WCAG 2.2 AA en páginas clave |
| Visual | Capturas Playwright | Responsive y claro/oscuro |
| Rendimiento | Lighthouse CI / PageSpeed | Core Web Vitals de laboratorio |

### 23.2 Fase de verificación al terminar cada sección

Al cerrar cada fase (o módulo grande) el asistente ejecuta y reporta:

**Backend**
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde.
- [ ] Migraciones aplican desde cero y el *seed* corre sin errores.
- [ ] Endpoints de la fase responden según OpenAPI (casos felices y de error: 400, 401, 403, 404, 409).
- [ ] Consistencia de datos: restricciones, relaciones, sin huérfanos; consultas de verificación sobre la base.
- [ ] Permisos: un rol sin permiso recibe 403.
- [ ] Logs sin datos sensibles.
- [ ] Para pagos: firma de integridad correcta, evento con firma inválida rechazado, evento repetido no duplica, monto alterado rechazado.

**Frontend** (con el contenedor Playwright)
- [ ] Flujos de la fase recorridos de punta a punta.
- [ ] Capturas en 375/768/1280/1440, claro y oscuro, revisadas visualmente (sin desbordes, textos cortados ni contrastes pobres).
- [ ] Navegación con teclado y foco visible.
- [ ] axe sin violaciones serias.
- [ ] Sin errores en consola del navegador.
- [ ] Estados de carga, vacío y error implementados.

**Reporte:** resumen de lo verificado, capturas relevantes, problemas encontrados y cómo se corrigieron. Si algo falla, se corrige antes de avanzar.

### 23.3 Flujos E2E mínimos

1. Visitante navega inicio → destino → plan → arma paquete → cotización enviada.
2. Visitante arma paquete → reserva como invitado → paga en sandbox Wompi → ve estado actualizado tras el evento.
3. Cambiar edades de niños recalcula el precio según el destino.
4. Admin crea destino, hotel y tour → aparecen en el sitio tras revalidación.
5. Admin cambia precio/promoción → nuevo cálculo; reserva anterior conserva su snapshot.
6. Admin registra abono manual → saldo se actualiza.
7. Formulario de contacto y PQR → correo enviado y registro en panel.
8. Cambio de tema claro/oscuro persiste.

---

## 24. Despliegue y operación

- Ambientes: **desarrollo** (Docker local), **staging** (protegido, `noindex`, Wompi sandbox) y **producción**.
- Componentes: web Next.js, API NestJS, PostgreSQL administrado, Cloudinary/S3, correo, dominio con HTTPS.
- Opciones de hosting a comparar por costo, soporte y experiencia del equipo: (a) Vercel para web + Railway/Render/Fly.io para API y base de datos; (b) un VPS con Docker Compose y proxy inverso (Caddy/Traefik) con HTTPS automático. Decisión en ADR.
- Copias de seguridad automáticas diarias de PostgreSQL con retención y **prueba de restauración** antes del lanzamiento.
- Monitoreo de errores (Sentry), disponibilidad (*uptime*) y alertas del webhook de pagos.
- *Healthcheck* `/api/v1/health`.
- Lista previa al lanzamiento: llaves Wompi de producción, URL de eventos en producción, DNS de correo (SPF/DKIM/DMARC), Search Console, sitemap enviado, textos legales aprobados, RNT visible, 301 si había sitio previo, capacitación al cliente.

---

## 25. Fases de desarrollo

Cada fase termina con la verificación de la sección 23.2.

| Fase | Contenido | Puntos de control |
|------|-----------|-------------------|
| **0. Preparación** | Pedir logo; definir Playwright (Docker/local); crear Drive con el cliente; recopilar información disponible (sección 26). | PC-1, PC-2 |
| **1. Investigación y marca** | Análisis de referencias con capturas, investigación de color y UX, palabras clave, direcciones visuales, guía de marca y tokens (sección 19). | PC-3 |
| **2. Base técnica** | Monorepo, Docker Compose (postgres, api, web, playwright), configuración de calidad (lint, prettier, husky, commitlint, CI), core de diseño (`packages/ui`) con tokens y tema claro/oscuro, autenticación, esquema Prisma inicial, OpenAPI. | — |
| **3. Catálogo y administración** | CRUD de destinos, modalidades, hoteles, tours, complementos, paquetes, medios, configuración general; roles; auditoría. | — |
| **4. Sitio público** | Inicio, listados, detalle de destino/plan, galería, quiénes somos, contacto/PQR, pie legal, SEO técnico (metadata, sitemap, JSON-LD). | — |
| **5. Constructor y precios** | Flujo por pasos, viajeros/edades, reglas tarifarias, desglose, simulador en panel, pruebas doradas con la matriz real. | PC-4 |
| **6. Cotizaciones, reservas y pagos** | Cotizaciones, reservas, máquina de estados, Wompi (firma, widget, eventos, consulta), abonos, correos, Mis reservas, conciliación. | PC-5 |
| **7. Contenido y SEO** | Carga de contenido real, guías de destino, FAQ, revisión on-page, Google Business Profile, Search Console, analítica con consentimiento. | PC-6 |
| **8. Pruebas finales y lanzamiento** | Regresión E2E completa, seguridad (revisión OWASP), rendimiento, accesibilidad, prueba de restauración de copias, despliegue a producción, capacitación. | PC-5, PC-6 |

Las fases 3 y 4 pueden avanzar en paralelo una vez acordados los contratos API.

---

## 26. Información pendiente del cliente

El equipo **no** debe inventar esta información.

### 26.1 Marca e institucional
- [ ] **Logo en alta calidad (PNG transparente y, si existe, SVG)** — se necesita antes de la Fase 1.
- [ ] Razón social, NIT, **número de RNT**.
- [ ] Misión, visión, valores, eslogan, "quiénes somos" (se entregarán después).
- [ ] Dirección, ciudad de la sede, horarios, teléfonos, número de WhatsApp, correos.
- [ ] Usuarios de Instagram, TikTok (cuando exista); confirmar Facebook.
- [ ] Fotos reales (Drive) con permiso de uso.

### 26.2 Catálogo
- [ ] Documento Word con planes nacionales e internacionales: qué incluye y qué no, itinerarios, duración.
- [ ] Destinos destacados (los más vendidos).
- [ ] Hoteles por destino y tours por destino.
- [ ] Orígenes de salida de los planes terrestres.
- [ ] Complementos (seguro de viaje: proveedor, coberturas, precio).

### 26.3 Tarifas
- [ ] **Matriz Excel de costos y precios.**
- [ ] Rangos de edad por destino/producto y criterio por estatura.
- [ ] Fecha de referencia para la edad (reserva o viaje).
- [ ] Ocupación de habitaciones, temporadas, promociones, impuestos, redondeos.
- [ ] Vigencia de cotizaciones.

### 26.4 Reservas y operación
- [ ] Quién valida cupos y en cuánto tiempo.
- [ ] Bloqueo de cupo durante el pago.
- [ ] Qué pasa si se paga y no hay disponibilidad.
- [ ] Políticas de cambios, cancelación y reembolso.
- [ ] Datos obligatorios de viajeros y documentos.
- [ ] Responsable de formularios, PQR y correo destinatario.
- [ ] Usuarios del panel y sus roles.

### 26.5 Pagos
- [ ] Cuenta comercial Wompi (o crearla) y cuenta de desembolso.
- [ ] Medios de pago a habilitar.
- [ ] Reglas de anticipo, abonos, frecuencia y fecha límite.
- [ ] Facturación electrónica actual.

### 26.6 Legal
- [ ] Textos de términos, privacidad, cookies, cancelación, retracto, aviso Ley 679 aprobados por la agencia/asesor.

---

## 27. Decisiones y principios

| Tema | Decisión |
|------|----------|
| Tipo de plataforma | Sitio comercial + constructor + cotizaciones + reservas + administración |
| Paquetes | Prediseñados y personalizables |
| Combinaciones | Las define la agencia |
| Disponibilidad | Manual en v1 |
| Reservas | Invitado o cuenta |
| Cotización | Flujo propio, convertible en reserva con enlace de pago |
| Moneda operativa y de pago | COP |
| USD | Solo equivalencia informativa |
| Pasarela | **Wompi** (adaptador desacoplado) |
| Idioma | Español (es-CO) |
| Tema | Claro y oscuro |
| Arquitectura | Monolito modular, front y back separados |
| Frontend | Next.js + TypeScript + Tailwind + shadcn/ui |
| Backend | NestJS + Fastify + TypeScript |
| Base de datos | PostgreSQL + Prisma |
| Medios | Cloudinary o S3 compatible |
| Monorepo | pnpm workspaces + Turborepo |
| Navegador automatizado | Playwright en Docker (recomendado) |
| WordPress | Descartado (sección 13.1) |

**Principios**
1. La agencia controla la oferta y sus combinaciones.
2. El backend es la autoridad del precio.
3. Las reservas conservan su precio histórico.
4. No se promete disponibilidad sin validación.
5. Todo pago y abono es trazable y verificado con Wompi.
6. COP es la moneda de cálculo y cobro; USD es solo visual.
7. Integraciones desacopladas.
8. Modularidad sin complejidad innecesaria.
9. No se inventan destinos, tarifas, inclusiones, condiciones, reseñas ni textos legales.
10. Diseño centralizado en el core: un cambio de marca se hace en un solo lugar.
11. Nada se da por terminado sin verificación (lint, tipos, pruebas, revisión visual).
12. La v1 resuelve el flujo comercial principal y deja espacio para crecer.

---

## 28. Criterios de aceptación de la v1

- [ ] Se consultan destinos y planes nacionales, internacionales y pasadías.
- [ ] La agencia gestiona destinos, hoteles, tours, complementos, paquetes, promociones e imágenes sin ayuda técnica.
- [ ] El constructor calcula precios con reglas configurables y la matriz real; muestra desglose y precio por persona.
- [ ] Se registran adultos, niños y edades, con rangos por destino.
- [ ] Importes calculados y guardados en COP; USD identificado como informativo; checkout avisa cobro en COP.
- [ ] Se envían cotizaciones y se convierten en reservas.
- [ ] Se reserva como invitado o usuario.
- [ ] Pagos con Wompi verificados por firma de eventos y consulta de transacción; idempotentes.
- [ ] Una reserva admite varios abonos y muestra saldo.
- [ ] Historial de estados y transacciones consultable.
- [ ] Contacto, WhatsApp contextual, correo, mapa, redes y PQR funcionando.
- [ ] RNT, aviso Ley 679 y textos legales aprobados visibles.
- [ ] Sitio responsive y en modo claro/oscuro, con WCAG 2.2 AA en páginas clave.
- [ ] Core Web Vitals de laboratorio en "bueno" en inicio, destino y plan.
- [ ] Sitemap, robots, metadatos, JSON-LD validados; Search Console configurado.
- [ ] Lint, tipado y pruebas en verde; E2E críticos pasando en CI.
- [ ] Copias de seguridad probadas y monitoreo activo.

---

## 29. Base de este documento

- Transcripción de la reunión inicial con el cliente.
- Versión 1.0 de esta especificación.
- Indicaciones del equipo: Wompi como pasarela, investigación de referencias con Playwright, identidad desde el logo, modo claro/oscuro, core de diseño centralizado, verificación por fases.
- Documentación oficial consultada: Google Search Central (SEO, contenido útil, datos estructurados), web.dev (Core Web Vitals), documentación de Wompi (widget, firma de integridad, eventos), documentación de Playwright (Docker), normativa colombiana de turismo, consumidor y datos personales, Baymard Institute (UX de reservas), Labrecque y Milne (color y marca).

Las decisiones técnicas son propuestas del equipo de desarrollo. Las reglas comerciales y textos legales dependen de lo que entregue y apruebe la agencia.
