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

## En curso

**S12 — Analíticas.** Planificación. Esperando del usuario el código de
integración del sitio creado en `code/analytics`.

Decisiones abiertas antes de implementar:

1. **Invariante 3 (cero JS público).** Si la integración es un `<script>`,
   hay que elegir entre: rediseñarla sin JS (registro del lado del servidor
   desde Fastify, o píxel `<img>`), o que el usuario modifique a mano el
   invariante en `CLAUDE.md` para admitir esa excepción.
2. **WON'T DO.** "Analytics propio" está descartado en `CLAUDE.md` y
   `SPEC.md` §1. Si se interpreta como "no construir analíticas dentro de
   Multiblog", usar un servicio externo no lo contradice; queda registrarlo
   como decisión (D29).

## Próxima

Sin definir. Backlog en `docs/PLAN.md` (comentarios).
