import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { spaces, posts, users, siteSettings } from "./schema.js";
import { hashPassword } from "../modules/auth/password.js";
import { renderMarkdown } from "../markdown/pipeline.js";

const seedEnvSchema = z.object({
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
});

const seedEnv = seedEnvSchema.parse(process.env);

const seedSpaces = [
  {
    slug: "nutricion",
    subdomain: "nutricion",
    name: "Nutrición",
    post: {
      slug: "hola",
      title: "Hola desde Nutrición",
      bodyMd: [
        "# Hola desde Nutrición",
        "",
        "Este es el primer post del espacio **nutrición**, servido en",
        "`nutricion.localhost`.",
        "",
        "- fibra",
        "- proteína",
        "- agua",
        "",
        '```js',
        'console.log("nutrición");',
        "```",
        "",
      ].join("\n"),
    },
  },
  {
    slug: "ideas",
    subdomain: "ideas",
    name: "Ideas",
    post: {
      slug: "hola",
      title: "Hola desde Ideas",
      bodyMd: [
        "# Hola desde Ideas",
        "",
        "Este es el primer post del espacio **ideas**, servido en",
        "`ideas.localhost`. Contenido distinto al de nutrición para probar",
        "que cada subdominio lee su propio archivo.",
        "",
        "> Una idea sin ejecutar es sólo una nota.",
        "",
        '```js',
        'console.log("ideas");',
        "```",
        "",
      ].join("\n"),
    },
  },
];

async function seed(): Promise<void> {
  for (const spaceSeed of seedSpaces) {
    // El seed corre en cada arranque (D11): sólo crea lo que falta. Pisar
    // filas existentes revertía ediciones del autor y, con un post
    // despublicado, lo dejaba "published" sin published_at (D31).
    await db
      .insert(spaces)
      .values({ slug: spaceSeed.slug, subdomain: spaceSeed.subdomain, name: spaceSeed.name })
      .onConflictDoNothing({ target: spaces.slug });
    const [space] = await db.select().from(spaces).where(eq(spaces.slug, spaceSeed.slug));

    if (!space) {
      throw new Error(`No se pudo sembrar el espacio ${spaceSeed.slug}`);
    }

    const bodyHtml = await renderMarkdown(spaceSeed.post.bodyMd);

    await db
      .insert(posts)
      .values({
        spaceId: space.id,
        lang: "es",
        slug: spaceSeed.post.slug,
        title: spaceSeed.post.title,
        bodyMd: spaceSeed.post.bodyMd,
        bodyHtml,
        status: "published",
        publishedAt: new Date(),
      })
      .onConflictDoNothing({ target: [posts.spaceId, posts.lang, posts.slug] });
  }

  await db
    .insert(users)
    .values({
      email: seedEnv.ADMIN_EMAIL,
      passwordHash: hashPassword(seedEnv.ADMIN_PASSWORD),
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash: hashPassword(seedEnv.ADMIN_PASSWORD) },
    });

  // Igual que espacios y posts: coverMediaId lo edita el admin desde
  // /admin/sitio, así que se siembra una sola vez.
  await db.insert(siteSettings).values({ id: 1, coverMediaId: null }).onConflictDoNothing({ target: siteSettings.id });
}

await seed();
process.exit(0);
