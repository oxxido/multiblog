# Multiblog — Estado actual

> Foto del momento. Se actualiza al cerrar o arrancar una slice, no en cada commit.

---

## Slice hecha

**S1 — Un post, un subdominio, una URL.** Implementada y verificada en esta
máquina con `docker compose build && docker compose up`, sobre `*.localhost`
sin TLS (ver `docs/DECISIONS.md` D3). Criterio de aceptación de
`docs/slices/01.md` §4 confirmado con curl:

```
GET http://nutricion.localhost/hola   → 200, HTML del md de nutrición
GET http://ideas.localhost/hola       → 200, HTML del md de ideas, distinto
GET http://otroespacio.localhost/     → 404
```

Pendiente explícito, no parte de esta corrida: certificado wildcard vía
DNS-01 (D3) — requiere dominio real. Falta que el stack se dé de alta en
dockge en esta máquina; el `docker-compose.yml` está listo para eso.

`pnpm lint && pnpm typecheck && pnpm test` en verde.

## Slice actual

Ninguna abierta. Próximo paso: dar de alta el stack en dockge y, con eso
confirmado funcionando, arrancar S2.

## Próxima

S2 — Postgres, admin, CRUD en texto plano. No arranca hasta que S1 esté
desplegada y funcionando en esta máquina.
