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
    // Tagged with the run, so each run's file is its own: DramaTube refuses
    // another channel's file, and an earlier run's may still be there.
    "-metadata", `comment=dramatube-e2e-${run}`,
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

    const forged = await v.evaluate(
      async (id) =>
        (await fetch(`/api/videos/${id}/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: "1.forged" }) })).json(),
      videoId,
    );
    check(forged.counted === false, "a view request without the page's ticket is not counted");
    const playAndCount = async () => {
      const response = v.waitForResponse((r) => r.url().endsWith(`/api/videos/${videoId}/view`) && r.request().method() === "POST", { timeout: 20_000 });
      await v.goto(`${BASE}/watch/${videoId}`);
      await v.evaluate(() => {
        const video = document.querySelector("video")!;
        video.muted = true;
        return video.play();
      });
      return (await (await response).json()).counted as boolean;
    };
    check((await playAndCount()) === true, "real playback counts a view");
    check((await playAndCount()) === false, "…once: the same viewer the same day does not count twice");
    const redirect = await viewer.request.get(`${BASE}/login?next=${encodeURIComponent("/\t/evil.example")}`, { maxRedirects: 0 });
    check(redirect.headers()["location"] === "/", "sign-in will not redirect to another site");

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

    console.log("series");
    const patched = await fetch(`${BASE}/api/v1/videos/${apiVideo.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "public" }),
    });
    check(patched.status === 200 && (await patched.json()).visibility === "public", "PATCH changes one field and keeps the rest");
    const listedSeries = (await (await fetch(`${BASE}/api/v1/series`, { headers: auth })).json()).series as Array<{ id: string; episodeCount: number }>;
    check(listedSeries.find((item) => item.id === series.id)?.episodeCount === 1, "the series counts its public episode");
    await a.goto(`${BASE}/@e2ec${run}?tab=series`);
    check(await a.isVisible(`text=Ferry Tales ${run}`), "the channel's Series tab lists it");
    await a.goto(`${BASE}/series/${series.id}`);
    check(await a.isVisible(`text=API episode ${run}`), "the series page lists the episode");
    const secretUpload = await (
      await fetch(`${BASE}/api/v1/uploads`, { method: "POST", headers: { ...auth, "Content-Type": "video/mp4" }, body: new Uint8Array(await readFile(clip)) })
    ).json();
    const secret = await (
      await fetch(`${BASE}/api/v1/videos`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: secretUpload.uploadId, title: `Secret episode ${run}`, visibility: "unlisted", seriesId: series.id }),
      })
    ).json();
    await a.goto(`${BASE}/watch/${apiVideo.id}`);
    check(!(await a.isVisible(`text=Secret episode ${run}`)), "an unlisted episode is not listed beside its public sibling");
    await a.goto(`${BASE}/watch/${secret.id}`);
    check(await a.isVisible(`h1:has-text("Secret episode ${run}")`), "…but plays for anyone with its link");

    console.log("dramas");
    // The creator shelves the series through the API: tropes, how long it runs, a poster.
    const posterFile = join(work, "poster.jpg");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xff4f6d:s=400x600", "-frames:v", "1", posterFile]);
    const shelved = await (
      await fetch(`${BASE}/api/v1/series/${series.id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          tropes: ["found family", "Werewolf", "Second Chance"],
          plannedEpisodes: 12,
          posterBase64: (await readFile(posterFile)).toString("base64"),
        }),
      })
    ).json();
    check(
      JSON.stringify(shelved.tropes) === JSON.stringify(["Found Family", "Second Chance"]) && shelved.plannedEpisodes === 12 && shelved.status === "ongoing",
      "the API shelves a series: known tropes only, episodes planned, the rest kept",
    );
    check(shelved.posterUrl && (await fetch(shelved.posterUrl)).status === 200, "…and its poster is served");
    const badSeries = await fetch(`${BASE}/api/v1/series/${series.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    check(badSeries.status === 422, "a status that is not ongoing or completed is refused");
    const patchSeries = (body: object) =>
      fetch(`${BASE}/api/v1/series/${series.id}`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const badPoster = await patchSeries({ posterBase64: "@@@@" });
    const kept = await (await fetch(`${BASE}/api/v1/series/${series.id}`, { headers: auth })).json();
    check(badPoster.status === 422 && kept.posterUrl === shelved.posterUrl, "a poster that is not an image is refused, and the old one stays");
    check((await patchSeries({ premiereAt: "9999-01-01" })).status === 422, "a premiere more than a year away is refused");
    await a.goto(`${BASE}/dramas?trope=found-family`);
    check((await a.locator(`[data-testid="series-poster"][href="/series/${series.id}"]`).count()) === 1, "the series is on its trope's shelf");
    await a.goto(`${BASE}/series/${series.id}`);
    check(await a.isVisible('[data-testid="episode-grid"]') && (await a.isVisible("text=EP 1 / 12")), "the series page counts episodes against the plan");

    await v.goto(`${BASE}/series/${series.id}`);
    await v.click('[data-testid="my-list-button"]');
    // The button answers at once; wait for the server to have saved it too.
    await v.waitForSelector('[data-testid="my-list-button"][aria-pressed="true"]:not([disabled])');
    await v.goto(`${BASE}/my-list`);
    check((await v.locator(`[data-testid="series-poster"][href="/series/${series.id}"]`).count()) === 1, "My List keeps a saved series");

    // The viewer stops a second into the episode: home offers to pick it up there.
    await v.evaluate(
      (id) => fetch(`/api/videos/${id}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: 1 }) }),
      apiVideo.id,
    );
    await v.goto(`${BASE}/`);
    check((await v.locator(`[data-testid="continue-shelf"] a[href="/watch/${apiVideo.id}"]`).count()) === 1, "Continue watching picks the series up at the viewer's episode");
    check(await v.isVisible('[data-testid="continue-bar"]'), "…and the Continue bar follows them");
    await v.click('[data-testid="continue-bar"] button');
    await v.goto(`${BASE}/dramas`);
    check(!(await v.isVisible('[data-testid="continue-bar"]')), "…until they close it");

    console.log("money");
    const paidEpisodes: string[] = [];
    await v.goto(`${BASE}/wallet`);
    const canPay = !(await v.isVisible("text=Top-ups aren't set up"));
    const moneyAdminContext = await browser.newContext();
    const moneyAdmin = canPay ? await signIn(moneyAdminContext, ADMIN.email, ADMIN.password) : null;
    if (!canPay || !moneyAdmin) {
      console.log(`  – skipped: needs ALLOW_DEV_PAYMENTS=1 on the server and the operator account ${ADMIN.email}`);
    } else {
      // The creator applies to sell; a moderator approves.
      await c.goto(`${BASE}/studio/earnings`);
      await c.fill('input[name="legalName"]', "Somchai Jaidee");
      await c.fill('input[name="promptpayId"]', "081-234-5678");
      await c.fill('input[name="birthDate"]', "1995-05-05");
      await c.click('[data-testid="apply-seller"]');
      await c.waitForSelector("text=Your application is being checked.");
      check(true, "a creator applies to sell");
      await moneyAdmin.goto(`${BASE}/admin`);
      await moneyAdmin.locator('[data-testid="seller-application"]', { hasText: `@e2ec${run}` }).locator('button:has-text("Approve")').click();
      await moneyAdmin.waitForLoadState("networkidle");
      await c.goto(`${BASE}/studio/earnings`);
      check(await c.isVisible("text=You're a verified seller."), "a moderator approves the seller");

      // Three public episodes join the series (it already has episode 1, and the unlisted episode 2).
      for (let i = 0; i < 3; i++) {
        const upload = await (
          await fetch(`${BASE}/api/v1/uploads`, { method: "POST", headers: { ...auth, "Content-Type": "video/mp4" }, body: new Uint8Array(await readFile(clip)) })
        ).json();
        const episode = await (
          await fetch(`${BASE}/api/v1/videos`, {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId: upload.uploadId, title: `Ferry Tales ${run} · part ${i + 3}`, visibility: "public", seriesId: series.id }),
          })
        ).json();
        paidEpisodes.push(episode.id);
      }
      const [ep3, ep4, ep5] = paidEpisodes;

      // The creator puts the series on sale: episode 1 free, 30 credits after that.
      await c.goto(`${BASE}/studio/series`);
      const card = c
        .locator("form", { has: c.locator(`input[name="seriesId"][value="${series.id}"]`) })
        .filter({ has: c.locator('[data-testid="on-sale"]') });
      await card.locator('[data-testid="on-sale"]').check();
      await card.locator('[data-testid="free-episodes"]').fill("1");
      await card.locator('[data-testid="save-pricing"]').click();
      await card.locator("text=Saved").waitFor();
      check(true, "the creator puts the series on sale");

      // A viewer meets the paywall, and the file itself is refused.
      await c.goto(`${BASE}/watch/${ep3}`);
      const ep3Src = await c.getAttribute("video", "src");
      await v.goto(`${BASE}/watch/${ep3}`);
      check(await v.isVisible('[data-testid="paywall"]'), "a paid episode shows the paywall");
      check((await viewer.request.get(`${BASE}${ep3Src}`)).status() === 403, "a locked episode's file is refused, not just hidden");
      await v.goto(`${BASE}/series/${series.id}`);
      check((await v.locator('[data-testid="lock-badge"]').count()) >= 3, "the series page marks the locked episodes");

      // Top up with the first-top-up offer, pay, come back, unlock.
      await v.goto(`${BASE}/watch/${ep3}`);
      await v.click('[data-testid="paywall"] a:has-text("Top up")');
      await v.waitForURL(/\/wallet\?return=/);
      await v.click('button:has-text("First top-up")');
      await v.click('form button.btn-primary:has-text("Pay")');
      await v.waitForURL(/\/wallet\/pay\//);
      await v.click('[data-testid="simulate-payment"]');
      await v.waitForSelector('[data-testid="payment-done"]');
      check(await v.isVisible("text=Your balance is now 90 credits."), "a ฿19 top-up adds 90 credits");
      await v.click("text=Back to the episode");
      await v.waitForURL(`${BASE}/watch/${ep3}`);
      await v.click('[data-testid="unlock-episode"]');
      await v.waitForSelector("video", { timeout: 15_000 });
      check(!(await v.isVisible('[data-testid="paywall"]')), "unlocking replaces the paywall with the player");
      check((await v.textContent('[data-testid="credits-chip"]'))?.trim() === "60", "30 credits were spent");
      check((await viewer.request.get(`${BASE}${ep3Src}`, { headers: { Range: "bytes=0-99" } })).status() === 206, "the buyer gets the file");

      // The rest of the series at once: episodes 4 and 5 at 70%.
      await v.goto(`${BASE}/watch/${ep4}`);
      await v.click('[data-testid="unlock-rest"]');
      await v.waitForSelector("video", { timeout: 15_000 });
      check((await v.textContent('[data-testid="credits-chip"]'))?.trim() === "18", "the rest of the series costs 42 credits, not 60");

      // Another viewer arrives through the creator's own link: a direct sale.
      const third = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const w = await signUp(third, `E2E Fan ${run}`, `e2ef${run}`);
      const refSent = w.waitForResponse((r) => r.url().endsWith("/api/ref"));
      await w.goto(`${BASE}/@e2ec${run}?ref=e2ec${run}`);
      check((await (await refSent).json()).recorded === true, "the creator's link is remembered");
      await w.goto(`${BASE}/wallet?return=${encodeURIComponent(`/watch/${ep3}`)}`);
      await w.click('button:has-text("315")');
      await w.click('form button.btn-primary:has-text("Pay")');
      await w.waitForURL(/\/wallet\/pay\//);
      await w.click('[data-testid="simulate-payment"]');
      await w.waitForSelector('[data-testid="payment-done"]');
      await w.click("text=Back to the episode");
      await w.click('[data-testid="unlock-episode"]');
      await w.waitForSelector("video", { timeout: 15_000 });
      check((await w.textContent('[data-testid="credits-chip"]'))?.trim() === "285", "bonus credits are spent first and the balance adds up");

      // What the creator sees.
      await c.goto(`${BASE}/studio/earnings`);
      const rows = await c.locator('[data-testid="sale-row"]').allTextContents();
      const credits = (await c.locator('[data-testid="sale-credits"]').allTextContents()).map(Number).sort((a, b) => a - b);
      check(JSON.stringify(credits) === JSON.stringify([8, 8, 12, 21]), `earnings: 12 + 8 + 8 discovered, 21 direct (got ${credits.join(", ")})`);
      check(rows.some((row) => row.includes("Your link")) && rows.filter((row) => row.includes("DramaTube")).length === 3, "each sale says where the viewer came from");
      check(await c.isVisible("text=Held until"), "new earnings are held for the refund window");

      // A moderator reviewing a paid episode is not asked to pay for it.
      await moneyAdmin.goto(`${BASE}/watch/${ep4}`);
      check(!(await moneyAdmin.isVisible('[data-testid="paywall"]')) && (await moneyAdmin.isVisible("video")), "a moderator watches a paid episode without buying it");

      // A ?ref= link reached from DramaTube's own pages is not the creator's own link.
      const refCalls: string[] = [];
      v.on("request", (request) => {
        if (request.url().endsWith("/api/ref")) refCalls.push(request.url());
      });
      await v.goto(`${BASE}/@e2ec${run}?ref=e2ec${run}`, { referer: `${BASE}/watch/${ep3}` });
      await v.waitForLoadState("networkidle");
      check(refCalls.length === 0, "a ?ref= link followed from inside DramaTube does not make sales direct");

      // The creator deletes a sold episode: its buyer gets the credits back.
      const gone = await fetch(`${BASE}/api/v1/videos/${ep5}`, { method: "DELETE", headers: auth });
      paidEpisodes.splice(paidEpisodes.indexOf(ep5), 1);
      await v.goto(`${BASE}/wallet`);
      check(gone.status === 204 && (await v.textContent('[data-testid="wallet-balance"]'))?.trim() === "39", "a deleted episode refunds its buyers (18 + 21)");
      await c.goto(`${BASE}/studio/earnings`);
      check(await c.isVisible("text=Refunded"), "…and reverses the creator's earning");

      // The price changes while a viewer has the paywall open: they are not charged the new price unseen.
      await w.goto(`${BASE}/watch/${ep4}`);
      await w.waitForSelector('[data-testid="unlock-episode"]:has-text("30 credits")');
      await c.goto(`${BASE}/studio/series`);
      const pricing = c
        .locator("form", { has: c.locator(`input[name="seriesId"][value="${series.id}"]`) })
        .filter({ has: c.locator('[data-testid="on-sale"]') });
      await pricing.locator('select[name="episodePrice"]').selectOption("35");
      await pricing.locator('[data-testid="save-pricing"]').click();
      await pricing.locator("text=Saved").waitFor();
      await w.click('[data-testid="unlock-episode"]');
      await w.waitForSelector("text=The price just changed.");
      check((await w.textContent('[data-testid="credits-chip"]'))?.trim() === "285", "a price changed under the viewer is refused, not charged");
      await w.waitForSelector('[data-testid="unlock-episode"]:has-text("35 credits")');
      await w.click('[data-testid="unlock-episode"]');
      await w.waitForSelector("video", { timeout: 15_000 });
      check((await w.textContent('[data-testid="credits-chip"]'))?.trim() === "250", "…and the new price, once shown, is what is charged");
      await third.close();

      console.log("protection");
      await v.goto(`${BASE}/watch/${ep3}`);
      check((await v.textContent('[data-testid="watermark"]'))?.includes(`@e2ev${run}`), "a bought episode carries its buyer's handle across the picture");
      check(
        (await v.getAttribute("video", "controlslist"))?.includes("nodownload") && (await v.getAttribute("video", "disablepictureinpicture")) !== null,
        "…with no download or picture-in-picture in the player",
      );
      // The same account signed in on two more browsers: the third is one too many.
      const second = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const thirdDevice = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await signIn(second, `e2ev${run}@e2e.example`, "e2e-password");
      const d3 = await signIn(thirdDevice, `e2ev${run}@e2e.example`, "e2e-password");
      const range = { headers: { Range: "bytes=0-99" } };
      check((await second.request.get(`${BASE}${ep3Src}`, range)).status() === 206, "a buyer streams on a second browser");
      check((await thirdDevice.request.get(`${BASE}${ep3Src}`, range)).status() === 409, "…but not a third at the same time");
      await d3!.goto(`${BASE}/watch/${ep3}`);
      await d3!.waitForSelector('[data-testid="too-many-devices"]', { timeout: 15_000 });
      await d3!.click('[data-testid="watch-here"]');
      await d3!.waitForSelector('[data-testid="too-many-devices"]', { state: "detached" });
      check((await thirdDevice.request.get(`${BASE}${ep3Src}`, range)).status() === 206, "…until it takes over from the others");
      await second.close();
      await thirdDevice.close();

      // Somebody else's file, uploaded as their own: refused before they type a word.
      await v.goto(`${BASE}/upload`);
      await v.setInputFiles('[data-testid="video-file"]', clip);
      await v.waitForSelector("text=already on DramaTube from another channel", { timeout: 60_000 });
      check(true, "uploading another channel's video file is refused");
    }
    await moneyAdminContext.close();

    console.log("language");
    await anon.addCookies([{ name: "dt_lang", value: "th", url: BASE }]);
    await a.goto(`${BASE}/`);
    check(await a.isVisible("text=หน้าแรก"), "Thai is Thai once chosen");

    console.log("phone");
    // Signed in, in Thai, on a 390px phone: nothing may be wider than the screen.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await phone.addCookies([...(await viewer.cookies()), { name: "dt_lang", value: "th", url: BASE }]);
    const p = await phone.newPage();
    const tooWide: string[] = [];
    for (const path of ["/", "/dramas", `/series/${series.id}`, `/watch/${apiVideo.id}`, "/my-list", "/wallet", "/feed/you"]) {
      await p.goto(`${BASE}${path}`);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) tooWide.push(`${path} (+${overflow}px)`);
    }
    check(tooWide.length === 0, `every page fits a phone${tooWide.length ? `: ${tooWide.join(", ")}` : ""}`);
    await phone.close();

    console.log("moderation");
    const adminContext = await browser.newContext();
    const admin = await signIn(adminContext, ADMIN.email, ADMIN.password);
    if (!admin) {
      console.log(`  – skipped: no operator account ${ADMIN.email} (seed the database to include it)`);
    } else {
      await fetch(`${BASE}/api/v1/videos/${apiVideo.id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "private" }),
      });
      await admin.goto(`${BASE}/watch/${apiVideo.id}`);
      check(await admin.isVisible("text=This video isn't available."), "a private video is its owner's alone, moderators included");
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
    for (const id of [videoId, apiVideo.id, secret.id, ...paidEpisodes]) {
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
