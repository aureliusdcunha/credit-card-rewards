import test from "node:test";
import assert from "node:assert/strict";
import { getAiProvider, generateWithGemini, generateWithGeminiResilient, DEFAULT_GEMINI_MODEL } from "../src/model-provider.js";

test("prefers Gemini when a Gemini API key is configured", () => {
  const provider = getAiProvider({ GEMINI_API_KEY: "test-key", AI: { run() {} } });
  assert.deepEqual(provider, { provider: "gemini", model: DEFAULT_GEMINI_MODEL, configured: true });
});

test("supports a configurable Gemini model ID", () => {
  const provider = getAiProvider({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-3.6-flash" });
  assert.equal(provider.model, "gemini-3.6-flash");
});

test("falls back to Cloudflare AI when no Gemini key is configured", () => {
  const provider = getAiProvider({ AI: { run() {} } });
  assert.equal(provider.provider, "cloudflare");
  assert.equal(provider.configured, true);
});

test("reports no provider when neither Gemini nor Cloudflare AI is configured", () => {
  assert.deepEqual(getAiProvider({}), { provider: "none", model: null, configured: false });
});

test("calls Gemini using a secret header and requests JSON output", async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: '{"issuer":"HDFC Bank","rules":[]}' }] }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await generateWithGemini({
      GEMINI_API_KEY: "do-not-put-in-url",
      GEMINI_MODEL: "gemini-3.5-flash"
    }, { systemPrompt: "Output JSON only", prompt: "Extract the card terms", maxOutputTokens: 1000 });
    assert.match(call.url, /models\/gemini-3\.5-flash:generateContent$/);
    assert.equal(new URL(call.url).searchParams.has("key"), false);
    assert.equal(call.options.headers["x-goog-api-key"], "do-not-put-in-url");
    assert.equal(call.body.generationConfig.responseMimeType, "application/json");
    assert.equal(call.body.generationConfig.maxOutputTokens, 1000);
    assert.equal(result.text, '{"issuer":"HDFC Bank","rules":[]}');
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3.5-flash");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns actionable status and quota guidance for Gemini API failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "Resource exhausted" }
  }), { status: 429, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(
      () => generateWithGemini({ GEMINI_API_KEY: "test-key" }, { prompt: "test" }),
      /Gemini API returned HTTP 429: Resource exhausted.*quota or rate limit/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a successful Gemini response that contains no text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(
      () => generateWithGemini({ GEMINI_API_KEY: "test-key" }, { prompt: "test" }),
      /Gemini returned no text content/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("sends official PDF bytes to Gemini when inline document extraction is used", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: "Joining Fee: ₹2,500 plus applicable taxes. Annual fee waiver after qualifying annual spend." }] }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await generateWithGemini({
      GEMINI_API_KEY: "test-key"
    }, {
      prompt: "Extract the exact PDF text",
      inlineData: { mimeType: "application/pdf", data: "JVBERi0xLjQK" },
      maxOutputTokens: 12000
    });
    const filePart = requestBody.contents[0].parts.find(part => part.inlineData);
    assert.deepEqual(filePart.inlineData, { mimeType: "application/pdf", data: "JVBERi0xLjQK" });
    assert.match(result.text, /Joining Fee: ₹2,500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("retries a Gemini 503 once, then succeeds with the free-tier fallback model", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedModels = [];
  globalThis.fetch = async (rawUrl, options) => {
    const url = String(rawUrl);
    const match = url.match(/models\/([^:]+):generateContent$/);
    const model = match ? decodeURIComponent(match[1]) : "unknown";
    attemptedModels.push(model);
    if (model === "gemini-3.5-flash") {
      return new Response(JSON.stringify({
        error: { message: "This model is currently experiencing high demand." }
      }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"rules":[]}' }] } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await generateWithGeminiResilient({
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-3.5-flash"
    }, { prompt: "Extract card terms" });
    assert.equal(result.model, "gemini-3.5-flash-lite");
    assert.equal(result.primaryModel, "gemini-3.5-flash");
    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(attemptedModels, [
      "gemini-3.5-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses configured Gemini fallback models and returns actionable errors when all models are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedModels = [];
  globalThis.fetch = async rawUrl => {
    const url = String(rawUrl);
    const match = url.match(/models\/([^:]+):generateContent$/);
    attemptedModels.push(match ? decodeURIComponent(match[1]) : "unknown");
    return new Response(JSON.stringify({
      error: { message: "model overloaded" }
    }), { status: 503, headers: { "content-type": "application/json" } });
  };
  try {
    await assert.rejects(
      () => generateWithGeminiResilient({
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "primary-model",
        GEMINI_FALLBACK_MODELS: "fallback-a,fallback-b"
      }, { prompt: "Extract card terms" }),
      /primary and fallback models are temporarily unavailable.*primary-model, fallback-a, fallback-b/i
    );
    assert.deepEqual(attemptedModels, [
      "primary-model",
      "primary-model",
      "fallback-a",
      "fallback-b"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
