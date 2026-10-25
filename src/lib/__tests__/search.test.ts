import { describe, expect, it } from "vitest";
import { escapeLike, searchTerms } from "../videos";

describe("search input", () => {
  it("treats % and _ as characters, not wildcards", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
  it("splits on whitespace and bounds the work", () => {
    expect(searchTerms("  bangkok   2077 ")).toEqual(["bangkok", "2077"]);
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
    expect(searchTerms("x".repeat(100))[0]).toHaveLength(40);
  });
});
