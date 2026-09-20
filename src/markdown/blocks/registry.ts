import type { BlockDefinition, DirectiveNode } from "./types.js";

// Único estado mutable del motor de bloques: qué directiva conoce qué
// bloque. Cargar src/markdown/blocks/index.ts (que llama a `registerBlock`
// por cada bloque) antes de renderizar o convertir es lo que puebla este
// mapa — antes de eso, cualquier directiva es "no registrada".
const blocks = new Map<string, BlockDefinition>();

export function registerBlock<Attrs>(block: BlockDefinition<Attrs>): void {
  blocks.set(block.name, block);
}

export function getBlock(name: string): BlockDefinition | undefined {
  return blocks.get(name);
}

// Atributos de una directiva vienen del texto del autor: pueden faltar o no
// validar. Un atributo inválido no rompe el render del resto del post — el
// bloque entero cae a sus valores por defecto (docs/slices/06.md §0). Un
// bloque no registrado sí es un error real: es contenido que el registro no
// sabe interpretar, no un dato de usuario mal escrito.
export function resolveBlock(node: DirectiveNode): { block: BlockDefinition; attrs: unknown } {
  const block = getBlock(node.name);
  if (!block) {
    throw new Error(`Bloque de Markdown no registrado: ${node.name}`);
  }
  const parsed = block.attrsSchema.safeParse(node.attributes ?? {});
  const attrs = parsed.success ? parsed.data : block.attrsSchema.parse({});
  return { block, attrs };
}
