import { StudioError, toErrorResponse } from "@/lib/errors";
import { requireCredentials, submitCharacter, submitGeneration, submitPayload } from "@/lib/higgsfield";
import { reserveJob, settleJob } from "@/lib/jobs";
import { parseGenerationRequest, type StyleId } from "@/lib/prompts";
import { parseWorkflowRequest, workflowBody } from "@/lib/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let reservedId: string | null = null;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StudioError("Send a prompt as JSON.", 400);
    }

    requireCredentials();
    if (isWorkflow(body)) {
      const style = styleOf(body);
      const workflow = parseWorkflowRequest(body, style);
      const reserved = await reserveJob({
        prompt: workflow.prompt,
        mode: workflow.task === "character" ? "image" : "video",
        model: workflow.model,
        audio: workflow.task === "motion" || workflow.task === "edit" || workflow.task === "extend" ? workflow.audio : null,
        style,
        aspectRatio: "16:9",
        duration: workflow.duration,
        inputImageUrl: workflow.imageUrls[0] ?? null,
      });
      reservedId = reserved.id;

      if (workflow.task === "character") {
        const created = await submitCharacter(workflowBody(workflow));
        const status = created.status === "completed" || created.status === "failed" || created.status === "in_progress"
          ? created.status
          : "queued";
        const job = await settleJob(reserved.id, {
          status,
          requestId: created.id,
          statusUrl: `https://api.higgsfield.ai/v1/custom-references/${created.id}`,
          referenceId: created.id,
          outputUrl: created.thumbnail,
          outputKind: created.thumbnail ? "image" : null,
          error: status === "failed" ? created.failReason || "Character training failed." : null,
        });
        return Response.json({ job });
      }

      const submitted = await submitPayload(workflow.path, workflowBody(workflow), true);
      const job = await settleJob(reserved.id, {
        status: "queued",
        requestId: submitted.requestId,
        statusUrl: submitted.statusUrl,
        cancelUrl: submitted.cancelUrl,
        estimate: submitted.estimate,
        error: null,
      });
      return Response.json({ job });
    }

    const generation = parseGenerationRequest(body);
    const reserved = await reserveJob({
      prompt: generation.prompt,
      mode: generation.mode,
      model: generation.model,
      audio: generation.mode === "video" ? generation.audio : null,
      style: generation.style,
      aspectRatio: generation.aspectRatio,
      duration: generation.mode === "video" ? generation.duration : null,
      inputImageUrl: generation.imageUrl,
    });
    reservedId = reserved.id;

    const submitted = await submitGeneration(generation);
    const job = await settleJob(reserved.id, {
      status: "queued",
      requestId: submitted.requestId,
      statusUrl: submitted.statusUrl,
      cancelUrl: submitted.cancelUrl,
      estimate: submitted.estimate,
      error: null,
    });

    return Response.json({ job });
  } catch (error) {
    if (reservedId) {
      const message =
        error instanceof StudioError ? error.message : "Higgsfield did not accept this generation.";
      await settleJob(reservedId, { status: "failed", error: message }).catch(() => undefined);
    }
    return toErrorResponse(error);
  }
}

function isWorkflow(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const task = (body as { task?: unknown }).task;
  return task === "motion" || task === "edit" || task === "extend" || task === "character";
}

function styleOf(body: unknown): StyleId | null {
  if (!body || typeof body !== "object") return null;
  const style = (body as { style?: unknown }).style;
  if (style === "cinematic" || style === "anime" || style === "ad" || style === "trailer" || style === "cartoon") {
    return style;
  }
  return null;
}
