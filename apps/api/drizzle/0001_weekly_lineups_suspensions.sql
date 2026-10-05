CREATE TYPE "public"."task_kind" AS ENUM('recurring', 'one_off');--> statement-breakpoint
ALTER TYPE "public"."result_detail" ADD VALUE 'suspended';--> statement-breakpoint
ALTER TABLE "rainout_allowances" DROP CONSTRAINT "rainout_allowances_used_game_uq";--> statement-breakpoint
ALTER TABLE "games" DROP CONSTRAINT "games_makeup_ck";--> statement-breakpoint
ALTER TABLE "games" DROP CONSTRAINT "games_final_ck";--> statement-breakpoint
ALTER TABLE "games" DROP CONSTRAINT "games_detail_ck";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lineup_entries" ADD COLUMN "pinch_hit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lineup_entries" ADD COLUMN "carried_over" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "no_decisions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD COLUMN "kind" "task_kind" DEFAULT 'recurring' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD COLUMN "carryover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "rainout_allowances_used_game_idx" ON "rainout_allowances" USING btree ("used_game_id");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_makeup_ck" CHECK (("games"."postponed" OR "games"."suspended") = ("games"."slot" = 2));--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_final_ck" CHECK (("games"."status" = 'final') = ("games"."result_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_detail_ck" CHECK (("games"."result" IS NULL) = ("games"."result_detail" IS NULL OR "games"."result_detail"::text = 'suspended'));