import { describe, expect, it } from "vitest";
import { continuePoint, isFinished } from "../continue";
import { formatDate } from "../format";
import { MAX_TROPES, TROPES, normalizeTropes, tropeFromSlug, tropeSlug } from "../tropes";
import { en } from "../i18n/en";
import { th } from "../i18n/th";

const episodes = [
  { id: "e1", episodeNumber: 1 },
  { id: "e2", episodeNumber: 2 },
  { id: "e3", episodeNumber: 3 },
];

describe("continue watching", () => {
  it("picks an unfinished episode up where it stopped", () => {
    const point = continuePoint({ videoId: "e2", episodeNumber: 2, positionSec: 60, durationSec: 240, completed: false }, episodes);
    expect(point).toEqual({ videoId: "e2", episodeNumber: 2, positionSec: 60, progress: 0.25 });
  });
  it("moves on to the next episode once one is finished", () => {
    const point = continuePoint({ videoId: "e1", episodeNumber: 1, positionSec: 0, durationSec: 240, completed: true }, episodes);
    expect(point).toEqual({ videoId: "e2", episodeNumber: 2, positionSec: 0, progress: 0 });
  });
  it("counts stopping in the credits as finishing", () => {
    expect(isFinished({ positionSec: 237, durationSec: 240, completed: false })).toBe(true);
    expect(isFinished({ positionSec: 200, durationSec: 240, completed: false })).toBe(false);
  });
  it("does not call a short episode finished half-way through", () => {
    // Five seconds of credits would be most of an eight-second clip.
    expect(isFinished({ positionSec: 4, durationSec: 8, completed: false })).toBe(false);
    expect(isFinished({ positionSec: 7.5, durationSec: 8, completed: false })).toBe(true);
  });
  it("goes by the player's word when the episode's length is unknown", () => {
    expect(isFinished({ positionSec: 0, durationSec: 0, completed: true })).toBe(true);
    expect(isFinished({ positionSec: 40, durationSec: 0, completed: false })).toBe(false);
  });
  it("treats a finished episode that was started again as unfinished", () => {
    expect(isFinished({ positionSec: 90, durationSec: 240, completed: true })).toBe(false);
  });
  it("has nothing to continue after the last episode out", () => {
    expect(continuePoint({ videoId: "e3", episodeNumber: 3, positionSec: 0, durationSec: 240, completed: true }, episodes)).toBeNull();
  });
  it("finds the next episode by number when the finished one is gone", () => {
    const point = continuePoint({ videoId: "gone", episodeNumber: 1, positionSec: 0, durationSec: 240, completed: true }, episodes.slice(1));
    expect(point?.videoId).toBe("e2");
  });
});

describe("tropes", () => {
  it("keeps known tropes only, whatever their case, each once, at most five", () => {
    expect(normalizeTropes(["hidden identity", "Werewolf", "Hidden Identity", "AMNESIA"])).toEqual(["Hidden Identity", "Amnesia"]);
    expect(normalizeTropes(TROPES)).toHaveLength(MAX_TROPES);
  });
  it("round-trips through a URL slug", () => {
    for (const trope of TROPES) expect(tropeFromSlug(tropeSlug(trope))).toBe(trope);
    expect(tropeSlug("Betrayal by a Friend")).toBe("betrayal-by-a-friend");
    expect(tropeFromSlug("nope")).toBeNull();
  });
  it("has a label in every language", () => {
    for (const trope of TROPES) {
      const key = `trope.${tropeSlug(trope)}` as keyof typeof en;
      expect(en[key], trope).toBeTruthy();
      expect(th[key], trope).toBeTruthy();
    }
  });
});

describe("dates", () => {
  it("are days in Bangkok whatever the server's clock", () => {
    // Midnight on the 20th in Bangkok is still the 19th in UTC.
    expect(formatDate(new Date("2026-11-19T17:00:00Z"), "en")).toBe("Nov 20, 2026");
  });
});
