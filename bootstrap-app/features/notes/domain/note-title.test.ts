import {
  NOTE_TITLE_MAX_LENGTH,
  NOTE_TITLE_MIN_LENGTH,
  normalizeTitle,
  validateTitle,
} from "./note-title";

describe("normalizeTitle", () => {
  it("trims the ends", () => {
    expect(normalizeTitle("  Release checklist  ")).toBe("Release checklist");
  });

  it("collapses runs of whitespace so spacing cannot smuggle a duplicate past the unique index", () => {
    expect(normalizeTitle("Release\t\n  checklist")).toBe("Release checklist");
  });

  it("leaves an already normalized title untouched", () => {
    expect(normalizeTitle("Release checklist")).toBe("Release checklist");
  });
});

describe("validateTitle", () => {
  it("accepts a title between the bounds", () => {
    expect(validateTitle("Release checklist")).toBeNull();
  });

  it("accepts the exact bounds", () => {
    expect(validateTitle("a".repeat(NOTE_TITLE_MIN_LENGTH))).toBeNull();
    expect(validateTitle("a".repeat(NOTE_TITLE_MAX_LENGTH))).toBeNull();
  });

  it("rejects one character short of the minimum", () => {
    expect(validateTitle("a".repeat(NOTE_TITLE_MIN_LENGTH - 1))).toBe("too-short");
  });

  it("rejects one character past the maximum", () => {
    expect(validateTitle("a".repeat(NOTE_TITLE_MAX_LENGTH + 1))).toBe("too-long");
  });

  it("treats an empty title as too short rather than valid", () => {
    expect(validateTitle("")).toBe("too-short");
  });
});
