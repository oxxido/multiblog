---
paths: ["src/db/**", "src/modules/**", "src/middleware/**"]
---

# Base de datos y aislamiento entre espacios

## Aislamiento

Toda consulta de contenido filtra por `space_id`. Sin excepciones.

Esto aplica a posts, categorías, media y cualquier tabla que cuelgue de un
espacio. Aplica también en el admin: que el usuario sea el dueño de todos los
blogs no convierte una consulta sin filtrar en correcta, porque el día que un
listado se reutilice en el sitio público la fuga es silenciosa.

El espacio se resuelve **una sola vez**, en el middleware, desde la cabecera
`Host`, y viaja en `request.space`. Ninguna función de módulo debe volver a
mirar la cabecera.

El dominio base sale de `BASE_DOMAIN`. Nunca escribas `localhost` ni
`midominio.com` en el código, ni ramas del tipo "si estamos en desarrollo".
El mismo código tiene que funcionar en `a.localhost:3000` y en
`cocina.midominio.com`.

Los espacios se resuelven contra la tabla `spaces`, nunca contra una lista en
código. Crear un espacio es una fila; no debe requerir redeploy.

## Idioma

Igual que el espacio: toda consulta pública filtra por `lang`. La clave única
de un post es `(space_id, lang, slug)`, y la de un slug histórico también.

Un post y su traducción son filas hermanas unidas por
`translation_group_id`. Ninguna es la "real". No crees jerarquías entre
ellas ni consultas que asuman que el español existe.

## Slugs

Cambiar el slug de un post publicado **siempre** inserta fila en
`post_slugs`. El slug anterior responde 301 para siempre. Esto no es una
optimización de SEO que se pueda posponer: es irreversible una vez que las
URLs están indexadas.

## Migraciones

- el esquema se edita en `schema.ts`, y después `pnpm db:generate`;
- nunca `db:push`;
- nunca SQL crudo fuera de un archivo de migración;
- las migraciones son inmutables: una vez commiteada, no se edita, se añade otra.

**Antes de cualquier migración que borre o renombre columnas, o que cambie
una clave única: pará y consultá.** No la generes "para ver si funciona".

## Consultas

- acceso mediante Drizzle, con tipos;
- nada de `SELECT *` implícito: nombrá las columnas que necesitás;
- toda consulta que devuelva listas lleva `LIMIT`, incluso en el admin;
- índices explícitos para lo que se consulta seguido: `(space_id, lang,
  status, published_at)` es el patrón de acceso público principal.

## Errores

Una consulta que no encuentra nada devuelve `null` o lista vacía; eso no es un
error. Un estado imposible —un post sin espacio, un `translation_group_id`
huérfano— sí lo es: lanzá, no lo arregles en silencio.