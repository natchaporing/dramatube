/**
 * The whole site, driven the way people use it, against a running server.
 *
 *   pnpm build && pnpm start &       # or pnpm dev
 *   BASE_URL=http://127.0.0.1:3000 pnpm e2e
 *
 * Two new accounts: a creator who uploads through the real upload page and
 * publishes through the API, and a viewer who watches, likes, comments,
 * subscribes, searches and reports. If the seeded operator account exists
 * (director@example.com / dramatube), the report is then taken down from the
 * moderation page. Needs ffmpeg, to make a video to upload.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { Browser, BrowserContext, Page } from "playwright";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "director@example.com", password: process.env.E2E_ADMIN_PASSWORD ?? "dramatube" };
const run = Date.now().toString(36);
let failures = 0;

function check(ok: unknown, label: string) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}

async function signUp(context: BrowserContext, name: string, handle: string) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login?mode=signup`);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="email"]', `${handle}@e2e.example`);
  await page.fill('input[name="password"]', "e2e-password");
  await page.click("form button.btn-primary");
  await page.waitForURL(`${BASE}/`);
  return page;
}

async function signIn(context: BrowserContext, email: string, password: string): Promise<Page | null> {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("form button.btn-primary");
  try {
    await page.waitForURL(`${BASE}/`, { timeout: 5000 });
    return page;
  } catch {
    return null;
  }
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), "dramatube-e2e-"));
  const clip = join(work, `e2e-${run}.mp4`);
  const made = spawnSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=s=640x360:rate=25:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=330:duration=4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip,
  ]);
  if (made.status !== 0) throw new Error("ffmpeg is needed to make the test video");

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
    const creator = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const viewer = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const pageErrors: string[] = [];
    for (const context of [creator, viewer]) {
      context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(`${page.url()}: ${error.message}`)));
    }

    console.log("creator signs up and uploads through the page");
    const c = await signUp(creator, `E2E Creator ${run}`, `e2ec${run}`);
    await c.goto(`${BASE}/upload`);
    await c.setInputFiles('[data-testid="video-file"]', clip);
    await c.waitForSelector('[data-testid="upload-done"]', { timeout: 60_000 });
    check(true, "the file streamed to /api/uploads");
    const title = `Moonlit Ferry ${run}`;
    await c.fill('input[name="title"]', title);
    await c.fill('textarea[name="description"]', "Made for the end-to-end check. 0:02 the turn.");
    await c.click('button:has-text("Veo")');
    await c.click('button:has-text("ElevenLabs")');
    await c.selectOption('select[name="category"]', "short-film");
    await c.click('button:has-text("Publish")');
    await c.waitForURL(/\/watch\/[A-Za-z0-9]{11}$/, { timeout: 60_000 });
    const videoId = c.url().split("/").pop()!;
    check(videoId.length === 11, `published as /watch/${videoId}`);
    check(await c.isVisible(`h1:has-text("${title}")`), "the watch page shows the title");
    check(await c.isVisible("text=This video was generated with AI."), "the AI disclosure is on the page");
    check(await c.isVisible('a:has-text("Veo")'), "the models are credited");
    const duration = await c.evaluate(() => {
      const video = document.querySelector("video");
      return new Promise<number>((resolve) => {
        if (!video) return resolve(0);
        if (video.readyState >= 1) return resolve(video.duration);
        video.addEventListener("loadedmetadata", () => resolve(video.duration), { once: true });
        setTimeout(() => resolve(video.duration || 0), 10_000);
      });
    });
    check(duration > 3 && duration < 5, `the browser can play it (${duration.toFixed(1)}s)`);

    console.log("viewer watches, likes, comments, subscribes");
    const v = await signUp(viewer, `E2E Viewer ${run}`, `e2ev${run}`);
    await v.goto(`${BASE}/watch/${videoId}`);
    await v.click('button[aria-label="Like"]');
    await v.waitForSelector('button[aria-label="Like"][aria-pressed="true"]');
    check(true, "like sticks");
    await v.click('button:has-text("Subscribe")');
    await v.waitForSelector('button:has-text("Subscribed")');
    check(true, "subscribe sticks");
    const comment = `Lovely ferry shot ${run}`;
    await v.click('textarea[name="body"]');
    await v.fill('textarea[name="body"]', comment);
    await v.click('button:has-text("Comment")');
    await v.waitForSelector(`text=${comment}`);
    check(true, "the comment appears");
    await v.reload();
    check(await v.isVisible(`text=${comment}`), "the comment survives a reload");
    check(await v.isVisible('button[aria-label="Like"][aria-pressed="true"]'), "the like survives a reload");

    const viewed = await v.evaluate(async (id) => (await fetch(`/api/videos/${id}/view`, { method: "POST" })).json(), videoId);
    check(viewed.counted === true, "a view counts once");
    const again = await v.evaluate(async (id) => (await fetch(`/api/videos/${id}/view`, { method: "POST" })).json(), videoId);
    check(again.counted === false, "…and the same viewer the same day does not count twice");

    await v.goto(`${BASE}/feed/subscriptions`);
    check(await v.isVisible(`text=${title}`), "the subscriptions feed has the creator's video");
    await v.goto(`${BASE}/search?q=${encodeURIComponent(`ferry ${run}`)}`);
    check(await v.isVisible(`text=${title}`), "search finds it by words in the title");
    await v.goto(`${BASE}/search?model=Veo`);
    check(await v.isVisible(`text=${title}`), "search finds it by the model that made it");

    console.log("viewer reports it");
    await v.goto(`${BASE}/watch/${videoId}`);
    await v.click('button:has-text("Report")');
    await v.check('input[value="undisclosed"]');
    await v.fill('textarea[maxlength="1000"]', "e2e report");
    await v.click('button:has-text("Send report")');
    await v.waitForSelector("text=A moderator will look at it");
    check(true, "the report is filed");

    console.log("creator publishes through the API");
    await c.goto(`${BASE}/studio/api`);
    await c.fill('input[name="name"]', "e2e");
    await c.click('button:has-text("Create token")');
    const token = await (await c.waitForSelector('[data-testid="new-token"]')).inputValue();
    check(token.startsWith("dtk_"), "a token is shown once");
    const auth = { Authorization: `Bearer ${token}` };
    const me = await (await fetch(`${BASE}/api/v1/me`, { headers: auth })).json();
    check(me.handle === `e2ec${run}`, "GET /api/v1/me knows whose token it is");
    const up = await fetch(`${BASE}/api/v1/uploads`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "video/mp4" },
      body: new Uint8Array(await readFile(clip)),
    });
    const { uploadId } = await up.json();
    check(up.status === 201 && uploadId, "POST /api/v1/uploads takes the raw bytes");
    const series = await (await fetch(`${BASE}/api/v1/series`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ title: `Ferry Tales ${run}` }) })).json();
    const pub = await fetch(`${BASE}/api/v1/videos`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId,
        title: `API episode ${run}`,
        visibility: "private",
        category: "drama",
        aiModels: ["veo", "Kling"],
        sourceApp: "DramaStudio",
        seriesId: series.id,
      }),
    });
    const apiVideo = await pub.json();
    check(pub.status === 201 && apiVideo.aiModels.join() === "Veo,Kling", "POST /api/v1/videos publishes and canonicalises models");
    check(apiVideo.episodeNumber === 1, "a video filed into a series without a number becomes episode 1");
    check(apiVideo.durationSec > 3 && apiVideo.width === 640, "ffprobe measured the upload");
    const reuse = await fetch(`${BASE}/api/v1/videos`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ uploadId, title: "again" }) });
    check(reuse.status === 404, "an upload publishes once");
    const notMine = await fetch(`${BASE}/api/v1/uploads`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: "not a token" });
    check(notMine.status === 401, "no token, no upload");
    const fake = await fetch(`${BASE}/api/v1/uploads`, { method: "POST", headers: { ...auth, "Content-Type": "video/mp4" }, body: "<html>not a video</html>" });
    check(fake.status === 415, "a file that is not a video is refused by its bytes");

    console.log("privacy");
    const anon = await browser.newContext();
    const a = await anon.newPage();
    await a.goto(`${BASE}/watch/${apiVideo.id}`);
    check(await a.isVisible("text=This video isn't available."), "a private video is hidden from strangers");
    await c.goto(`${BASE}/watch/${apiVideo.id}`);
    check(await c.isVisible(`h1:has-text("API episode ${run}")`), "…and visible to its owner");
    const ownerSrc = await c.getAttribute("video", "src");
    const media = await a.goto(`${BASE}${ownerSrc}`);
    check(media?.status() === 404, "its file is refused to a stranger too");
    const publicSrc = await (async () => {
      await c.goto(`${BASE}/watch/${videoId}`);
      return c.getAttribute("video", "src");
    })();
    const ranged = await fetch(`${BASE}${publicSrc}`, { headers: { Range: "bytes=0-1023" } });
    check(ranged.status === 206 && ranged.headers.get("content-range")?.startsWith("bytes 0-1023/"), "media answers Range requests");
    const embed = await fetch(`${BASE}/embed/${videoId}`);
    const watch = await fetch(`${BASE}/watch/${videoId}`);
    check(!embed.headers.get("x-frame-options") && watch.headers.get("x-frame-options") === "DENY", "only the embed player may be framed");

    console.log("language");
    await anon.addCookies([{ name: "dt_lang", value: "th", url: BASE }]);
    await a.goto(`${BASE}/`);
    check(await a.isVisible("text=หน้าแรก"), "Thai is Thai once chosen");

    console.log("moderation");
    const adminContext = await browser.newContext();
    const admin = await signIn(adminContext, ADMIN.email, ADMIN.password);
    if (!admin) {
      console.log(`  – skipped: no operator account ${ADMIN.email} (seed the database to include it)`);
    } else {
      await admin.goto(`${BASE}/admin`);
      const row = admin.locator("div.rounded-xl", { hasText: title }).first();
      if (await row.count()) {
        await row.locator('input[name="reason"]').fill("e2e takedown");
        await row.locator('button:has-text("Remove video")').click();
        await admin.waitForLoadState("networkidle");
        await v.goto(`${BASE}/watch/${videoId}`);
        check(await v.isVisible("text=This video isn't available."), "a removed video disappears for viewers");
        await c.goto(`${BASE}/watch/${videoId}`);
        check(await c.isVisible("text=e2e takedown"), "…and its owner is told why");
      } else {
        check(false, "the report reached the moderation queue (is the operator account the admin?)");
      }
    }

    console.log("cleanup");
    for (const id of [videoId, apiVideo.id]) {
      const gone = await fetch(`${BASE}/api/v1/videos/${id}`, { method: "DELETE", headers: auth });
      check(gone.status === 204, `DELETE /api/v1/videos/${id}`);
    }

    check(pageErrors.length === 0, `no uncaught errors in the browser${pageErrors.length ? `: ${pageErrors.join("; ")}` : ""}`);
  } finally {
    await browser?.close();
    await rm(work, { recursive: true, force: true });
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
