-- Days that pinch hitters left out of reach: runs to win was raised by each added task's
-- runs, but the day started unwinnable (an empty default lineup still needs 1 run), so it
-- stayed short no matter what was added. For unfinished games with a pinch hitter, cap runs
-- to win at what the lineup can score, so doing every task wins (rules.pinchHitThreshold).
UPDATE "games" AS g
SET "threshold" = l.runs
FROM (
  SELECT "game_id", SUM("points")::integer AS runs, bool_or(pinched) AS pinched
  FROM (
    SELECT "game_id", "points", "pinch_hit_at" IS NOT NULL AS pinched FROM "lineup_entries" WHERE "role" = 'lineup'
    UNION ALL
    -- Spots held for tasks on the IL count: those tasks come back.
    SELECT "game_id", "points", false FROM "il_holds" WHERE "role" = 'lineup'
  ) AS spots
  GROUP BY "game_id"
) AS l
WHERE l."game_id" = g."id"
  AND g."status" <> 'final'
  AND l.pinched
  AND l.runs > 0
  AND g."threshold" > l.runs;
