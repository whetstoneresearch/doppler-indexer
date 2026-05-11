import { describe, expect, it } from "vitest";
import {
  parseChainIdsParam,
  parseClaimableFeesPagination,
  parseRequiredIntegerParam,
} from "../../src/api/queryParams";

describe("API query param parsing", () => {
  it("defaults claimable fee pagination to limit 100 and offset 0", () => {
    expect(parseClaimableFeesPagination({ limit: undefined, offset: undefined })).toEqual({
      limit: 100,
      offset: 0,
    });
  });

  it("rejects malformed claimable fee pagination", () => {
    expect(parseClaimableFeesPagination({ limit: "0", offset: "0" })).toBeNull();
    expect(parseClaimableFeesPagination({ limit: "101", offset: "0" })).toBeNull();
    expect(parseClaimableFeesPagination({ limit: "10.5", offset: "0" })).toBeNull();
    expect(parseClaimableFeesPagination({ limit: "10", offset: "-1" })).toBeNull();
    expect(parseClaimableFeesPagination({ limit: "10", offset: "" })).toBeNull();
    expect(parseClaimableFeesPagination({ limit: "10", offset: "10001" })).toBeNull();
  });

  it("rejects empty or malformed chain id segments", () => {
    expect(parseChainIdsParam(undefined)).toBeUndefined();
    expect(parseChainIdsParam("8453,84532")).toEqual([8453, 84532]);
    expect(parseChainIdsParam("")).toBeNull();
    expect(parseChainIdsParam("8453,")).toBeNull();
    expect(parseChainIdsParam(",8453")).toBeNull();
    expect(parseChainIdsParam("8453,abc")).toBeNull();
    expect(parseChainIdsParam("2147483648")).toBeNull();
    expect(parseChainIdsParam("9007199254740992")).toBeNull();
  });

  it("rejects empty required integer params instead of parsing them as zero", () => {
    expect(parseRequiredIntegerParam("8453")).toBe(8453);
    expect(parseRequiredIntegerParam(undefined)).toBeNull();
    expect(parseRequiredIntegerParam("")).toBeNull();
    expect(parseRequiredIntegerParam("1.5")).toBeNull();
    expect(parseRequiredIntegerParam("-1")).toBeNull();
    expect(parseRequiredIntegerParam("2147483648")).toBeNull();
    expect(parseRequiredIntegerParam("9007199254740992")).toBeNull();
  });
});
