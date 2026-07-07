import Anthropic from "@anthropic-ai/sdk";
import { numFromEnv } from "../utils/env";

export type AiProvider = "anthropic" | "openai" | "gemini";

export class AiClientError extends Error {}

interface CallAiParams {
  system: string;
  user: string;
}

const config = {
  provider: (process.env.AI_PROVIDER || "gemini").toLowerCase() as AiProvider,
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  // Higher than the previous hardcoded 4096 - a batch of 25 verbose rows can
  // otherwise get truncated mid-JSON, which fails to parse and burns all retries
  // on an error that will just repeat identically every time.
  anthropicMaxTokens: numFromEnv("ANTHROPIC_MAX_TOKENS", 8192, 1024, 32000),
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  // Prevents a stalled provider request from hanging a batch (and the whole
  // /confirm request) forever - it will fail fast and go through the normal
  // per-batch retry path instead.
  timeoutMs: numFromEnv("AI_TIMEOUT_MS", 45000, 5000, 300000),
};

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!config.anthropicKey) {
    throw new AiClientError(
      "ANTHROPIC_API_KEY is not set. Add it to backend/.env (see .env.example)."
    );
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicKey, timeout: config.timeoutMs });
  }
  return anthropicClient;
}

async function callAnthropic({ system, user }: CallAiParams): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: config.anthropicMaxTokens,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new AiClientError(
      "Anthropic response was truncated (hit max_tokens) - the batch was too large or too verbose to fit the response budget."
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AiClientError("Anthropic response did not contain a text block.");
  }
  return textBlock.text;
}

async function callOpenAi({ system, user }: CallAiParams): Promise<string> {
  if (!config.openaiKey) {
    throw new AiClientError(
      "OPENAI_API_KEY is not set. Add it to backend/.env (see .env.example)."
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiClientError(`OpenAI request timed out after ${config.timeoutMs}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiClientError(`OpenAI request failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  if (json.choices?.[0]?.finish_reason === "length") {
    throw new AiClientError("OpenAI response was truncated (hit the token limit).");
  }
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new AiClientError("OpenAI response did not contain message content.");
  }
  return content;
}

async function callGemini({ system, user }: CallAiParams): Promise<string> {
  if (!config.geminiKey) {
    throw new AiClientError(
      "GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example)."
    );
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiClientError(`Gemini request timed out after ${config.timeoutMs}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiClientError(`Gemini request failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new AiClientError("Gemini response was truncated (hit the output token limit).");
  }
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new AiClientError("Gemini response did not contain content.");
  }
  return content;
}

/**
 * Dispatches a single AI call to whichever provider is configured via
 * AI_PROVIDER. All three providers are asked to return raw JSON text.
 */
export async function callAi(params: CallAiParams): Promise<string> {
  switch (config.provider) {
    case "openai":
      return callOpenAi(params);
    case "anthropic":
      return callAnthropic(params);
    case "gemini":
    default:
      return callGemini(params);
  }
}

export function getAiConfig() {
  return config;
}
