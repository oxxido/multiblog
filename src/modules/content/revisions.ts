import { diffLines } from "diff";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { postRevisions } from "../../db/schema.js";

const REVISION_LIST_LIMIT = 200;

// Sólo en el guardado explícito del formulario completo, nunca en el
// autosave de S5 (docs/slices/10.md §0): evita cientos de filas por sesión
// de escritura. No inserta si body_md no cambió contra la última revisión
// guardada (o contra "ninguna" en el primer guardado real de un post recién
// creado).
export async function recordRevisionIfChanged(postId: string, bodyMd: string): Promise<void> {
  const [latest] = await db
    .select({ bodyMd: postRevisions.bodyMd })
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.createdAt))
    .limit(1);

  if (latest && latest.bodyMd === bodyMd) {
    return;
  }

  await db.insert(postRevisions).values({ postId, bodyMd });
}

export interface RevisionSummary {
  id: string;
  createdAt: Date;
}

export async function listRevisions(postId: string): Promise<RevisionSummary[]> {
  return db
    .select({ id: postRevisions.id, createdAt: postRevisions.createdAt })
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.createdAt))
    .limit(REVISION_LIST_LIMIT);
}

export interface Revision {
  id: string;
  postId: string;
  bodyMd: string;
  createdAt: Date;
}

export async function getRevision(id: string): Promise<Revision | null> {
  const [row] = await db
    .select({ id: postRevisions.id, postId: postRevisions.postId, bodyMd: postRevisions.bodyMd, createdAt: postRevisions.createdAt })
    .from(postRevisions)
    .where(eq(postRevisions.id, id))
    .limit(1);

  return row ?? null;
}

// Escapa entidades HTML a mano (mismo criterio que escapeXmlText de rss.ts en
// S9): esto nunca pasa por body_html/rehype-sanitize porque no es el
// pipeline de contenido, es una vista de depuración del propio Markdown
// fuente, sólo visible en el admin.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Diff de líneas en texto plano, sólo contra la revisión inmediatamente
// anterior (docs/slices/10.md §0): null si es la primera revisión del post,
// no hay "anterior" contra la que comparar.
export async function diffAgainstPrevious(revisionId: string): Promise<string | null> {
  const revision = await getRevision(revisionId);
  if (!revision) {
    throw new Error("Revisión no encontrada");
  }

  const rows = await db
    .select({ id: postRevisions.id, bodyMd: postRevisions.bodyMd, createdAt: postRevisions.createdAt })
    .from(postRevisions)
    .where(eq(postRevisions.postId, revision.postId))
    .orderBy(desc(postRevisions.createdAt))
    .limit(REVISION_LIST_LIMIT);

  const index = rows.findIndex((row) => row.id === revisionId);
  const previousRow = rows[index + 1];
  if (!previousRow) {
    return null;
  }

  const parts = diffLines(previousRow.bodyMd, revision.bodyMd);
  return parts
    .map((part) => {
      const escaped = escapeHtml(part.value);
      if (part.added) {
        return `<ins>${escaped}</ins>`;
      }
      if (part.removed) {
        return `<del>${escaped}</del>`;
      }
      return escaped;
    })
    .join("");
}
