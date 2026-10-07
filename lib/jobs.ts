import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { StudioError } from "@/lib/errors";
import { cancelRequest, getReferenceStatus, getRequestStatus, type HiggsStatus } from "@/lib/higgsfield";
import type { AspectRatio, StyleId } from "@/lib/prompts";
import type { Estimate, JobStatus, PublicJob } from "@/lib/types";

const DATA_FILE = path.join(process.cwd(), "data", "jobs.json");
const SUBMIT_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_STORED = 40;

type StoredJob = {
  id: string;
  requestId: string | null;
  statusUrl: string | null;
  cancelUrl: string | null;
  status: JobStatus;
  prompt: string;
  mode: "video" | "image";
  model: string;
  audio: boolean | null;
  style: StyleId | null;
  aspectRatio: AspectRatio;
  duration: number | null;
  inputImageUrl: string | null;
  outputUrl: string | null;
  outputKind: "video" | "image" | null;
  referenceId: string | null;
  error: string | null;
  estimate: Estimate | null;
  createdAt: string;
  updatedAt: string;
};

const REMOTE_STATUSES = new Set<JobStatus>([
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "canceled",
]);

let queue: Promise<void> = Promise.resolve();

function locked<T>(task: () => Promise<T>) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isActive(job: StoredJob) {
  return job.status === "submitting" || job.status === "queued" || job.status === "in_progress";
}

function maxConcurrent() {
  const parsed = Number(process.env.HF_MAX_CONCURRENT ?? 4);
  if (!Number.isInteger(parsed)) return 4;
  return Math.min(Math.max(parsed, 1), 20);
}

function toPublic(job: StoredJob): PublicJob {
  return {
    id: job.id,
    status: job.status,
    prompt: job.prompt,
    mode: job.mode,
    model: job.model,
    audio: job.audio,
    style: job.style,
    aspectRatio: job.aspectRatio,
    duration: job.duration,
    inputImageUrl: job.inputImageUrl,
      outputUrl: job.outputUrl,
      outputKind: job.outputKind,
      referenceId: job.referenceId ?? null,
      error: job.error,
    estimate: job.estimate,
    createdAt: job.createdAt,
  };
}

async function readJobs() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredJob[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((job) => ({
      ...job,
      model: job.model || (job.mode === "image" ? "soul-v2" : "seedance-2"),
      audio: typeof job.audio === "boolean" ? job.audio : null,
      referenceId: typeof job.referenceId === "string" ? job.referenceId : null,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeJobs(jobs: StoredJob[]) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(jobs, null, 2));
  await rename(temporary, DATA_FILE);
}

function expireSubmitting(jobs: StoredJob[]) {
  const cutoff = Date.now() - SUBMIT_TIMEOUT_MS;
  let changed = false;
  const next = jobs.map((job) => {
    if (job.status !== "submitting" || Date.parse(job.createdAt) > cutoff) return job;
    changed = true;
    return {
      ...job,
      status: "failed" as const,
      error: "Higgsfield did not accept this generation. It was not submitted again.",
      updatedAt: new Date().toISOString(),
    };
  });
  return { jobs: next, changed };
}

function prune(jobs: StoredJob[]) {
  if (jobs.length <= MAX_STORED) return jobs;
  const active = jobs.filter(isActive);
  const terminal = jobs.filter((job) => !isActive(job));
  const room = Math.max(MAX_STORED - active.length, 0);
  return [...active, ...terminal.slice(-room)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function applyHiggsStatus(job: StoredJob, status: HiggsStatus): StoredJob {
  const remote = REMOTE_STATUSES.has(status.status as JobStatus)
    ? (status.status as JobStatus)
    : job.status;

  let nextStatus = remote;
  let error = status.error;
  if (nextStatus === "completed" && !status.outputUrl && !status.referenceId && !job.referenceId) {
    nextStatus = "failed";
    error = "Higgsfield finished without a media file.";
  }
  if (nextStatus === "nsfw") {
    error = error || "Higgsfield stopped this for content moderation.";
  }
  if (nextStatus === "failed") {
    error = error || "Generation failed.";
  }

  return {
    ...job,
    status: nextStatus,
    outputUrl: status.outputUrl ?? job.outputUrl,
    outputKind: status.outputKind ?? job.outputKind,
    referenceId: status.referenceId ?? job.referenceId,
    error,
    updatedAt: new Date().toISOString(),
  };
}

export async function reserveJob(input: {
  prompt: string;
  mode: "video" | "image";
  model: string;
  audio: boolean | null;
  style: StyleId | null;
  aspectRatio: AspectRatio;
  duration: number | null;
  inputImageUrl: string | null;
}) {
  return locked(async () => {
    const loaded = expireSubmitting(await readJobs());
    const active = loaded.jobs.filter(isActive).length;
    const limit = maxConcurrent();
    if (active >= limit) {
      if (loaded.changed) await writeJobs(loaded.jobs);
      throw new StudioError(
        `Sky × Higgs already has ${limit} generations running. Wait for one to finish.`,
        429,
      );
    }

    const now = new Date().toISOString();
    const job: StoredJob = {
      id: crypto.randomUUID(),
      requestId: null,
      statusUrl: null,
      cancelUrl: null,
      status: "submitting",
      prompt: input.prompt,
      mode: input.mode,
      model: input.model,
      audio: input.audio,
      style: input.style,
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      inputImageUrl: input.inputImageUrl,
      outputUrl: null,
      outputKind: null,
      referenceId: null,
      error: null,
      estimate: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeJobs(prune([...loaded.jobs, job]));
    return toPublic(job);
  });
}

export async function settleJob(
  id: string,
  patch: {
    status: JobStatus;
    requestId?: string;
    statusUrl?: string;
    cancelUrl?: string;
    estimate?: Estimate | null;
    error?: string | null;
    outputUrl?: string | null;
    outputKind?: "video" | "image" | null;
    referenceId?: string | null;
  },
) {
  return locked(async () => {
    const jobs = await readJobs();
    const index = jobs.findIndex((job) => job.id === id);
    if (index < 0) throw new StudioError("That generation is no longer on this studio.", 404);

    const next: StoredJob = {
      ...jobs[index],
      status: patch.status,
      requestId: patch.requestId ?? jobs[index].requestId,
      statusUrl: patch.statusUrl ?? jobs[index].statusUrl,
      cancelUrl: patch.cancelUrl ?? jobs[index].cancelUrl,
      estimate: patch.estimate === undefined ? jobs[index].estimate : patch.estimate,
      error: patch.error === undefined ? jobs[index].error : patch.error,
      outputUrl: patch.outputUrl === undefined ? jobs[index].outputUrl : patch.outputUrl,
      outputKind: patch.outputKind === undefined ? jobs[index].outputKind : patch.outputKind,
      referenceId: patch.referenceId === undefined ? jobs[index].referenceId : patch.referenceId,
      updatedAt: new Date().toISOString(),
    };
    jobs[index] = next;
    await writeJobs(jobs);
    return toPublic(next);
  });
}

export async function syncJobs() {
  const snapshot = await locked(async () => {
    const loaded = expireSubmitting(await readJobs());
    if (loaded.changed) await writeJobs(loaded.jobs);
    return loaded.jobs;
  });

  let authError = false;
  for (const job of snapshot) {
    if ((job.status !== "queued" && job.status !== "in_progress") || !job.statusUrl) continue;
    try {
      const status = job.referenceId
        ? await getReferenceStatus(job.referenceId)
        : await getRequestStatus(job.statusUrl);
      await locked(async () => {
        const jobs = await readJobs();
        const index = jobs.findIndex((item) => item.id === job.id);
        if (index < 0 || !isActive(jobs[index])) return;
        jobs[index] = applyHiggsStatus(jobs[index], status);
        await writeJobs(jobs);
      });
    } catch (error) {
      if (error instanceof StudioError && error.status === 401) authError = true;
    }
  }

  const jobs = await locked(async () => (await readJobs()).map(toPublic));
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { jobs, authError };
}

export async function cancelStoredJob(id: string) {
  const job = await locked(async () => (await readJobs()).find((item) => item.id === id) ?? null);
  if (!job) throw new StudioError("That generation is no longer on this studio.", 404);
  if (job.status === "canceled") return toPublic(job);
  if (job.status !== "queued" || !job.cancelUrl) {
    throw new StudioError("Only a queued generation can be canceled.", 400);
  }

  const result = await cancelRequest(job.cancelUrl);
  if (result === "started") {
    throw new StudioError("Generation already started, so it can no longer be canceled.", 400);
  }

  return settleJob(id, { status: "canceled", error: null });
}
