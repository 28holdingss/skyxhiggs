export type JobStatus =
  | "submitting"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export type Estimate = {
  credits: string;
  usd: string;
};

export type PublicJob = {
  id: string;
  status: JobStatus;
  prompt: string;
  mode: "video" | "image";
  model: string;
  audio: boolean | null;
  style: "cinematic" | "anime" | "ad" | "trailer" | "cartoon" | null;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number | null;
  inputImageUrl: string | null;
  outputUrl: string | null;
  outputKind: "video" | "image" | null;
  referenceId: string | null;
  error: string | null;
  estimate: Estimate | null;
  createdAt: string;
};
