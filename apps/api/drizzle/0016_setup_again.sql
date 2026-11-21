-- Version 1.1: everyone goes through the guided setup once more (now with a season win
-- goal step). Accounts that finish or skip it are marked done again, as before.
UPDATE "users" SET "setup_done_at" = NULL;
