import { describe, expect, it } from "vitest";
import { validateEffectiveRange } from "./versioned-policy.js";
describe("versioned effective ranges", () => {
  it("accepts an open range and a later closing instant", () => {
    expect(validateEffectiveRange("2026-08-01T09:00:00.000Z", "2026-08-02T09:00:00.000Z")).toEqual({ effectiveAt: "2026-08-01T09:00:00.000Z", effectiveUntil: "2026-08-02T09:00:00.000Z" });
    expect(validateEffectiveRange("2026-08-01T09:00:00.000Z")).toEqual({ effectiveAt: "2026-08-01T09:00:00.000Z", effectiveUntil: undefined });
  });
  it("rejects invalid and non-forward ranges", () => {
    expect(() => validateEffectiveRange("not-a-date")).toThrow("effectiveAt");
    expect(() => validateEffectiveRange("2026-08-02T09:00:00.000Z", "2026-08-01T09:00:00.000Z")).toThrow("effectiveUntil");
  });
});
