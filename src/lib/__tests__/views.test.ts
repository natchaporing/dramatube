import { describe, expect, it } from "vitest";
import { checkViewTicket, issueAnonId, issueViewTicket, minWatchSeconds, networkKey, readAnonId } from "../views";

describe("view tickets", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");

  it("counts only after the playback rule could have been met", () => {
    const ticket = issueViewTicket("vid", now);
    expect(checkViewTicket(ticket, "vid", 60, now + 1000)).toBe(false);
    expect(checkViewTicket(ticket, "vid", 60, now + 9_500)).toBe(true);
    expect(checkViewTicket(ticket, "vid", 4, now + 2_000)).toBe(true);
  });
  it("expires", () => {
    const ticket = issueViewTicket("vid", now);
    expect(checkViewTicket(ticket, "vid", 4, now + 13 * 3600_000)).toBe(false);
  });
  it("belongs to one video and cannot be forged", () => {
    const ticket = issueViewTicket("vid", now);
    expect(checkViewTicket(ticket, "other", 4, now + 5_000)).toBe(false);
    const [issued] = ticket.split(".");
    expect(checkViewTicket(`${issued}.forged`, "vid", 4, now + 5_000)).toBe(false);
    expect(checkViewTicket(`${Number(issued) - 60}.${ticket.split(".")[1]}`, "vid", 4, now + 5_000)).toBe(false);
    expect(checkViewTicket(undefined, "vid", 4, now)).toBe(false);
  });
  it("asks for 30% of a video, between 2 and 10 seconds", () => {
    expect(minWatchSeconds(4)).toBe(2);
    expect(minWatchSeconds(20)).toBe(6);
    expect(minWatchSeconds(600)).toBe(10);
  });
});

describe("anonymous viewer ids", () => {
  it("accepts only ids this server signed", () => {
    const issued = issueAnonId();
    expect(readAnonId(issued)).toBe(issued.split(".")[0]);
    expect(readAnonId("u:user_someone")).toBeNull();
    expect(readAnonId(`${issued.split(".")[0]}.tampered`)).toBeNull();
    expect(readAnonId(undefined)).toBeNull();
  });
  it("keys a network without storing its address", () => {
    const request = (ip: string) => new Request("https://x/", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
    expect(networkKey(request("203.0.113.9"))).toBe(networkKey(request("203.0.113.9")));
    expect(networkKey(request("203.0.113.9"))).not.toBe(networkKey(request("203.0.113.10")));
    expect(networkKey(request("203.0.113.9"))).not.toContain("203");
  });
});
