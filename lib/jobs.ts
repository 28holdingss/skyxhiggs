import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StudioError } from "@/lib/errors";
import {
  cancelRequest,
  getReferenceStatus,
  getRequestStatus,
  resolveStatusTarget,
  type HiggsStatus,
} from "@/lib/higgsfield";
import type { AspectRatio, StyleId } from "@/lib/prompts";
import type { Estimate, JobStatus, PublicJob } from "@/lib/types";

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

/** In-memory copy so the same serverless isolate can list jobs even if disk is ephemeral. */
let memoryJobs: StoredJob[] = [];

function jobsFilePath() {
  const custom = process.env.SKY_JOBS_DIR?.trim();
  if (custom) return path.join(custom, "jobs.json");
  // Vercel’s app directory is read-only; only /tmp is writable.
  if (process.env.VERCEL) return path.join(os.tmpdir(), "sky-higgs", "jobs.json");
  return path.join(process.cwd(), "data", "jobs.json");
}

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
    requestId: job.requestId,
    statusUrl: job.statusUrl,
    error: job.error,
    estimate: job.estimate,
    createdAt: job.createdAt,
  };
}

function normalizeJob(job: StoredJob): StoredJob {
  return {
    ...job,
    model: job.model || (job.mode === "image" ? "soul-v2" : "seedance-2"),
    audio: typeof job.audio === "boolean" ? job.audio : null,
    referenceId: typeof job.referenceId === "string" ? job.referenceId : null,
    requestId: typeof job.requestId === "string" ? job.requestId : null,
    statusUrl: typeof job.statusUrl === "string" ? job.statusUrl : null,
  };
}

function mergeJobs(fromFile: StoredJob[], fromMemory: StoredJob[]) {
  const map = new Map<string, StoredJob>();
  for (const job of fromFile) map.set(job.id, normalizeJob(job));
  for (const job of fromMemory) {
    const existing = map.get(job.id);
    const next = normalizeJob(job);
    if (!existing || existing.updatedAt <= next.updatedAt) map.set(job.id, next);
  }
  return [...map.values()];
}

async function readJobs() {
  let fromFile: StoredJob[] = [];
  try {
    const raw = await readFile(jobsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredJob[];
    if (Array.isArray(parsed)) fromFile = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return mergeJobs(fromFile, memoryJobs);
}

async function writeJobs(jobs: StoredJob[]) {
  memoryJobs = jobs.map(normalizeJob);
  const file = jobsFilePath();
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify(memoryJobs, null, 2));
    await rename(temporary, file);
  } catch (error) {
    // Memory still holds the jobs for this isolate; disk may be unavailable.
    console.error("jobs persist failed; using memory only", error);
  }
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

/**
 * Poll Higgsfield directly by statusUrl/requestId from a prior generate response.
 * Works across serverless instances when local job files are missing.
 */
export async function pollRemoteJob(input: {
  statusUrl?: string | null;
  requestId?: string | null;
  jobId?: string | null;
}) {
  const target = resolveStatusTarget(input);
  const remote = await getRequestStatus(target.statusUrl);

  const local = await locked(async () => {
    const jobs = await readJobs();
    const index = jobs.findIndex(
      (job) =>
        (input.jobId && job.id === input.jobId) ||
        job.requestId === target.requestId ||
        job.statusUrl === target.statusUrl,
    );
    if (index < 0) return null;
    if (!isActive(jobs[index]) && jobs[index].status !== "submitting") {
      return toPublic(jobs[index]);
    }
    jobs[index] = applyHiggsStatus(jobs[index], remote);
    await writeJobs(jobs);
    return toPublic(jobs[index]);
  });

  if (local) return { job: local };

  let status = REMOTE_STATUSES.has(remote.status as JobStatus)
    ? (remote.status as JobStatus)
    : "in_progress";
  let error = remote.error;
  if (status === "completed" && !remote.outputUrl) {
    status = "failed";
    error = "Higgsfield finished without a media file.";
  }
  if (status === "nsfw") error = error || "Higgsfield stopped this for content moderation.";
  if (status === "failed") error = error || "Generation failed.";

  return {
    job: {
      id: input.jobId || target.requestId,
      status,
      prompt: "",
      mode: remote.outputKind === "image" ? "image" : "video",
      model: "",
      audio: null,
      style: null,
      aspectRatio: "16:9" as const,
      duration: null,
      inputImageUrl: null,
      outputUrl: remote.outputUrl,
      outputKind: remote.outputKind,
      referenceId: remote.referenceId,
      requestId: target.requestId,
      statusUrl: target.statusUrl,
      error,
      estimate: null,
      createdAt: new Date().toISOString(),
    } satisfies PublicJob,
  };
}
