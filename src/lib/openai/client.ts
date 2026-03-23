import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }

  return cachedClient;
}

export function getTextModel() {
  return process.env.OPENAI_TEXT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
}

export function getPdfModel() {
  return process.env.OPENAI_PDF_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
}
