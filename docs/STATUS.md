# Multiblog — Estado actual

> Foto del momento. Se actualiza al cerrar o arrancar una slice, no en cada commit.

---

## Slice hecha

**S1 — Un post, un subdominio, una URL.** Desplegada y funcionando en esta
máquina, dada de alta en dockge (`~/docker/stacks/multiblog-prod/`, repo
clonado completo ahí), sobre `*.localhost` sin TLS (ver `docs/DECISIONS.md`
D3). Criterio de aceptación de `docs/slices/01.md` §4 confirmado con curl
contra el stack real:

```
GET http://nutricion.localhost/hola   → 200, HTML del md de nutrición
GET http://ideas.localhost/hola       → 200, HTML del md de ideas, distinto
GET http://otroespacio.localhost/     → 404
```

Pendiente explícito, no parte de esta corrida: certificado wildcard vía
DNS-01 (D3) — requiere dominio real.

`pnpm lint && pnpm typecheck && pnpm test` en verde.

## Slice hecha

**S2 — Postgres, admin, CRUD en texto plano.** Implementada según
`docs/slices/02.md` (T1–T8) y validada de punta a punta corriendo
`docker compose up` real (postgres + migrate/seed one-shot + app), contra
`*.localhost` igual que S1 (D3 sigue abierta). `pnpm lint && pnpm typecheck
&& pnpm test` en verde (10 tests, acceptance incluida en
`tests/acceptance/s2.test.ts`: login, CRUD de posts, borrador 404, publicar,
cambio de slug con 301).

El esquema de `posts`/`post_slugs`/`categories`/`tags` ya incluye los campos
de i18n de `docs/I18N.md` (ver D8 en `docs/DECISIONS.md`), sin UI de
traducción todavía.

`.env.example` creado y migración `0001` (índice compuesto
`(space_id, lang, status, published_at)` + `onDelete: cascade` en las
tablas de unión) generada y aplicada contra el Postgres de dev.

Redeploy en `~/docker/stacks/multiblog-prod/` (dockge) confirmado: el stack
de producción de esta máquina corre con los servicios `postgres` y
`migrate` nuevos.

## Slice hecha (código), pendiente de redeploy

**S3 — Espacios reales.** Implementada según `docs/slices/03.md` (T1–T5) en
la rama `s3-espacios-reales`, validada contra el Postgres de dev
(`compose.dev.yaml`, puerto 5433). `pnpm lint && pnpm typecheck && pnpm test`
en verde (15 tests; acceptance nueva en `tests/acceptance/s3.test.ts`: crear
espacio y que responda sin redeploy, aislamiento del índice entre espacios,
archivar espacio con contenido intacto, categoría acotada a su espacio,
paginación del índice sin repetidos ni omisiones).

`src/middleware/space.ts` resuelve contra la tabla `spaces` en vez del mapa
fijo de S1 (`src/config/spaces.ts`, borrado). CRUD de espacios y categorías
desde `/admin/espacios` y `/admin/categorias`. Dos ajustes que no estaban en
el desglose original de la slice y aparecieron al implementar (anotados en
`docs/slices/03.md` T4 y §0): el parser de formularios de `src/app.ts`
agrupa campos repetidos en array (lo necesitan los checkboxes de categoría),
y el orden de los índices paginados lleva desempate por `id` para que dos
posts publicados en el mismo instante no den un resultado no determinista
entre página y página.

**No se tocó el stack de producción de esta máquina.** El puerto 3000 ya lo
sirve `multiblog-prod-app-1` (dockge, `~/docker/stacks/multiblog-prod/`) —
correr `docker compose up` del checkout de desarrollo hubiera competido por
ese puerto contra el stack real. El redeploy (`git pull` + reconstruir en esa
carpeta) queda para que el usuario lo decida, igual que quedó anotado en S2.

## Próxima

S4 — Implementación del diseño existente (`docs/Design.md` +
`docs/UI_mockups/`) sobre el shell de espacio y de post ya servidos por
S1-S3. Desglose en definición, ver `docs/slices/04.md` cuando exista.

Después: S5 — Editor visual (TipTap), la slice más grande: conversión
bidireccional TipTap ↔ Markdown, alternar visual/crudo sin perder nada,
guardado automático de borrador.
