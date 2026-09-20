import { exportSpaceToDirectory } from "../modules/content/importExport.js";

const [spaceSlug, dir] = process.argv.slice(2);

if (!spaceSlug || !dir) {
  console.error("Uso: pnpm export <espacio> <directorio>");
  process.exit(1);
}

const summary = await exportSpaceToDirectory(spaceSlug, dir);
console.log(`Exportado: ${summary.exported.toString()} posts.`);
process.exit(0);
