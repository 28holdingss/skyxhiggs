import { StudioError } from "@/lib/errors";

/**
 * Auth for ChatGPT Custom GPT Actions (and similar server-side clients).
 * Set ACTIONS_API_KEY in the environment. The Higgsfield key stays server-side only.
 */
export function getActionsApiKey() {
  const key = (process.env.ACTIONS_API_KEY || process.env.CHATGPT_ACTIONS_KEY || "").trim();
  return key || null;
}

export function requireActionAuth(request: Request) {
  const expected = getActionsApiKey();
  if (!expected) {
    throw new StudioError(
      "Set ACTIONS_API_KEY in .env.local (or the host env), then restart the server.",
      503,
    );
  }

  const header = request.headers.get("authorization")?.trim() ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  const provided = bearer || apiKey;

  if (!provided || provided !== expected) {
    throw new StudioError("Unauthorized. Use Bearer ACTIONS_API_KEY for ChatGPT Actions.", 401);
  }
}
