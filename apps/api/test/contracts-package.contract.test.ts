import { commonBoundary } from "@shelfops/contracts/common";
import { errorsBoundary } from "@shelfops/contracts/errors";
import { paginationBoundary } from "@shelfops/contracts/pagination";
import { recurrenceBoundary } from "@shelfops/contracts/recurrence";
import { slaPolicyBoundary } from "@shelfops/contracts/sla-policy";
import { describe, expect, it } from "vitest";

describe("contracts package boundary", () => {
  it("resolves its five neutral public subpaths", () => {
    expect(commonBoundary).toBe("common");
    expect(errorsBoundary).toBe("errors");
    expect(paginationBoundary).toBe("pagination");
    expect(slaPolicyBoundary).toBe("sla-policy");
    expect(recurrenceBoundary).toBe("recurrence");
  });
});
