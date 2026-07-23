import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY must be set. Create one at https://platform.openai.com/api-keys.",
  );
}

// OPENAI_BASE_URL is optional — set it only to point at a proxy or an
// OpenAI-compatible gateway. Left unset, the SDK uses api.openai.com.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
});
