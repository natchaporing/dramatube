# Business model: a marketplace on a credit wallet

**For:** local creators who want to sell what they make.
**The question:** credits (pay per episode) or a subscription?
**The answer:** both are needed, but in this order — **credits first, as the
wallet and the way an episode is sold; a subscription per creator second;
a platform-wide unlimited plan last, and only if the catalogue earns it.**

Two confidence levels, as in DramaStudio's `docs/PRICING.md`: **[H]** is
arithmetic on numbers chosen here. **[M]** is market information from
secondary sources (October 2026), right in direction but worth checking
before launch.

---

## 1. Why not a subscription first

Four reasons, each enough on its own.

1. **A creator selling a production needs a sale.** "Your episode sold 1,200
   times at ฿10" is a sentence a creator understands, can put in a pitch, and
   can plan a season around. "Your share of this month's pool was ฿3,100" is
   not: it depends on what everyone else did, and it changes when the platform
   changes a formula. A marketplace pays per sale.
2. **A new catalogue cannot sell "unlimited".** Unlimited is worth paying for
   when there is more to watch than a month holds. With fifty series it is a
   smaller promise than DramaBox makes, at the same price.
3. **PromptPay cannot bill next month.** It is a one-off QR payment; Stripe,
   Rapyd and Airwallex all list recurring as unsupported for it [M]. A
   subscription in Thailand therefore means a card, which fewer people have
   and trust, or an app-store subscription, which pays the store 15–30%
   first. A wallet topped up by QR is the Thai-native rail, and it makes
   every later product — memberships included — payable by PromptPay.
4. **Pools invite fraud and arguments.** A shared pot split by watch time
   pays whoever generates the most plays, real or not, and every creator
   suspects the formula. Per-sale money has neither problem.

Credits are not the business model. They are the **wallet**: top up once by
QR, spend many times, because a ฿10 payment cannot carry a per-transaction
fee. The model is **creators set prices and sell**.

---

## 2. The credit

**One credit = $0.01 ≈ ฿0.33**, the same unit DramaStudio renders with.
A creator's earnings can be spent on the next season in DramaStudio with no
conversion, and paying creators in render credits costs the platform about
half what cash does, because renders carry a 60% gross margin [H].

The suggested episode price is **30 credits ≈ ฿10**, cheaper than
ReelShort's roughly $0.50–0.60 an episode [M]. AI production costs a fraction
of a film crew, and a new platform wins viewers on price.

---

## 3. Viewer packs

Base rate **฿1 = 3 credits**, with a bonus that grows with the pack.

| Pack | Price | Credits | Bonus | Total | Episodes at 30 | ฿ per credit |
|---|---:|---:|---:|---:|---:|---:|
| First top-up (once per account) | **฿19** | 90 | — | 90 | 3 | 0.211 |
| Taster | ฿49 | 150 | — | 150 | 5 | 0.327 |
| Regular | ฿99 | 300 | +15 (5%) | 315 | 10 | 0.314 |
| Binge | ฿199 | 600 | +60 (10%) | 660 | 22 | 0.302 |
| Super fan | ฿499 | 1,500 | +225 (15%) | 1,725 | 57 | 0.289 |
| Whale | ฿999 | 3,000 | +600 (20%) | 3,600 | 120 | 0.278 |

- **Bought credits never expire. Bonus credits expire after 90 days.**
- **The ฿19 first top-up is the most important price on the page:** a free
  viewer becomes a paying one for less than a coffee. Once per account.
- **No daily free credits at launch.** DramaBox gives them because ads pay
  for its free viewers; here every free credit spent on an episode is money
  owed to a creator. Free sampling is the creator's decision instead: the
  first episodes of every series are free (at least one, 5–10 recommended).
- **Unlocks are permanent.** No rental.

---

## 4. What a creator sells

The creator sets the prices, inside limits, from Studio or through the API.

| | Default | Range |
|---|---|---|
| Free episodes at the start of a series | 5 | 1 or more |
| Price per episode | 30 credits | 10–60, in steps of 5 |
| Whole-series price (the rest of the series at once) | 70% of the remaining episodes | 50–100% |
| Early window (phase 2) | — | New episodes unlock-only for 7 days before members see them |

A whole-series price is how a creator sells a *production* rather than ten
episodes: one decision for the viewer, one sale for the creator.

---

## 5. The split: it depends on who brought the viewer

A new platform has no audience. At launch, creators bring their own viewers
by sharing links; later, DramaTube's home page, search and feeds bring
viewers to creators. Those are different services and are charged
differently — the same way Gumroad charges 10% on sales a creator brings and
30% on sales its marketplace makes [M].

Every unlock is attributed. A viewer who arrived through the creator's own
share link (`/@handle?ref` or any link the creator copies from Studio) is
**direct** for 30 days; anyone else is **discovered**.

| Sale | Creator keeps | Platform keeps | Why |
|---|---:|---:|---|
| **Direct** — the viewer came from the creator's own link | **70%** | 30% | The platform hosted, played and took the payment |
| **Discovered** — DramaTube's home, search, feed or another page found the viewer | **40%** | 60% | The platform also found the customer |
| Partner Exclusive (series exclusive to DramaTube for 90 days) | +10 points on either | | |

The headline to creators: **"Bring your own fans and keep 70%. We find you
new ones and you keep 40%."** It also aligns the incentive exactly right: a
creator who promotes earns more, and the platform earns most on the sales it
worked for.

> **Your number was 30% for the creator.** Using it for the discovered tier is
> one change in this table and raises the platform's take per discovered
> unlock by about ฿0.90 [H]. The reason to prefer 40%: "we keep 70% of your
> sales" is a hard sentence on a creator page when Tapas pays 50% and YouTube
> pays 45–55% [M], and the extra ฿0.90 buys little. Either way, the direct
> tier is what makes the offer competitive at launch, when nearly every sale
> is direct.

### What the platform really keeps per paid unlock [H]

A 30-credit unlock, paid with credits from the ฿99 pack (฿9.43 cash). VAT 7%
is inside the price; the payment fee is ~2% (PromptPay and cards blended).

| | Direct | Discovered (40%) | Discovered (30%) |
|---|---:|---:|---:|
| Net revenue after VAT and fees | ฿8.62 | ฿8.62 | ฿8.62 |
| Creator (credits × ฿0.30) | 21 cr = ฿6.30 | 12 cr = ฿3.60 | 9 cr = ฿2.70 |
| **Platform keeps** | **฿2.32** | **฿5.02** | **฿5.92** |

With credits from the ฿999 pack (more bonus, ฿7.63 net) the platform keeps
about ฿1 less in each column. Hosting is near zero beside these: a 90-second
720p episode is about 40 MB and Cloudflare R2 charges nothing for egress.
Credits bought inside an iPhone or Android app pay the store 15–30% before
any of this, so sell on the web with PromptPay first and give fewer credits
per baht in the apps, as the credit apps do.

---

## 6. Creator accounts

Joining and uploading are free. Creators are the supply of a new platform,
and charging them shrinks the catalogue when it most needs to grow.

| | **Creator** | **Seller** | **Seller, Exclusive** |
|---|---|---|---|
| Who | Anyone | Verified: ID, age 20+ (Thai majority), PromptPay or bank account, every video's AI disclosure filled in, no upheld strikes | A Seller whose series is exclusive to DramaTube for its first 90 days |
| Can charge | No | Yes: episode price, series price, free episodes | Yes |
| Share | — | 70% direct / 40% discovered | 80% / 50% |
| Promotion | Search and feeds | Eligible for the home shelf | A featured launch slot per series |

### Getting paid

- Earnings arrive in credits with their baht value beside them (฿0.30 each).
- **14-day hold** for refunds (episodes that fail to play or are removed) and
  payment disputes.
- **Cash out monthly by PromptPay** from ฿500 (about 1,667 credits). Thai
  withholding tax and e-tax receipts apply; confirm the treatment of creator
  income with an accountant before the first payout run.
- **Or spend earnings in DramaStudio at 1.2×**, any time, no minimum: 10
  earned credits buy 12 render credits. Better for the creator than cash, and
  about half the cost to the platform [H].

---

## 7. A worked example (illustrative)

A 40-episode drama of 90-second episodes: 6 free, 34 at 30 credits. The
funnel numbers are assumptions; replace them with real ones as soon as
there are any.

| Step | Assumption | People |
|---|---|---:|
| Watch episode 1 | — | 50,000 |
| Reach the paywall | 20% | 10,000 |
| Pay for at least one episode | 8% | 800 |
| Paid episodes per payer | 20 | 16,000 unlocks |
| Direct : discovered | 60 : 40 (a creator who promotes) | 9,600 : 6,400 |

| | Credits | ≈ Baht |
|---|---:|---:|
| Viewers spend | 480,000 | ≈ ฿130,000 cash (about 10% of credits are bonus) |
| **Creator earns** (9,600 × 21 + 6,400 × 12) | **278,400** | **฿83,500 cash**, or 334,000 DramaStudio render credits |
| Platform keeps, after VAT, fees and the creator | | ≈ ฿35,000 (≈ ฿41,000 at 30% discovered) |

**Can it pay for the next season?** From DramaStudio's price list [H], one
finished minute is about 1,170 credits on Seedance 1.5 Pro and about 5,940
on Veo 3.1 Fast. This series is 60 minutes.

| Rendered on | Next season | Covered by the 334,000 render credits |
|---|---:|---:|
| Seedance 1.5 Pro | ≈ 70,000 | **4.8×** |
| Veo 3.1 Fast | ≈ 356,000 | 0.9× |

A creator on the cheaper model funds four more seasons; on the premium model,
about one. Say so on the creator pages.

---

## 8. Phase 2: membership per creator

The first subscription is **to a creator, not to the platform** — the shape
of Patreon and YouTube channel memberships, where YouTube keeps 30% [M].

- The creator sets a monthly price, ฿49–499.
- A member watches everything from that creator while the membership runs,
  including the early window (new episodes are unlock-only for everyone else
  for 7 days).
- **Charged from the wallet each month.** That is what makes it payable by
  PromptPay: the viewer tops up, the membership spends. An empty wallet
  pauses the membership; nothing is owed.
- **Creator keeps 70%, flat.** Memberships are fan-driven, so the direct rate
  applies without attribution.
- No pool. The creator sees every member by name and the money is a sale.

This gives a creator with a loyal audience steady monthly income and gives
the platform recurring revenue — without a catalogue-wide promise it cannot
yet keep.

## 9. Phase 3: platform-wide unlimited — only if earned

DramaBox's biggest product is an unlimited pass, and it belongs on the
roadmap. It should start only when all three hold:

1. **Catalogue over ~100 series**, so "unlimited" means something.
2. **Data shows bingeing**: a meaningful share of payers unlock more than
   about 30 episodes a month, the point where a ฿299 pass beats per-episode
   for them and for the platform [H].
3. **Creators opt in** per series. Nobody's per-episode sales are converted
   into pool shares without their say.

When it comes: **30% of net pass revenue to creators** (the YouTube Premium
rate [M]), split **per member** — each member's share goes only to the
creators that member actually watched, by episodes watched under the view
rule DramaTube already enforces (30% of the episode, 2–10 seconds, once per
viewer per day). A bot has to pay ฿299 to redirect its own ฿82 and nothing
else, which is why per-member beats a single pool.

---

## 10. What to build, in order

1. **Wallet and ledger** — append-only; bought, bonus and earned balances;
   bonus expiry. DramaStudio's ledger is the model to copy.
2. **Top-ups** — PromptPay and cards through Stripe (or a Thai gateway), with
   an idempotent webhook that grants credits once however often it is
   retried.
3. **Pricing and the paywall** — free-episode count, episode price, series
   price; unlock records; **the media route refuses a locked episode's file**,
   because a paywall that only hides the play button is no paywall.
4. **Attribution** — `?ref` on share links, a 30-day cookie, recorded on each
   unlock, shown to the creator as "direct" and "discovered".
5. **Earnings** — the creator's share written to the ledger in the same
   transaction as the unlock; the 14-day hold; an earnings page in Studio;
   monthly PromptPay payouts; "spend in DramaStudio".
6. **Membership per creator**, charged from the wallet.
7. **Platform unlimited**, when §9's conditions are met.

---

Sources [M]:
[Stripe: PromptPay](https://stripe.com/payment-method/promptpay) ·
[Rapyd: PromptPay](https://docs.rapyd.net/en/promptpay.html) ·
[Airwallex: PromptPay](https://www.airwallex.com/docs/payments/payment-methods/apac/promptpay) ·
[Gumroad fees](https://checkoutpage.com/blog/gumroad-fees) ·
[Gumroad fees 2026](https://dodopayments.com/blogs/gumroad-fees-explained) ·
[Tapas creator share (Wikipedia)](https://wikipedia.com/wiki/Tapastic) ·
[YouTube Partner Program 2027 changes (9to5Google)](https://9to5google.com/2026/08/10/youtube-premium-lite-expansion-monetization-changes/) ·
[ReelShort episode pricing](https://geekvibesnation.com/cost-to-finish-short-drama/) ·
[Pro-rata vs per-member payouts (Curve)](https://www.curveroyaltysystems.com/news/pro-rata-vs-user-centric-streaming-model)
