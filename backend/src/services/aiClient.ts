import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { numFromEnv } from "../utils/env";

export type AiProvider = "anthropic" | "openai" | "gemini";

export class AiClientError extends Error {
    status?: number;
    retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
        super(message);
        this.name = "AiClientError";
        this.status = options.status;
        this.retryable = options.retryable ?? true;
  }
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function extractErrorMessage(body: string): string {
    try {
          const parsed = JSON.parse(body) as { error?: { message?: string } | string };
          if (parsed?.error) {
                  if (typeof parsed.error === "string") return parsed.error;
                  if (typeof parsed.error === "object" && parsed.error.message) return parsed.error.message;
          }
    } catch {
          // Not JSON - fall through to the raw-body fallback below.
    }
    const trimmed = body.trim();
    if (!trimmed) return "no response body";
    return trimmed.length > 300 ? `${trimmed.slice(0, 300)}...` : trimmed;
}

interface CallAiParams {
    system: string;
    user: string;
}

const config = {
    provider: (process.env.AI_PROVIDER || "gemini").toLowerCase() as AiProvider,
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    anthropicMaxTokens: numFromEnv("ANTHROPIC_MAX_TOKENS", 8192, 1024, 32000),
    openaiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    geminiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    timeoutMs: numFromEnv("AI_TIMEOUT_MS", 45000, 5000, 300000),
};

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
    if (!config.anthropicKey) {
          throw new AiClientError(
                  "ANTHROPIC_API_KEY is not set. Add it to backend/.env (see .env.example).",
            { retryable: false }
                );
    }
    if (!anthropicClient) {
          anthropicClient = new Anthropic({ apiKey: config.anthropicKey, timeout: config.timeoutMs });
    }
    return anthropicClient;
}

async function callAnthropic({ system, user }: CallAiParams): Promise<string> {
    const client = getAnthropicClient();
    let response;
    try {
          response = await client.messages.create({
                  model: config.anthropicModel,
                  max_tokens: config.anthropicMaxTokens,
                  temperature: 0,
                  system,
                  messages: [{ role: "user", content: user }],
          });
    } catch (err) {
          if (err instanceof APIError) {
                  throw new AiClientError(`Anthropic request failed (${err.status ?? "unknown"}): ${err.message}`, {
                            status: err.status,
                            retryable: err.status ? isRetryableStatus(err.status) : true,
                  });
          }
          throw err;
    }

  if (response.stop_reason === "max_tokens") {
        throw new AiClientError(
                "Anthropic response was truncated (hit max_tokens) - the batch was too large or too verbose to fit the response budget.",
          { retryable: false }
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
                  "OPENAI_API_KEY is not set. Add it to backend/.env (see .env.example).",
            { retryable: false }
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
        throw new AiClientError(`OpenAI request failed (${res.status}): ${extractErrorMessage(body)}`, {
                status: res.status,
                retryable: isRetryableStatus(res.status),
        });
  }
    const json = (await res.json()) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    if (json.choices?.[0]?.finish_reason === "length") {
          throw new AiClientError("OpenAI response was truncated (hit the token limit).", { retryable: false });
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
                  "GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example).",
            { retryable: false }
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
        throw new AiClientError(`Gemini request failed (${res.status}): ${extractErrorMessage(body)}`, {
                status: res.status,
                retryable: isRetryableStatus(res.status),
        });
  }
    const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") {
          throw new AiClientError("Gemini response was truncated (hit the output token limit).", {
                  retryable: false,
          });
    }
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
          throw new AiClientError("Gemini response did not contain content.");
    }
    return content;
}

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
