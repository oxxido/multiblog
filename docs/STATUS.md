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

## Ahora

S3 — Espacios reales, según `docs/slices/03.md` (T1–T5): resolución de
`Host` contra la tabla `spaces`, CRUD de espacios desde el admin, índice de
espacio paginado, categorías por espacio y su índice público.
