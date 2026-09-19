---
paths: ["src/markdown/**", "tests/roundtrip/**", "src/views/**"]
---

# Pipeline de Markdown

El Markdown es la fuente de verdad. El HTML es derivado y cacheado.

- nunca se guarda HTML que no haya salido de este pipeline;
- nunca se edita `body_html` a mano ni desde el admin;
- el render ocurre **al guardar el post**, no al servir la petición. Si estás
  generando HTML dentro de un manejador de ruta pública, algo está mal.

## Orden del pipeline

```text
remark-parse
  → remark-gfm
  → remark-directive
  → remark-rehype
  → rehype-shiki         resaltado de código
  → rehype-sanitize       SIEMPRE, y siempre después de todo lo demás
  → rehype-stringify
```

`rehype-sanitize` va al final, sin excepción. Si un bloque propio necesita
etiquetas o atributos que el esquema por defecto elimina, se amplía el
esquema de forma explícita y acotada — nunca se salta el saneado.

## Bloques ricos

Todo bloque nuevo requiere, **en el mismo commit**, estas cinco cosas:

1. entrada en el registro de bloques, con esquema Zod de sus atributos;
2. renderizador a HTML;
3. nodo TipTap equivalente;
4. serializador de vuelta a Markdown;
5. test en `tests/roundtrip/` que verifique `md → tiptap → md` idéntico.

Sin el punto 5 el bloque no existe. No lo dejes "para después" ni lo marques
como pendiente: no se mergea.

Los atributos de una directiva vienen del texto que escribe el usuario.
Validalos siempre con Zod y aplicá valores por defecto; nunca confíes en que
`cols` sea un número.

Añadir un bloque no debe requerir tocar el pipeline. Si para meter un bloque
nuevo hace falta modificar `pipeline.ts`, el registro está mal diseñado:
decilo en vez de hacer el cambio.

## Traducción

El traductor recibe Markdown y devuelve Markdown. La estructura de directivas
del resultado se compara con la del original antes de guardar: mismo número
de bloques, mismos tipos, mismos atributos. Si no coincide, se rechaza la
traducción entera. Nunca se guarda una traducción parcial.

## Plantillas

El HTML del post se inserta en las plantillas ya saneado. No vuelvas a
escapar el contenido ni uses el escapado automático de Eta sobre `body_html`,
porque duplicaría las entidades.

Todo lo demás que venga de la base — títulos, extractos, nombres de espacio —
sí se escapa normalmente.