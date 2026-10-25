ALTER TABLE "views" ADD COLUMN "network_key" text;--> statement-breakpoint
CREATE INDEX "views_network_idx" ON "views" USING btree ("video_id","day","network_key");