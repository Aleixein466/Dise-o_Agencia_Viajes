# Tipografías de la marca (autoalojadas)

Las dos familias del diseño Tropical Premium se sirven desde este repositorio con `next/font/local` (`../layout.tsx`).
Ni `next dev`, ni `next build`, ni el navegador piden nada a Google Fonts: la web compila y se ve igual sin conexión a
internet, y un corte de red de Google ya no puede romper el build ni dejar la página en Arial.

## Archivos

| Archivo                                    | Familia (versión de la fuente) | Estilo  | Eje variable    | SHA-256                                                            |
| ------------------------------------------ | ------------------------------ | ------- | --------------- | ------------------------------------------------------------------ |
| `dm-sans-latin-wght-normal.woff2`          | DM Sans 4.004                  | normal  | `wght` 100–1000 | `9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543` |
| `playfair-display-latin-wght-normal.woff2` | Playfair Display 1.203         | normal  | `wght` 400–900  | `e0c764a8e9e1cce92163c55bac4b2ad6cd4cf8c696ce2289ab5c41565e65b7e2` |
| `playfair-display-latin-wght-italic.woff2` | Playfair Display 1.203         | cursiva | `wght` 400–900  | `54af24bd0f911f0fd7399d5445ea2023ff501d6a69f2d728f1213072f977ab14` |

## Procedencia

Son los archivos `files/*-latin-wght-*.woff2` de los paquetes oficiales de Fontsource, copiados sin modificar:

- `@fontsource-variable/dm-sans@5.3.0`, integridad npm `sha512-BpUG5bqePiDFMBM4ZtLSlPdAIOM990uB1dlXzIf4aw21yQR7BmykedLXXXMqGWsR18aMLOsbWccwJNh3ztTQaA==`
- `@fontsource-variable/playfair-display@5.3.0`, integridad npm `sha512-IHdzTvE8eGIXHteZql7KXoqdc3Gfm+Zs1u4XlSC3MeplkwviT3sx/P6gI0tLwg/xIYLF4ZJYveZ5V+bl9cnDwA==`

Tienen las mismas versiones, ejes y avisos de licencia que servía Google Fonts (DM Sans con `opsz` fijo y solo `wght`
libre; Playfair Display 1.203), por lo que el dibujo de las letras no cambia. Para reproducirlos:
`npm pack @fontsource-variable/dm-sans@5.3.0 @fontsource-variable/playfair-display@5.3.0`, extraer
`package/files/<archivo>` y comprobar el SHA-256 de la tabla.

## Licencia

Ambas familias están bajo la **SIL Open Font License 1.1** (uso comercial y en web permitido). El texto íntegro de cada
paquete está en `OFL-DM-Sans.txt` y `OFL-Playfair-Display.txt`; deben acompañar siempre a los archivos. Los archivos no
se venden por separado ni se renombran: «Playfair Display» es un nombre de fuente reservado.

## Alcance y límites

- **Subconjunto `latin`**: Unicode `U+0000-00FF`, `U+0131`, `U+0152-0153`, `U+02BB-02BC`, `U+02C6`, `U+02DA`, `U+02DC`,
  `U+0304`, `U+0308`, `U+0329`, `U+2000-206F`, `U+20AC`, `U+2122`, `U+2191`, `U+2193`, `U+2212`, `U+2215`, `U+FEFF`,
  `U+FFFD`. Cubre todo el español (tildes, `ñ`, `¿`, `¡`, comillas, guiones, `€`). No se incluyen `latin-ext`,
  `cyrillic` ni `vietnamese`: el 2026-11-15 se revisó el código, las semillas y los paquetes y ningún texto los usa.
  Un carácter fuera del rango (por ejemplo `ş` o `Ł` en el nombre de un cliente) se dibuja con la fuente de reserva
  (Arial o Times New Roman), igual que ya ocurre con flechas como `→`. Para ampliarlo, añade el archivo
  `*-latin-ext-*` y una segunda llamada a `localFont` con `unicode-range`.
- **Pesos**: se declaran los mismos que antes (DM Sans 400, 500, 600, 700 y 800; Playfair Display 500 y 600, normal y
  cursiva), cada uno apuntando al mismo archivo variable. No los reemplaces por un rango (`100 900`): los pesos que hoy
  se aproximan al más cercano pasarían a dibujarse con su peso real y el diseño cambiaría.
- **Nada de Google**: no vuelvas a `next/font/google` ni a un `@import` de Google Fonts. `src/app/fonts.test.ts` lo
  impide y comprueba que estos archivos existen, son WOFF2 y llevan su licencia.
