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

## Slice hecha (código), pendiente de redeploy

**S4 — Implementación del diseño existente.** Implementada según
`docs/slices/04.md` (T1–T8) en la rama `s4-diseno-existente`, validada
contra el Postgres de dev. `pnpm lint && pnpm typecheck && pnpm test` en
verde (22 tests; acceptance nueva en `tests/acceptance/s4.test.ts`: home
central sobre `Host` sin subdominio, `Host` desconocido sigue en 404,
"Último" cruza espacios con acento y enlace correctos, categoría activa en
la barra de categorías, metadatos y navegación adyacente en la página de
post, tags cruzando espacios, ninguna plantilla pública con `<script>`).

`public/css/site.css` (nuevo) implementa `docs/Design.md` completo,
incluidas las clases de bloques ricos (`callout`, `gallery`, `code-block`)
sin contenido real que las ejercite todavía (S6). `@fastify/static` sirve
`public/` bajo `/`. Partials nuevos `src/views/partials/head.eta` y
`space-nav.eta`. `src/middleware/space.ts` distingue `Host === BASE_DOMAIN`
(`request.space = null`) de un `Host` desconocido (404), y `routes/public/space.ts`
delega a la home central nueva (`routes/central/index.ts`,
`modules/content/central.ts`) cuando corresponde.

Dos detalles que `Design.md` no fijaba y que hubo que decidir para poder
implementar (no ameritan entrada en `DECISIONS.md`, quedan anotados acá
como el resto de los ajustes de slice):
- **Ancho del contenedor:** `Design.md` habla de "ancho fijo del
  contenedor" pero sólo el mockup trae números concretos, en un lienzo de
  presentación. Se usó `max-width: 1200px` (central) y `1040px` (espacio),
  centrados — no un `100vw` literal — porque el mockup nunca muestra el
  sitio a un ancho de viewport mayor al de esos números.
- **Copy del header central:** sin un campo de "nombre del sitio" o
  tagline en el modelo (no lo hay y agregarlo es un cambio de esquema fuera
  de alcance), la marca usa `BASE_DOMAIN` y el titular/bajada de la home
  central se arman a partir de los nombres de los espacios activos
  (`Intl.ListFormat`), no de copy fijo tipo "Divermente" del mockup.

**No se tocó el stack de producción de esta máquina** (mismo motivo que S3:
el puerto 3000 ya lo sirve `multiblog-prod-app-1`). Redeploy pendiente de
que el usuario lo pida.

## Slice hecha (código), pendiente de redeploy

**S5 — Editor visual.** Implementada según `docs/slices/05.md` (T1–T6) en la
rama `s5-editor-visual`, validada contra el Postgres de dev.
`pnpm lint && pnpm typecheck && pnpm test` en verde (45 tests; 18 nuevos de
round-trip en `tests/roundtrip/` — uno por tipo de nodo base más un caso de
cuerpo vacío — y acceptance nueva en `tests/acceptance/s5.test.ts`: alta
mínima con `body_md` vacío, autosave que sólo toca cuerpo, reapertura con el
mismo Markdown en crudo y en el documento del editor visual, autosave sobre
un post publicado sin cambiarle el estado).

`src/markdown/tiptap/` trae `fromMarkdown`/`toMarkdown` (remark-parse +
remark-gfm para leer, remark-stringify + remark-gfm para escribir) y
`extensions.ts` con la lista de nodos TipTap (StarterKit, Link, Table) que
usan tanto el conversor como el editor de cliente. `src/admin-client/editor.ts`
monta TipTap sobre el formulario de post, alterna visual/crudo sin cambiar
qué envía el `<form>`, y dispara el autosave (`POST
/admin/posts/:id/autosave`, sólo `body_md`/`body_html`) con 2s de debounce.
Bundle armado con esbuild (dependencia nueva) y servido bajo
`/admin/static/` por una segunda instancia de `@fastify/static`; el sitio
público no lo referencia (invariante 3 intacta). `/admin/posts/new` pasó a
pedir sólo espacio, título, slug y extracto (`new.eta`, nuevo); el cuerpo se
escribe en `/admin/posts/{id}`, la pantalla de edición completa (`form.eta`).

Ajustes que no estaban en el desglose original y aparecieron al implementar:

- **TipTap 3 ya trae `Link` adentro de `StarterKit`** (no era así cuando se
  escribió `docs/slices/05.md`): se desactiva con
  `StarterKit.configure({ link: false })` y se agrega por separado, para
  poder configurarlo explícitamente sin el aviso de "extensión duplicada".
- **Dos archivos más en `src/markdown/tiptap/`** de los que listaba T1:
  `types.ts` (los tipos `TiptapNode`/`TiptapDoc`/`TiptapMark`) y
  `normalize.ts` (valida cualquier documento —venga de `fromMarkdown` o del
  cliente— contra el esquema real de `extensions.ts` antes de convertirlo,
  vía `prosemirror-model`). Separarlos de `fromMarkdown.ts`/`toMarkdown.ts`
  no cambia la interfaz pública que describía la slice.
- **Un documento vacío serializa sin la clave `content`** (así lo hace
  `Node#toJSON` de prosemirror-model, no un array vacío): `TiptapDoc.content`
  quedó opcional y `toMarkdown` lo trata como `?? []`. Importa porque un post
  recién creado por el paso mínimo de T5 arranca exactamente así.
- **`@types/mdast` como dependencia explícita** (antes llegaba transitivo):
  necesario para tipar `fromMarkdown.ts`/`toMarkdown.ts` sin `any`.
- **`eslint.config.js` ignora `public/admin/**`**: es el bundle generado por
  esbuild, no código fuente; sin el ignore, eslint intentaba tipar el bundle
  minificado.
- **Los helpers de creación de post en `tests/acceptance/{s2,s3,s4}.test.ts`
  pasaron a dos pasos** (alta mínima + `POST /admin/posts/{id}` para el
  cuerpo y las categorías): el endpoint de alta ya no acepta `bodyMd` ni
  `categoryIds`, consecuencia directa del paso mínimo de creación de T5, no
  un cambio de comportamiento de esas slices.

**No se tocó el stack de producción de esta máquina** (mismo motivo que S3 y
S4). Redeploy pendiente de que el usuario lo pida.

## Próxima

S6 — Bloques ricos: registro de bloques (`SPEC.md` §3), `remark-directive`
en el pipeline, los primeros tres bloques (`callout`, `gallery`, `youtube`)
con su nodo TipTap y su test de round-trip, insertables desde una barra del
editor que ya trajo S5.
