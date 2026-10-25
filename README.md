# DramaTube

A video platform for AI creators. People upload the films, series and music
videos they make with AI models; viewers watch, subscribe, like, comment and
search. It works like the video sites everybody already knows, with one
difference: **every video says how it was made.**

It is the sister product to [DramaStudio](https://github.com/natchaporing/dramastudio.ai),
which makes the films. DramaStudio's own strategy notes name the missing half
of the business as "a viewer app … not in this repository". This is that app.

---

## Why it is shaped this way

**The disclosure is a column, not a tag.** Each video records whether the
picture was *generated* by models or made by a person with AI *assisting*,
which models were used, and (if the creator chooses) the prompt. The upload
form puts this in its own panel and the watch page shows it inside the
description box rather than under the fold. Model names are canonicalised —
`veo`, `VEO` and `Veo` are one filter — so "show me everything made with
Kling" is a real query (`/search?model=Kling`) and not a hopeful keyword
search. Violet is spent on exactly this and nothing else in the interface,
so the disclosure is never mistaken for decoration.

**Vertical is first-class.** AI micro-drama is shot 9:16. A tall video is
never letterboxed into a wide slot: the home page gives tall videos their own
shelf, there is a full-screen snapping feed at `/vertical`, the watch page sizes
the player to the picture, and a tall thumbnail in a wide card fills its bars
with a blurred copy of itself. "Tall" is decided from the file's own
dimensions, as ffprobe reads them, including a phone's rotation flag.

**Series are how drama is watched.** A series keeps its episodes in order,
shows them in a panel beside the player, and rolls into the next episode when
one ends (with a five-second countdown and a cancel button). Filing a video
into a series without an episode number makes it the next episode.

**Tools publish, not just people.** A creator can make a personal API token
and publish in two calls — the raw file, then its details. That is how
DramaStudio gets a "Publish" button, and how a render farm or a script can
post an episode when it finishes. The browser upload page uses exactly the
same two functions underneath, so the API cannot drift from the site.

**Views mean something.** A view counts after real playback (30% of the
video, between two and ten seconds), once per viewer per video per day, and
the server decides that rather than trusting the player:

- The watch page hands the player a signed ticket, and a view counts only once
  the ticket is old enough for the playback rule to have been met.
- A signed-out viewer is an id the server issued and signed. A cookie it did
  not sign is ignored, so nobody can choose their own key or borrow someone
  else's.
- Anonymous views of one video from one network count at most twenty times a
  day. Twenty, because mobile carriers put many real people behind one
  address.

The de-duplication is a primary key, and the counter on the video moves in the
same transaction as the row, so the two can never disagree. Likes, comments and
subscribers work the same way.

---

## Running it

Needs Node 22+, Postgres 16, and ideally ffmpeg (see below).

```bash
pnpm install
cp .env.example .env.local     # set DATABASE_URL and AUTH_SECRET
pnpm db:migrate
pnpm db:seed                   # six channels and twenty videos to look at
pnpm dev
```

Sign in as `director@example.com` / `dramatube` (the site's moderator). The
other seeded channels (`neon@`, `paper@`, `synth@`, `kaiju@`, `school@` at
`example.com`) use the same password.

The seed draws its videos with ffmpeg — fractals, gradients and cellular
automata with a title over them — and pushes each one through the real upload
and publish pipeline, so seeding also proves that pipeline works. Its view,
like and subscriber counts are invented so the feeds look lived-in; they are
demo data. `SEED_RESET=1 pnpm db:seed` empties every table and seeds again.

```bash
pnpm test        # unit tests: parsing, ranges, sniffing, i18n completeness, redirects
pnpm typecheck
pnpm lint
pnpm e2e         # drives a running server in a real browser (see below)
pnpm money-check # the money rules against the database: races, refunds, reversals
```

`pnpm e2e` signs up a creator and a viewer and walks the site the way people
use it: upload through the page, publish, play, like, subscribe, comment,
count a view once and only once, find the video by its title and by the model
that made it, report it, publish a private episode through the API, prove a
stranger cannot see the private one or fetch its file, check Range requests
and framing headers, switch to Thai, and — if the seeded operator exists —
take the reported video down from the moderation page. It cleans up after
itself.

```bash
pnpm build && pnpm start &
BASE_URL=http://127.0.0.1:3000 pnpm e2e
```

Set `E2E_CHROMIUM` to a Chromium binary if Playwright's own download is not
where it expects.

---

## Publishing from DramaStudio (or anything else)

**Studio → API & publishing** creates a token (`dtk_…`). It is shown once;
only its SHA-256 is stored.

```bash
# 1. Send the file — the raw bytes, not a multipart form
curl -X POST "$DRAMATUBE/api/v1/uploads" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: video/mp4" \
  --data-binary @episode-01.mp4
# → { "uploadId": "upl_…", "byteSize": …, "mimeType": "video/mp4" }

# 2. Publish it
curl -X POST "$DRAMATUBE/api/v1/videos" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "uploadId": "upl_…", "title": "The Salt Line — Episode 1",
        "visibility": "public", "category": "drama",
        "aiUsage": "generated", "aiModels": ["Veo", "ElevenLabs"],
        "seriesId": "ser_…", "sourceApp": "DramaStudio" }'
# → { "id": "…", "url": "https://…/watch/…", "embedUrl": "…", … }
```

| Route | Does |
|---|---|
| `GET /api/v1/me` | Whose token this is, and their channel URL |
| `POST /api/v1/uploads` | Raw video bytes in, `uploadId` out |
| `POST /api/v1/videos` | Publish an upload. Only `uploadId` and `title` are required. `thumbnailBase64` optional |
| `GET /api/v1/videos` | Your videos, newest first |
| `GET/PATCH/DELETE /api/v1/videos/:id` | Read, change (fields left out keep their values), delete |
| `GET/POST /api/v1/series` | List your series; create one with `{ title, description }` |

An upload publishes once: publishing claims it first, so a double click or a
retrying client makes one video, not two. An account can have three uploads
waiting at a time (the fourth gets 429), and uploads nobody publishes within
six hours are deleted, along with any half-written file a crash left behind.
Errors come back as `{ "error": { "code", "detail" } }` with a status that
fits: 401 no token, 404 unknown upload, 413 too large, 415 not a video, 422
invalid fields, 429 too many uploads waiting.

---

## Media

**What arrives is checked by its bytes, not its name.** The upload is
streamed straight to disk — never held in memory, whatever its size — and
refused the moment it passes `UPLOAD_MAX_MB`. Its first bytes must be an MP4,
QuickTime or WebM container. When ffprobe is installed it is the authority:
a file with no picture in it is refused, and duration and size are measured
rather than taken from the browser.

**ffmpeg is optional but worth having.** With it, an MP4 or MOV is rewritten
with its index at the front (no re-encode) so playback starts before the
download finishes, a QuickTime file comes out as MP4 — which is what every
browser plays — and a video uploaded through the API without a thumbnail gets
one cut from it. Without it, the browser's reading of the file is used, and
the upload page still cuts three candidate thumbnails in the browser.
`nixpacks.toml` installs it on Railway.

**Storage** is a local directory (`STORAGE_DRIVER=local`, the default) or any
S3-compatible bucket (`STORAGE_DRIVER=s3`). Use Cloudflare R2 for anything
real: video egress is free there and is otherwise the biggest bill a video
site has. On a container host, a local directory must be a mounted volume or
every deploy deletes the library.

**Privacy is enforced on the files, not just the pages.** Media is served from
`/api/media/…`, which answers Range requests (so seeking works) and checks the
video before sending a byte. A private video's file and thumbnail answer only
to its owner, moderators included. A removed one answers to its owner and the
moderators. A public video's files are cached for five minutes. Anything else
is `private, no-store`, so a video made private or taken down stops being
served from a CDN within minutes. With an S3 bucket
the route redirects to a short-lived signed URL after the same check. Setting
`S3_PUBLIC_BASE_URL` serves files straight from a public bucket instead —
faster, but then unguessable keys are the only thing between a private video
and the internet.

There is no transcoding. A file plays if the viewer's browser plays it, which
for H.264 MP4 is every browser. Adaptive streaming (HLS renditions) is the
first thing to build when real traffic arrives; see below.

---

## Selling episodes

The plan behind this is in [`docs/MONETIZATION.md`](docs/MONETIZATION.md);
this is how the built part works.

**Viewers buy credits and spend them.** Packs run from a once-per-account
฿19 first top-up (90 credits) to ฿999 (3,600). Credits are kept as lots:
bought credits never expire, bonus credits expire after 90 days and are
spent first. Every movement writes a ledger line, which is the wallet's
history page.

**Payments are hybrid.** PromptPay goes through Omise as a QR on our own pay
page; cards go through Stripe Checkout. Each covers for the other: with no
Omise key Stripe takes PromptPay too. With neither, the wallet says top-ups
are not set up. A payment is believed only after asking the provider
directly — the webhook is a prompt, not proof — and the credits granted are
the ones written on the purchase row before the viewer paid, granted once
however often a provider repeats itself. `ALLOW_DEV_PAYMENTS=1` adds a
"simulate payment" button for development and the e2e check; never set it in
production.

**Creators sell series.** A creator applies to sell (legal name, PromptPay
number, date of birth, 20 or older) and a moderator approves. They then put a
series on sale from Studio → Series: how many episodes are free, the price
per episode (10–60 credits), what the rest of the series costs at once
(50–100% of buying one by one, for two or more episodes), and optionally
exclusivity for ten more points of share. Exclusivity covers a series' first
90 days from its first episode: it can be switched on inside that window,
not switched off before it ends, and not started again.

**A sale is at the price the buyer saw.** The paywall sends the price on its
button (and, for the rest of a series, which episodes and the total); the
sale goes through only if that is still the price, with the series row locked
so a price change waits for it. Otherwise the viewer is told the price
changed and shown the new one.

**The paywall is on the file.** A locked episode's page shows the paywall,
and the media route refuses its file to anyone who has not bought it, so a
copied file address does not get round it. Paid files are never given a
shared-cache header. The vertical feed leaves locked episodes out, and an
embed sends the viewer to DramaTube to buy. Moderators are never locked out,
so reviewing a reported episode does not pay the creator reported.
**Selling needs a private bucket**: video files always go through the checked
route, but with a public bucket a file's address is a permanent free copy.
With `S3_PUBLIC_BASE_URL` set, a series cannot go on sale unless
`S3_VIDEOS_PRIVATE=1` says the `videos/` prefix is not publicly readable.

**Who brought the viewer decides the share.** A creator's own links carry
`?ref=<handle>`; a viewer who arrives through one from outside DramaTube buys
from that creator at 70% for 30 days (remembered in a signed cookie and on
the account). Every other sale is 40%, and exclusive series add ten points to
both. A `?ref=` link followed from a DramaTube page does not count, and
links back into the site in descriptions, comments and bios lose their
`?ref=`, so a creator cannot claim viewers DramaTube found. Shares are rounded
down to the credit. The Studio earnings page shows each sale's source.

**Getting paid.** Earnings are held 14 days, the refund window, then can be
cashed out from ฿500 at ฿0.30 a credit. A payout request copies the seller's
PromptPay number at that moment; a moderator sends the transfer and marks it
paid with its reference on the Moderation page. An approved seller cannot
re-apply (it would take their series off sale); changing a payout account
goes through support for now.

**Undoing a sale.** If a sold episode is removed, deleted or made private,
every buyer gets their credits back, into the lots they came from (so bonus
credits keep their expiry). If money goes back to a card — a refund or a
dispute — the credits it bought are taken back, and so is every episode bought
with them; one that arrives before the payment was confirmed stops the grant.
Either way the creator's sale is reversed if no payout has claimed it yet, or
comes off their next payout as a clawback if one has. Each unlock records
which top-ups paid for it, which is what makes this exact.

Neither gateway is reachable from CI, so both adapters are written to their
documentation and are untested against a live account: the Stripe webhook's
signature check and the choice of provider are unit-tested, the whole flow
from top-up to payout request is exercised end to end against the stand-in,
and `pnpm money-check` runs the rules a browser cannot see — concurrent
purchases, refunds after payout, card reversals, the ledger adding up to the
balance — against the database. Try one real ฿19 top-up on each method
before launch.

---

## Accounts, channels, moderation

One account is one channel, at `/@handle`. Handles are ASCII on purpose — they
are typed into address bars and read aloud, and look-alike scripts are how
impersonation works — while names, descriptions and everything else take Thai
or any other script.

**Nobody becomes a moderator by signing up.** Accounts are not
email-verified, so "the first account" or "whoever registers this address"
would hand moderation to whoever got there first; on a fresh deploy, anyone can
enter that race. The operator grants the role from a shell on the server once
their account exists:

```bash
pnpm admin:grant you@example.com     # also: admin:revoke, admin:list
railway run pnpm admin:grant you@example.com   # on Railway
```

Viewers report a video
with a reason (including "AI use not disclosed" and "presents fiction as real
news"); reports group by video on **Moderation**, most-reported first. Removing
a video hides it everywhere and tells its owner why on the watch page and in
Studio; it can be restored.

Signing in is required to like, comment, subscribe or report — an anonymous
report button is a spam cannon aimed at the moderators.

---

## Languages

English and Thai, chosen from the browser and changeable from the top bar. The
Thai dictionary is typed against the English one, so a new string that is not
translated fails the typecheck, and a unit test checks every placeholder
survives translation. Search matches substrings rather than words, because
Thai is written without spaces between words and a word index finds nothing
in it.

---

## Deploying

`railway.json` runs migrations and then the server, and health-checks
`/api/health`. Set `DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_APP_URL` and the
storage variables, then sign up and grant yourself the moderator role with
`pnpm admin:grant`. Video files never pass through a Server Action
(those are capped at 12 MB for thumbnails and channel art); they stream to
`/api/uploads`, so put no proxy body-size limit in front of that route that is
smaller than `UPLOAD_MAX_MB`.

---

## Not built yet

In rough order of what real traffic would demand first:

1. **Adaptive streaming.** Transcode uploads to HLS renditions in a worker.
   Today the original file is served as-is.
2. **Rate limits** on sign-up, comments and reports. Uploads are capped per
   account, but nothing stops one person making many accounts.
3. **Email verification and password reset.**
4. **Automated payouts.** Payout requests are sent by hand from the
   Moderation page today; a payout API (Omise transfers) would do it.
5. **Spending earnings on DramaStudio renders at 1.2×**, and a "Publish to
   DramaTube" button in DramaStudio using the API above.
6. **Membership per creator** (phase 2 in the plan), charged from the wallet.
7. **Recommendations** beyond "same series, same channel, same category,
   trending", and **notifications** when a subscribed channel publishes.
8. **Captions** (WebVTT tracks; DramaStudio already has the dialogue).
9. **Provenance metadata** (C2PA) read from uploads and shown beside the
   creator's own disclosure.
