# Multiblog — Plan (v2)

> La v1 (S1–S11) está cerrada. Su plan original, las especificaciones de cada
> slice, el historial de estado y los mockups están en `docs/archive/v1/`:
> son historia, no instrucciones vigentes.

De acá en adelante no hay un plan cerrado de antemano: las features se
deciden sobre la marcha. Cada feature aceptada se convierte en una slice con
el número siguiente (S12, S13, …), con su especificación en
`docs/slices/{nn}.md` y el mismo formato de commits (`S{n}: …`).

Lo que sigue vigente de la v1: `SPEC.md` (producto y arquitectura),
`Design.md` (sistema visual), `I18N.md` (bilingüe) y `DECISIONS.md`
(D1–D28 siguen mandando sobre el documento original).

---

## En curso

### S12 — Analíticas

Integrar el servicio de analíticas propio (`code/analytics`) con un sitio
dado de alta para Multiblog. El código de integración lo provee el usuario.

Abierto antes de implementar (ver `STATUS.md`):

- choca con el invariante 3 de `CLAUDE.md` ("cero JavaScript en el sitio
  público") si la integración es un `<script>`;
- "analytics propio" figura en WON'T DO de `CLAUDE.md` y `SPEC.md` §1.

---

## Backlog

Ideas aceptadas para más adelante, sin especificar ni ordenar.

- **Comentarios.** Hoy en WON'T DO; requiere sacarlo de esa lista
  (`CLAUDE.md` y `SPEC.md`) antes de planificarlo.

---

## Reglas de ejecución

Las de la v1 siguen valiendo (`docs/archive/v1/PLAN.md`, "Reglas de
ejecución"):

- no se abre una slice con la anterior sin desplegar;
- si una slice necesita "sólo terminar una cosita de la anterior", la
  anterior no estaba terminada;
- dos intentos fallidos con la misma tarea significan que la tarea está mal
  escrita: se reescribe, no se repite;
- si una tarea toca el modelo de datos, los permalinks o el formato
  canónico, se consulta antes de implementar.
