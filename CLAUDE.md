# Multiblog

Plataforma de blogs autoalojada. Cada tema vive en su propio subdominio con identidad propia; un sitio central los agrega.

```text
midominio.com          sitio central, agrega todos los espacios
{espacio}.midominio.com  blog independiente
admin.midominio.com      panel único
```

Un autor. Un proceso Node. Una base de datos. Sin SPA.

Los documentos de referencia están en `docs/`: `SPEC.md`, `PLAN.md`, `DESIGN.md`. Ante una duda de producto, arquitectura o diseño, la respuesta está ahí. Si no está, preguntá — no la inventes.

---

## Stack

```text
Node 22 · TypeScript · Fastify · Postgres 16 · Drizzle
Eta (plantillas de servidor)
unified/remark/rehype + remark-directive + rehype-sanitize + shiki
TipTap (sólo en admin)
Docker Compose + Caddy
```

---

## Invariantes

No negociables. Romper una de estas es un bug de arquitectura, no una preferencia de estilo.

1. **Markdown es la fuente de verdad.** `body_html` es derivado y cacheado. Nunca se edita HTML, nunca se guarda HTML que no venga del pipeline.
2. **Toda consulta de contenido filtra por `space_id`.** Una consulta sin ese filtro es una fuga entre blogs. No hay excepciones "porque es el admin".
3. **Cero JavaScript en el sitio público.** Ni un byte. Si una funcionalidad lo necesita, se rediseña o se descarta.
4. **Todo HTML generado pasa por `rehype-sanitize`.** Aunque el autor seas vos.
5. **Cambiar el slug de un post publicado inserta fila en `post_slugs`.** El slug viejo responde 301 para siempre.
6. **Un bloque rico que no sobrevive el round-trip `md → tiptap → md` no se mergea.** Un test por bloque, sin excepción.
7. **Los espacios se resuelven contra la base, no contra una lista en código.** Crear un espacio no requiere redeploy.
8. **Ningún cambio de esquema sin migración versionada de Drizzle.** Nada de `push` contra la base de desarrollo.

---

## Estructura

```text
src/
  server.ts            arranque Fastify
  middleware/space.ts  resuelve Host → espacio, antes de cualquier ruta
  routes/
    public/            home de espacio, post, categoría, feed
    central/           home central, espacios, tags, feed agregado
    admin/
  modules/
    content/           posts, borradores, publicación
    taxonomy/          espacios, categorías, tags
    media/
  markdown/
    pipeline.ts        md → html
    blocks/            registro de bloques ricos
  db/
    schema.ts          Drizzle
    migrations/
  views/               plantillas Eta
public/
  css/
tests/
  unit/
  roundtrip/           un archivo por bloque
  acceptance/          uno por slice
docs/
```

---

## Comandos

```bash
pnpm dev              # app en local con recarga
pnpm test             # todo
pnpm test:roundtrip   # sólo round-trip de bloques
pnpm db:generate      # generar migración desde schema.ts
pnpm db:migrate       # aplicar
pnpm lint && pnpm typecheck
docker compose up -d
```

Antes de dar por terminada cualquier tarea: `pnpm lint && pnpm typecheck && pnpm test` en verde.

---

## Convenciones

- TypeScript estricto. Sin `any`, sin `as` para salir de un problema de tipos.
- Validación de entrada con Zod en el borde: cuerpo de request, atributos de directivas, variables de entorno.
- Errores: lanzar, no devolver `null` silencioso. Fastify tiene un manejador central.
- Sin comentarios que expliquen *qué* hace el código. Sólo *por qué*, cuando el porqué no es obvio.
- SQL mediante Drizzle. Nada de SQL crudo salvo en migraciones.
- Commits: `S{n}: descripción en imperativo`. Ejemplo: `S2: añadir historial de slugs con redirección 301`.

---

## Cómo trabajar

El proyecto avanza en **slices**, definidas en `docs/PLAN.md`. Una slice termina desplegada y funcionando, no "lista para integrar".

- trabajá sólo en la slice actual;
- si algo parece necesario pero pertenece a una slice posterior, decilo y no lo hagas;
- si una tarea requiere tocar el modelo de datos, los permalinks o el formato canónico de contenido, **pará y consultá antes de implementar**;
- dos intentos fallidos con la misma tarea significan que la tarea está mal especificada: decilo en vez de intentar un tercero.

---

## WON'T DO

Esto **no** se construye. No está aplazado: está descartado para esta versión. Si te parece obvio que un blog debería tenerlo, esa intuición es exactamente lo que esta lista existe para bloquear.

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

No agregues dependencias sin proponerlo primero. El stack de arriba está cerrado.