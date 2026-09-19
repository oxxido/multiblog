# Multiblog — Especificación

> Documento único de referencia. Producto, arquitectura y decisiones.
> Si algo no está acá, no está decidido.

---

## 1. Qué es

Una plataforma de blogs propia, autoalojada, donde cada tema vive en su propio subdominio con identidad propia, y un sitio central agrega todo.

```text
midominio.com              home central — agrega todos los espacios
cocina.midominio.com       espacio independiente
codigo.midominio.com       espacio independiente
admin.midominio.com        panel único
```

Un solo autor. Un solo despliegue. Una sola base de datos.

### MVP

- crear espacios (subdominio, nombre, descripción)
- escribir, editar y publicar posts en un espacio
- editor visual + Markdown, intercambiables
- categorías dentro de cada espacio, tags globales entre espacios
- home de espacio, página de post, home central
- feeds RSS por espacio y agregado
- subida de imágenes

### WON'T DO

Esta lista va en cada tarea que se le pase a un agente. El modelo sabe cómo es un blog y va a intentar construir *el blog completo*.

```text
comentarios
usuarios múltiples y roles
newsletter
analytics propio
temas intercambiables por UI
sistema de plugins
búsqueda full-text
traducciones de contenido
```

---

## 2. Decisiones tomadas

| # | Decisión | Estado |
|---|---|---|
| D1 | Un espacio = un subdominio, entidad de primer nivel | cerrada |
| D2 | Markdown canónico extendido con bloques (`directives`) | cerrada |
| D3 | Permalinks `{espacio}.dominio/{slug}` sin fecha, con historial de slugs | cerrada |
| D4 | Un solo proceso Node sirve todos los espacios, resuelto por `Host` | cerrada |
| D5 | Autoalojado con Docker Compose | cerrada |
| D6 | Renderizado en servidor, sin SPA | cerrada |

---

## 3. D2 — Markdown con bloques (la decisión importante)

El requisito era "Markdown, pero con flexibilidad". La resolución:

**El Markdown es la fuente de verdad.** El HTML se deriva y se cachea. Nunca se edita HTML.

La flexibilidad no viene de abandonar Markdown, viene de **extenderlo con directivas**, que es sintaxis Markdown válida y estándar (`remark-directive`):

```markdown
Texto normal, que sigue siendo portable y diffeable.

:::gallery{cols=3}
![Alt uno](/media/a.jpg)
![Alt dos](/media/b.jpg)
:::

::youtube[dQw4w9WgXcQ]

:::callout{type=warning}
Esto se renderiza como un bloque destacado.
:::
```

### Registro de bloques

Cada bloque rico es una entrada en un registro. Añadir un bloque nuevo no toca el motor:

```ts
{
  name: 'gallery',
  attrs: { cols: z.coerce.number().min(1).max(4).default(2) },
  render: (node, attrs) => string,   // HTML del bloque
  tiptapNode: GalleryNode,           // nodo del editor visual
  toMarkdown: (node) => string       // serialización de vuelta
}
```

### La regla que evita el desastre

> **Si un bloque no puede ir y volver entre editor visual y Markdown sin perder información, ese bloque no existe.**

El round-trip es lo que rompe estos sistemas. Se verifica con un test por bloque: `markdown → tiptap → markdown` debe ser idéntico. Un bloque sin ese test no se mergea.

### Consecuencias

- podés escribir en el editor visual o pegar Markdown, es lo mismo
- podés exportar todo el blog a archivos `.md` en cualquier momento
- el importador de `.md` es trivial: es el formato nativo
- el techo de riqueza lo pone el registro de bloques, no el formato

---

## 4. Stack

```text
Node 22 + TypeScript
Fastify                  HTTP, admin y sitio público en el mismo proceso
Postgres 16
Drizzle ORM              esquema en TS, migraciones versionadas
Eta                      plantillas de servidor
unified / remark / rehype  pipeline Markdown → HTML
  + remark-directive     bloques
  + rehype-sanitize      obligatorio, incluso siendo autor único
  + shiki                resaltado de código
TipTap                   editor visual, isla JS sólo en admin
Caddy                    proxy, TLS wildcard
Docker Compose           despliegue
```

Sin framework frontend. El admin es HTML del servidor con TipTap montado en el textarea del post y nada más.

---

## 5. Routing por subdominio

Un middleware resuelve el espacio antes que cualquier ruta:

```text
Host: cocina.midominio.com  →  space = cocina
Host: midominio.com         →  space = null  (sitio central)
Host: www.midominio.com     →  301 al apex
Host: admin.midominio.com   →  panel
Host desconocido            →  404
```

El espacio resuelto va en `request.space` y **toda consulta de contenido lo filtra**. Una consulta sin filtro de espacio es un bug de aislamiento, no una optimización pendiente.

### Rutas

```text
ESPACIO — {espacio}.midominio.com
  /                      índice paginado
  /{slug}                post
  /c/{categoria}         índice de categoría
  /feed.xml              RSS del espacio
  /sitemap.xml

CENTRAL — midominio.com
  /                      últimos posts de todos los espacios
  /espacios              listado de espacios
  /t/{tag}               posts de ese tag, cruzando espacios
  /feed.xml              RSS agregado
  /sitemap.xml           índice, apunta a los sitemaps de cada espacio

ADMIN — admin.midominio.com
  /login
  /posts                 filtrable por espacio
  /posts/{id}
  /espacios
  /media
```

### TLS wildcard — el detalle que muerde

Un certificado `*.midominio.com` **no se puede emitir con el desafío HTTP-01**. Requiere DNS-01, o sea que Caddy necesita credenciales de API de tu proveedor de DNS (vía el plugin correspondiente). Hay que resolverlo en la primera slice, no cuando quieras crear el segundo espacio.

---

## 6. Modelo de datos

```sql
spaces
  id, slug, subdomain (unique), name, description,
  accent_color, created_at, archived_at

posts
  id, space_id → spaces, slug, title, excerpt,
  body_md,            -- fuente de verdad
  body_html,          -- derivado, cacheado
  status,             -- draft | scheduled | published
  published_at, created_at, updated_at,
  cover_media_id → media
  UNIQUE (space_id, slug)

post_slugs                   -- historial, para redirecciones 301
  id, post_id → posts, space_id, slug, created_at
  UNIQUE (space_id, slug)

categories                   -- viven DENTRO de un espacio
  id, space_id → spaces, slug, name, description
  UNIQUE (space_id, slug)

post_categories
  post_id, category_id

tags                         -- GLOBALES, cruzan espacios
  id, slug (unique), name

post_tags
  post_id, tag_id

media
  id, filename, path, mime, width, height, size, created_at

users
  id, email (unique), password_hash, created_at

sessions
  id, user_id, expires_at
```

### Dos decisiones dentro del modelo

**Categorías por espacio, tags globales.** Las categorías son la estructura interna de cada blog. Los tags son el tejido que conecta el sitio central: un post de cocina y uno de código pueden compartir el tag `experimentos`, y esa es la única forma de que la home central sea algo más que una lista cronológica.

**`post_slugs` desde el día uno.** Cada vez que cambia el slug de un post publicado, el anterior se guarda y responde 301. Es cinco líneas ahora e imposible de reconstruir después de que Google indexe.

---

## 7. Caché e invalidación

`body_html` se genera al guardar, no al servir. El render de Markdown con resaltado de sintaxis es caro y no debe estar en el camino de la request.

```text
guardar post → render md → guardar body_html → invalidar índices del espacio
```

Índices y home central: caché en memoria con TTL corto, invalidada al publicar. Nada de Redis por ahora — un proceso, un servidor.

---

## 8. Despliegue

```yaml
# docker-compose.yml — estructura
caddy       # TLS wildcard vía DNS-01, enruta *.midominio.com al app
app         # Node, puerto interno
postgres    # volumen persistente
```

- media en volumen montado, servido por el app con cabeceras de caché largas
- migraciones: contenedor one-shot con `drizzle-kit migrate` antes de levantar el app
- backup: `pg_dump` a cron + el volumen de media. La combinación de ambos reconstruye todo

---

## 9. Criterios de aceptación del producto

```text
✓ dos espacios en subdominios distintos sirven contenido aislado
✓ un post escrito en el editor visual y otro pegado en Markdown producen lo mismo
✓ cada bloque rico sobrevive el round-trip md → editor → md sin pérdida
✓ cambiar el slug de un post publicado deja 301 desde el anterior
✓ la home central muestra posts de todos los espacios, ordenados por fecha
✓ cada espacio tiene feed RSS válido y hay un feed agregado
✓ todo el contenido se puede exportar a archivos .md
```

El último es el más importante: es tu seguro contra haber construido una jaula.