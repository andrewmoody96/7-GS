ALTER TABLE "series" DROP CONSTRAINT "series_number_ck";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "head_start_from" date;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_number_ck" CHECK ("series"."number" BETWEEN 0 AND 25);--> statement-breakpoint
-- Seasons are now quarterly: 12 series (84 days) plus a Review Week, 13 weeks in all,
-- instead of 25 series plus a Review Week. Existing seasons are shortened in place:
-- everything played so far is kept, the season simply ends at week 12. Each season is
-- re-anchored to the user's Opening Day (the first Monday on or after sign-up), and a
-- win goal above the new 84-game season is lowered to fit.
UPDATE "seasons" AS s
SET
	"start_date" = m."opening_day" + (s."number" - 1) * 91,
	"play_end_date" = m."opening_day" + (s."number" - 1) * 91 + 83,
	"offseason_end_date" = m."opening_day" + (s."number" - 1) * 91 + 90,
	"win_goal" = CASE WHEN s."win_goal" > 84 THEN 84 ELSE s."win_goal" END
FROM (
	SELECT "id", "start_date" + ((8 - EXTRACT(ISODOW FROM "start_date")::int) % 7) AS "opening_day"
	FROM "users"
) AS m
WHERE m."id" = s."user_id";
