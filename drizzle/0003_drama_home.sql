CREATE TABLE "my_list" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "my_list_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "poster_key" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tropes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "status" text DEFAULT 'ongoing' NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "planned_episodes" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "premiere_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watch_history" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "my_list" ADD CONSTRAINT "my_list_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_list" ADD CONSTRAINT "my_list_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "my_list_user_idx" ON "my_list" USING btree ("user_id","added_at");--> statement-breakpoint
CREATE INDEX "videos_series_listed_idx" ON "videos" USING btree ("series_id","episode_number") WHERE "videos"."visibility" = 'public' and "videos"."status" = 'ready';