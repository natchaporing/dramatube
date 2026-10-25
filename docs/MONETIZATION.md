# Making money: episode unlocks, packages, creator share

The model: viewers buy credits and spend them to unlock episodes. Every unlock
is split between the creator and the platform.

> **One thing to settle first.** "Creator gets 30%" and "30 credits → creator
> 10, platform 20" are different numbers. 10 of 30 is **33.3%**; 30% of 30
> would be 9. This plan uses **one credit in three** (10 of 30). That matches
> the example and is the easier sentence to tell a creator. If 30% is the real
> intention, change one number, `CREATOR_SHARE`, and every table below scales.

Two confidence levels, as in DramaStudio's `docs/PRICING.md`: **[H]** is
arithmetic on numbers chosen here. **[M]** is market pricing from secondary
sources (October 2026). It points the right way but should be checked before
launch.

---

## 1. The credit

**One credit, two products.** A DramaTube credit is the same unit as a
DramaStudio credit: one US cent, about **฿0.33**. That matters for three reasons:

- A creator's earnings can be spent rendering the next episode in DramaStudio
  with no conversion. This is the flywheel: *earn on DramaTube, make on
  DramaStudio.*
- Paying a creator in render credits costs the platform far less than paying
  cash. DramaStudio sells renders at a 60% gross margin, so 10 credits spent on
  rendering costs about 4 credits of real provider cost [H].
- A viewer who becomes a creator already has a wallet.

**Episode price: 30 credits ≈ ฿10.** That is cheaper than the incumbent
micro-drama apps. ReelShort charges roughly 50–60 coins an episode on a
$4.99/500-coin pack (about $0.50–0.60), and finishing a series there runs
$28–47 [M]. Being cheaper is deliberate: AI production costs a fraction of a
filmed drama, and the platform is new and has to win viewers.

---

## 2. Viewer packages

### Top-up packs

Base rate **฿1 = 3 credits**, with a bonus that grows with the pack.

| Pack | Price | Credits | Bonus | Total | Episodes at 30 | ฿ per credit |
|---|---:|---:|---:|---:|---:|---:|
| First top-up (once per account) | **฿19** | 90 | — | 90 | 3 | 0.211 |
| Taster | ฿49 | 150 | — | 150 | 5 | 0.327 |
| Regular | ฿99 | 300 | +15 (5%) | 315 | 10 | 0.314 |
| Binge | ฿199 | 600 | +60 (10%) | 660 | 22 | 0.302 |
| Super fan | ฿499 | 1,500 | +225 (15%) | 1,725 | 57 | 0.289 |
| Whale | ฿999 | 3,000 | +600 (20%) | 3,600 | 120 | 0.278 |

- **Bought credits never expire. Bonus credits expire after 90 days.** This is
  universal across credit products, and it is what people expect [M].
- **The first top-up at ฿19 is the most important price on the page.** It
  turns a free viewer into a paying one for less than a coffee. Making it
  once per account limits what it costs the platform.

### Plus membership (monthly)

| | **DramaTube Plus** |
|---|---|
| Monthly | **฿149** |
| Yearly | **฿1,490** (two months free) |
| Credits each month | 450 (expire at the end of the month) |
| Unlock discount | **20% off every episode** (24 instead of 30), including with bought credits |
| Early access | New episodes 24 hours before everyone else |
| Daily check-in | Doubled |
| Badge | Plus badge beside comments |

With the discount, the 450 monthly credits unlock about 19 episodes, against
15 at full price. **The creator is paid as if the viewer paid full price.** The
discount comes out of the platform's share, so a creator never earns less
because their viewer subscribed.

### Series pass

The creator can offer the rest of a series at a discount; the suggested
default is **70% of the remaining episodes' price**. A 34-episode paywall at
30 credits is 1,020 credits one by one, or **714** as a pass. The creator gets
one third of whatever was paid. A pass is a binge viewer's best deal, and
selling every episode in one decision is a creator's best deal.

### Free ways in

| Path | What the viewer gets | Rule |
|---|---|---|
| Free episodes | The first episodes of every series | At least 1, recommended 5–10. The creator sets where the paywall lands, and DramaStudio already plans this per episode |
| Daily check-in | 3 credits a day, plus 15 on day 7 | About one free episode a week. These are bonus credits and expire in 7 days |
| Unlocks are permanent | Rewatch forever | No rental |

---

## 3. What happens to 30 credits

### The headline split

| | Credits | ≈ Baht |
|---|---:|---:|
| Viewer spends | 30 | ฿10.00 at the base rate |
| **Creator earns** | **10** | **฿3.00** (paid out at ฿0.30 per credit) |
| Platform keeps | 20 | ≈ ฿6.67 before costs |

### What the platform really keeps [H]

The platform's 20 credits are not all profit. VAT and payment fees come out of
them, and so do bonus credits, because the creator is paid on every unlock
whichever credits it used.

| Per paid unlock (web payment) | Base pack (฿99) | Biggest pack (฿999) |
|---|---:|---:|
| Cash behind 30 credits | ฿9.43 | ฿8.33 |
| − VAT 7% (prices include it) | −฿0.62 | −฿0.54 |
| − Payment fee (~2%, PromptPay/cards blended) | −฿0.19 | −฿0.17 |
| Net revenue | ฿8.62 | ฿7.61 |
| − Creator (10 credits × ฿0.30) | −฿3.00 | −฿3.00 |
| **Platform keeps** | **฿5.62 (65%)** | **฿4.61 (61%)** |

Hosting is close to zero by comparison. A 90-second 720p episode is about
40 MB, and Cloudflare R2 charges nothing for egress.

**An unlock paid with free credits costs the platform the creator's ฿3.00.**
That is why the first top-up is once per account, check-in credits are small
and expire in seven days, and bonus credits expire in 90. If free credits stay
under about 20% of all credits spent, the platform keeps roughly ฿3–4 per
unlock across everything.

**App stores change the arithmetic.** Credits bought inside an iPhone or
Android app pay the store 15–30%. At 30%, the platform keeps about ฿2.5–3 per paid
unlock. Sell on the web first: PromptPay is the habit in Thailand, and it
costs about a percent through a Thai gateway. In the apps, give fewer credits
per baht than on the web, as most credit apps do, and check each store's
current rules before launch.

---

## 4. Creator packages

Joining is free and nothing is charged to upload. Creators are the supply side
of a new platform, and charging them shrinks the catalogue at the moment it
most needs to grow.

| | **Creator** | **Partner** | **Partner Exclusive** |
|---|---|---|---|
| Who | Anyone | Applies and is approved | A Partner whose series is exclusive to DramaTube for its first 90 days |
| Requirements | — | One series with at least 5 episodes; every video's AI disclosure filled in; ID verified, age 20 or over (the Thai age of majority); bank or PromptPay account; no upheld strikes | Same, plus the exclusivity commitment per series |
| Paywall | No: everything is free | Yes | Yes |
| **Share per unlock** | — | **1 in 3: 10 of every 30 credits** | **2 in 5: 12 of every 30 credits** |
| Episode price | — | Chosen from 10–60 credits in steps of 5; 30 suggested for 1–2 minute episodes | Same |
| Series pass | — | Yes | Yes |
| Promotion | Search and feeds | Eligible for the home page shelf | A featured launch slot for each new series |

### Getting paid

- **Earnings arrive in credits**, with their baht value shown beside them
  (฿0.30 each).
- **A 14-day hold** before earnings become available. It covers refunds,
  meaning episodes that fail to play or are removed by a moderator, and payment
  disputes.
- **Cash out** once a month when the balance is at least ฿500 (1,667 credits,
  about 167 unlocks), by PromptPay or bank transfer. Withholding tax and
  e-tax receipts follow Thai rules, so confirm the treatment of creator income
  with an accountant before the first payout.
- **Or spend earnings in DramaStudio at 1.2×**, any time and with no minimum:
  10 earned credits buy 12 render credits. That is a better deal for the
  creator than cash. It also costs the platform about half as much as a cash
  payout, because render credits carry a 60% margin [H].

### DramaStudio bundle

A creator on any paid DramaStudio plan gets **Partner fast-track**: review
inside 48 hours, and the 5-episode minimum waived for their first series.
Publishing goes straight from DramaStudio through the API, which already
exists.

---

## 5. A worked example (illustrative, not a forecast)

The numbers below are assumptions chosen to show the mechanics. Replace them
with real funnel data as soon as there is any.

A 40-episode drama of 90-second episodes. Episodes 1–6 are free and 34 are
paid at 30 credits.

| Step | Assumption | People |
|---|---|---:|
| Watch episode 1 | — | 50,000 |
| Reach the paywall | 20% | 10,000 |
| Pay for at least one episode | 8% of those | 800 |
| Paid episodes per payer, on average | 20 | 16,000 unlocks |

| | Credits | ≈ Baht |
|---|---:|---:|
| Viewers spend | 480,000 | ≈ ฿115,000 in cash (if 20% were free credits and packs average ฿0.30 a credit) |
| **Creator earns** | **160,000** | **฿48,000 cash**, or 192,000 DramaStudio credits |
| Platform keeps, after VAT, fees and the creator | — | ≈ ฿57,000 |

**Can it pay for the next season?** From DramaStudio's own price list [H], one
finished minute costs about 1,170 credits on Seedance 1.5 Pro and about 5,940
on Veo 3.1 Fast. This series is 60 minutes long:

| Rendered on | Next season costs | Earnings above cover it |
|---|---:|---:|
| Seedance 1.5 Pro | ≈ 70,000 credits | **2.7×** |
| Veo 3.1 Fast | ≈ 356,000 credits | 0.5× |

A creator on the cheaper model funds the next season and keeps the rest. A
creator on the premium model needs about twice this audience. That is worth
saying plainly in the creator help pages.

---

## 6. Phase 2: unlimited weekly pass

The incumbents' biggest earner is an all-you-can-watch weekly pass: about
$15–20 a week at ReelShort and DramaBox [M]. A Thai launch price would be
around **฿99 a week**. Build it after the per-unlock model works, because it
needs a payout pool:

- **One third of net pass revenue goes into the creator pool** each week,
  matching the per-unlock share.
- The pool is split by **counted views from pass holders**: playback past 30%
  of the episode or ten seconds, once per viewer per episode per day. DramaTube
  already counts views exactly this way.
- Creators see pool earnings as a separate line, so per-unlock income stays
  easy to read.

---

## 7. What has to be built

In order:

1. **Wallet and ledger.** An append-only credit ledger with separate bought,
   bonus and earned balances, and expiry on bonus credits. DramaStudio's
   ledger is the model to copy.
2. **Packs and checkout.** Stripe Checkout or a Thai gateway with PromptPay.
   The webhook grants credits idempotently, as DramaStudio's already does.
3. **The paywall.** A per-series free-episode count, a per-episode price,
   unlock records, and a check in the media route so a locked episode's file
   is refused, not just its page.
4. **Creator earnings.** Each unlock writes the creator's share to the ledger
   in the same transaction, with the 14-day hold and an earnings page in
   Studio.
5. **Partner application and payouts.** ID check, bank or PromptPay details, a
   monthly payout run, and a "spend in DramaStudio" button.
6. **Plus membership.** Then the series pass. Then the weekly pass with its
   pool.

The single most important rule for all of it: **the media route enforces the
paywall.** A paywall that only hides the play button is a paywall anyone with
the file's URL walks through.

---

Sources [M]:
[geekvibesnation: cost to finish a short drama](https://geekvibesnation.com/cost-to-finish-short-drama/) ·
[qwe.edu.pl: short drama app pricing](https://www.qwe.edu.pl/tutorial/short-drama-app-free/) ·
[qwe.edu.pl: no-paywall short drama](https://www.qwe.edu.pl/tutorial/no-paywall-short-drama/) ·
[Stripe: payment gateway fees in Thailand](https://stripe.com/resources/more/payment-gateway-fees-thailand)
