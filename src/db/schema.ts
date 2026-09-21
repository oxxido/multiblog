import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  primaryKey,
  unique,
  index,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const postStatus = pgEnum("post_status", ["draft", "scheduled", "published"]);
export const postLang = pgEnum("post_lang", ["es", "en"]);

export const spaces = pgTable("spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  subdomain: text("subdomain").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  accentColor: text("accent_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  coverMediaId: uuid("cover_media_id").references((): AnyPgColumn => media.id, { onDelete: "set null" }),
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  width: integer("width"),
  height: integer("height"),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    lang: postLang("lang").notNull().default("es"),
    // Une un post con sus traducciones hermanas (docs/I18N.md §3). Ninguna
    // fila es "la real"; el grupo entero comparte este id.
    translationGroupId: uuid("translation_group_id").notNull().defaultRandom(),
    sourcePostId: uuid("source_post_id"),
    translatedAt: timestamp("translated_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    bodyMd: text("body_md").notNull(),
    bodyHtml: text("body_html").notNull(),
    status: postStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    // Identifica el post en la URL de vista previa (S10, `/_preview/{token}`),
    // sembrado desde que se crea igual que `id`. Rotar el link (admin) es la
    // única forma de invalidar uno viejo: no expira solo.
    previewToken: uuid("preview_token").notNull().defaultRandom().unique(),
  },
  (table) => [
    unique().on(table.spaceId, table.lang, table.slug),
    // patrón de acceso público principal (docs Db.md)
    index("posts_space_lang_status_published_idx").on(
      table.spaceId,
      table.lang,
      table.status,
      table.publishedAt,
    ),
  ],
);

export const postSlugs = pgTable(
  "post_slugs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    lang: postLang("lang").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.spaceId, table.lang, table.slug)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    nameEn: text("name_en"),
    slugEn: text("slug_en"),
  },
  (table) => [unique().on(table.spaceId, table.slug)],
);

export const postCategories = pgTable(
  "post_categories",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.categoryId] })],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
});

export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

// Una fila por guardado explícito del formulario completo que cambió
// body_md (nunca desde el autosave, docs/slices/10.md §0): el historial que
// el admin compara contra la revisión inmediata anterior.
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    bodyMd: text("body_md").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("post_revisions_post_id_created_at_idx").on(table.postId, table.createdAt)],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Fila única (id fijo = 1), sembrada por seed.ts igual que espacios/usuario
// (docs/slices/07.md §0): la cabecera a sangre del sitio central necesita
// una foto propia que no pertenece a ningún espacio ni post.
export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  coverMediaId: uuid("cover_media_id").references((): AnyPgColumn => media.id, { onDelete: "set null" }),
});
