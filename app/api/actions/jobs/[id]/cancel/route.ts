import { requireActionAuth } from "@/lib/action-auth";
import { toErrorResponse } from "@/lib/errors";
import { POST as cancelJob } from "@/app/api/jobs/[id]/cancel/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Cancel only while the job is still queued. */
export async function POST(request: Request, context: RouteContext) {
  try {
    requireActionAuth(request);
    return cancelJob(request, context);
  } catch (error) {
    return toErrorResponse(error);
  }
}
