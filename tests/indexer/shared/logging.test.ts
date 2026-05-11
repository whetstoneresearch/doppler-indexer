import { describe, expect, it } from "vitest";
import { sanitizeErrorMetadata } from "../../../src/indexer/shared/logging";

describe("logging helpers", () => {
  it("keeps only safe error name and message fields", () => {
    const error = new Error("request failed for https://example.invalid/api-key");

    expect(sanitizeErrorMetadata(error)).toEqual({
      name: "Error",
      message: "request failed for [redacted-url]",
    });
  });

  it("keeps non-URL error messages intact", () => {
    const error = new Error("request failed with status 429");

    expect(sanitizeErrorMetadata(error)).toEqual({
      name: "Error",
      message: "request failed with status 429",
    });
  });

  it("does not expose arbitrary fields from thrown objects", () => {
    const metadata = sanitizeErrorMetadata({ message: "hidden", url: "https://secret.invalid" });

    expect(metadata).toEqual({
      name: "object",
      message: "Non-Error thrown",
    });
  });
});
