import { describe, expect, it } from "vitest";

describe("integration harness sentinel", () => {
  it("runs under Vitest's configured Node environment", () => {
    expect(process.env.VITEST).toBe("true");
    expect(process.release.name).toBe("node");
    expect(process.getBuiltinModule("node:fs")).toBeDefined();
    expect("window" in globalThis).toBe(false);
  });
});
