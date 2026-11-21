CREATE TABLE "league_teams" (
	"user_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"name" text NOT NULL,
	"colors" text[] NOT NULL,
	"seed" bigint NOT NULL,
	CONSTRAINT "league_teams_user_id_slot_pk" PRIMARY KEY("user_id","slot"),
	CONSTRAINT "league_teams_slot_ck" CHECK ("league_teams"."slot" BETWEEN 0 AND 28)
);
--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;