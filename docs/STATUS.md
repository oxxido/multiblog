# Multiblog — Estado actual

> Foto del momento. Se actualiza al cerrar o arrancar una slice, no en cada commit.

---

## Slice hecha

Ninguna todavía. El proyecto está en preparación: spec, plan y diseño cerrados,
sin código propio escrito.

## Slice actual

**S1 — Un post, un subdominio, una URL.** Planificada en detalle en
`docs/slices/01.md`, con las decisiones de esta corrida (Caddy en vez de
Traefik, sin dominio real todavía → `*.localhost` sin TLS, espacios de prueba
`nutricion`/`ideas`). Ver `docs/DECISIONS.md`.

Pendiente de empezar la implementación: T1 (scaffolding Node + TS + Fastify +
Eta).

## Próxima

S2 — Postgres, admin, CRUD en texto plano. No arranca hasta que S1 esté
desplegada y funcionando en esta máquina.
