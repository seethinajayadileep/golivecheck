import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "../src/errors.js";
import { completeJson, parseActions } from "../src/llm/client.js";

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

describe("completeJson", () => {
  const previousKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  it("maps budget abort during response-body reads to BudgetExceededError", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ac = new AbortController();
    vi.stubGlobal("fetch", async () => {
      return {
        ok: true,
        async json() {
          ac.abort();
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
        async text() {
          ac.abort();
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      } as Response;
    });
    await expect(completeJson("plan", ac.signal)).rejects.toBeInstanceOf(BudgetExceededError);
  });
});
