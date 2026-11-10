ALTER TABLE "login_tokens" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD COLUMN "code_attempts" integer DEFAULT 0 NOT NULL;