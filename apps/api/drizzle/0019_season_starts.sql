ALTER TABLE "users" ADD COLUMN "season_starts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Seasons that already started on their own (before 1.4) keep their dates: record them as
-- chosen starts. A season still 'upcoming' waits for the player, like every season from now on.
UPDATE "users" u SET "season_starts" = COALESCE((
	SELECT jsonb_agg(jsonb_build_object('openingDay', s."start_date", 'headStartFrom', NULL) ORDER BY s."number")
	FROM "seasons" s
	WHERE s."user_id" = u."id" AND s."number" >= 2 AND s."status" <> 'upcoming'
), '[]'::jsonb);
