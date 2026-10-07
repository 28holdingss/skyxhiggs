import { StudioError } from "@/lib/errors";
import { composePrompt, type StyleId } from "@/lib/prompts";

export type StudioTask = "create" | "motion" | "edit" | "extend" | "character";

export type SoulVersion = "v1" | "v2" | "cinema";

type MotionKind = "genjutsu" | "kling-motion";
type EditKind = "seedance-edit" | "kling-edit";

type WorkflowModel = {
  id: string;
  label: string;
  path: string;
  task: Exclude<StudioTask, "create">;
  kind: MotionKind | EditKind | "seedance-extend" | "soul-id";
};

const WORKFLOWS: WorkflowModel[] = [
  {
    id: "genjutsu-motion",
    label: "Genjutsu",
    path: "/higgsfiled/genjutsu/motion-transfer/v1.0",
    task: "motion",
    kind: "genjutsu",
  },
  {
    id: "genjutsu-swap",
    label: "Genjutsu Swap",
    path: "/higgsfiled/genjutsu/object-swap/v1.0",
    task: "motion",
    kind: "genjutsu",
  },
  {
    id: "kling-3-motion",
    label: "Kling 3.0 Motion",
    path: "/kling-video/v3/motion-control/std",
    task: "motion",
    kind: "kling-motion",
  },
  {
    id: "kling-3-motion-pro",
    label: "Kling 3.0 Motion Pro",
    path: "/kling-video/v3/motion-control/pro",
    task: "motion",
    kind: "kling-motion",
  },
  {
    id: "kling-2.6-motion",
    label: "Kling 2.6 Motion",
    path: "/kling-video/motion-control/std",
    task: "motion",
    kind: "kling-motion",
  },
  {
    id: "kling-2.6-motion-pro",
    label: "Kling 2.6 Motion Pro",
    path: "/kling-video/motion-control/pro",
    task: "motion",
    kind: "kling-motion",
  },
  {
    id: "seedance-2.5-edit",
    label: "Seedance 2.5 Edit",
    path: "/bytedance/seedance-2.5/video-edit",
    task: "edit",
    kind: "seedance-edit",
  },
  {
    id: "kling-o3-edit",
    label: "Kling O3 Edit",
    path: "/kling-video/o3/video-edit",
    task: "edit",
    kind: "kling-edit",
  },
  {
    id: "kling-omni-edit",
    label: "Kling Omni Edit",
    path: "/kling-video/omni/video-edit",
    task: "edit",
    kind: "kling-edit",
  },
  {
    id: "seedance-2.5-extend",
    label: "Seedance 2.5 Extend",
    path: "/bytedance/seedance-2.5/video-extend",
    task: "extend",
    kind: "seedance-extend",
  },
  {
    id: "soul-id-v1",
    label: "Soul ID",
    path: "/v1/custom-references",
    task: "character",
    kind: "soul-id",
  },
  {
    id: "soul-id-v2",
    label: "Soul ID v2",
    path: "/v1/custom-references",
    task: "character",
    kind: "soul-id",
  },
  {
    id: "soul-id-cinema",
    label: "Soul ID Cinema",
    path: "/v1/custom-references",
    task: "character",
    kind: "soul-id",
  },
];

const EXTEND_DURATIONS = [5, 10, 15, 30];

export type StudioResolution = "480p" | "720p";
export type StudioBitrate = "standard" | "high";
export type StudioEditMode = "std" | "pro" | "4k";

export type WorkflowProfile = {
  imageLimit: number;
  resolution: boolean;
  bitrate: boolean;
  modes: StudioEditMode[];
  referenceClip: boolean;
};

export type WorkflowRequest = {
  task: Exclude<StudioTask, "create">;
  model: string;
  label: string;
  path: string;
  prompt: string;
  videoUrl: string | null;
  referenceVideoUrl: string | null;
  imageUrls: string[];
  audio: boolean;
  duration: number | null;
  orientation: "image" | "video";
  resolution: StudioResolution;
  bitrate: StudioBitrate;
  editMode: StudioEditMode;
  soulVersion: SoulVersion | null;
};

export function workflowsFor(task: Exclude<StudioTask, "create">) {
  return WORKFLOWS.filter((model) => model.task === task);
}

export function workflowProfile(id: string): WorkflowProfile {
  const model = WORKFLOWS.find((item) => item.id === id);
  if (!model) return { imageLimit: 1, resolution: false, bitrate: false, modes: [], referenceClip: false };
  if (model.kind === "genjutsu") {
    return { imageLimit: 8, resolution: true, bitrate: false, modes: [], referenceClip: false };
  }
  if (model.kind === "kling-motion") {
    return { imageLimit: 1, resolution: false, bitrate: false, modes: [], referenceClip: false };
  }
  if (model.kind === "seedance-edit" || model.kind === "seedance-extend") {
    return { imageLimit: 8, resolution: true, bitrate: true, modes: [], referenceClip: true };
  }
  if (model.id === "kling-o3-edit") {
    return { imageLimit: 4, resolution: false, bitrate: false, modes: ["std", "pro", "4k"], referenceClip: false };
  }
  if (model.kind === "kling-edit") {
    return { imageLimit: 4, resolution: false, bitrate: false, modes: ["std", "pro"], referenceClip: false };
  }
  return { imageLimit: 16, resolution: false, bitrate: false, modes: [], referenceClip: false };
}

export function workflowLabel(id: string) {
  return WORKFLOWS.find((model) => model.id === id)?.label ?? null;
}

export function soulModelFor(version: SoulVersion) {
  if (version === "v2") return "soul-id-v2";
  if (version === "cinema") return "soul-id-cinema";
  return "soul-id-v1";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function httpsList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    const url = httpsUrl(item);
    if (!url) continue;
    urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

export function parseWorkflowRequest(body: unknown, style: StyleId | null): WorkflowRequest {
  if (!isRecord(body)) throw new StudioError("Send the job as JSON.", 400);
  const task = body.task;
  if (task !== "motion" && task !== "edit" && task !== "extend" && task !== "character") {
    throw new StudioError("Choose a job type.", 400);
  }

  const model = WORKFLOWS.find((item) => item.id === body.model && item.task === task);
  if (!model) throw new StudioError("Choose a model for this job.", 400);

  const rawPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (task === "character" && (rawPrompt.length < 1 || rawPrompt.length > 100)) {
    throw new StudioError("Name the character in 100 characters or fewer.", 400);
  }
  if (task !== "character" && rawPrompt.length > 2000) {
    throw new StudioError("Keep the prompt under 2000 characters.", 400);
  }

  const prompt = task === "character" ? rawPrompt : composePrompt(rawPrompt, style);
  const videoUrl = httpsUrl(body.videoUrl);
  const profile = workflowProfile(model.id);
  const imageUrls = httpsList(body.imageUrls, profile.imageLimit);
  const referenceVideoUrl = profile.referenceClip ? httpsUrl(body.referenceVideoUrl) : null;
  if (body.videoUrl && !videoUrl) {
    throw new StudioError("The clip needs a public https URL.", 400);
  }

  if (task === "motion") {
    if (!videoUrl || imageUrls.length < 1) {
      throw new StudioError("Motion needs a clip and a character photo.", 400);
    }
  }
  if (task === "edit" || task === "extend") {
    if (!prompt) throw new StudioError("Describe the change.", 400);
    if (!videoUrl) throw new StudioError("Attach the clip to change.", 400);
  }
  if (task === "character" && imageUrls.length < 1) {
    throw new StudioError("Add at least one photo of the character.", 400);
  }

  const durationValue = Number(body.duration);
  const duration = EXTEND_DURATIONS.includes(durationValue) ? durationValue : 5;
  const orientation = body.orientation === "image" ? "image" : "video";
  const resolution: StudioResolution = body.resolution === "480p" ? "480p" : "720p";
  const bitrate: StudioBitrate = body.bitrate === "standard" ? "standard" : "high";
  const editMode: StudioEditMode =
    body.editMode === "std" || body.editMode === "4k" || body.editMode === "pro" ? body.editMode : "pro";
  const soulVersion: SoulVersion | null =
    model.id === "soul-id-v2" ? "v2" : model.id === "soul-id-cinema" ? "cinema" : model.id === "soul-id-v1" ? "v1" : null;

  return {
    task,
    model: model.id,
    label: model.label,
    path: model.path,
    prompt,
    videoUrl,
    referenceVideoUrl,
    imageUrls,
    audio: body.audio !== false,
    duration: task === "extend" ? duration : null,
    orientation,
    resolution,
    bitrate,
    editMode: profile.modes.includes(editMode) ? editMode : profile.modes[0] ?? "pro",
    soulVersion,
  };
}

export function workflowBody(request: WorkflowRequest) {
  const model = WORKFLOWS.find((item) => item.id === request.model);
  if (!model) throw new StudioError("Choose a model for this job.", 400);

  if (model.kind === "genjutsu") {
    return {
      ...(request.prompt ? { prompt: request.prompt } : {}),
      video_url: request.videoUrl,
      image_urls: request.imageUrls,
      resolution: request.resolution,
    };
  }

  if (model.kind === "kling-motion") {
    return {
      ...(request.prompt ? { prompt: request.prompt } : {}),
      image_url: request.imageUrls[0],
      video_url: request.videoUrl,
      character_orientation: request.orientation,
      keep_original_sound: request.audio ? "yes" : "no",
    };
  }

  if (model.kind === "seedance-edit") {
    return {
      prompt: request.prompt,
      video_url: request.videoUrl,
      resolution: request.resolution,
      bitrate_mode: request.bitrate,
      generate_audio: request.audio,
      ...(request.imageUrls.length > 0 ? { image_urls: request.imageUrls } : {}),
      ...(request.referenceVideoUrl ? { video_urls: [request.referenceVideoUrl] } : {}),
    };
  }

  if (model.kind === "kling-edit") {
    return {
      prompt: request.prompt,
      mode: request.editMode,
      video_urls: [request.videoUrl],
      ...(request.imageUrls.length > 0 ? { image_urls: request.imageUrls } : {}),
    };
  }

  if (model.kind === "seedance-extend") {
    return {
      prompt: request.prompt,
      video_url: request.videoUrl,
      duration: request.duration,
      resolution: request.resolution,
      bitrate_mode: request.bitrate,
      generate_audio: request.audio,
      ...(request.imageUrls.length > 0 ? { image_urls: request.imageUrls } : {}),
      ...(request.referenceVideoUrl ? { video_urls: [request.referenceVideoUrl] } : {}),
    };
  }

  return {
    name: request.prompt,
    model_version: request.soulVersion ?? "v1",
    input_images: request.imageUrls.map((imageUrl) => ({ type: "image_url", image_url: imageUrl })),
  };
}
