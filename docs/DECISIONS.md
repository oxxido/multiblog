# Multiblog — Decisiones nuevas

> Decisiones tomadas después de `SPEC.md`/`PLAN.md`, que los modifican o los
> precisan. `SPEC.md` y `PLAN.md` no se reescriben en su prosa de origen salvo
> que la decisión cambie el stack o el plan mismos (como D1); todo lo demás
> vive acá. Ante una duda, esta tabla manda sobre el documento original.

| # | Decisión | Slice | Reemplaza / precisa |
|---|---|---|---|
| D1 | Proxy y TLS con **Caddy**, no Traefik. Ya está disponible y probado en el servidor de despliegue (gestionado con dockge). | S1 | `SPEC.md` §4 y §8, `PLAN.md` S1 |
| D2 | Servidor de despliegue de S1 en adelante: **esta máquina**, administrada con dockge. No se provisiona VPS nuevo. | S1 | `PLAN.md` S1 ("servidor real") |
| D3 | Sin dominio real todavía. S1 corre sobre `*.localhost` en HTTP plano; el certificado wildcard vía DNS-01 queda **pendiente explícito** hasta tener un dominio real apuntado a la máquina. No se marca como criterio de aceptación cumplido mientras tanto. | S1 | `PLAN.md` S1 (criterio de aceptación "certificado válido") |
| D4 | Espacios de prueba de S1: **`nutricion` e `ideas`** (de los tres definidos en `Design.md`), no genéricos `a`/`b`. | S1 | `PLAN.md` S1 (ejemplos `a.midominio.com`/`b.midominio.com`) |
| D5 | La regla "el render de Markdown ocurre al guardar, nunca en el manejador de ruta pública" (`.claude/rules/Markdown.md`) no aplica todavía en S1: no hay guardado ni base de datos, sólo archivos `.md` en disco. La ruta `/{slug}` lee y renderiza al servir la petición. La regla entra en vigencia recién en S2, cuando exista un `body_html` cacheado que renderizar al guardar. | S1 | `.claude/rules/Markdown.md` (alcance temporal, no la regla en sí) |

---

## Detalle

### D1 — Caddy en vez de Traefik

`SPEC.md` fijaba Traefik para TLS wildcard. Se cambió a Caddy porque ya está
desplegado y funcionando en el servidor real (esta máquina), vía dockge.
Caddy resuelve DNS-01 igual que Traefik, con el plugin del proveedor de DNS
correspondiente. Se actualizó `SPEC.md` y `CLAUDE.md` directamente porque es
un cambio de stack, no una excepción puntual de una slice.

### D2 — Servidor: esta máquina

`PLAN.md` habla de "el servidor real" sin especificar cuál. Se definió que,
para S1 en adelante, ese servidor es la máquina actual, ya gestionada con
dockge para stacks de Docker Compose. No hace falta provisionar nada nuevo.

### D3 — Sin dominio real, sin TLS por ahora

DNS-01 requiere un dominio real apuntando a la máquina; todavía no hay uno
decidido (`Design.md` usa `divermente.com` como marca, pero no está
confirmado ni apuntado por DNS). Mientras tanto, S1 se valida sobre
`*.localhost`. El código nunca debe asumir un dominio fijo (`BASE_DOMAIN` por
variable de entorno, regla ya existente en `.claude/rules/Db.md`), así que
activar TLS real más adelante es una tarea de infraestructura (Caddyfile +
credenciales DNS-01), no un cambio de código de aplicación.

### D4 — Espacios de prueba: nutrición e ideas

`PLAN.md` ejemplifica S1 con espacios genéricos `a`/`b`. Se usan en cambio dos
de los tres espacios reales definidos en `Design.md`, con contenido mínimo de
prueba — el objetivo de S1 sigue siendo probar el pipeline, no publicar
contenido real.

### D5 — Render en la ruta pública, sólo durante S1

`.claude/rules/Markdown.md` fija que el HTML se genera al guardar el post, no
al servir la petición, porque asume un flujo de guardado con `body_html`
cacheado en base — ese flujo no existe todavía en S1 (`docs/slices/01.md`
excluye explícitamente base de datos y admin de esta corrida). La ruta
`/{slug}` de S1 lee el `.md` del disco y lo pasa por el pipeline en cada
petición, tal como describe la tarea T4 del desglose de la slice. Esto no es
una excepción a la regla: es que la regla habla de un paso ("guardar") que
todavía no existe. S2 introduce Postgres y el CRUD de posts; ahí el render
pasa a ocurrir al guardar y esta ruta deja de tocar el pipeline directamente.
