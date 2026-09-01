import { describe, expect, it } from "vitest";
import { holdsModel } from "@/lib/ai";

/**
 * Ollama names every pulled model `family:tag`, and never bare.
 *
 * So `OLLAMA_MODEL=gemma3` is a legitimate thing to configure and will never
 * appear verbatim in `/api/tags`. An exact-match check would report a model
 * that is sitting right there as missing, and send Vincent to pull something he
 * already has — which is the one failure mode of this check that costs time
 * rather than merely being wrong.
 */
describe("holdsModel", () => {
  const pulled = ["gemma3:12b", "llama3.1:8b", "qwen2.5-coder:7b"];

  it("matches a fully qualified name", () => {
    expect(holdsModel(pulled, "gemma3:12b")).toBe(true);
  });

  it("matches a bare family against its tag", () => {
    expect(holdsModel(pulled, "gemma3")).toBe(true);
  });

  it("does not match a family that is genuinely absent", () => {
    expect(holdsModel(pulled, "mistral")).toBe(false);
  });

  it("does not match the wrong tag of a family that is present", () => {
    // 27b is not 12b. Answering "available" here would send a prompt that
    // fails at generation time with a 404, one screen later than it should.
    expect(holdsModel(pulled, "gemma3:27b")).toBe(false);
  });

  it("does not match on a shared prefix that is not a family boundary", () => {
    // `llama3` must not claim `llama3.1:8b`: the separator is the colon, and
    // without it every family that is a prefix of another would match.
    expect(holdsModel(pulled, "llama3")).toBe(false);
  });

  it("holds nothing when nothing is pulled", () => {
    expect(holdsModel([], "gemma3")).toBe(false);
  });
});
