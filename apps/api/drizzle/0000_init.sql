CREATE TYPE "public"."game_result" AS ENUM('W', 'L');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'live', 'final');--> statement-breakpoint
CREATE TYPE "public"."lineup_role" AS ENUM('lineup', 'bench', 'subbed_out');--> statement-breakpoint
CREATE TYPE "public"."rainout_source" AS ENUM('monthly', 'iron_man');--> statement-breakpoint
CREATE TYPE "public"."rally_token_source" AS ENUM('monthly', 'series_bonus');--> statement-breakpoint
CREATE TYPE "public"."result_detail" AS ENUM('clean', 'short', 'forfeit', 'no_appeal', 'rally');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('upcoming', 'active', 'offseason', 'complete');--> statement-breakpoint
CREATE TYPE "public"."series_result" AS ENUM('won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('active', 'injured', 'retired');--> statement-breakpoint
CREATE TYPE "public"."template_role" AS ENUM('lineup', 'bench');--> statement-breakpoint
CREATE TABLE "day_template_tasks" (
	"template_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"role" "template_role" NOT NULL,
	CONSTRAINT "day_template_tasks_pk" PRIMARY KEY("template_id","task_id"),
	CONSTRAINT "day_template_tasks_position_ck" CHECK ("day_template_tasks"."position" >= 1),
	CONSTRAINT "day_template_tasks_bench_ck" CHECK ("day_template_tasks"."role" = 'lineup' OR NOT "day_template_tasks"."required")
);
--> statement-breakpoint
CREATE TABLE "day_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"name" text NOT NULL,
	"threshold" integer DEFAULT 1 NOT NULL,
	"min_tasks" integer,
	"lock_time" time,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "day_templates_user_weekday_uq" UNIQUE("user_id","weekday"),
	CONSTRAINT "day_templates_weekday_ck" CHECK ("day_templates"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "day_templates_threshold_ck" CHECK ("day_templates"."threshold" >= 1),
	CONSTRAINT "day_templates_min_tasks_ck" CHECK ("day_templates"."min_tasks" IS NULL OR "day_templates"."min_tasks" >= 1)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"played_date" date NOT NULL,
	"slot" integer DEFAULT 1 NOT NULL,
	"postponed" boolean DEFAULT false NOT NULL,
	"template_id" uuid,
	"starter_name" text,
	"threshold" integer,
	"min_tasks" integer,
	"lock_time" time,
	"time_zone" text,
	"lineup_built_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"status" "game_status" DEFAULT 'scheduled' NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"tasks_done" integer DEFAULT 0 NOT NULL,
	"missed_required" integer DEFAULT 0 NOT NULL,
	"result" "game_result",
	"result_detail" "result_detail",
	"rally_deadline" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_series_number_uq" UNIQUE("series_id","game_number"),
	CONSTRAINT "games_user_played_slot_uq" UNIQUE("user_id","played_date","slot"),
	CONSTRAINT "games_number_ck" CHECK ("games"."game_number" BETWEEN 1 AND 7),
	CONSTRAINT "games_slot_ck" CHECK ("games"."slot" IN (1, 2)),
	CONSTRAINT "games_makeup_ck" CHECK ("games"."postponed" = ("games"."slot" = 2)),
	CONSTRAINT "games_threshold_ck" CHECK ("games"."threshold" IS NULL OR "games"."threshold" >= 1),
	CONSTRAINT "games_min_tasks_ck" CHECK ("games"."min_tasks" IS NULL OR "games"."min_tasks" >= 1),
	CONSTRAINT "games_snapshot_ck" CHECK ("games"."lineup_built_at" IS NULL OR ("games"."starter_name" IS NOT NULL AND "games"."threshold" IS NOT NULL AND "games"."time_zone" IS NOT NULL)),
	CONSTRAINT "games_counts_ck" CHECK ("games"."runs" >= 0 AND "games"."tasks_done" >= 0 AND "games"."missed_required" >= 0),
	CONSTRAINT "games_final_ck" CHECK (("games"."status" = 'final') = ("games"."result" IS NOT NULL)),
	CONSTRAINT "games_final_built_ck" CHECK ("games"."status" <> 'final' OR "games"."lineup_built_at" IS NOT NULL),
	CONSTRAINT "games_detail_ck" CHECK (("games"."result" IS NULL) = ("games"."result_detail" IS NULL)),
	CONSTRAINT "games_live_ck" CHECK ("games"."status" <> 'live' OR "games"."locked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "lineup_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"task_name" text NOT NULL,
	"points" integer NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"role" "lineup_role" NOT NULL,
	"subbed_in_at" timestamp with time zone,
	"completed_client_at" timestamp with time zone,
	"completed_received_at" timestamp with time zone,
	"partial" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lineup_entries_game_task_uq" UNIQUE("game_id","task_id"),
	CONSTRAINT "lineup_entries_points_ck" CHECK ("lineup_entries"."points" >= 1),
	CONSTRAINT "lineup_entries_position_ck" CHECK ("lineup_entries"."position" >= 1),
	CONSTRAINT "lineup_entries_completed_ck" CHECK (("lineup_entries"."completed_client_at" IS NULL) = ("lineup_entries"."completed_received_at" IS NULL)),
	CONSTRAINT "lineup_entries_bench_ck" CHECK ("lineup_entries"."role" <> 'bench' OR NOT "lineup_entries"."required")
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rainout_allowances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "rainout_source" NOT NULL,
	"month" char(7),
	"seq" integer DEFAULT 1 NOT NULL,
	"expires_on" date,
	"earned_month" char(7),
	"series_id" uuid,
	"used_game_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rainout_allowances_monthly_uq" UNIQUE("user_id","source","month","seq"),
	CONSTRAINT "rainout_allowances_series_uq" UNIQUE("series_id"),
	CONSTRAINT "rainout_allowances_used_game_uq" UNIQUE("used_game_id"),
	CONSTRAINT "rainout_allowances_source_ck" CHECK (("rainout_allowances"."source" = 'monthly' AND "rainout_allowances"."month" IS NOT NULL AND "rainout_allowances"."expires_on" IS NULL AND "rainout_allowances"."seq" IN (1, 2))
        OR ("rainout_allowances"."source" = 'iron_man' AND "rainout_allowances"."month" IS NULL AND "rainout_allowances"."expires_on" IS NOT NULL AND "rainout_allowances"."earned_month" IS NOT NULL)),
	CONSTRAINT "rainout_allowances_used_ck" CHECK (("rainout_allowances"."used_game_id" IS NULL) = ("rainout_allowances"."used_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "rally_rolls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"odds_pct" integer NOT NULL,
	"odds_breakdown" jsonb NOT NULL,
	"roll" integer NOT NULL,
	"hit" boolean NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rally_rolls_game_uq" UNIQUE("game_id"),
	CONSTRAINT "rally_rolls_token_uq" UNIQUE("token_id"),
	CONSTRAINT "rally_rolls_user_key_uq" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "rally_rolls_odds_ck" CHECK ("rally_rolls"."odds_pct" BETWEEN 10 AND 40),
	CONSTRAINT "rally_rolls_roll_ck" CHECK ("rally_rolls"."roll" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "rally_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "rally_token_source" NOT NULL,
	"month" char(7) NOT NULL,
	"series_id" uuid,
	"used_game_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rally_tokens_user_source_month_uq" UNIQUE("user_id","source","month"),
	CONSTRAINT "rally_tokens_used_game_uq" UNIQUE("used_game_id"),
	CONSTRAINT "rally_tokens_month_ck" CHECK ("rally_tokens"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "rally_tokens_used_ck" CHECK (("rally_tokens"."used_game_id" IS NULL) = ("rally_tokens"."used_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"start_date" date NOT NULL,
	"play_end_date" date NOT NULL,
	"offseason_end_date" date NOT NULL,
	"win_goal" integer,
	"status" "season_status" NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"rally_wins" integer DEFAULT 0 NOT NULL,
	"series_won" integer DEFAULT 0 NOT NULL,
	"series_lost" integer DEFAULT 0 NOT NULL,
	"run_differential" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seasons_user_number_uq" UNIQUE("user_id","number"),
	CONSTRAINT "seasons_number_ck" CHECK ("seasons"."number" >= 1),
	CONSTRAINT "seasons_win_goal_ck" CHECK ("seasons"."win_goal" IS NULL OR "seasons"."win_goal" BETWEEN 1 AND 175),
	CONSTRAINT "seasons_counts_ck" CHECK ("seasons"."wins" >= 0 AND "seasons"."losses" >= 0 AND "seasons"."rally_wins" >= 0 AND "seasons"."series_won" >= 0 AND "seasons"."series_lost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"start_date" date NOT NULL,
	"opponent_name" text NOT NULL,
	"opponent_colors" text[] NOT NULL,
	"opponent_seed" bigint NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"result" "series_result",
	"iron_man" boolean,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "series_season_number_uq" UNIQUE("season_id","number"),
	CONSTRAINT "series_user_start_uq" UNIQUE("user_id","start_date"),
	CONSTRAINT "series_number_ck" CHECK ("series"."number" BETWEEN 1 AND 25),
	CONSTRAINT "series_colors_ck" CHECK (cardinality("series"."opponent_colors") = 2),
	CONSTRAINT "series_seed_ck" CHECK ("series"."opponent_seed" BETWEEN 0 AND 4294967295),
	CONSTRAINT "series_counts_ck" CHECK ("series"."wins" BETWEEN 0 AND 7 AND "series"."losses" BETWEEN 0 AND 7)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"points" integer DEFAULT 1 NOT NULL,
	"status" "task_status" DEFAULT 'active' NOT NULL,
	"il_started_on" date,
	"il_min_until" date,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "task_definitions_points_ck" CHECK ("task_definitions"."points" >= 1),
	CONSTRAINT "task_definitions_streaks_ck" CHECK ("task_definitions"."current_streak" >= 0 AND "task_definitions"."longest_streak" >= "task_definitions"."current_streak"),
	CONSTRAINT "task_definitions_il_ck" CHECK (("task_definitions"."status" = 'injured') = ("task_definitions"."il_started_on" IS NOT NULL AND "task_definitions"."il_min_until" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text NOT NULL,
	"start_date" date NOT NULL,
	"default_lock_time" time,
	"finalized_through" date NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "day_template_tasks" ADD CONSTRAINT "day_template_tasks_template_id_day_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."day_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_template_tasks" ADD CONSTRAINT "day_template_tasks_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_templates" ADD CONSTRAINT "day_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_template_id_day_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."day_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rainout_allowances" ADD CONSTRAINT "rainout_allowances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rainout_allowances" ADD CONSTRAINT "rainout_allowances_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rainout_allowances" ADD CONSTRAINT "rainout_allowances_used_game_id_games_id_fk" FOREIGN KEY ("used_game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_rolls" ADD CONSTRAINT "rally_rolls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_rolls" ADD CONSTRAINT "rally_rolls_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_rolls" ADD CONSTRAINT "rally_rolls_token_id_rally_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."rally_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_tokens" ADD CONSTRAINT "rally_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_tokens" ADD CONSTRAINT "rally_tokens_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_tokens" ADD CONSTRAINT "rally_tokens_used_game_id_games_id_fk" FOREIGN KEY ("used_game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_template_tasks_task_idx" ON "day_template_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "lineup_entries_task_idx" ON "lineup_entries" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rainout_allowances_iron_man_month_uq" ON "rainout_allowances" USING btree ("user_id","earned_month") WHERE "rainout_allowances"."source" = 'iron_man';--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_definitions_user_idx" ON "task_definitions" USING btree ("user_id");