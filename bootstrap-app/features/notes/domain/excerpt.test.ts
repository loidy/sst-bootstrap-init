import { EXCERPT_MAX_LENGTH, excerptOf } from "./excerpt";

describe("excerptOf", () => {
  it("returns a short body whole, without an ellipsis", () => {
    expect(excerptOf("Ship the release notes.")).toBe("Ship the release notes.");
  });

  it("flattens newlines so the excerpt stays one line", () => {
    expect(excerptOf("Ship the notes.\n\nThen tag the release.")).toBe(
      "Ship the notes. Then tag the release.",
    );
  });

  it("cuts on a word boundary and marks the cut", () => {
    expect(excerptOf("alpha bravo charlie delta", 14)).toBe("alpha bravo…");
  });

  it("cuts mid-word only when there is no boundary to use", () => {
    expect(excerptOf("aaaaaaaaaa", 4)).toBe("aaaa…");
  });

  it("does not add an ellipsis to a body of exactly the maximum length", () => {
    const body = "a".repeat(EXCERPT_MAX_LENGTH);

    expect(excerptOf(body)).toBe(body);
  });
});
