CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"purchase_id" text,
	"unlock_id" text,
	"external_ref" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"amount" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"purchase_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_spends" (
	"id" text PRIMARY KEY NOT NULL,
	"unlock_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"purchase_id" text,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"unlock_id" text NOT NULL,
	"kind" text DEFAULT 'sale' NOT NULL,
	"video_id" text,
	"credits" integer NOT NULL,
	"attribution" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"payout_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_satang" integer NOT NULL,
	"promptpay_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reference" text,
	"note" text DEFAULT '' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"pack_id" text NOT NULL,
	"credits" integer NOT NULL,
	"bonus_credits" integer NOT NULL,
	"amount_satang" integer NOT NULL,
	"currency" text DEFAULT 'thb' NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"qr_image_url" text,
	"expires_at" timestamp with time zone,
	"return_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"legal_name" text NOT NULL,
	"promptpay_id" text NOT NULL,
	"birth_date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"price" integer NOT NULL,
	"paid_spent" integer NOT NULL,
	"bonus_spent" integer NOT NULL,
	"attribution" text NOT NULL,
	"via_series_price" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "on_sale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "free_episodes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "episode_price" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "series_price_percent" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "exclusive_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_spends" ADD CONSTRAINT "credit_spends_lot_id_credit_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."credit_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_channel_id_users_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_external_ref_idx" ON "credit_ledger" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_lots_user_idx" ON "credit_lots" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "credit_spends_unlock_idx" ON "credit_spends" USING btree ("unlock_id");--> statement-breakpoint
CREATE INDEX "credit_spends_purchase_idx" ON "credit_spends" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "earnings_unlock_idx" ON "earnings" USING btree ("unlock_id","kind");--> statement-breakpoint
CREATE INDEX "earnings_creator_idx" ON "earnings" USING btree ("creator_id","available_at");--> statement-breakpoint
CREATE INDEX "payouts_creator_idx" ON "payouts" USING btree ("creator_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_provider_ref_idx" ON "purchases" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "purchases_user_idx" ON "purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_first_pack_idx" ON "purchases" USING btree ("user_id") WHERE "purchases"."pack_id" = 'first' and "purchases"."status" in ('pending', 'paid', 'reversed');--> statement-breakpoint
CREATE UNIQUE INDEX "unlocks_user_video_idx" ON "unlocks" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "unlocks_video_idx" ON "unlocks" USING btree ("video_id");