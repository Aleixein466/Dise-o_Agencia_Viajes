# Ricaurte Tours · propuesta inicial

Prototipo responsive en Next.js para explorar viajes anteriores y preparar cotizaciones. El catálogo presenta **viajes documentados** por Ricaurte Tours en publicaciones que el cliente compartió: Eje Cafetero (2026), Atacames (2025), Excursión Chévere (2024), Cartagena (2022), San Andrés (2022) y Parque de las Aguas (2021). Esas publicaciones no representan paquetes, tarifas, fechas ni disponibilidad futura. Se incorporó el logo proporcionado por el cliente; los datos de contacto y textos legales siguen pendientes de validación.

## Estado

- Fase 1: diagnóstico, arquitectura, mapa de navegación y diseño visual inicial.
- Fase 2: inicio, catálogo filtrable, detalle de destino y formulario de cotización.
- Fase 3: esquema relacional Prisma y endpoint de cotizaciones preparado. La recepción está deshabilitada hasta aprobar la política de datos y configurar PostgreSQL.
- Fases 4 a 6: reservas, autenticación, panel, pagos sandbox, PQRS completo y pruebas de producción pendientes. No se muestran como funcionalidades operativas.

## Ejecución local

Requiere Node.js 20.19+ (se probó con Node 24) y npm.

```powershell
npm install
npm run dev
```

Abrir `http://localhost:3000`. Para preparar PostgreSQL, copiar `.env.example` a `.env` y cambiar la contraseña. `docker-compose.yml` permite levantar la base si Docker está instalado:

```powershell
docker compose up -d
npm run db:generate
npm run db:migrate
```

El formulario solo acepta y guarda solicitudes cuando existe `DATABASE_URL`, las migraciones están aplicadas y `QUOTE_INTAKE_ENABLED=true`. **Antes de activarlo se debe sustituir la página provisional de privacidad por la política aprobada por la agencia.** Docker no estaba instalado en el entorno donde se preparó el proyecto; por ello no se ejecutó una migración contra una base real.

## Verificaciones

```powershell
npx prisma validate
npm run typecheck
npm run build
npm audit
```

## Estructura

- `src/app`: rutas públicas y API de cotizaciones.
- `src/components`: navegación, pie y tarjetas.
- `src/lib/demo-data.ts`: contenido editorial reemplazable.
- `prisma/schema.prisma`: modelo de datos inicial.
- `docs/propuesta.md`: diagnóstico, arquitectura y plan.

Las fotografías de portada, tarjetas, sitios turísticos, galerías y cierre se obtuvieron de [publicaciones específicas de Ricaurte Tours](https://www.facebook.com/ricaurtetours) compartidas por el cliente, con enlaces a cada publicación original. La ficha de cada viaje incluye su propia galería. Cuatro afiches promocionales antiguos aparecen en un archivo plegable y se identifican como no vigentes. Antes de publicar el sitio, conviene revisar la selección final de fotografías con la agencia, incluidas las imágenes de menores y de la interacción con delfines.
