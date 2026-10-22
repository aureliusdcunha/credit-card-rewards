export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

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

export async function generateWithGemini(env, { prompt, systemPrompt, maxOutputTokens = 3500, temperature = 0.1, inlineData = null }) {
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
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
      : "";
    throw new Error("Gemini API returned HTTP " + response.status + ": " + providerMessage + "." + suffix);
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
