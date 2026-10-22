export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];

export function getAiProvider(env = {}) {
  if (String(env.GEMINI_API_KEY || "").trim()) {
    return {
      provider: "gemini",
      model: String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL,
      configured: true
    };
  }
  if (env.AI && typeof env.AI.run === "function") {
    return { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", configured: true };
  }
  return { provider: "none", model: null, configured: false };
}

export async function generateWithGemini(env, { prompt, systemPrompt, maxOutputTokens = 3500, temperature = 0.1, inlineData = null, model: requestedModel = null }) {
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = String(requestedModel || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: String(systemPrompt || "Return only accurate, evidence-grounded JSON.") }] },
        contents: [{
          role: "user",
          parts: [
            ...(String(prompt || "") ? [{ text: String(prompt) }] : []),
            ...(inlineData && inlineData.data ? [{ inlineData: { mimeType: String(inlineData.mimeType || "application/pdf"), data: String(inlineData.data) } }] : [])
          ]
        }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: "application/json"
        }
      })
    });
  } catch (error) {
    throw new Error("Gemini network request failed: " + String(error?.message || error).slice(0, 180));
  }

  let payload;
  try { payload = await response.json(); }
  catch { payload = null; }

  if (!response.ok) {
    const providerMessage = String(payload?.error?.message || "No error details returned").slice(0, 240);
    const suffix = response.status === 429
      ? " Free-tier quota or rate limit may have been reached; check Google AI Studio usage and retry later."
      : response.status === 503
        ? " Google reports this as temporary service overload; a retry or fallback model may succeed."
        : "";
    const apiError = new Error("Gemini API returned HTTP " + response.status + ": " + providerMessage + "." + suffix);
    apiError.status = response.status;
    apiError.model = model;
    throw apiError;
  }

  const candidate = payload?.candidates?.[0];
  const text = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts.map(part => typeof part.text === "string" ? part.text : "").join("").trim()
    : "";
  if (!text) {
    const reason = String(candidate?.finishReason || payload?.promptFeedback?.blockReason || "empty response");
    throw new Error("Gemini returned no text content (" + reason + "). Try a shorter official source excerpt.");
  }
  return { text, model, provider: "gemini", finishReason: candidate?.finishReason || null };
}


function isRetryableGeminiStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export function getGeminiFallbackModels(env = {}) {
  const configured = String(env.GEMINI_FALLBACK_MODELS || env.GEMINI_FALLBACK_MODEL || "").trim();
  const requested = configured
    ? configured.split(",").map(model => model.trim()).filter(Boolean)
    : DEFAULT_GEMINI_FALLBACK_MODELS;
  const primary = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  return [...new Set(requested)].filter(model => model && model !== primary).slice(0, 3);
}

/**
 * Retry transient overload/rate-limit failures once, then fall back through
 * separately configurable Gemini models. It never silently falls back to a
 * paid provider or sends a key in a URL.
 */
export async function generateWithGeminiResilient(env, requestOptions = {}) {
  const primary = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const fallbacks = getGeminiFallbackModels(env);
  const modelChain = [primary, ...fallbacks];
  const failures = [];

  for (let modelIndex = 0; modelIndex < modelChain.length; modelIndex++) {
    const model = modelChain[modelIndex];
    const maxAttempts = modelIndex === 0 ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await generateWithGemini(env, { ...requestOptions, model });
        return {
          ...result,
          primaryModel: primary,
          fallbackUsed: model !== primary,
          attemptedModels: [...new Set([...failures.map(failure => failure.model), model])]
        };
      } catch (error) {
        failures.push({
          model,
          status: Number(error?.status || 0),
          message: String(error?.message || error || "unknown error").slice(0, 260)
        });
        if (!isRetryableGeminiStatus(error?.status)) throw error;
        if (attempt === 0 && modelIndex === 0) {
          // Google recommends exponential backoff for transient 429/5xx errors.
          await wait(450);
        }
      }
    }
  }

  const summary = failures.map(failure =>
    failure.model + " (HTTP " + (failure.status || "network") + "): " + failure.message
  ).join(" | ");
  const finalError = new Error(
    "Gemini primary and fallback models are temporarily unavailable. Tried " +
    modelChain.join(", ") + ". " + summary +
    " Wait briefly and retry, or set GEMINI_FALLBACK_MODELS to other currently available model IDs."
  );
  finalError.status = failures[failures.length - 1]?.status || 503;
  finalError.attemptedModels = modelChain;
  throw finalError;
}
