import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * An account is a channel. YouTube separated the two years after launch and
 * it is still the most confusing screen it has; one person, one channel, is
 * the right shape until somebody asks for a second.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** The channel's display name. */
  name: text("name").notNull(),
  /** Lowercase, unique, shown as @handle and used in channel URLs. */
  handle: text("handle").notNull().unique(),
  bio: text("bio").notNull().default(""),
  avatarKey: text("avatar_key"),
  bannerKey: text("banner_key"),
  role: text("role", { enum: ["member", "admin"] }).notNull().default("member"),
  /** Kept in step with `subscriptions` inside the same transaction. */
  subscriberCount: integer("subscriber_count").notNull().default(0),
  createdAt: createdAt(),
});

/** An ordered run of episodes — the shape a micro-drama is published in. */
export const series = pgTable(
  "series",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),

    /* What the creator sells. A series is free until its creator, once
       verified as a seller, puts it on sale. */
    onSale: boolean("on_sale").notNull().default(false),
    /** Episodes 1..freeEpisodes are free to everyone; the paywall starts after. */
    freeEpisodes: integer("free_episodes").notNull().default(5),
    /** Credits per locked episode. */
    episodePrice: integer("episode_price").notNull().default(30),
    /** The rest of the series at once costs this percentage of buying it episode by episode. */
    seriesPricePercent: integer("series_price_percent").notNull().default(70),
    /** Exclusive to DramaTube for 90 days from this moment: +10 points of creator share. */
    exclusiveSince: timestamp("exclusive_since", { withTimezone: true }),

    /* How the series is shelved. A drama is browsed as a show, not as a
       pile of clips: a tall poster, the tropes it plays, whether it is
       still coming out, and when it starts if it has not yet. */
    /** A 2:3 poster. Without one the first episode's picture stands in, whatever its shape. */
    posterKey: text("poster_key"),
    /** From the shared list in src/lib/tropes.ts, which DramaStudio's writers' room uses too. */
    tropes: text("tropes").array().notNull().default([]),
    status: text("status", { enum: ["ongoing", "completed"] }).notNull().default("ongoing"),
    /** How many episodes it will have, when the creator knows: "EP 3 / 40". */
    plannedEpisodes: integer("planned_episodes"),
    /** Announced but not out yet: shelved under Coming soon until its first episode. */
    premiereAt: timestamp("premiere_at", { withTimezone: true }),

    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("series_channel_idx").on(t.channelId)],
);

export const videos = pgTable(
  "videos",
  {
    /** Eleven URL-safe characters, so a link reads like a video link. */
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    visibility: text("visibility", { enum: ["public", "unlisted", "private"] })
      .notNull()
      .default("public"),
    /** `removed` is a moderator's decision; the owner still sees why. */
    status: text("status", { enum: ["ready", "removed"] }).notNull().default("ready"),
    removedReason: text("removed_reason"),
    category: text("category").notNull().default("other"),
    tags: text("tags").array().notNull().default([]),

    videoKey: text("video_key").notNull(),
    mimeType: text("mime_type").notNull(),
    /**
     * SHA-256 of the file as uploaded and as stored (they differ when the
     * upload was rewritten for streaming). Another channel's upload matching
     * either is somebody else's video, and is refused.
     */
    uploadHash: text("upload_hash"),
    fileHash: text("file_hash"),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    thumbnailKey: text("thumbnail_key"),
    durationSec: real("duration_sec").notNull().default(0),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),

    /**
     * The disclosure. Every video on the site says how much of it a model
     * made, and which ones — that is the premise of the site, not a footnote,
     * so it is a column rather than a tag somebody might forget.
     */
    aiUsage: text("ai_usage", { enum: ["generated", "assisted"] }).notNull().default("generated"),
    aiModels: text("ai_models").array().notNull().default([]),
    /** Optional. A creator who shares the prompt is teaching; most will not. */
    prompt: text("prompt"),
    /** The tool that published it through the API, e.g. "DramaStudio". */
    sourceApp: text("source_app"),

    seriesId: text("series_id").references(() => series.id, { onDelete: "set null" }),
    episodeNumber: integer("episode_number"),

    /* Denormalised counters, moved in the same transaction as the rows they
       count so that a grid of fifty cards is one query rather than fifty. */
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    dislikeCount: integer("dislike_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),

    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("videos_channel_idx").on(t.channelId, t.publishedAt),
    index("videos_feed_idx").on(t.visibility, t.status, t.publishedAt),
    index("videos_series_idx").on(t.seriesId, t.episodeNumber),
    index("videos_upload_hash_idx").on(t.uploadHash),
    index("videos_file_hash_idx").on(t.fileHash),
    // What every shelf adds up: a series' episodes that strangers can watch.
    index("videos_series_listed_idx")
      .on(t.seriesId, t.episodeNumber)
      .where(sql`${t.visibility} = 'public' and ${t.status} = 'ready'`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    subscriberId: text("subscriber_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.subscriberId, t.channelId] }),
    index("subscriptions_channel_idx").on(t.channelId),
  ],
);

/** A like is +1, a dislike is -1; one row per person per video. */
export const reactions = pgTable(
  "reactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("reactions_video_idx").on(t.videoId)],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** One level of replies, as on every video site that has tried more. */
    parentId: text("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_video_idx").on(t.videoId, t.createdAt), index("comments_parent_idx").on(t.parentId)],
);

/**
 * One row per viewer per video per day. The primary key is the de-duplication:
 * a reload, a second tab or a replay on the same day counts once, and the
 * counter on `videos` only moves when this insert actually lands.
 */
export const views = pgTable(
  "views",
  {
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    day: date("day").notNull(),
    /** A keyed hash of the network an anonymous view came from, for the daily cap. */
    networkKey: text("network_key"),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.viewerKey, t.day] }),
    index("views_network_idx").on(t.videoId, t.day, t.networkKey),
  ],
);

/** Signed-in viewing history, with where they stopped so they can resume. */
export const watchHistory = pgTable(
  "watch_history",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    positionSec: real("position_sec").notNull().default(0),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
    /** Watched to the end, at least once: Continue watching moves on to the next episode. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("history_user_idx").on(t.userId, t.watchedAt)],
);

/** Series a viewer saved to watch: My List. */
export const myList = pgTable(
  "my_list",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.seriesId] }), index("my_list_user_idx").on(t.userId, t.addedAt)],
);

/**
 * Personal tokens for the publishing API — how DramaStudio, or a script,
 * uploads on somebody's behalf. Only a hash is kept; the token is shown once.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** The first characters, so a person can tell two tokens apart. */
    prefix: text("prefix").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_tokens_hash_idx").on(t.tokenHash), index("api_tokens_user_idx").on(t.userId)],
);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason", {
      enum: ["undisclosed", "misleading", "impersonation", "sexual", "violent", "hateful", "spam", "copyright", "other"],
    }).notNull(),
    details: text("details").notNull().default(""),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution", { enum: ["removed", "dismissed"] }),
  },
  (t) => [index("reports_open_idx").on(t.resolvedAt, t.createdAt), index("reports_video_idx").on(t.videoId)],
);

/**
 * A file that has arrived but not yet been published. The video streams in
 * while its details are being typed, as on every upload page people already
 * know; publishing moves it into storage and deletes this row.
 */
export const uploads = pgTable("uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  /** SHA-256 of the bytes received, worked out while they streamed in. */
  contentHash: text("content_hash"),
  createdAt: createdAt(),
});

/**
 * Where an account is streaming paid episodes from: one row per signed-in
 * browser (a hash of its session, never the session itself). Two may stream
 * at once; a third has to take over from them.
 */
export const playbackSessions = pgTable(
  "playback_sessions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceKey: text("device_key").notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.deviceKey] })],
);

export type User = typeof users.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Comment = typeof comments.$inferSelect;

/* ------------------------------------------------------------------------ */
/* Money. Credits are the wallet; see docs/MONETIZATION.md.                   */
/* ------------------------------------------------------------------------ */

/**
 * A top-up, written down before the viewer is sent to pay. The credits it
 * grants are the ones recorded here, never ones read back from a payment
 * provider's message, so a forged or replayed webhook cannot choose an amount.
 */
export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    packId: text("pack_id").notNull(),
    credits: integer("credits").notNull(),
    bonusCredits: integer("bonus_credits").notNull(),
    amountSatang: integer("amount_satang").notNull(),
    currency: text("currency").notNull().default("thb"),
    method: text("method", { enum: ["promptpay", "card"] }).notNull(),
    provider: text("provider", { enum: ["omise", "stripe", "dev"] }).notNull(),
    /** The provider's id for this payment: an Omise charge, a Stripe Checkout session. */
    providerRef: text("provider_ref"),
    status: text("status", { enum: ["pending", "paid", "failed", "expired", "reversed"] }).notNull().default("pending"),
    /** PromptPay only: the QR the viewer scans, and when it stops working. */
    qrImageUrl: text("qr_image_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Where to send the viewer afterwards: the episode they were trying to watch. */
    returnTo: text("return_to"),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("purchases_provider_ref_idx").on(t.provider, t.providerRef),
    index("purchases_user_idx").on(t.userId, t.createdAt),
    // The first-top-up offer is once per account, however many tabs ask at once.
    uniqueIndex("purchases_first_pack_idx")
      .on(t.userId)
      .where(sql`${t.packId} = 'first' and ${t.status} in ('pending', 'paid', 'reversed')`),
  ],
);

/**
 * Credits a viewer holds, as lots. Bought credits never expire; bonus credits
 * do, so spending takes bonus first, soonest-expiring first, then bought.
 * A balance is the sum of `remaining` over lots that have not expired.
 */
export const creditLots = pgTable(
  "credit_lots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["paid", "bonus"] }).notNull(),
    amount: integer("amount").notNull(),
    remaining: integer("remaining").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    purchaseId: text("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("credit_lots_user_idx").on(t.userId, t.expiresAt)],
);

/**
 * Every credit movement, append-only: the explanation of every balance.
 * `externalRef` is unique, which is what makes granting a purchase happen
 * exactly once however many times a payment provider repeats itself.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    delta: integer("delta").notNull(),
    reason: text("reason", { enum: ["topup", "bonus", "unlock", "refund", "reversal", "expiry"] }).notNull(),
    purchaseId: text("purchase_id"),
    unlockId: text("unlock_id"),
    externalRef: text("external_ref"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("credit_ledger_external_ref_idx").on(t.externalRef), index("credit_ledger_user_idx").on(t.userId, t.createdAt)],
);

/** An episode a viewer owns. Permanent: there is no rental. */
export const unlocks = pgTable(
  "unlocks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull(),
    /** Credits this episode cost, and which kind paid for it (for refunds). */
    price: integer("price").notNull(),
    paidSpent: integer("paid_spent").notNull(),
    bonusSpent: integer("bonus_spent").notNull(),
    attribution: text("attribution", { enum: ["direct", "discovered"] }).notNull(),
    viaSeriesPrice: boolean("via_series_price").notNull().default(false),
    createdAt: createdAt(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("unlocks_user_video_idx").on(t.userId, t.videoId), index("unlocks_video_idx").on(t.videoId)],
);

/**
 * Which credits paid for which unlock: one row per lot an unlock drew on.
 * This is what lets money that goes back to a card find the episodes it
 * bought, and lets a refund put credits back into the lot they came from.
 */
export const creditSpends = pgTable(
  "credit_spends",
  {
    id: text("id").primaryKey(),
    unlockId: text("unlock_id").notNull(),
    lotId: text("lot_id")
      .notNull()
      .references(() => creditLots.id, { onDelete: "cascade" }),
    /** The top-up behind the lot. */
    purchaseId: text("purchase_id"),
    amount: integer("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("credit_spends_unlock_idx").on(t.unlockId), index("credit_spends_purchase_idx").on(t.purchaseId)],
);

/**
 * The creator's side of an unlock. Held for 14 days — the refund window —
 * then available to cash out. `payoutId` is set when a payout claims it.
 *
 * A sale that is undone before a payout claims it is marked reversed. One
 * undone after — the buyer's money went back, or the episode was taken down
 * once the earnings were already being paid — gets a `clawback` row of
 * negative credits, which comes off the creator's next payout.
 */
export const earnings = pgTable(
  "earnings",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    unlockId: text("unlock_id").notNull(),
    kind: text("kind", { enum: ["sale", "clawback"] }).notNull().default("sale"),
    videoId: text("video_id"),
    credits: integer("credits").notNull(),
    attribution: text("attribution", { enum: ["direct", "discovered"] }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["open", "paid", "reversed"] }).notNull().default("open"),
    payoutId: text("payout_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("earnings_unlock_idx").on(t.unlockId, t.kind), index("earnings_creator_idx").on(t.creatorId, t.availableAt)],
);

/** A creator's application to sell, and its outcome. */
export const sellers = pgTable("sellers", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  legalName: text("legal_name").notNull(),
  /** A 10-digit Thai mobile number or a 13-digit citizen ID registered with PromptPay. */
  promptpayId: text("promptpay_id").notNull(),
  birthDate: date("birth_date").notNull(),
  note: text("note").notNull().default(""),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

/** Money going out: one PromptPay transfer to a creator. */
export const payouts = pgTable(
  "payouts",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credits: integer("credits").notNull(),
    amountSatang: integer("amount_satang").notNull(),
    /** Copied from the seller record at request time, so a later edit cannot redirect it. */
    promptpayId: text("promptpay_id").notNull(),
    legalName: text("legal_name").notNull(),
    status: text("status", { enum: ["requested", "paid", "rejected"] }).notNull().default("requested"),
    reference: text("reference"),
    note: text("note").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("payouts_creator_idx").on(t.creatorId, t.requestedAt)],
);

/** A signed-in viewer arrived through a creator's own link: sales to them are direct for 30 days. */
export const referrals = pgTable(
  "referrals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
);

export type Purchase = typeof purchases.$inferSelect;
export type Unlock = typeof unlocks.$inferSelect;

