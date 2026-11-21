-- A task is worth at most 4 runs (rules LIMITS.taskPointsMax: no play scores more than a
-- grand slam). Tasks above that come down to 4. Games already built keep the runs they
-- were planned with, like any other change to a task's worth.
UPDATE "task_definitions" SET "points" = 4 WHERE "points" > 4;
