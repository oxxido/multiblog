# Multiblog — Decisiones nuevas

> Decisiones tomadas después de `SPEC.md`/`PLAN.md`, que los modifican o los
> precisan. `SPEC.md` y `PLAN.md` no se reescriben en su prosa de origen salvo
> que la decisión cambie el stack o el plan mismos (como D1); todo lo demás
> vive acá. Ante una duda, esta tabla manda sobre el documento original.

| # | Decisión | Slice | Reemplaza / precisa |
|---|---|---|---|
| D1 | Proxy y TLS con **Caddy**, no Traefik. Corre como contenedor propio dentro del `docker-compose.yml` de Multiblog — no depende de un Caddy preexistente en el servidor. | S1 | `SPEC.md` §4 y §8, `PLAN.md` S1 |
| D2 | Servidor de despliegue de S1 en adelante: **esta máquina**, administrada con dockge. No se provisiona VPS nuevo. | S1 | `PLAN.md` S1 ("servidor real") |
| D3 | Sin dominio real todavía. S1 corre sobre `*.localhost` en HTTP plano; el certificado wildcard vía DNS-01 queda **pendiente explícito** hasta tener un dominio real apuntado a la máquina. No se marca como criterio de aceptación cumplido mientras tanto. | S1 | `PLAN.md` S1 (criterio de aceptación "certificado válido") |
| D4 | Espacios de prueba de S1: **`nutricion` e `ideas`** (de los tres definidos en `Design.md`), no genéricos `a`/`b`. | S1 | `PLAN.md` S1 (ejemplos `a.midominio.com`/`b.midominio.com`) |
| D5 | La regla "el render de Markdown ocurre al guardar, nunca en el manejador de ruta pública" (`.claude/rules/Markdown.md`) no aplica todavía en S1: no hay guardado ni base de datos, sólo archivos `.md` en disco. La ruta `/{slug}` lee y renderiza al servir la petición. La regla entra en vigencia recién en S2, cuando exista un `body_html` cacheado que renderizar al guardar. | S1 | `.claude/rules/Markdown.md` (alcance temporal, no la regla en sí) |
| D6 | Dominio tentativo: **`divermente.es`** (no `.com`, que era el placeholder de `Design.md`). No confirmado ni apuntado por DNS todavía — sigue sin cambiar nada de D3: sin dominio apuntado, sin TLS real. | — | `Design.md` (placeholder `divermente.com`), D3 |
| D7 | El TLS público y la terminación real de tráfico de internet **no las hace el Caddy de Multiblog**, las hace el Caddy de un Raspberry Pi aparte (DHCP + Pi-hole + Caddy) que ya es el borde de la red doméstica: el port-forward del router apunta ahí, y ese Caddy reenvía por `reverse_proxy` a los servicios internos por IP, incluida esta máquina (`192.168.1.45`). Esto corrige el supuesto de D1 de que el Caddy del `docker-compose.yml` de Multiblog haría su propio DNS-01 de cara a internet. | — | D1 |
| D8 | El esquema Drizzle de S2 incorpora ya los campos de `docs/I18N.md` §3 (`lang`, `translation_group_id`, `source_post_id`, `translated_at`, `source_updated_at` en `posts`; `lang` en `post_slugs`; `UNIQUE (space_id, lang, slug)` en vez de `UNIQUE (space_id, slug)`; `name_en`/`slug_en` en `categories`; `name_en` en `tags`), aunque `docs/slices/02.md` T2 sólo pedía el esquema de `SPEC.md` §6. `I18N.md` §7 es explícito: "S2 — el esquema incorpora lang, translation_group_id... Esto es lo único que no se puede posponer sin pagar una migración de URLs". No hay UI de traducción todavía, sólo la forma de los datos. | S2 | `docs/slices/02.md` T2 |
| D9 | Driver de Postgres para Drizzle: **`postgres`** (promesas nativas), no `pg`, tal como proponía `docs/slices/02.md` §0. | S2 | `docs/slices/02.md` §0 |
| D10 | Flujo de git por slice: rama nueva antes de empezar a implementar, commits cuando corresponda durante el trabajo, y push al cerrar la slice (si hace falta) con link y mensaje de PR propuestos al usuario — el PR mismo no se crea sin que él lo pida. | — | `CLAUDE.md` "Cómo trabajar" |
| D11 | El servicio `caddy` del `docker-compose.yml` de Multiblog se vuelve opcional (`profiles: ["local-caddy"]`), no arranca en `docker compose up` normal. `app` publica su puerto (`3000:3000`) al host. Esto materializa lo que D7 ya preveía: en el redeploy real de S2 en dockge, el borde es el Caddy del Pi, que llega a esta máquina por IP:puerto directo — el Caddy propio quedaba de más ahí y además rompía el arranque en dockge (bind mount de `Caddyfile` sobre un directorio fantasma). El Caddy local se sigue usando para pruebas completas contra `*.localhost` con `docker compose --profile local-caddy up`. | S2 (redeploy) | D7 |
| D12 | Dev y prod corren en la misma máquina (D2) como procesos separados, en puertos fijos distintos: **prod** (contenedor `app` de `docker-compose.yml`) en `3000`; **dev** (`pnpm dev` suelto con `tsx`) en `3100`, vía `PORT` en `.env.local`. No es una convención de código, es sólo asignación manual para no pisarse en esta máquina — si se agrega otro entorno (staging, etc.) le toca otro puerto libre. | — | D2, D11 |
| D13 | Se inserta una slice nueva, **S4 — Implementación del diseño existente**, entre S3 y el editor visual. Aplica `docs/Design.md` + `docs/UI_mockups/` al shell de espacio, al post y a una versión mínima de la home central (`midominio.com`, adelantada de S8 sólo para esa vista). Sin fotos reales (variante "sin foto" de `Design.md`, hasta que S7/Media exista), sin CSS de admin (`Design.md` no lo cubre), con el CSS de bloques ricos (`callout`, `gallery`) ya escrito aunque el bloque en sí llega en S6. Fuentes por Google Fonts (`<link>`), no autohospedadas. Esto corre un número a todo lo que seguía: editor visual (antes S4) → **S5**, bloques → **S6**, media → **S7**, sitio central y distribución → **S8**, flujo de escritura → **S9**. La slice bilingüe que `docs/I18N.md` §7 preveía insertar después de bloques/media (sin número fijo en `PLAN.md` todavía) pasa de S7 a **S8**, corriendo sitio central a S9 y flujo de escritura a S10 — ya actualizado en `docs/I18N.md` y en la mención de D8. | S4 | `PLAN.md` S4-S9 (renumeración), `docs/slices/04.md` → `05.md`, `docs/I18N.md` §7, D8 |
| D14 | `spaces` gana una columna `cover_media_id` (nullable, FK a `media.id`), adelantada de **S7 — Media**, a pedido del usuario tras revisar S4: el mockup de `Design.md` §2/§3 muestra una imagen central por espacio (hero central y de espacio) que ni `SPEC.md` ni `PLAN.md` habían modelado — S7 sólo preveía "imagen de portada **por post**". Se agrega **sólo la columna y su migración** (`0002_tan_drax.sql`); no hay forma de subirla ni de asignarla todavía (ni en el admin ni en las plantillas públicas) porque el camino de subida de archivos es S7 y no existe. Queda `NULL` en todo espacio hasta esa slice. | S4 (adelanto de S7) | `PLAN.md` S7 ("imagen de portada por post"), `docs/Design.md` §2/§3, `src/db/schema.ts` |
| D15 | Al planificar S7 (`docs/slices/07.md`): dos dependencias nuevas, **`sharp`** (derivados WebP) y **`@fastify/multipart`** (subida), propuestas y confirmadas con el usuario — las únicas altas al stack cerrado de `CLAUDE.md` para esta slice. Tabla nueva **`site_settings`** (singleton, `id` fijo = 1, `cover_media_id` → `media`), también confirmada con el usuario: la cabecera a sangre del sitio central (`Design.md` §2.1) no tenía ninguna fila dueña de su foto, a diferencia de `spaces`/`posts` que ya la tenían desde D14. | S7 | `docs/slices/07.md` §0, `PLAN.md` S7, `Design.md` §2.1 |
| D16 | Al planificar S8 (bilingüe): (1) **el proveedor de traducción es OpenRouter, no la API de Claude directa** — decisión del usuario, `docs/I18N.md` §7/§8 hablaba de "la API de Claude"/`ANTHROPIC_API_KEY` porque no había otra opción sobre la mesa todavía. Env var nueva `OPENROUTER_API_KEY`. Dependencia nueva propuesta y confirmada: el SDK `openai` (compatible con la API de OpenRouter vía `baseURL: "https://openrouter.ai/api/v1"`), única alta al stack para esta slice. Modelo: **`openrouter/auto`** (ruteo automático de OpenRouter, distinto modelo por llamada según el prompt) — confirmado con el usuario; no compromete el invariante 6 porque la validación estructural (mismas directivas, mismos tipos, mismos atributos) rechaza cualquier traducción que rompa el formato, sea cual sea el modelo que la generó. (2) **Se corrigen los títulos de `PLAN.md` S8/S9** para que coincidan con la renumeración que D13 ya había decidido pero que `PLAN.md` nunca aplicó a sus propios encabezados: **S8 — Bilingüe** (contenido movido desde `docs/I18N.md` §7), **S9 — Sitio central y distribución** (antes S8), **S10 — Flujo de escritura** (antes S9). `docs/STATUS.md` ya daba esta numeración por hecha. (3) **El routing del prefijo `/en/`** que `docs/I18N.md` §7 asignaba a S3 nunca se implementó ahí (`docs/slices/03.md` no lo menciona; las rutas públicas de S3-S7 hardcodean `LANG = "es"` aunque el módulo de contenido ya acepta `lang` como parámetro desde D8) — queda absorbido por S8, que es la primera slice que necesita que exista. (4) **"Feeds y sitemaps por idioma"**, que `docs/I18N.md` §7 listaba como parte de S8, se saca de esta slice: ni feeds ni sitemaps existen todavía en ningún idioma (los construye S9/Sitio central). S8 se limita a `hreflang`/`canonical`/`x-default` en las páginas que sí existen hoy (post, índice de espacio, central). | S8 | `docs/I18N.md` §7/§8 (reescritos), `PLAN.md` S8-S10 (renumeración), D13, D8 |
| D17 | Al planificar S10 (`docs/slices/10.md`): cuatro decisiones confirmadas con el usuario. (1) **Publicación programada por job periódico en el proceso**, no por filtro en tiempo de consulta: `status` sigue siendo la fuente de verdad exacta, con una ventana de latencia igual al intervalo del job (60s por defecto), en vez de tratar un `scheduled` con `published_at` pasado como públicamente visible sin tocarlo. (2) **Vista previa de borrador con token persistente** (`posts.preview_token`, `uuid` único, rotable desde el admin), no un token HMAC efímero sin columna nueva. (3) **Una revisión de `body_md` sólo en el guardado explícito del formulario completo**, nunca en el autosave de 2s de S5, y sólo si cambió — evita cientos de filas por sesión de escritura; diff sólo contra la revisión inmediata anterior, con la dependencia nueva **`diff`** (única alta al stack para esta slice). (4) **Import/export en scripts CLI** (`pnpm import`/`pnpm export`, patrón `db:seed`), un espacio por invocación, con **front-matter propio hecho a mano** (`clave: valor` entre líneas `---`, sin YAML real ni dependencia nueva tipo `gray-matter`) — organizado en subdirectorios `es/`/`en/` en vez de un campo `lang`, categorías por slug que deben preexistir (falla si no), tags *find-or-create* vía `syncPostTags` (S9), medios fuera de alcance (ya cubiertos por `pg_dump` + volumen, `docs/SPEC.md` §8) y sin reconstrucción de `post_slugs` al reimportar. Detalle completo, con el resto de las decisiones de implementación que no ameritaron pregunta aparte, en `docs/slices/10.md` §0. | S10 | `docs/PLAN.md` S10, `docs/SPEC.md` §3/§8/§9 |
| D18 | Se inserta una slice nueva, **S11 — Diseño propio para el admin**, a pedido del usuario: aplica al panel el sistema visual que D13 había excluido explícitamente ("sin CSS de admin, `Design.md` no lo cubre") sobre el mockup `docs/UI_mockups/Divermente Admin.html`, confirmado como slice formal (no ajuste suelto) y de alcance completo (las siete pantallas del mockup, no sólo las tres detalladas). Es visual, no funcional — mismo criterio que D13 fijó para S4: `public/css/admin.css` nuevo, independiente de `site.css` (sin factorizar tokens compartidos, por no reabrir esa slice cerrada); Google Fonts por `<link>`, mismas dos familias que ya usa el público; el picker de medios sigue siendo ventana propia (`window.open`/`postMessage` de S7), no se convierte en diálogo de la misma página; el alta rápida de post gana una entrada inline en la lista pero no reemplaza `GET /admin/posts/new` (lo verifica el test de aceptación de S5); sin campos editoriales nuevos en "Sitio central" (titular/bajada/pie de foto quedarían fuera de alcance, requieren migración de `site_settings`). Detalle completo en `docs/slices/11.md` §0. | S11 | D13, `docs/PLAN.md` S11, `docs/slices/11.md` §0 |
| D19 | Dominio definitivo: **`neurodivermente.com`**, registrado en name.com (que también hace de DNS) — reemplaza el tentativo `divermente.es` de D6. `BASE_DOMAIN` deja de estar fijo en `docker-compose.yml` (`${BASE_DOMAIN:-localhost}`) y se toma del `.env` del stack. DNS: registros A apex y `*` a la IP pública. **Sin certificado wildcard por ahora**: el módulo `caddy-dns/namedotcom` no compila con Caddy ≥ 2.8.4 (issue #4 del repo, sin mantenimiento), así que el Caddy del Pi lista cada host explícito (apex, `admin`, un nombre por espacio) y saca un certificado por host vía HTTP-01. Consecuencia temporal: un espacio nuevo requiere agregar su host al Caddyfile del Pi y recargar Caddy — no redeploy de Multiblog, y la resolución del espacio sigue siendo contra la base (invariante 7), pero sí un paso manual fuera de la app. Corrige D7 (que asumía un bloque wildcard con DNS-01). Se revisa cuando exista **DnsDynArr**, el sistema del usuario para controlar Caddy y puertos internos vía MCP. | — | D6, D3, D7 |
| D20 | A pedido del usuario, **el picker de medios deja de ser una ventana propia** (`window.open`/`postMessage`, S7) y pasa a ser un panel dentro de la misma página: se abre debajo del campo de portada (post, espacio, sitio) o de la barra del editor (botones "Imagen" y "Galería"), con la grilla de la biblioteca y un botón **"Subir imagen"** que sube con `fetch` y, en modo único, elige la imagen en la misma acción (en modo múltiple la deja marcada). Revierte la parte de D18 que mantenía la ventana propia. Sin cambios de esquema: `GET /admin/media/items` (JSON) reemplaza a `/admin/media/picker`, y `POST /admin/media` responde la imagen creada en JSON cuando el cliente manda `Accept: application/json` (sin ese header sigue redirigiendo al listado). Se eliminan `picker.eta`, `picker.ts` y `mediaPicker.ts`; nuevo `src/admin-client/mediaPanel.ts`. Aparte, el **color de acento de un espacio** pasa de texto libre a `<input type="color">` y el servidor sólo acepta `#rrggbb` (o vacío) — el valor se interpola en `style="--sp: ..."` del sitio público, así que un texto libre permitía inyectar CSS. | S7, S11 | D18, `docs/slices/07.md` T4/T8/T9 |
| D21 | A pedido del usuario, **los espacios archivados se pueden desarchivar** desde el admin (`POST /admin/espacios/:id/unarchive`, que pone `archived_at` en `null`), con botón "Desarchivar" en la lista y en la edición del espacio. Precisa que "sin borrado, sólo archivado" (S3) es una baja reversible: el espacio recupera su subdominio con todo su contenido intacto. Sin cambios de esquema. | S3, S11 | D18, `docs/slices/03.md` |
| D22 | Producción se muda a un **VPS de IONOS** (Ubuntu 24.04, 2 vCPU / 4 GB / 120 GB NVMe), administrado con dockge en `/opt/stacks/<nombre>/`. Un **Caddy compartido** en su propio stack (`/opt/stacks/caddy`) termina el TLS de todos los proyectos del VPS y llega a cada app por la red Docker externa `proxy`. `app` deja de publicar `3000:3000` y se anuncia en esa red con el alias `multiblog-app`. Esta máquina queda sólo para desarrollo (`pnpm dev`, `compose.dev.yaml`). | — | D2, D7, D11 (puerto publicado), D12 (puerto de prod) |
| D23 | El certificado TLS de cada espacio nuevo se emite **en demanda** (on-demand TLS del Caddy compartido del VPS) en la primera petición HTTPS a su host, en vez de listar cada host en el Caddyfile. Crear un espacio ya no requiere editar ni recargar Caddy. Elimina la consecuencia temporal de D19 (paso manual por espacio); el wildcard DNS-01 sigue bloqueado y ya no hace falta para esto. | — | D19 (certificados por host), D22 |

---

## Detalle

### D1 — Caddy en vez de Traefik

`SPEC.md` fijaba Traefik para TLS wildcard. Se cambió a Caddy — no porque
hubiera uno ya corriendo en el servidor de despliegue (esa premisa era
incorrecta, corregida acá), sino porque Multiblog trae su propio contenedor
Caddy dentro de `docker-compose.yml` (ver `Caddyfile`, `Dockerfile`), sin
depender de infraestructura preexistente en la máquina. Caddy resuelve DNS-01
igual que Traefik, con el plugin del proveedor de DNS correspondiente, una
vez que exista dominio real (D3). Se actualizó `SPEC.md` y `CLAUDE.md`
directamente porque es un cambio de stack, no una excepción puntual de una
slice.

Ese servidor tiene un Raspberry Pi aparte para DHCP y otros daemons de red,
sin relación con Multiblog ni con este Caddy.

### D2 — Servidor: esta máquina

`PLAN.md` habla de "el servidor real" sin especificar cuál. Se definió que,
para S1 en adelante, ese servidor es la máquina actual, ya gestionada con
dockge para stacks de Docker Compose — los stacks viven en
`~/docker/stacks/<nombre>/` (p. ej. `~/docker/stacks/multiblog-prod/`), con
el repo clonado ahí para que `build: .` tenga todo el contexto que necesita.
No hace falta provisionar nada nuevo.

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

### D6 — Dominio tentativo: divermente.es

`Design.md` usaba `divermente.com` como marca, sin confirmar ni apuntar por
DNS. El dominio que tentativamente se va a comprar/usar es **`divermente.es`**
(nótese el cambio de TLD). Sigue siendo tentativo: no está comprado ni
apuntado todavía, así que D3 no cambia — S1 y S2 siguen validándose contra
`*.localhost`. Este dato se anota para que cuando haya que decidir el bloque
wildcard del Pi (D7) y las credenciales DNS-01, ya esté claro qué dominio va.

### D7 — El Pi termina TLS de internet, no el Caddy de Multiblog

Al conversar el despliegue real apareció un dato que D1 no tenía: esta
máquina de desarrollo/release nunca recibe tráfico de internet directo. El
que lo recibe es un Raspberry Pi aparte (DHCP + Pi-hole + Caddy) — el
port-forward del router (80/443) apunta a él, y su Caddyfile ya tiene un
bloque `reverse_proxy` estático por servicio hacia las IPs internas, por
ejemplo:

```
catalogo.calle11.es {
        reverse_proxy 192.168.1.45:8000
}
```

Esta máquina es `192.168.1.45`. Cualquier dominio de Multiblog (`divermente.es`,
D6) va a tener que pasar primero por ese Caddy del Pi para llegar acá — el
Caddy que define el `docker-compose.yml` de Multiblog (D1) nunca ve tráfico
de internet directo, sólo lo que el Pi le reenvíe.

**Consecuencia práctica, para cuando haya dominio real:**

- el wildcard de espacios (`*.divermente.es`) se resuelve con **un solo
  bloque estático** en el Caddyfile del Pi, igual de manual que los que ya
  tiene por servicio — no con la API de administración de Caddy, no
  dinámico por espacio. Eso mantiene el invariante 7 (crear un espacio no
  requiere redeploy) porque quién resuelve el espacio dentro de ese wildcard
  es `middleware/space.ts` contra la tabla `spaces`, no el Caddyfile del Pi;
- ese bloque wildcard necesita DNS-01 (un wildcard no se emite por HTTP-01),
  así que las credenciales de API del proveedor de DNS van en el Caddy del
  **Pi**, no en el de Multiblog;
- el Caddy del `docker-compose.yml` de Multiblog (D1) deja de ser el que
  hace TLS de cara a internet. Sigue existiendo para el reverse-proxy interno
  hacia el proceso Node, pero sin DNS-01 propio — eso pasa a estar de más si
  el Pi ya termina TLS antes de reenviar.

Nada de esto se implementa todavía: sigue pendiente de dominio real, igual
que D3. Se deja anotado para no perder la conversación.

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

### D8 — Esquema de S2 incluye i18n desde ya

`docs/slices/02.md` T2 pedía sólo el esquema de `SPEC.md` §6. Pero
`docs/I18N.md` §7 dice explícitamente que S2 tiene que incorporar `lang`,
`translation_group_id` y las claves únicas nuevas, sin esperar a la slice de
traducción (S8): es la única parte de i18n que no se puede posponer sin
pagar una migración de URLs después de indexado. Se resolvió esta
contradicción entre documentos a favor de `I18N.md`: el esquema de `posts` y
`post_slugs` de S2 ya tiene la forma final (`lang`, `translation_group_id`,
`source_post_id`, `translated_at`, `source_updated_at`,
`UNIQUE (space_id, lang, slug)`), y `categories`/`tags` ya tienen sus
columnas `_en`. No hay ninguna UI ni lógica de traducción todavía — sólo la
forma de los datos.

### D9 — Driver de Postgres: `postgres`

`docs/slices/02.md` §0 dejaba `pg` anotado como alternativa a confirmar. Se
usa `postgres` (promesas nativas), como proponía el desglose, sin razón
adicional más que evitar una capa de callbacks sobre Drizzle.

### D10 — Flujo de git por slice

Antes de empezar a implementar una slice se crea una rama nueva (no se
trabaja directo sobre `master`). Durante la implementación se commitea
cuando tiene sentido — no todo al final en un commit gigante — siguiendo el
formato de mensajes ya fijado en `CLAUDE.md` (`S{n}: descripción en
imperativo`). Al cerrar la slice, si hace falta subir la rama, se hace push
y se le propone al usuario el link para abrir el pull request junto con un
mensaje de PR sugerido; abrir el PR en sí (o mergear) es una decisión suya,
no se hace automáticamente.

### D11 — Migraciones y seed en el arranque de `app`, sin contenedor one-shot

`SPEC.md` §8 pedía un contenedor one-shot con `drizzle-kit migrate` antes de
levantar el app. Ese contenedor termina en `Exited (0)` tras cada despliegue
y Dockge muestra el stack entero como finalizado aunque esté sano. Se
reemplaza por el CMD de la imagen `runtime`: `node dist/db/migrate.js && node
dist/db/seed.js && exec node dist/server.js`. Si una migración o el seed
fallan, el servidor no arranca y `restart: unless-stopped` lo reintenta.

`migrate.ts` usa el migrador de `drizzle-orm` (ya es dependencia de runtime)
en vez de `drizzle-kit`, para que la imagen siga sin devDependencies. Ambos
registran en la misma tabla `drizzle.__drizzle_migrations`, así que lo ya
aplicado no se repite. `pnpm db:migrate` con `drizzle-kit` sigue igual en
desarrollo.

Consecuencia: el seed (idempotente) corre en cada arranque del contenedor,
no sólo en cada `docker compose up`, así que la contraseña del admin y los
posts `hola` de nutrición/ideas se reconcilian con `.env` y el código
también tras un reinicio del host.

### D22 — Producción en un VPS de IONOS con Caddy compartido

Se deja de usar esta máquina y el Pi como servidor y borde de producción
(D2, D7) y se pasa a un VPS de IONOS que también alojará otros proyectos
del usuario. Un solo Caddy, en su propio stack, es el dueño de los puertos
80/443 y enruta por `Host` a cada proyecto; cada app se une a la red Docker
externa `proxy` con un alias único (`multiblog-app`) para no chocar con otros
servicios llamados `app`. `postgres` queda sólo en la red del stack, nunca en
`proxy`.

`app` ya no publica puerto al host: Docker salta las reglas de `ufw` para
los puertos publicados, y el único camino legítimo de internet a la app pasa
por Caddy. Esto reemplaza a D11 (`app` publica `3000:3000`) y a la
asignación de puerto de prod de D12; el puerto de dev (`3100`) sigue igual.
`D19` (dominio y estrategia de certificados) no cambia: el wildcard sigue
bloqueado por el plugin `caddy-dns/namedotcom`, así que se lista cada host en
el Caddyfile hasta resolverlo.

Despliegue manual, en el VPS (`/opt/stacks/multiblog`, con el `.env` creado
a mano y fuera de git):

```bash
docker network create proxy          # una sola vez
git pull --ff-only origin master
docker compose up -d --build         # migra y siembra al arrancar (D11)
docker compose logs --tail=50 app
```

Al mergear a `master`, `.github/workflows/deploy.yml` corre lint, typecheck y
tests contra un Postgres de servicio (puerto 5433, como en dev) y, si pasan,
entra al VPS por SSH. La llave de ese deploy sólo puede ejecutar
`scripts/deploy.sh` (`command=` en `authorized_keys`), que hace el `git pull`
y el `docker compose up -d --build` de arriba y falla si `/health` no
responde después. Los secretos (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
`VPS_KNOWN_HOSTS`) viven en el environment `production` de GitHub, no en el
repo. Quien puede mergear a `master` puede cambiar lo que corre en el VPS (el
script y el `Dockerfile` vienen del repo): el control es proteger la rama.

### D23 — TLS en demanda para los espacios nuevos

D19 dejó el certificado por host listado a mano en el Caddyfile, con un paso
manual cada vez que se creaba un espacio. Con el Caddy compartido del VPS
(D22) ese paso desaparece: el certificado de un espacio se emite en demanda,
la primera vez que llega una petición HTTPS a su host, vía HTTP-01.

Esto cumple con el invariante 7 de punta a punta: el espacio se resuelve
contra la base y su TLS aparece solo, sin redeploy de Multiblog ni cambios en
la configuración de Caddy. El wildcard DNS-01 (bloqueado por
`caddy-dns/namedotcom`, D19) deja de ser necesario para este flujo.

La configuración vive en el Caddy compartido (`/opt/stacks/caddy`), fuera de
este repo, no en el `Caddyfile` de Multiblog.
