import { describe, expect, it } from "vitest";
import { artifactSlug, joinUrl } from "../src/urls.js";

describe("urls", () => {
  it("keeps a leading slash as origin-relative", () => {
    expect(joinUrl("https://example.com/app", "/api")).toBe("https://example.com/api");
  });

  it("sanitizes screenshot names so they cannot traverse", () => {
    expect(artifactSlug("../../etc/passwd")).toBe("passwd");
    expect(artifactSlug("..")).toBe("shot");
  });
});
