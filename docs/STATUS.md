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

## Slice actual

Ninguna abierta. S1 cerrada. Próximo paso: arrancar S2.

## Próxima

S2 — Postgres, admin, CRUD en texto plano. No arranca hasta que S1 esté
desplegada y funcionando en esta máquina.
