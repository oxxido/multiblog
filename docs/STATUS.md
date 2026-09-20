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

## Slice hecha (código), pendiente de redeploy

**S6 — Bloques ricos.** Implementada según `docs/slices/06.md` (T1–T6) en
la rama `s6-bloques`, validada contra el Postgres de dev y en un navegador
real (Chromium vía Playwright: login, alta de post, inserción de los tres
bloques desde la barra del editor, alternar Markdown/visual, guardar,
publicar y confirmar el HTML público). `pnpm lint && pnpm typecheck &&
pnpm test` en verde (55 tests, 10 nuevos: 7 de round-trip en
`tests/roundtrip/{callout,gallery,youtube}.test.ts` y 3 de acceptance en
`tests/acceptance/s6.test.ts` — los tres bloques con las clases esperadas en
el sitio público, un atributo inválido cae a su valor por defecto sin
romper el resto del post, un intento de inyección dentro de un bloque no
sobrevive el saneado).

`src/markdown/blocks/` trae el registro (`types.ts`, `registry.ts`,
`toHast.ts` con los tres handlers genéricos por tipo de directiva) y los
tres bloques (`callout.ts`, `gallery.ts`, `youtube.ts`), con `index.ts`
como único punto que los registra y expone `blockTiptapNodes` para
`tiptap/extensions.ts`. `pipeline.ts` pasa esos handlers a `remarkRehype` y
amplía el esquema de `rehype-sanitize` para `figure`/`figcaption`/`iframe`
(acotado a `src`/`loading`). `fromMarkdown.ts`/`toMarkdown.ts` delegan
`containerDirective`/`leafDirective` al registro por nombre. Barra nueva de
tres botones (Callout, Galería, YouTube) en `src/admin-client/editor.ts`,
con `window.prompt()` para los atributos, sobre la barra que dejó S5.

`mdast-util-to-hast`, `mdast-util-directive` y `@types/hast` pasaron a
devDependencies explícitas (ya llegaban transitivo vía `remark-rehype` y
`remark-directive`): hacían falta para tipar el registro sin `any`, mismo
motivo que `@types/mdast` en S5.

Dos ajustes que no estaban en el desglose original y aparecieron al
implementar:

- **`fromMdast`/`toMdast` de un bloque reciben el conversor de nodo como
  parámetro, no lo importan.** `docs/slices/06.md` T2 suponía que
  `callout.ts` importaría `blockFromMdast`/`blockToMdast` de
  `tiptap/fromMarkdown.ts`/`toMarkdown.ts` directamente, pero eso arma un
  ciclo (`callout.ts` → `fromMarkdown.ts` → `normalize.ts` →
  `tiptap/extensions.ts` → `blocks/index.ts` → `callout.ts`, porque
  `extensions.ts` necesita el nodo TipTap de cada bloque). Pasar la
  función por parámetro rompe el ciclo sin duplicar la conversión.
- **`extensions.ts` sólo se toca una vez (T2), no de nuevo en T3.**
  Exporta `[...base, ...blockTiptapNodes]`, y `blockTiptapNodes` (el
  arreglo que crece en `blocks/index.ts`) es lo único que un bloque nuevo
  necesita tocar además de su propio archivo — así el criterio de
  aceptación de un "cuarto bloque hipotético" (§4) es literal.
- **Insertar un bloque desde la barra siempre va al final del documento**
  (`insertContentAt` con el tamaño total), no a la posición del cursor:
  detectado en la verificación con navegador real, insertar con el cursor
  todavía dentro de un `callout` recién creado (que sólo acepta
  `paragraph+`) hacía que TipTap descartara el bloque siguiente en
  silencio.
- Las NodeViews interactivas de T4 (selector de `type` en `callout`,
  miniaturas en `gallery`, tarjeta de verificación en `youtube`) se
  definieron directamente en `src/markdown/blocks/*.ts` (vía
  `renderHTML`), no por separado en `editor.ts` como preveía el desglose —
  evita duplicar el nodo base y el nodo interactivo del mismo bloque.

**No se tocó el stack de producción de esta máquina** (mismo motivo que S3,
S4 y S5). Redeploy pendiente de que el usuario lo pida.

## Slice hecha (código), pendiente de redeploy

**S7 — Media.** Implementada según `docs/slices/07.md` (T1–T10) en la rama
`s7-media`, validada contra el Postgres de dev, con `pnpm lint && pnpm
typecheck && pnpm test` en verde (70 tests, 15 nuevos: 7 unit en
`tests/unit/media/derivatives.test.ts`, 3 de round-trip en
`tests/roundtrip/image.test.ts` y 5 de acceptance en
`tests/acceptance/s7.test.ts`), y en un navegador real (Chromium vía
Playwright contra `pnpm dev`: login, subir una imagen, elegir portada de
post/espacio/sitio con el picker en ventana propia, insertar imagen suelta
y galería desde el editor, publicar y confirmar `srcset`/`width`/`height`
en las tres formas de uso en el HTML público de `ideas.localhost` y en la
home central).

`sharp` y `@fastify/multipart` nuevas (D15). `src/modules/media/` trae
`derivatives.ts` (puro: anchos fijos, `buildResponsiveImage`,
`buildThumbnail`, `parseMediaUrl` — sin I/O ni `env.ts`, ver más abajo),
`storage.ts` (disco: `generateDerivatives` con sharp, rutas de archivo) y
`media.ts` (`uploadMedia`, `listMedia`, `findMediaUsage`, `deleteMedia`,
`resolveCoverImage`/`resolveSiteCoverImage`). `/admin/media` (listado +
subida), `/admin/media/:id/delete` (confirmación con dónde se usa antes de
borrar) y `/admin/media/picker` (misma grilla en modo single/multi,
`postMessage` a quien la abre). Tercera instancia de `@fastify/static` sirve
`MEDIA_DIR` bajo `/media/` con caché larga. `src/markdown/mediaImages.ts`
(plugin remark, entre `remarkDirective` y `remarkRehype`) enriquece
imágenes sueltas del cuerpo con `srcset`/`width`/`height`/`loading`;
`gallery.ts` (S6) usa el mismo helper para sus propias imágenes de
biblioteca. Portadas de post, espacio y sitio (`site_settings`, tabla
nueva, D15) con un picker compartido (`admin-client/mediaPicker.ts` +
`coverPicker.ts`) y variante "con foto" en CSS para las tres cabeceras
(`--ph`, degradado, Design.md §1). El botón "Imagen" y el rediseño del
botón "Galería" del editor visual también usan el picker.

Ajustes que no estaban en el desglose original y aparecieron al
implementar:

- **`derivatives.ts` se separó de `storage.ts`.** El desglose preveía un
  solo archivo de "núcleo de derivados", pero `gallery.ts` y
  `mediaImages.ts` sólo necesitan las funciones puras (sin tocar disco); al
  importar el archivo completo arrastraban `env.ts` (`MEDIA_DIR`) y rompían
  `tests/roundtrip/` (fromMarkdown/toMarkdown corren sin servidor ni
  variables de entorno). Separar puro de disco resolvió esto sin duplicar
  lógica.
- **El esquema TipTap no tenía ningún nodo para `![alt](url)` suelto.**
  Detectado al planificar el botón "Imagen" (T9): una imagen fuera de un
  `gallery` ya rompía el editor visual al abrirse (nodo no soportado), desde
  antes de esta slice. Se agregó `tiptap/imageNode.ts` (nodo en línea,
  atómico, junto a los demás nodos base) y su conversión en
  `fromMarkdown.ts`/`toMarkdown.ts`, con round-trip nuevo — consultado con
  el usuario antes de tocar el formato canónico del editor, como pide
  `CLAUDE.md`.
- **`docker-compose.yml` (volumen `media_data` + `MEDIA_DIR` en `app`) y
  `package.json` (entry points nuevos de esbuild para
  `picker.ts`/`coverPicker.ts`) no estaban en la lista de archivos de
  ningún task del desglose,** aunque el criterio de aceptación y la
  narrativa de T4/T9 los dan por sentado. Se tocaron igual, documentados
  acá en vez de en el desglose.
- **El glob `tests/**/*.test.ts` de `pnpm test`/`test:roundtrip` no es
  recursivo sin `shopt -s globstar`** (no activado en bash): un archivo en
  `tests/unit/media/` (un nivel más anidado que lo que había hasta S6) no
  corría. Se cambió a `find ... | sort`, independiente del shell.
- **`@fastify/multipart` no resuelve `toBuffer()` con un buffer truncado**
  cuando se supera `limits.fileSize` (como asumía la validación de tamaño
  de `uploadMedia`): rechaza la promesa con `FST_REQ_FILE_TOO_LARGE`. La
  ruta lo atrapa y devuelve 400, igual que `MediaValidationError`.
- **`seed.ts` no podía sembrar `site_settings`:** `onConflictDoUpdate` con
  un `set: {}` tira ("No values to set") aunque no haya conflicto real —
  drizzle lo valida al construir la query. Encontrado recién al validar la
  slice completa en un navegador contra el Postgres de dev: el primer
  seed real (`migrate` de `docker-compose.yml`) habría roto el contenedor.
  Se cambió a `onConflictDoNothing`: la fila se siembra una sola vez y
  nunca se vuelve a tocar desde acá, porque `coverMediaId` lo edita el
  admin y un `set` con valor fijo lo borraría en cada redeploy.

**No se tocó el stack de producción de esta máquina** (mismo motivo que
S3–S6: el puerto 3000 ya lo sirve `multiblog-prod-app-1`). Redeploy
pendiente de que el usuario lo pida — necesita, además del `git pull`
habitual, que el volumen `media_data` nuevo quede disponible para `app`.

## Slice hecha (código), pendiente de redeploy

**S8 — Bilingüe.** Implementada según `docs/slices/08.md` (T1–T9) en la
rama `S8-bilingue`, validada contra el Postgres de dev. `pnpm lint &&
pnpm typecheck && pnpm test` en verde (83 tests, 13 nuevos: 6 unit en
`tests/unit/translation/validate.test.ts` y 7 de aceptación en
`tests/acceptance/s8.test.ts` — traducir un post con galería y bloque de
código preserva la estructura y aparece como borrador sólo visible tras
publicarse, una traducción con una directiva de menos se rechaza sin
crear fila, editar el original tras traducir marca la traducción como
desactualizada en el admin, `/en/`, `/en/{slug}` y `/en/c/{categoria}`
resuelven sobre un espacio y sobre el dominio central, un post sin
traducir no aparece en el índice del espacio en `/en/` ni en la home
central en inglés, y un post con ambas versiones publicadas lleva
hreflang recíproco y `x-default` en las dos páginas).

`openai` (D16) nueva dependencia, apuntada a `https://openrouter.ai/api/v1`,
modelo `openrouter/auto` fijo en código. `src/modules/translation/` trae
`openrouter.ts` (`translateContent`, system prompt con las reglas de
`docs/I18N.md` §5), `validate.ts` (`extractDirectiveShape`/
`directiveShapesMatch`, sin depender del registro de bloques) y
`translate.ts` (`translatePost`, orquesta llamada + validación +
persistencia). `src/i18n/` (nuevo) trae `dictionary.ts` y `dates.ts`,
reemplazando el copy y los arreglos de meses fijos en español de las tres
rutas públicas y sus plantillas. `spaceIndexRoutes`/`postRoutes` pasan de
plugins de Fastify a fábricas `(lang) => (fastify) => void`;
`routes/public/index.ts` registra las cuatro combinaciones es/en ×
espacio/post — el routing de `/en/` que `docs/I18N.md` §7 le había
asignado a S3 y nunca se implementó ahí (D16). Admin: botón "Traducir al
inglés" (sólo `lang === "es"` y `status === "published"`), enlace al
hermano, aviso de traducción desactualizada y columna de idioma en el
listado. Sitio público: `hreflang`/`canonical`/`x-default` en `post.eta`
vía `partials/head.eta`.

Ajustes que no estaban en el desglose original y aparecieron al
implementar:

- **Sin `unist-util-visit`.** `validate.ts` recorre el árbol de mdast a
  mano en vez de sumar esa dependencia: es la única función que necesita
  recorrer el árbol completo, y `docs/slices/08.md` §0 ya había cerrado la
  lista de altas al stack en esta slice a `openai` únicamente.
- **`findTranslationSibling` devuelve también `lang` y `translatedAt`**,
  no sólo `id`/`slug`/`status` como sugería la firma de T6: el admin
  necesita esos dos campos para calcular si la traducción quedó
  desactualizada sin una segunda consulta.
- **`PostDetail` gana `updatedAt`** (no estaba en la lista de T6) por el
  mismo motivo: la ruta de edición ya tiene la marca de tiempo del post
  que está mostrando y la reutiliza para esa comparación, en vez de volver
  a pedirla.
- **`PublishedPostView` gana `id`/`translationGroupId`**: `routes/public/post.ts`
  los necesita para llamar a `findPublishedTranslationSibling` (T8) sin una
  consulta aparte.
- **`.env.example`** se tocó a mano fuera de este flujo (permisos del
  proyecto bloquean su lectura/escritura automática) para sumar
  `OPENROUTER_API_KEY`.

**No se tocó el stack de producción de esta máquina** (mismo motivo que
S3–S7: el puerto 3000 ya lo sirve `multiblog-prod-app-1`). Redeploy
pendiente de que el usuario lo pida — necesita, además del `git pull`
habitual, la variable `OPENROUTER_API_KEY` en el entorno de producción
para que el botón de traducción funcione (es opcional en `env.ts`, así que
el resto del sitio sigue andando sin ella).

## Próxima

**S9 — Sitio central y distribución.** Sin código todavía. Home de
`midominio.com` con últimos posts de todos los espacios, `/espacios` y
`/t/{tag}`, tags globales asignables desde el admin, RSS por espacio y
agregado ya bilingüe, sitemaps + índice de sitemaps por espacio e idioma,
metadatos Open Graph/canonical genéricos de central-vs-subdominio (D16).
