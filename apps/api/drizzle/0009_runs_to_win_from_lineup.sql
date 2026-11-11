-- Runs to win now comes from each day's lineup (rules.lineupThreshold) and there is no
-- minimum task count. Default lineups work theirs out when read, so only unfinished games
-- need fixing: drop the minimum, and make sure no day with tasks is out of reach by capping
-- runs to win at what its lineup (plus spots held for tasks on the IL) can score.
UPDATE "day_templates" SET "min_tasks" = NULL WHERE "min_tasks" IS NOT NULL;
--> statement-breakpoint
UPDATE "games" SET "min_tasks" = NULL WHERE "status" <> 'final' AND "min_tasks" IS NOT NULL;
--> statement-breakpoint
UPDATE "games" AS g
SET "threshold" = l.runs
FROM (
  SELECT "game_id", SUM("points")::integer AS runs
  FROM (
    SELECT "game_id", "points" FROM "lineup_entries" WHERE "role" = 'lineup'
    UNION ALL
    SELECT "game_id", "points" FROM "il_holds" WHERE "role" = 'lineup'
  ) AS spots
  GROUP BY "game_id"
) AS l
WHERE l."game_id" = g."id"
  AND g."status" <> 'final'
  AND l.runs > 0
  AND g."threshold" > l.runs;
