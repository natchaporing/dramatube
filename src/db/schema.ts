import {
  bigint,
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
  },
  (t) => [primaryKey({ columns: [t.videoId, t.viewerKey, t.day] })],
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
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("history_user_idx").on(t.userId, t.watchedAt)],
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
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Comment = typeof comments.$inferSelect;
