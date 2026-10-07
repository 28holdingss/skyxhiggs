import { toErrorResponse } from "@/lib/errors";
import { cancelStoredJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const job = await cancelStoredJob(id);
    return Response.json({ job });
  } catch (error) {
    return toErrorResponse(error);
  }
}
