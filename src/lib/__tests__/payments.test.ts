import Stripe from "stripe";
import { afterEach, describe, expect, it } from "vitest";
import { providers, verifyStripeEvent } from "../payments";

const KEYS = ["OMISE_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ALLOW_DEV_PAYMENTS"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}
afterEach(() => setEnv(saved as Record<string, string>));

describe("which provider takes which payment", () => {
  it("is hybrid when both are configured: PromptPay by Omise, cards by Stripe", () => {
    setEnv({ OMISE_SECRET_KEY: "skey_test", STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test" });
    expect(providers()).toEqual({ promptpay: "omise", card: "stripe" });
  });
  it("lets Stripe take PromptPay too when there is no Omise key", () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test" });
    expect(providers()).toEqual({ promptpay: "stripe", card: "stripe" });
  });
  it("never uses Stripe without its webhook secret, because nothing could confirm the payment", () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test" });
    expect(providers()).toEqual({ promptpay: null, card: null });
  });
  it("uses the test stand-in only when it is switched on", () => {
    setEnv({ ALLOW_DEV_PAYMENTS: "1" });
    expect(providers()).toEqual({ promptpay: "dev", card: "dev" });
    setEnv({});
    expect(providers()).toEqual({ promptpay: null, card: null });
  });
});

describe("Stripe webhook signature", () => {
  const payload = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_test" } } });

  it("accepts an event signed with our secret", () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: "whsec_test_secret" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    expect(verifyStripeEvent(payload, header).type).toBe("checkout.session.completed");
  });
  it("refuses a changed body or another secret", () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: "whsec_test_secret" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    expect(() => verifyStripeEvent(payload.replace("cs_test", "cs_other"), header)).toThrow();
    const other = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });
    expect(() => verifyStripeEvent(payload, other)).toThrow();
  });
});
