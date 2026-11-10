ALTER TABLE "task_definitions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Recurring tasks retired before this column existed were deleted by the user (one-offs
-- also retire on their own when completed, so those stay unmarked).
UPDATE "task_definitions" SET "deleted_at" = "updated_at" WHERE "status" = 'retired' AND "kind" = 'recurring';
