# Auditoría y rediseño V2 · Ricaurte Tours

Fecha: 15 de octubre de 2026. Rama local: `redesign-premium-v2`. Esta revisión compara el código de la rama principal con la referencia pública [Turismo Andino](https://turismoandinopasto.com/) y las publicaciones de [Ricaurte Tours](https://www.facebook.com/ricaurtetours). No supone que los anuncios históricos sigan vigentes.

## Hallazgos verificados

| Problema | Archivo | Severidad | Evidencia | Solución y prioridad | Estado |
| --- | --- | --- | --- | --- | --- |
| Titular de portada idéntico al de la referencia | `src/app/page.tsx` | Alta | Ambas portadas dicen «Tu destino, tu momento» | Crear una composición y voz propias. P0 | Corregido en V2 |
| Búsqueda dirigida a cotización, sin filtros de catálogo | `src/app/page.tsx`, `src/app/destinos/catalog.tsx` | Alta | `action="/cotizar"`; el catálogo solo filtra texto y categoría | Separar exploración histórica de solicitudes futuras; conservar fecha y viajeros. P0 | Corregido en V2 |
| Ofertas actuales sin datos confirmados | `src/lib/demo-data.ts`, páginas de destinos | Alta | Las seis entradas están documentadas como viajes pasados | Mantener la etiqueta «Viaje realizado» y mostrar un estado vacío para salidas actuales. P0 | Corregido en V2; depende de datos de agencia |
| Recepción de datos personales condicionada solo a dos variables | `src/app/api/quotes/route.ts`, `src/app/cotizar/page.tsx` | Alta | `QUOTE_INTAKE_ENABLED` y `DATABASE_URL` activan el envío | Exigir además aprobación explícita de privacidad, validar fecha y usar trampa antispam. P0 | Corregido en V2; permanece desactivado |
| Galería extensa con fotografías repetidas y sin vista ampliada | `src/app/page.tsx`, página de detalle | Media | Doce imágenes de home enlazan directo a Facebook; varias se repiten en tarjetas | Mosaico más selecto, visor accesible y atribución. P1 | Corregido en V2 |
| CSS acumulado en capas de sobrescrituras | `src/app/globals.css` | Media | Bloques de marca y media queries añadidos tras las reglas originales | Consolidar tokens y estilos legibles. P1 | Corregido en V2 |
| Menú sin estado de ruta ni cierre con Escape | `src/components/site-header.tsx` | Media | Enlaces sin `aria-current`; el botón solo alterna estado | Indicar sección activa y mejorar teclado. P1 | Corregido en V2 |
| Sin script de lint | `package.json` | Baja | Solo existen build y typecheck | Registrar el límite; no instalar dependencias sin necesidad. P2 | Pendiente |
| Contacto, PQRS, política y condiciones sin información aprobada | Rutas institucionales | Alta comercial | Las páginas informan su estado pendiente; no hay número oficial ni texto legal final | Mantener rutas informativas; completar con datos aprobados. P0 externo | Pendiente de la agencia |
| Reservas, pagos y panel administrativo sin operación | `prisma/schema.prisma` y rutas | Alta comercial | El esquema prepara entidades; no existen UI ni credenciales de operación | Implementar por fases después de aprobar catálogo, contrato, seguridad y operación. P1 externo | Pendiente de la agencia |

La comprobación inicial de TypeScript y `prisma validate` pasó. La base PostgreSQL no está conectada en este entorno; no se prueban escrituras reales.

## Matriz de referencia e identidad

| Componente | Versión inicial | Patrón observado en Turismo Andino | Solución Ricaurte Tours V2 |
| --- | --- | --- | --- |
| Navegación | Barra y menú móvil básicos | Acceso destacado a destinos, planes y ayuda | Logo oficial, enlaces compactos, ruta activa y menú operable con teclado |
| Hero | Fotografía a pantalla ancha y titular duplicado | Fotografía dominante y llamada comercial | Composición editorial propia, narrativa «Viajes que se convierten en historias», fotografías históricas y controles manuales |
| Buscador | Envía directamente a cotización | Entrada a ofertas por criterios | Explora experiencias documentadas; conserva preferencias sin sugerir disponibilidad |
| Catálogo | Seis fichas históricas | Tarjetas de paquetes con fechas y tarifas | Historias verificadas + estado vacío explícito de próximas salidas |
| Ficha | Descripción, fotos y CTA | Información de paquete y reserva | Historia, lugares, imágenes ampliables, datos futuros pendientes y destinos relacionados |
| Galería | Cuadrícula densa | Fotografía como protagonista | Mosaico asimétrico reducido, fuente por foto y visor accesible |
| Planes | Dos conceptos con advertencia | Plan Separa y Ahorro Programado comerciales | Dos conceptos diferenciados y señalados «En evaluación» |
| Ayuda | Tres preguntas | FAQ, contacto y PQRS visibles | FAQ ampliada, rutas claras y límites comerciales explícitos |
| Pie | Logo, enlaces y aviso | Navegación y canales | Información comprobada, redes y avisos legibles; sin inventar WhatsApp o RNT |

## Decisiones de contenido y arquitectura

- Las fotos locales proceden de publicaciones que el usuario proporcionó. Su archivo y URL de origen permanecen identificados en `src/lib/demo-data.ts`.
- «Viaje realizado» es contenido editorial. Ninguna ruta convierte automáticamente estas entradas en `TourPackage` o `Departure`.
- `prisma/schema.prisma` sigue preparando destinos, paquetes, salidas, cotizaciones, reservas y pagos. La V2 no activa transacciones ni ofrece un panel administrativo ficticio.
- El formulario solo podrá recibir datos cuando haya base de datos, activación operativa y aprobación de la política. WhatsApp espera un número oficial confirmado.
- No se copian textos, fotografías, marca ni estructura exacta de Turismo Andino.

## Verificación y pendientes

## Entrega por fases

| Fase | Archivos y motivo | Resultado | Verificación | Pendiente |
| --- | --- | --- | --- | --- |
| A · diagnóstico | `docs/auditoria-v2.md`: hallazgos y matriz comparativa | Alcance y datos comprobables definidos | TypeScript y Prisma iniciales correctos | Confirmación comercial y legal |
| B · diseño | `src/app/globals.css`, `src/components/hero-slider.tsx`: tokens, tipografía, composición y fotos reales | Identidad de azul profundo, superficies cálidas y acento coral | Capturas en cuatro anchos | Validación de marca final por la agencia |
| C · implementación | `src/app/page.tsx`, `src/app/destinos/*`, componentes de navegación, tarjetas y galería | Home editorial, catálogo histórico, fichas y visor | Rutas 200, filtros y galería probados | Paquetes y salidas vigentes |
| D · experiencia | `src/app/cotizar/*`, `src/components/site-header.tsx`, rutas de contacto y privacidad | Preferencias conservadas, menú con Escape, formulario honesto | CDP, teclado y capturas | Canal oficial y política aprobada |
| E · backend | `src/app/api/quotes/route.ts`, `.env.example` | API protegida por tres condiciones, fecha validada y trampa antispam | POST desactivado devuelve 503; Prisma válido | Base PostgreSQL real y operación aprobada |
| F · QA | `tmp/qa-v2/` (ignorado), este informe | Ajustes de contraste y centrado del visor | Build, typecheck, audit de producción, rutas, anchos e interacciones | Pruebas de operación cuando existan datos reales |

### Resultados locales

- `npm run typecheck`, `npm run build` y `npx prisma validate`: correctos.
- Capturas de home a 375, 768, 1024 y 1440 px; catálogo, detalle, cotización, galería y menú en `tmp/qa-v2/` (carpeta ignorada por Git). El navegador local no mostró desbordamiento horizontal en esos cuatro anchos.
- Interacciones verificadas con Chromium: apertura de galería, carga de imagen ampliada, avance con flecha, cierre con Escape; menú móvil abre y cierra con Escape; búsqueda de Cartagena muestra resultados históricos; destino, fecha y viajeros pasan a `/cotizar`.
- `/cotizar` no muestra campos de datos personales cuando la recepción está desactivada. La API se mantiene cerrada por tres condiciones explícitas: base de datos, activación y política aprobada.
- Las ocho rutas públicas probadas devolvieron HTTP 200; `POST /api/quotes` devolvió HTTP 503 con la recepción desactivada. `npm audit --omit=dev --audit-level=high` reportó cero vulnerabilidades.
- El navegador de línea de comandos no pudo cargar la referencia externa para capturas propias de móvil y escritorio dentro del tiempo de prueba. El benchmark de esa página se basó en la versión pública consultada por web; no se afirma haber comprobado su comportamiento responsive visualmente.
- No existe script de lint ni suite automatizada de pruebas en este repositorio. No se añadieron dependencias solo para cubrir esa ausencia.

Faltan para producción: catálogo vigente, precios y condiciones, canales oficiales, texto legal aprobado, RNT validado, política de privacidad, operación de cotizaciones, reservas y pagos. También se requiere validación final de las fotografías por parte de la agencia, especialmente cuando aparecen menores o interacciones con fauna.
