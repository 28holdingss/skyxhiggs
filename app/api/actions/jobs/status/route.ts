import { requireActionAuth } from "@/lib/action-auth";
import { StudioError, toErrorResponse } from "@/lib/errors";
import { pollRemoteJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll one job via statusUrl/requestId from generate — works across Vercel instances. */
export async function POST(request: Request) {
  try {
    requireActionAuth(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StudioError("Send statusUrl or requestId as JSON.", 400);
    }
    if (!body || typeof body !== "object") {
      throw new StudioError("Send statusUrl or requestId as JSON.", 400);
    }
    const record = body as {
      statusUrl?: unknown;
      requestId?: unknown;
      jobId?: unknown;
    };
    const result = await pollRemoteJob({
      statusUrl: typeof record.statusUrl === "string" ? record.statusUrl : null,
      requestId: typeof record.requestId === "string" ? record.requestId : null,
      jobId: typeof record.jobId === "string" ? record.jobId : null,
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
