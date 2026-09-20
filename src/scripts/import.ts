import { importSpaceFromDirectory } from "../modules/content/importExport.js";

const [spaceSlug, dir] = process.argv.slice(2);

if (!spaceSlug || !dir) {
  console.error("Uso: pnpm import <espacio> <directorio>");
  process.exit(1);
}

const summary = await importSpaceFromDirectory(spaceSlug, dir);
console.log(`Importado: ${summary.created.toString()} creados, ${summary.updated.toString()} actualizados.`);
process.exit(0);
