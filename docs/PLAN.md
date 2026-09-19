# Multiblog — Plan de construcción

> Ocho slices. Cada una termina desplegada y funcionando.
> No se abre una slice con la anterior a medias.

Orden por riesgo, no por facilidad. Las dos primeras son las menos vistosas y las que deciden si el resto tiene sentido.

---

## S1 — Un post, un subdominio, una URL

**Por qué primero:** prueba simultáneamente el pipeline de Markdown, el routing por `Host` y el TLS wildcard. Si alguna de las tres está mal, todo lo demás se construye encima del error.

Sin base de datos. Dos archivos `.md` en disco, uno por espacio.

- proyecto Node + TS + Fastify + Eta
- pipeline `remark → rehype → sanitize → shiki` → HTML
- middleware de resolución de espacio por `Host`
- ruta `/{slug}` que renderiza el `.md` correspondiente
- Docker Compose con Caddy y certificado wildcard vía DNS-01
- desplegado en el servidor real, con dos subdominios respondiendo

**Aceptación**
```
GET https://a.midominio.com/hola   → 200, HTML del md de A
GET https://b.midominio.com/hola   → 200, HTML del md de B, distinto
GET https://c.midominio.com/       → 404
ambos con certificado válido
```

---

## S2 — Postgres, admin, CRUD en texto plano

Todavía sin editor visual. Un `<textarea>` con Markdown crudo.

- esquema Drizzle completo (§6 del spec), migraciones versionadas
- login con sesión en cookie, un único usuario sembrado
- CRUD de posts: crear, editar, borrar, publicar
- render a `body_html` al guardar
- historial de slugs + redirección 301
- el sitio público lee de Postgres en vez de disco

**Aceptación**
```
✓ crear post desde admin → visible en su subdominio
✓ cambiar slug de post publicado → el slug viejo responde 301
✓ borrador no accesible públicamente
✓ /admin sin sesión → redirige a login
```

---

## S3 — Espacios reales

- CRUD de espacios desde el admin
- resolución de `Host` contra la tabla `spaces`, no contra una lista fija
- índice del espacio, paginado
- categorías por espacio + `/c/{categoria}`
- selector de espacio al crear un post

**Aceptación**
```
✓ crear un espacio nuevo desde el admin → su subdominio responde sin redeploy
✓ un post de un espacio nunca aparece en el índice de otro
✓ archivar un espacio → 404 en su subdominio, contenido intacto en la base
```

---

## S4 — Implementación del diseño existente

Aplica el diseño ya aprobado en `docs/Design.md` y `docs/UI_mockups/` a lo
que S1-S3 ya sirven (shell de espacio: home + categoría + post), más una
home central mínima adelantada de S8 sólo para esa vista. No cambia el
modelo de datos ni el pipeline de Markdown, pero sí toca rutas y módulos
para dar forma a los datos que el diseño necesita (categoría y minutos de
lectura por post, post anterior/siguiente, agregación entre espacios) y
para resolver `Host` sin subdominio, que `SPEC.md` fija desde el principio
y ninguna slice había implementado. Desglose en `docs/slices/04.md`.

**Aceptación**
```
✓ home de espacio, página de post y home central mínima igualan el mockup
  aprobado
✓ acento por espacio, tipografía y retícula de Design.md aplicados
✓ Host sin subdominio → home central; Host desconocido → sigue en 404
✓ pnpm lint && pnpm typecheck && pnpm test en verde
```

---

## S5 — Editor visual

La slice más grande. Se apoya en todo lo anterior ya verificado.

- TipTap montado en el formulario de post
- conversión bidireccional TipTap ↔ Markdown para los nodos base: párrafos, encabezados, listas, enlaces, código, citas, tablas
- alternar entre vista visual y Markdown crudo sin perder nada
- guardado automático de borrador

**Aceptación**
```
✓ escribir en visual → guardar → reabrir en crudo → Markdown limpio y correcto
✓ pegar Markdown en crudo → guardar → reabrir en visual → estructura correcta
✓ test de round-trip por cada tipo de nodo, sin diferencias
```

---

## S6 — Bloques

- registro de bloques (§3 del spec)
- `remark-directive` en el pipeline
- primeros tres bloques: `callout`, `gallery`, `youtube`
- nodos TipTap correspondientes, insertables desde una barra
- test de round-trip obligatorio por bloque

**Aceptación**
```
✓ los tres bloques se insertan desde el editor y se renderizan en público
✓ los tres sobreviven md → editor → md idénticos
✓ agregar un cuarto bloque no requiere tocar el pipeline, sólo el registro
```

---

## S7 — Media

- subida de imágenes al volumen
- derivados en varios anchos + WebP
- biblioteca en el admin, inserción desde el editor
- imagen de portada por post
- `<img>` con `srcset` y dimensiones explícitas

**Aceptación**
```
✓ subir una imagen y usarla en un post desde el editor
✓ el HTML público incluye srcset y width/height
✓ borrar una imagen en uso avisa y no rompe posts
```

---

## S8 — Sitio central y distribución

- home de `midominio.com`: últimos posts de todos los espacios, con su origen visible
- `/espacios` y `/t/{tag}`
- tags globales asignables desde el admin
- RSS por espacio y agregado
- sitemaps + índice de sitemaps
- metadatos: Open Graph, canonical, títulos, descripciones

**Aceptación**
```
✓ los feeds validan contra el W3C Feed Validator
✓ un tag compartido agrupa posts de espacios distintos
✓ cada post tiene canonical apuntando a su subdominio, no al central
```

---

## S9 — Flujo de escritura

Lo que hace que uses la herramienta en vez de tolerarla.

- borradores con vista previa en el subdominio real, por URL secreta
- publicación programada
- revisiones: histórico de `body_md` con diff
- importador en lote de `.md` desde un directorio
- exportador completo a `.md` con front-matter

**Aceptación**
```
✓ importar 20 archivos .md a un espacio en una operación
✓ exportar, borrar la base, reimportar → contenido equivalente
✓ programar un post a futuro → aparece solo a la hora indicada
```

---

## Reglas de ejecución

**Sobre los agentes**

- la lista `WON'T DO` del spec va en el prompt de cada tarea, no sólo en el documento
- cada tarea declara qué archivos puede tocar; nada fuera de ahí
- dos intentos fallidos con la misma tarea significan que la tarea está mal escrita — reescribila, no la repitas
- si una tarea toca el modelo de datos, los permalinks o el formato canónico, la revisa otro modelo antes de mergear

**Sobre las slices**

- no se abre una slice con la anterior sin desplegar
- si una slice necesita "sólo terminar una cosita de la anterior", la anterior no estaba terminada
- cada slice termina con el sitio real funcionando en el servidor real

**Sobre el orden**

S1 y S2 no se saltan ni se fusionan. Son las que contienen el riesgo. El resto es trabajo conocido.