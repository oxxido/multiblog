CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cover_media_id" uuid
);
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_cover_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_cover_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;