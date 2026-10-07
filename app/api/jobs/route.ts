import { toErrorResponse } from "@/lib/errors";
import { getCredentials } from "@/lib/higgsfield";
import { syncJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configured = getCredentials() !== null;
    if (!configured) {
      const { jobs } = await syncJobs();
      return Response.json({ jobs, configured: false, authError: false });
    }

    const { jobs, authError } = await syncJobs();
    return Response.json({ jobs, configured: true, authError });
  } catch (error) {
    return toErrorResponse(error);
  }
}
