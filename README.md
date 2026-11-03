# Multiblog

Plataforma de blogs autoalojada, para un solo autor. Cada tema vive en su propio subdominio con identidad propia (nombre, color, portada) y un sitio central los agrega a todos.

```text
midominio.com             sitio central: todos los espacios, últimos posts, tags que los cruzan
{espacio}.midominio.com   blog independiente
midominio.com/admin       panel de administración
```

Un autor, un proceso Node, una base de datos. Sin SPA: el sitio público se renderiza en el servidor y **no envía nada de JavaScript**.

## Para qué sirve

Para escribir sobre cosas distintas sin mezclarlas. Cocina, código y notas personales pueden ser tres blogs con su propia cara, y aun así compartir tags (`experimentos`) que los conectan en el sitio central. Crear un espacio nuevo no requiere redeploy: se da de alta desde el admin y responde en su subdominio.

## Qué incluye

- **Espacios** con subdominio, color de acento, portada y categorías propias; tags globales entre espacios.
- **Posts en Markdown** como fuente de verdad, con editor visual (TipTap) y editor de Markdown intercambiables. Bloques ricos: avisos, galerías, código con resaltado y vídeos de YouTube.
- **Publicación** inmediata, programada o como borrador, con vista previa por enlace, historial de revisiones y despublicación.
- **Permalinks estables** `{espacio}.dominio/{slug}`: si cambias el slug de un post publicado, el anterior responde 301 para siempre.
- **Bilingüe** (es/en): traducción de posts desde el admin con un modelo de OpenRouter, validando que los bloques sobrevivan.
- **Imágenes** con derivados WebP responsivos, **RSS** por espacio y agregado, **sitemap** y metadatos para compartir.
- **Barra de compartir** en cada post, sin JavaScript.
- **Importar y exportar** un espacio como carpeta de archivos Markdown.

Lo que **no** hace, a propósito: comentarios, múltiples usuarios, newsletter, analíticas, temas intercambiables, plugins ni búsqueda.

## Stack

Node 22 · TypeScript · Fastify · Postgres 16 · Drizzle · Eta · unified/remark/rehype · Shiki · TipTap (sólo en el admin) · Docker Compose.

## Instalación

### Desarrollo local

Necesitas Node 22, [pnpm](https://pnpm.io) y Docker.

```bash
pnpm install

# Postgres de desarrollo en el puerto 5433
docker compose -f compose.dev.yaml up -d

# Variables de entorno
cp .env.example .env.local        # y ajusta los valores (ver tabla de abajo)

# Esquema y datos de ejemplo (dos espacios y el usuario admin)
export DATABASE_URL=postgres://multiblog:dev@localhost:5433/multiblog
pnpm db:migrate
pnpm db:seed

pnpm dev
```

Los subdominios `*.localhost` los resuelve el navegador sin configurar nada. Con `BASE_DOMAIN=localhost` y `PORT=3100`:

| URL | Qué es |
| --- | --- |
| `http://localhost:3100` | sitio central |
| `http://nutricion.localhost:3100` | espacio de ejemplo |
| `http://localhost:3100/admin` | panel (entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |

### Producción con Docker Compose

El `docker-compose.yml` levanta la app y Postgres. Al arrancar, el contenedor aplica las migraciones y el seed antes de servir.

```bash
# red compartida con tu proxy inverso (una sola vez)
docker network create proxy

# .env junto al docker-compose.yml
cat > .env <<'EOF'
BASE_DOMAIN=midominio.com
POSTGRES_PASSWORD=<una contraseña larga>
ADMIN_EMAIL=tu@correo.com
ADMIN_PASSWORD=<mínimo 8 caracteres>
OPENROUTER_API_KEY=<tu clave, para traducir>
EOF

docker compose up -d --build
```

La app **no publica puertos al host**: escucha en `multiblog-app:3000` dentro de la red `proxy`. Necesitas un proxy inverso (el proyecto usa Caddy) que:

1. envíe `midominio.com` y `*.midominio.com` a `multiblog-app:3000`, conservando el `Host`, porque así se resuelve el espacio;
2. termine el TLS. Con Caddy basta el TLS en demanda: el certificado de cada espacio nuevo se emite en su primera visita, sin tocar la configuración.

El DNS necesita `midominio.com` y `*.midominio.com` apuntando al servidor.

Para probar todo el stack en tu máquina, `docker compose --profile local-caddy up` suma un Caddy en el puerto 80 que atiende `nutricion.localhost` e `ideas.localhost`.

### Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `BASE_DOMAIN` | sí | dominio raíz; el resto de los hosts se resuelven contra él |
| `DATABASE_URL` | sí | conexión a Postgres (en el compose se arma sola) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | sí | usuario del admin, sembrado al arrancar |
| `POSTGRES_PASSWORD` | sí, en compose | contraseña de la base |
| `PORT` | no | puerto de la app (3000 por defecto) |
| `MEDIA_DIR` | no | dónde se guardan las imágenes (`./data/media`) |
| `OPENROUTER_API_KEY` | para traducir | clave de OpenRouter |

## Comandos

```bash
pnpm dev              # app con recarga
pnpm test             # todos los tests (necesitan Postgres en :5433)
pnpm test:roundtrip   # sólo el round-trip de bloques md → editor → md
pnpm lint && pnpm typecheck
pnpm db:generate      # migración nueva a partir de src/db/schema.ts
pnpm db:migrate       # aplicar migraciones
pnpm import <espacio> <directorio>
pnpm export <espacio> <directorio>
```

## Documentación

Todo el diseño está en [`docs/`](docs/): [`SPEC.md`](docs/SPEC.md) (producto y arquitectura), [`PLAN.md`](docs/PLAN.md) (slices), [`Design.md`](docs/Design.md) (sistema visual), [`DECISIONS.md`](docs/DECISIONS.md) (decisiones posteriores) y [`STATUS.md`](docs/STATUS.md) (estado actual). Las reglas del proyecto para quien contribuya, humano o agente, están en [`CLAUDE.md`](CLAUDE.md).

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE). Puedes usar, copiar, modificar y distribuir este software como quieras **siempre que no sea con fines comerciales**. Los derechos de autor son y seguirán siendo del autor. Esta licencia tiene código fuente disponible, pero no es de código abierto en el sentido de la OSI, porque restringe el uso comercial.
