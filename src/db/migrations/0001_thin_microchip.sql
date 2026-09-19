ALTER TABLE "post_categories" DROP CONSTRAINT "post_categories_post_id_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "post_categories" DROP CONSTRAINT "post_categories_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "post_slugs" DROP CONSTRAINT "post_slugs_post_id_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_post_id_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_slugs" ADD CONSTRAINT "post_slugs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_space_lang_status_published_idx" ON "posts" USING btree ("space_id","lang","status","published_at");