# Multiblog — Estado actual

> Foto del momento. Se actualiza al cerrar o arrancar una slice, no en cada
> commit. El historial completo de la v1 está en `docs/archive/v1/STATUS.md`.

---

## v1 cerrada

S1–S11 hechas y desplegadas en el VPS de IONOS (D22) sobre
`neurodivermente.com` (D19), con TLS en demanda por espacio (D23). Incluye
los ajustes posteriores a S11 (D20–D28).

### Pendientes heredados de la v1

- Fijar `TZ` en el compose del VPS: las fechas del admin salen en UTC.
- Sin probar en navegador real: barra del editor visual, fondo/columna del
  sitio público (D24) y flujo de guardado/restauración del editor (D27).
- Datos de test que no se limpian solos: posts que crean `s5`–`s8` en
  `nutricion`/`ideas`, filas `sample-*` de `media` (`s7`) y tags de `s9`.

---

## Slice hecha (código), pendiente de redeploy

**S12 — Analíticas.** Script de Umami (`analytics.xeedprojects.com`) en el
`<head>` de todas las páginas públicas (central, espacio, post), salvo la
vista previa de borradores; el admin no lo lleva. Excepción al invariante 3
registrada en D29. Se controla con `ANALYTICS_SCRIPT_URL` y
`ANALYTICS_WEBSITE_ID`; el `docker-compose.yml` trae por defecto los valores
del sitio de Multiblog, así que el redeploy no necesita tocar el `.env` del
VPS. Dev y tests no cargan el script. Test: `tests/acceptance/s12.test.ts`.

Pendiente fuera del código:

- **El usuario actualiza a mano el invariante 3 de `CLAUDE.md`** para
  reflejar D29 (y, cuando toque, saca "comentarios" de WON'T DO).
- En Umami, el sitio debe aceptar el apex y todos los subdominios de
  `neurodivermente.com` (un solo `data-website-id` para todos los espacios).

## Próxima

Sin definir. Backlog en `docs/PLAN.md` (comentarios).
