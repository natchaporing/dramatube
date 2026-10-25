CREATE TABLE "playback_sessions" (
	"user_id" text NOT NULL,
	"device_key" text NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_sessions_user_id_device_key_pk" PRIMARY KEY("user_id","device_key")
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "upload_hash" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_upload_hash_idx" ON "videos" USING btree ("upload_hash");--> statement-breakpoint
CREATE INDEX "videos_file_hash_idx" ON "videos" USING btree ("file_hash");