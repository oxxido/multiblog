ALTER TABLE "site_settings" ADD COLUMN "headline_es" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "headline_en" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "lead_es" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "lead_en" text;--> statement-breakpoint
ALTER TABLE "spaces" DROP COLUMN "headline_es";--> statement-breakpoint
ALTER TABLE "spaces" DROP COLUMN "headline_en";--> statement-breakpoint
ALTER TABLE "spaces" DROP COLUMN "lead_es";--> statement-breakpoint
ALTER TABLE "spaces" DROP COLUMN "lead_en";