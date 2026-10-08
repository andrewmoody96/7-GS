CREATE TABLE "il_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"task_name" text NOT NULL,
	"points" integer NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"role" "lineup_role" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "il_holds_game_task_uq" UNIQUE("game_id","task_id"),
	CONSTRAINT "il_holds_role_ck" CHECK ("il_holds"."role" <> 'subbed_out'),
	CONSTRAINT "il_holds_bench_ck" CHECK ("il_holds"."role" <> 'bench' OR NOT "il_holds"."required"),
	CONSTRAINT "il_holds_points_ck" CHECK ("il_holds"."points" >= 1),
	CONSTRAINT "il_holds_position_ck" CHECK ("il_holds"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "il_holds" ADD CONSTRAINT "il_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "il_holds" ADD CONSTRAINT "il_holds_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "il_holds" ADD CONSTRAINT "il_holds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "il_holds_task_idx" ON "il_holds" USING btree ("task_id");