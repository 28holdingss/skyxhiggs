import { requireActionAuth } from "@/lib/action-auth";
import { toErrorResponse } from "@/lib/errors";
import { POST as createGenerate } from "@/app/api/generate/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ChatGPT Actions entry for starting a generation. Do not retry this POST. */
export async function POST(request: Request) {
  try {
    requireActionAuth(request);
    return createGenerate(request);
  } catch (error) {
    return toErrorResponse(error);
  }
}
