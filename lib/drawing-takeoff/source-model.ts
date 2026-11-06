import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";

export type SourceSectionKind = "classify" | "doors" | "hardware" | "types" | "walls" | "plan";
export type SourceContent = Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; data: Uint8Array } | { type: "image"; image: Uint8Array }>;

/** Shared by the production worker and isolated PDF-only evaluations. */
export async function readSourceModel(kind: SourceSectionKind, schema: z.ZodType<Record<string, unknown>>, system: string, content: SourceContent) {
  const model = kind === "plan" ? process.env.DOCUMENT_VISION_MODEL || "openai/gpt-5.2" : process.env.DOCUMENT_EXTRACTION_MODEL || "google/gemini-2.5-flash";
  return generateText({ model,
    ...(model === "google/gemini-2.5-flash" ? { providerOptions: { google: { thinkingConfig: { thinkingBudget: kind === "classify" ? 512 : kind === "plan" ? 2048 : 1024 }, ...(kind === "plan" ? { mediaResolution: "MEDIA_RESOLUTION_HIGH" } : {}) } } } : {}),
    ...(model === "openai/gpt-5.2" ? { providerOptions: { openai: { reasoningEffort: "medium" } } } : {}),
    output: Output.object({ schema }), system, messages: [{ role: "user", content }] as ModelMessage[],
    maxRetries: 0, maxOutputTokens: kind === "classify" ? 3500 : kind === "plan" ? 6500 : 10000,
    abortSignal: AbortSignal.timeout(120_000),
  });
}
