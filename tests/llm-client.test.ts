import { describe, expect, it } from "vitest";
import { parseActions } from "../src/llm/client.js";

describe("llm actions", () => {
  it("drops fill actions that are missing a selector", () => {
    const actions = parseActions(
      JSON.stringify({
        actions: [
          { op: "fill", value: "secret" },
          { op: "click", selector: "#add-to-cart" },
        ],
      }),
    );
    expect(actions).toEqual([{ op: "click", selector: "#add-to-cart" }]);
  });
});
