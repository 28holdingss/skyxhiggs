import { requireActionAuth } from "@/lib/action-auth";
import { toErrorResponse } from "@/lib/errors";
import { GET as listJobs } from "@/app/api/jobs/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll job status after generate. Prefer this over retrying generate. */
export async function GET(request: Request) {
  try {
    requireActionAuth(request);
    return listJobs();
  } catch (error) {
    return toErrorResponse(error);
  }
}
