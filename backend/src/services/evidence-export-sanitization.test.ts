import { describe, test, expect } from "bun:test";
import { sanitizeScalar } from "./evidence-export.service";

describe("evidence export sanitization", () => {
  test("strips control characters", () => {
    expect(sanitizeScalar("test\x00\x01\x02value")).toBe("test   value");
  });

  test("removes HTML comments", () => {
    expect(sanitizeScalar("before<!-- secret -->after")).toBe("beforeafter");
  });

  test("removes Obsidian embeds", () => {
    expect(sanitizeScalar("text ![[image.png]] more")).toBe("text [removed embed] more");
  });

  test("removes template syntax", () => {
    expect(sanitizeScalar("text {{template}} more")).toBe("text [removed template] more");
  });

  test("truncates at 20k characters", () => {
    const long = "a".repeat(25_000);
    expect(sanitizeScalar(long).length).toBe(20_000);
  });

  test("normalizes line endings", () => {
    expect(sanitizeScalar("line1\r\nline2\rline3")).toBe("line1\nline2\nline3");
  });
});
