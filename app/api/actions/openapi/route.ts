import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same schema as /openapi/chatgpt-actions.yaml for Action import. */
export async function GET() {
  const file = path.join(process.cwd(), "public", "openapi", "chatgpt-actions.yaml");
  const body = await readFile(file, "utf8");
  return new Response(body, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
