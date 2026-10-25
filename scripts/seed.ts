/**
 * A small site to look at: six channels, two dramas told in vertical
 * episodes, short films, music videos, a tutorial with its prompt, comments
 * in English and Thai, subscriptions and likes.
 *
 * The pictures are drawn by ffmpeg — fractals, gradients, cellular automata
 * with the title over them — and pushed through the real upload and publish
 * pipeline, so seeding also proves that pipeline works end to end. The view
 * and like counts are invented to make the feeds look lived-in; they are
 * demo data and nothing else.
 *
 *   pnpm db:seed           # refuses if the site already has accounts
 *   SEED_RESET=1 pnpm db:seed   # empties every table first
 *
 * Sign in as director@example.com / dramatube.
 */
import "./load-env";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { and, count, eq, sql } from "drizzle-orm";
import { db, sql as client } from "../src/db";
import { comments, purchases, reactions, sellers, series, subscriptions, users, videos, watchHistory } from "../src/db/schema";
import { withReferral } from "../src/lib/referral";
import { unlockEpisode } from "../src/lib/unlock";
import { grantPurchase } from "../src/lib/wallet";
import { newId, newObjectName } from "../src/lib/ids";
import { publishVideo, receiveUpload } from "../src/lib/publish";
import { createSeries } from "../src/lib/studio";
import { registerUser } from "../src/lib/session";
import { env } from "../src/lib/env";
import { localRoot, putBuffer } from "../src/lib/storage";

const FONT = ["/usr/share/fonts/opentype/inter/Inter-Bold.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"].find(
  (path) => existsSync(path),
);

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr || result.error}`);
}

/** Escape text for an ffmpeg drawtext value inside a filtergraph. */
function drawtextSafe(text: string) {
  return text.replace(/\\/g, "\\\\\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/,/g, "\\,").replace(/%/g, "\\%");
}

type Look = "fractal" | "gradient" | "life" | "plasma" | "zone" | "cells";

function source(look: Look, w: number, h: number, d: number, hue: number): string {
  switch (look) {
    case "fractal":
      return `mandelbrot=s=${w}x${h}:rate=30:maxiter=256,hue=h=${hue}+t*12,trim=duration=${d}`;
    case "gradient":
      return `gradients=s=${w}x${h}:rate=30:n=4:speed=0.015:duration=${d}:c0=0x1b0f2e:c1=0xff4f6d:c2=0x6b4cff:c3=0x0e7c86,hue=h=${hue}`;
    case "life":
      return `life=s=${Math.round(w / 4)}x${Math.round(h / 4)}:rate=30:mold=12:ratio=0.12:life_color=#ff7aa0:death_color=#2a1446:mold_color=#3b1e6e,scale=${w}:${h}:flags=neighbor,trim=duration=${d}`;
    case "plasma":
      return `color=c=black:s=320x${Math.round((320 * h) / w)}:r=30:d=${d},geq=r='128+127*sin(X/23+T*1.7)':g='128+127*sin(Y/19+T*1.1)':b='128+127*sin((X+Y)/31+T*0.7)',hue=h=${hue},scale=${w}:${h}`;
    case "zone":
      return `zoneplate=s=${w}x${h}:rate=30:precision=10:kt2=2:kx2=180:ky2=180:duration=${d},hue=h=${hue}:s=1.6,gblur=sigma=2`;
    case "cells":
      return `cellauto=s=${Math.round(w / 3)}x${Math.round(h / 3)}:rate=30:rule=110:scroll=1,scale=${w}:${h}:flags=neighbor,negate,hue=h=${hue}+120:s=4,colorchannelmixer=rr=0.9:gg=0.5:bb=1.0,trim=duration=${d}`;
  }
}

function renderClip(out: string, opts: { look: Look; vertical: boolean; seconds: number; hue: number; title: string; kicker: string; note: number }) {
  const [w, h] = opts.vertical ? [720, 1280] : [1280, 720];
  const d = opts.seconds;
  const titleSize = opts.vertical ? 38 : 58;
  const text = FONT
    ? [
        `drawbox=x=0:y=ih*0.62:w=iw:h=ih*0.38:color=black@0.45:t=fill`,
        `drawtext=fontfile='${FONT}':text='${drawtextSafe(opts.kicker)}':fontcolor=0xb9a4ff:fontsize=${Math.round(titleSize * 0.42)}:x=(w-tw)/2:y=h*0.68`,
        `drawtext=fontfile='${FONT}':text='${drawtextSafe(opts.title)}':fontcolor=white:fontsize=${titleSize}:x=(w-tw)/2:y=h*0.68+${Math.round(titleSize * 0.9)}:alpha='min(1,t/0.8)'`,
        `drawtext=fontfile='${FONT}':text='AI-generated demo · DramaTube':fontcolor=white@0.6:fontsize=${Math.round(titleSize * 0.36)}:x=(w-tw)/2:y=h*0.9`,
      ].join(",")
    : "null";
  const root = 110 * 2 ** (opts.note / 12);
  const chord = `0.09*sin(2*PI*${root}*t)+0.06*sin(2*PI*${root * 1.26}*t)+0.05*sin(2*PI*${root * 1.5}*t)+0.03*sin(2*PI*${root * 2}*t)*sin(2*PI*0.5*t)`;
  ffmpeg([
    "-f", "lavfi", "-i", source(opts.look, w, h, d, opts.hue),
    "-f", "lavfi", "-i", `aevalsrc='${chord}':s=44100:d=${d}`,
    "-filter_complex", `[0:v]format=yuv420p,${text},fade=in:st=0:d=0.6,fade=out:st=${d - 0.6}:d=0.6[v];[1:a]afade=in:st=0:d=0.8,afade=out:st=${d - 0.8}:d=0.8[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", String(d),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k",
    out,
  ]);
}

function renderImage(out: string, opts: { w: number; h: number; hue: number; letter?: string }) {
  const draw =
    opts.letter && FONT
      ? `,drawtext=fontfile='${FONT}':text='${drawtextSafe(opts.letter)}':fontcolor=white:fontsize=${Math.round(opts.h * 0.5)}:x=(w-tw)/2:y=(h-th)/2`
      : "";
  ffmpeg([
    "-f", "lavfi", "-i", `gradients=s=${opts.w}x${opts.h}:n=3:c0=0xff4f6d:c1=0x6b4cff:c2=0x101018:seed=${opts.hue}:duration=1,hue=h=${opts.hue}${draw}`,
    "-frames:v", "1", "-q:v", "3", out,
  ]);
}

interface ChannelSeed {
  key: string;
  email: string;
  name: string;
  handle: string;
  bio: string;
  hue: number;
  admin?: boolean;
}

const CHANNELS: ChannelSeed[] = [
  { key: "director", email: "director@example.com", name: "The Director", handle: "director", bio: "Signed in as the site's operator. Rough cuts live here before they go anywhere else.", hue: 20, admin: true },
  { key: "neon", email: "neon@example.com", name: "Neon Lotus Studio", handle: "neonlotus", bio: "Thai sci-fi micro-dramas, shot vertical, made with Veo and Kling.\nNew episode every Friday.\n\nละครไซไฟสั้นแนวตั้ง ตอนใหม่ทุกวันศุกร์", hue: 300 },
  { key: "paper", email: "paper@example.com", name: "Paper Moon Pictures", handle: "papermoon", bio: "Short films about small towns, made one shot at a time with AI models and a lot of patience.", hue: 200 },
  { key: "synth", email: "synth@example.com", name: "Synthwave Sessions", handle: "synthwave", bio: "AI music videos. Tracks from Suno and Udio, pictures from whatever renders the night best.", hue: 260 },
  { key: "kaiju", email: "kaiju@example.com", name: "Kaiju Kitchen", handle: "kaijukitchen", bio: "A very large lizard learns to cook. Comedy, animated, mostly on fire.", hue: 90 },
  { key: "school", email: "school@example.com", name: "Prompt School", handle: "promptschool", bio: "How the AI films you like are actually made: continuity, camera language, and the prompts behind them.", hue: 160 },
];

interface VideoSeed {
  channel: string;
  title: string;
  kicker: string;
  overlay?: string;
  description: string;
  category: string;
  tags: string[];
  models: string[];
  usage?: "generated" | "assisted";
  prompt?: string;
  look: Look;
  vertical?: boolean;
  seconds?: number;
  series?: string;
  episode?: number;
  visibility?: "public" | "unlisted" | "private";
  views: number;
  daysAgo: number;
  sourceApp?: string;
}

const SERIES: Record<string, { channel: string; title: string; description: string }> = {
  bkk: {
    channel: "neon",
    title: "Bangkok 2077",
    description: "A night courier in a drowned, neon Bangkok finds every screen in the city showing her own name. A vertical sci-fi drama in five episodes.",
  },
  love: {
    channel: "neon",
    title: "รักนี้ไม่มีอยู่จริง (Love That Isn't Real)",
    description: "เธอตกหลุมรักผู้ชายที่ไม่มีตัวตน — เขาเป็นแค่ตัวละครที่ AI สร้างขึ้น หรือเปล่า\nA romance about falling for someone who might only exist in a render.",
  },
};

const BKK_PROMPT = `9:16 vertical. Rain-soaked Bangkok night market in 2077, neon Thai and English signage reflected in ankle-deep water. MALI (24, short black bob, reflective yellow courier raincoat, scuffed white sneakers) looks up as every screen flickers with the same message: her own name. Handheld, 35mm, shallow depth of field, cyan and magenta practicals, light steam from food stalls.`;

const VIDEOS: VideoSeed[] = [
  { channel: "neon", series: "bkk", episode: 1, title: "Bangkok 2077 · EP1: The Night Market Signal", kicker: "EPISODE 1", overlay: "The Night Market Signal", description: "Mali delivers her last parcel of the night — and every screen in the market says her name.\n\n0:03 the first glitch\n\nMade with Veo for the wides, Kling for close-ups, ElevenLabs for Mali's voice.", category: "drama", tags: ["bangkok", "cyberpunk", "vertical drama"], models: ["Veo", "Kling", "ElevenLabs"], prompt: BKK_PROMPT, look: "plasma", vertical: true, seconds: 9, views: 482_000, daysAgo: 26, sourceApp: "DramaStudio" },
  { channel: "neon", series: "bkk", episode: 2, title: "Bangkok 2077 · EP2: Rain on Silom", kicker: "EPISODE 2", overlay: "Rain on Silom", description: "The message follows her onto the Skytrain.", category: "drama", tags: ["bangkok", "cyberpunk"], models: ["Veo", "Kling", "ElevenLabs"], look: "gradient", vertical: true, seconds: 8, views: 311_000, daysAgo: 19, sourceApp: "DramaStudio" },
  { channel: "neon", series: "bkk", episode: 3, title: "Bangkok 2077 · EP3: The Tuk-Tuk That Remembered", kicker: "EPISODE 3", overlay: "The Tuk-Tuk That Remembered", description: "An autonomous tuk-tuk knows where Mali was born. She doesn't.", category: "drama", tags: ["bangkok", "cyberpunk"], models: ["Veo", "Kling", "ElevenLabs"], look: "zone", vertical: true, seconds: 8, views: 240_500, daysAgo: 12, sourceApp: "DramaStudio" },
  { channel: "neon", series: "bkk", episode: 4, title: "Bangkok 2077 · EP4: Her Name in the Data", kicker: "EPISODE 4", overlay: "Her Name in the Data", description: "Somebody built the city's AI out of a girl's memories.", category: "drama", tags: ["bangkok", "cyberpunk"], models: ["Veo", "Kling", "ElevenLabs"], look: "cells", vertical: true, seconds: 8, views: 198_000, daysAgo: 5, sourceApp: "DramaStudio" },
  { channel: "neon", series: "love", episode: 1, title: "รักนี้ไม่มีอยู่จริง EP1 | เขาตอบแชตตอนตีสาม", kicker: "EP 1", overlay: "Love That Isn't Real", description: "มิ้นท์ได้รับข้อความจากผู้ชายที่ไม่มีใครเคยเห็นหน้า\nMint gets a message at 3 a.m. from a man nobody has ever met.", category: "drama", tags: ["romance", "ละครสั้น", "thai"], models: ["Seedance", "Nano Banana", "ElevenLabs"], look: "gradient", vertical: true, seconds: 8, views: 127_000, daysAgo: 9 },
  { channel: "neon", series: "love", episode: 2, title: "รักนี้ไม่มีอยู่จริง EP2 | นัดเจอที่สยาม", kicker: "EP 2", overlay: "Love That Isn't Real", description: "เขานัดเจอที่สยาม แต่ไม่มาตามนัด\nHe asks to meet at Siam. He never arrives.", category: "drama", tags: ["romance", "ละครสั้น", "thai"], models: ["Seedance", "Nano Banana", "ElevenLabs"], look: "plasma", vertical: true, seconds: 8, views: 88_400, daysAgo: 2 },

  { channel: "paper", title: "The Salt Line — a short film", kicker: "SHORT FILM", overlay: "The Salt Line", description: "A ferry captain's daughter has one summer to decide whether to stay on the island.\n\n12 minutes in the full version; this is the opening.\n\nPictures: Veo and Midjourney. Score: Suno.", category: "short-film", tags: ["short film", "island", "drama"], models: ["Veo", "Midjourney", "Suno"], look: "gradient", seconds: 12, views: 96_300, daysAgo: 21 },
  { channel: "paper", title: "The Lighthouse Keeper's Daughter", kicker: "SHORT FILM", overlay: "The Lighthouse Keeper's Daughter", description: "A storm, a radio, and a voice that should not be there.", category: "short-film", tags: ["short film", "mystery"], models: ["Runway", "ElevenLabs"], look: "fractal", seconds: 10, views: 41_200, daysAgo: 14 },
  { channel: "paper", title: "GLASS ORCHARD — Official Trailer", kicker: "TRAILER", overlay: "Glass Orchard", description: "Coming this winter.", category: "trailer", tags: ["trailer", "fantasy"], models: ["Veo", "Luma Ray", "Suno"], look: "zone", seconds: 8, views: 210_000, daysAgo: 3 },

  { channel: "synth", title: "Midnight Drive (Official AI Music Video)", kicker: "MUSIC VIDEO", overlay: "Midnight Drive", description: "Track: Suno. Visuals: Runway and Kling, cut to the beat.\n\n0:04 the drop", category: "music-video", tags: ["synthwave", "retrowave", "night drive"], models: ["Suno", "Runway", "Kling"], look: "gradient", seconds: 12, views: 1_240_000, daysAgo: 28 },
  { channel: "synth", title: "Neon Rain — Lyric Visualizer", kicker: "MUSIC VIDEO", overlay: "Neon Rain", description: "A loop for studying, coding, or staring out of a rainy window.", category: "music-video", tags: ["lofi", "visualizer"], models: ["Udio", "Kling"], look: "plasma", seconds: 10, views: 356_000, daysAgo: 11 },
  { channel: "synth", title: "Fractal Dreams (8K render, 60fps original)", kicker: "EXPERIMENTAL", overlay: "Fractal Dreams", description: "No camera, no prompt — maths, and a model to colour it in.", category: "experimental", tags: ["fractal", "abstract"], models: ["Stable Diffusion", "Suno"], look: "fractal", seconds: 10, views: 72_800, daysAgo: 6 },
  { channel: "synth", title: "Cellular — a generative music video", kicker: "EXPERIMENTAL", overlay: "Cellular", description: "Rule 110, scored live.", category: "experimental", tags: ["generative", "abstract"], models: ["Udio"], usage: "assisted", look: "cells", vertical: true, seconds: 8, views: 15_400, daysAgo: 1 },

  { channel: "kaiju", title: "A Kaiju Tries to Make Pad Thai", kicker: "KAIJU KITCHEN", overlay: "A Kaiju Tries to Make Pad Thai", description: "Episode one of the cooking show nobody asked for. The wok did not survive.", category: "comedy", tags: ["comedy", "cooking", "kaiju"], models: ["Sora", "ElevenLabs"], look: "life", seconds: 10, views: 2_310_000, daysAgo: 24 },
  { channel: "kaiju", title: "Kaiju Reviews Bangkok Street Food (gets banned from Yaowarat)", kicker: "KAIJU KITCHEN", overlay: "Street Food Review", description: "Five stalls, four stars, one very flat motorbike.", category: "comedy", tags: ["comedy", "bangkok", "street food"], models: ["Sora", "Kling", "ElevenLabs"], look: "zone", vertical: true, seconds: 8, views: 870_000, daysAgo: 8 },
  { channel: "kaiju", title: "Kaiju Kitchen: The Animated Series — Pilot", kicker: "ANIMATION", overlay: "The Animated Series", description: "The pilot, in full.", category: "animation", tags: ["animation", "comedy"], models: ["Wan", "Suno"], look: "life", seconds: 12, views: 54_000, daysAgo: 4 },

  { channel: "school", title: "How to keep a character consistent across 40 shots", kicker: "TUTORIAL", overlay: "Consistency, shot 1 to 40", description: "The four rules we use on every production:\n1. Say the character's description verbatim, never paraphrased\n2. Restate locked wardrobe in every shot\n3. Pick reference images that match the shot's framing\n4. Derive the costume from the story day\n\n0:02 rule one\n0:05 rule three", category: "tutorial", tags: ["tutorial", "consistency", "prompting"], models: ["DramaStudio", "Veo", "Nano Banana"], usage: "assisted", prompt: "MALI (24, short black bob, reflective yellow courier raincoat, scuffed white sneakers) — medium close-up, eye level, 50mm. Same description, word for word, in every shot she appears in.", look: "gradient", seconds: 10, views: 188_000, daysAgo: 16, sourceApp: "DramaStudio" },
  { channel: "school", title: "Camera moves that AI video models actually understand", kicker: "TUTORIAL", overlay: "Camera language for AI video", description: "Dolly, truck, crane, handheld — which words every model obeys, and which ones they quietly ignore.", category: "tutorial", tags: ["tutorial", "camera", "prompting"], models: ["Veo", "Kling", "Seedance"], usage: "assisted", prompt: "Slow dolly-in from a medium shot to a close-up, eye level, 35mm, the subject stays centred; no cuts.", look: "zone", seconds: 9, views: 64_000, daysAgo: 7 },

  { channel: "director", title: "Rough cut — EP5 Lotus Protocol (private)", kicker: "ROUGH CUT", overlay: "Lotus Protocol", description: "Not for release yet.", category: "drama", tags: ["rough cut"], models: ["Veo"], look: "fractal", vertical: true, seconds: 6, visibility: "private", views: 0, daysAgo: 0 },
  { channel: "director", title: "Colour test — unlisted, for the team", kicker: "COLOUR TEST", overlay: "Colour test", description: "Share the link, don't post it.", category: "other", tags: [], models: ["Veo"], look: "plasma", seconds: 6, visibility: "unlisted", views: 12, daysAgo: 1 },
];

const COMMENTS = [
  "The rain shots in this are unreal. Which model did the reflections?",
  "ภาพสวยมากครับ รอตอนต่อไปอยู่นะ",
  "Her face is the same in every single shot. That's the hard part — respect.",
  "ซีนตลาดกลางคืนคือดีมาก",
  "Prompt please 🙏",
  "First AI drama I've actually wanted to binge.",
  "เพลงประกอบเข้ากับภาพมาก ขอชื่อเพลงหน่อยครับ",
  "0:04 gave me chills",
  "Love that the description says exactly which models made it. More channels should do this.",
  "ตอนนี้ดีที่สุดแล้ว",
  "How long did this take to render?",
  "I've watched this four times.",
];

const CREATOR_REPLIES = [
  "Thank you! Veo for the wides, Kling for the close-ups.",
  "ขอบคุณมากครับ ตอนต่อไปมาวันศุกร์นี้",
  "About six hours of renders for one minute of film, honestly.",
];

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

async function main() {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total > 0) {
    if (process.env.SEED_RESET !== "1") {
      console.log(`The database already has ${total} account(s). Run with SEED_RESET=1 to empty it and seed again.`);
      return;
    }
    await db.execute(
      sql`truncate table referrals, payouts, earnings, unlocks, credit_ledger, credit_lots, purchases, sellers, reports, api_tokens, watch_history, views, comments, reactions, subscriptions, uploads, videos, series, users cascade`,
    );
    // The rows named the files; with the rows gone, local files are orphans.
    if (env.storageDriver === "local") {
      for (const dir of ["videos", "thumbs", "avatars", "banners"]) {
        await rm(join(localRoot(), dir), { recursive: true, force: true });
      }
    }
    console.log("emptied every table");
  }

  const work = await mkdtemp(join(tmpdir(), "dramatube-seed-"));
  const ids: Record<string, string> = {};
  try {
    for (const channel of CHANNELS) {
      const user = await registerUser({ email: channel.email, name: channel.name, handle: channel.handle, password: "dramatube" });
      ids[channel.key] = user.id;
      const avatar = join(work, `${channel.key}-avatar.jpg`);
      const banner = join(work, `${channel.key}-banner.jpg`);
      renderImage(avatar, { w: 256, h: 256, hue: channel.hue, letter: channel.name.replace(/^The /, "")[0] });
      renderImage(banner, { w: 2048, h: 512, hue: channel.hue });
      const avatarKey = `avatars/${user.id}/${newObjectName()}.jpg`;
      const bannerKey = `banners/${user.id}/${newObjectName()}.jpg`;
      const { readFile } = await import("node:fs/promises");
      await putBuffer(avatarKey, await readFile(avatar), "image/jpeg");
      await putBuffer(bannerKey, await readFile(banner), "image/jpeg");
      await db
        .update(users)
        .set({ bio: channel.bio, avatarKey, bannerKey, role: channel.admin ? "admin" : "member" })
        .where(eq(users.id, user.id));
      console.log(`channel @${channel.handle}`);
    }

    const seriesIds: Record<string, string> = {};
    for (const [key, item] of Object.entries(SERIES)) {
      seriesIds[key] = (await createSeries(ids[item.channel], item.title, item.description)).id;
    }

    const published: Array<{ id: string; channel: string; views: number }> = [];
    for (const [index, seed] of VIDEOS.entries()) {
      const file = join(work, `clip-${index}.mp4`);
      renderClip(file, {
        look: seed.look,
        vertical: Boolean(seed.vertical),
        seconds: seed.seconds ?? 8,
        hue: (index * 47) % 360,
        title: seed.overlay ?? seed.title,
        kicker: seed.kicker,
        note: (index * 5) % 12,
      });
      const upload = await receiveUpload({
        userId: ids[seed.channel],
        body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
      });
      const video = await publishVideo(ids[seed.channel], {
        uploadId: upload.uploadId,
        title: seed.title,
        description: seed.description,
        visibility: seed.visibility ?? "public",
        category: seed.category as "drama",
        tags: seed.tags,
        aiUsage: seed.usage ?? "generated",
        aiModels: seed.models,
        prompt: seed.prompt ?? null,
        seriesId: seed.series ? seriesIds[seed.series] : null,
        episodeNumber: seed.episode ?? null,
        sourceApp: seed.sourceApp ?? null,
      });
      const publishedAt = new Date(Date.now() - seed.daysAgo * 86_400_000 - index * 3_600_000);
      await db
        .update(videos)
        .set({
          publishedAt,
          viewCount: seed.views,
          likeCount: Math.round(seed.views * 0.045),
          dislikeCount: Math.round(seed.views * 0.002),
        })
        .where(eq(videos.id, video.id));
      published.push({ id: video.id, channel: seed.channel, views: seed.views });
      console.log(`video ${video.id}  ${seed.title}`);
    }

    // Who follows whom: everybody follows a few, the director follows everyone.
    const keys = CHANNELS.map((channel) => channel.key);
    for (const [i, follower] of keys.entries()) {
      for (const [j, followed] of keys.entries()) {
        if (follower === followed) continue;
        if (follower !== "director" && (i + j) % 2 === 0) continue;
        await db.insert(subscriptions).values({ subscriberId: ids[follower], channelId: ids[followed] }).onConflictDoNothing();
      }
    }
    // Subscriber counts are demo numbers, like the views: big enough to look like a site.
    const audience: Record<string, number> = { neon: 184_000, paper: 22_400, synth: 412_000, kaiju: 1_020_000, school: 48_700, director: 3 };
    for (const key of keys) {
      await db.update(users).set({ subscriberCount: audience[key] ?? 0 }).where(eq(users.id, ids[key]));
    }

    // Comments, with the creator answering some of them.
    let n = 0;
    for (const video of published.filter((item) => item.views > 0)) {
      const howMany = 2 + (n % 4);
      for (let k = 0; k < howMany; k++) {
        const author = keys[(n + k + 1) % keys.length];
        if (ids[author] === ids[video.channel]) continue;
        const createdAt = new Date(Date.now() - (k + 1) * 3_600_000 * (n + 2));
        const [comment] = await db
          .insert(comments)
          .values({ id: newId("cmt"), videoId: video.id, userId: ids[author], body: pick(COMMENTS, n + k * 3), createdAt })
          .returning();
        if (k === 0) {
          await db.insert(comments).values({
            id: newId("cmt"),
            videoId: video.id,
            userId: ids[video.channel],
            parentId: comment.id,
            body: pick(CREATOR_REPLIES, n),
            createdAt: new Date(createdAt.getTime() + 1_800_000),
          });
        }
      }
      n++;
    }
    await db.execute(sql`update videos set comment_count = (select count(*) from comments c where c.video_id = videos.id)`);

    // The director has liked and watched a few things, so their library is not empty.
    for (const video of published.filter((item) => item.channel !== "director").slice(0, 8)) {
      await db.insert(reactions).values({ userId: ids.director, videoId: video.id, value: 1 }).onConflictDoNothing();
      await db.update(videos).set({ likeCount: sql`${videos.likeCount} + 1` }).where(eq(videos.id, video.id));
      await db.insert(watchHistory).values({ userId: ids.director, videoId: video.id, positionSec: 3 }).onConflictDoNothing();
    }

    // Money: Neon Lotus sells both its series; Paper Moon has applied and waits
    // for a moderator. The director has topped up once and bought an episode
    // through Neon Lotus's own link, so every money screen has something on it.
    await db.insert(sellers).values([
      { userId: ids.neon, status: "approved", legalName: "Ploy Siriwan", promptpayId: "0812345678", birthDate: "1996-04-12", reviewedAt: new Date() },
      { userId: ids.paper, status: "pending", legalName: "Arthit Chaiyaporn", promptpayId: "0898765432", birthDate: "1990-09-30" },
    ]);
    await db.update(series).set({ onSale: true, freeEpisodes: 2, episodePrice: 30 }).where(eq(series.id, seriesIds.bkk));
    await db.update(series).set({ onSale: true, freeEpisodes: 1, episodePrice: 25, exclusiveSince: new Date() }).where(eq(series.id, seriesIds.love));
    const purchaseId = newId("pur");
    await db.insert(purchases).values({
      id: purchaseId,
      userId: ids.director,
      packId: "regular",
      credits: 300,
      bonusCredits: 15,
      amountSatang: 9_900,
      method: "promptpay",
      provider: "dev",
      providerRef: `seed_${purchaseId}`,
    });
    await grantPurchase(purchaseId, 9_900);
    const [bkk3] = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.seriesId, seriesIds.bkk), eq(videos.episodeNumber, 3)))
      .limit(1);
    if (bkk3) await unlockEpisode(ids.director, bkk3.id, withReferral({}, ids.neon), 30);

    console.log(`\nSeeded ${CHANNELS.length} channels and ${published.length} videos.`);
    console.log("Sign in as director@example.com / dramatube");
  } finally {
    await rm(work, { recursive: true, force: true });
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
