import { StudioError } from "@/lib/errors";
import { findModel } from "@/lib/models";
import { composePrompt, type GenerationRequest } from "@/lib/prompts";
import type { Estimate } from "@/lib/types";

const API_BASE = "https://api.higgsfield.ai";
const USER_AGENT = "higgsfield-server-js/2.0";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MEDIA_TYPES = new Set([...IMAGE_TYPES, "video/mp4"]);

export type SubmittedRequest = {
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
  estimate: Estimate | null;
};

export type HiggsStatus = {
  status: string;
  error: string | null;
  outputUrl: string | null;
  outputKind: "video" | "image" | null;
  referenceId: string | null;
};

type Credentials = {
  id: string;
  secret: string;
};

function splitCombined(value: string) {
  const splitAt = value.indexOf(":");
  if (splitAt <= 0 || splitAt === value.length - 1) return null;
  return { id: value.slice(0, splitAt), secret: value.slice(splitAt + 1) };
}

export function getCredentials(): Credentials | null {
  const id = process.env.HF_API_KEY_ID?.trim() ?? "";
  let secret = process.env.HF_API_KEY_SECRET?.trim() ?? "";

  // The console copies one string, KEY_ID:KEY_SECRET. Accept that in either field.
  if (!secret && id.includes(":")) {
    const combined = splitCombined(id);
    if (combined) return combined;
  }
  if (id && secret.startsWith(`${id}:`)) {
    secret = secret.slice(id.length + 1);
  }
  if (id && secret) return { id, secret };

  const fromEnv = splitCombined((process.env.HF_CREDENTIALS || process.env.HF_KEY || "").trim());
  return fromEnv;
}

export function requireCredentials() {
  const credentials = getCredentials();
  if (!credentials) {
    throw new StudioError(
      "Add HF_API_KEY_ID and HF_API_KEY_SECRET to .env.local, then restart the server.",
      503,
    );
  }
  return credentials;
}

function authHeader(credentials: Credentials) {
  return `Key ${credentials.id}:${credentials.secret}`;
}

function higgsUrl(requestId: string, action: "status" | "cancel") {
  return `${API_BASE}/requests/${requestId}/${action}`;
}

function trustedHiggsUrl(value: unknown, requestId: string, action: "status" | "cancel") {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.origin === API_BASE && url.pathname === `/requests/${requestId}/${action}`) {
        return url.toString();
      }
    } catch {
      return higgsUrl(requestId, action);
    }
  }
  return higgsUrl(requestId, action);
}

/** Accept statusUrl or requestId from ChatGPT Actions; never allow arbitrary hosts. */
export function resolveStatusTarget(input: { statusUrl?: string | null; requestId?: string | null }) {
  const requestId = input.requestId?.trim() ?? "";
  if (requestId && /^[a-zA-Z0-9_-]+$/.test(requestId)) {
    return { requestId, statusUrl: higgsUrl(requestId, "status") };
  }

  const raw = input.statusUrl?.trim() ?? "";
  if (!raw) {
    throw new StudioError("Send statusUrl from generate, or requestId.", 400);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new StudioError("statusUrl must be a valid https URL.", 400);
  }

  if (url.origin !== API_BASE || url.protocol !== "https:") {
    throw new StudioError("statusUrl must be a Higgsfield API URL.", 400);
  }

  const match = url.pathname.match(/^\/requests\/([^/]+)\/status$/);
  if (!match) {
    throw new StudioError("statusUrl must point at a Higgsfield request status.", 400);
  }

  return { requestId: match[1], statusUrl: `${API_BASE}/requests/${match[1]}/status` };
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
    if (Array.isArray(body.detail)) {
      const text = body.detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") {
            return item.msg;
          }
          return "";
        })
        .filter(Boolean)
        .join("; ");
      if (text) return text;
    }
  } catch {
    return response.statusText || "Higgsfield request failed";
  }
  return response.statusText || "Higgsfield request failed";
}

async function higgsFetch(path: string, init: RequestInit) {
  const credentials = requireCredentials();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(credentials),
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...init.headers,
      },
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new StudioError(
        "Higgsfield did not answer in time. The generation was not retried, so a second one would not start by accident.",
        504,
      );
    }
    throw new StudioError("Could not reach Higgsfield.", 502);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new StudioError("Higgsfield redirected the request. Nothing was submitted.", 502);
  }

  return response;
}

function generationBody(request: GenerationRequest) {
  const prompt = composePrompt(request.prompt, request.style);
  const model = findModel(request.model);
  if (!model || model.mode !== request.mode) {
    throw new StudioError("Choose a model for this output.", 400);
  }

  if (model.mode === "image") {
    const aspect = { aspect_ratio: request.aspectRatio };
    if (model.kind === "grok") {
      return {
        path: model.path,
        outputKind: "image" as const,
        body: {
          prompt,
          resolution: "1k",
          ...aspect,
          quality: "medium",
          ...(request.imageUrl ? { image_urls: [request.imageUrl] } : {}),
        },
      };
    }

    if (model.kind === "ideogram") {
      return {
        path: model.path,
        outputKind: "image" as const,
        body: {
          prompt,
          ...aspect,
          rendering_speed: "DEFAULT",
          ...(request.imageUrl ? { image_url: request.imageUrl } : {}),
        },
      };
    }

    if (model.kind === "qwen") {
      if (request.imageUrl && model.editPath) {
        return {
          path: model.editPath,
          outputKind: "image" as const,
          body: {
            prompt,
            image_urls: [request.imageUrl],
            resolution: model.resolution ?? "1k",
            ...aspect,
          },
        };
      }
      return {
        path: model.path,
        outputKind: "image" as const,
        body: {
          prompt,
          resolution: model.resolution ?? "1k",
          ...aspect,
        },
      };
    }

    if (model.kind === "marketing") {
      return {
        path: model.path,
        outputKind: "image" as const,
        body: {
          prompt,
          quality: "high",
          resolution: model.resolution ?? "2k",
          ...aspect,
          ...(request.imageUrl ? { image_urls: [request.imageUrl] } : {}),
        },
      };
    }

    if (model.kind === "plain") {
      return {
        path: model.path,
        outputKind: "image" as const,
        body: {
          prompt,
          ...(model.resolution ? { resolution: model.resolution } : {}),
          ...aspect,
        },
      };
    }

    return {
      path: model.path,
      outputKind: "image" as const,
      body: {
        prompt,
        ...aspect,
        resolution: model.resolution ?? "720p",
        enhance_prompt: Boolean(request.style),
        batch_size: 1,
        ...(request.characterId ? { custom_reference_id: request.characterId } : {}),
      },
    };
  }

  const audioField =
    model.audio === "sound"
      ? { sound: request.audio ? "on" : "off" }
      : model.audio === "generate_audio"
        ? { generate_audio: request.audio }
        : {};
  const resolution = model.resolution ? { resolution: model.resolution } : {};
  const sendAspect = request.imageUrl ? model.aspectOnImage : model.aspectOnText;
  const aspect = sendAspect ? { aspect_ratio: request.aspectRatio } : {};

  if (request.imageUrl) {
    const imageField = model.imageList
      ? { image_urls: [request.imageUrl] }
      : { image_url: request.imageUrl };
    return {
      path: model.imagePath,
      outputKind: "video" as const,
      body: {
        ...imageField,
        ...(prompt ? { prompt } : {}),
        duration: request.duration,
        ...resolution,
        ...aspect,
        ...audioField,
      },
    };
  }

  return {
    path: model.textPath,
    outputKind: "video" as const,
    body: {
      prompt,
      duration: request.duration,
      ...resolution,
      ...aspect,
      ...audioField,
    },
  };
}

function httpsMedia(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function readEstimate(response: Response): Promise<Estimate | null> {
  if (!response.ok) {
    const message = await errorMessage(response);
    if (response.status >= 500) return null;
    throw new StudioError(message, response.status);
  }

  const body = (await response.json()) as { credits?: unknown; usd?: unknown };
  if (typeof body.credits !== "string" || typeof body.usd !== "string") return null;
  return { credits: body.credits, usd: body.usd };
}

export async function submitGeneration(request: GenerationRequest): Promise<SubmittedRequest> {
  const target = generationBody(request);
  return submitPayload(target.path, target.body, true);
}

export async function submitPayload(path: string, payloadBody: unknown, estimateFirst: boolean): Promise<SubmittedRequest> {
  const payload = JSON.stringify(payloadBody);

  let estimate: Estimate | null = null;
  if (estimateFirst) {
    try {
      const estimateResponse = await higgsFetch(`/estimate${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      estimate = await readEstimate(estimateResponse);
    } catch (error) {
      if (error instanceof StudioError && error.status < 500) throw error;
      estimate = null;
    }
  }

  const response = await higgsFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    const correlation = response.headers.get("x-correlation-id");
    console.error("Higgsfield submit failed", response.status, path, correlation);
    throw new StudioError(message, response.status);
  }

  const body = (await response.json()) as {
    request_id?: unknown;
    status_url?: unknown;
    cancel_url?: unknown;
  };

  if (typeof body.request_id !== "string" || !body.request_id) {
    throw new StudioError("Higgsfield accepted the request without an id.", 502);
  }

  return {
    requestId: body.request_id,
    statusUrl: trustedHiggsUrl(body.status_url, body.request_id, "status"),
    cancelUrl: trustedHiggsUrl(body.cancel_url, body.request_id, "cancel"),
    estimate,
  };
}

export async function getRequestStatus(statusUrl: string): Promise<HiggsStatus> {
  const credentials = requireCredentials();
  const response = await fetch(statusUrl, {
    headers: {
      Authorization: authHeader(credentials),
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });

  if (response.status >= 300 && response.status < 400) {
    throw new StudioError("Higgsfield redirected the status check.", 502);
  }

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new StudioError(message, response.status);
  }

  const body = (await response.json()) as {
    status?: unknown;
    error?: unknown;
    video?: { url?: unknown };
    images?: { url?: unknown }[];
  };

  const videoUrl = httpsMedia(body.video?.url);
  const imageUrl = httpsMedia(body.images?.[0]?.url);

  return {
    status: typeof body.status === "string" ? body.status : "in_progress",
    error: typeof body.error === "string" ? body.error : null,
    outputUrl: videoUrl ?? imageUrl,
    outputKind: videoUrl ? "video" : imageUrl ? "image" : null,
    referenceId: null,
  };
}

export async function getReferenceStatus(referenceId: string): Promise<HiggsStatus> {
  const response = await higgsFetch(`/v1/custom-references/${referenceId}`, { method: "GET" });
  if (!response.ok) {
    throw new StudioError(await errorMessage(response), response.status);
  }

  const body = (await response.json()) as {
    id?: unknown;
    status?: unknown;
    thumbnail_url?: unknown;
    fail_reason?: unknown;
  };
  const remote = typeof body.status === "string" ? body.status : "in_progress";
  const status = remote === "not_ready" ? "queued" : remote;
  const thumbnail = httpsMedia(body.thumbnail_url);
  const id = typeof body.id === "string" ? body.id : referenceId;

  return {
    status,
    error: typeof body.fail_reason === "string" ? body.fail_reason : null,
    outputUrl: thumbnail,
    outputKind: thumbnail ? "image" : null,
    referenceId: id,
  };
}

export async function submitCharacter(body: unknown) {
  const response = await higgsFetch("/v1/custom-references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new StudioError(await errorMessage(response), response.status);
  }

  const created = (await response.json()) as {
    id?: unknown;
    status?: unknown;
    thumbnail_url?: unknown;
    fail_reason?: unknown;
  };
  if (typeof created.id !== "string" || !created.id) {
    throw new StudioError("Higgsfield started character training without an id.", 502);
  }

  const remote = typeof created.status === "string" ? created.status : "queued";
  return {
    id: created.id,
    status: remote === "not_ready" ? "queued" : remote,
    thumbnail: httpsMedia(created.thumbnail_url),
    failReason: typeof created.fail_reason === "string" ? created.fail_reason : null,
  };
}

export async function cancelRequest(cancelUrl: string) {
  const credentials = requireCredentials();
  const response = await fetch(cancelUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader(credentials),
      "User-Agent": USER_AGENT,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new StudioError("Higgsfield redirected the cancellation.", 502);
  }

  if (response.ok) return "canceled" as const;

  if (response.status === 400) return "started" as const;

  const message = await errorMessage(response);
  throw new StudioError(message, response.status);
}

export function normalizeImageType(type: string, name: string) {
  const normalized = type === "image/jpg" ? "image/jpeg" : type.toLowerCase();
  if (IMAGE_TYPES.has(normalized)) return normalized;

  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return null;
}

export function normalizeUploadType(type: string, name: string) {
  const image = normalizeImageType(type, name);
  if (image) return image;
  if (type.toLowerCase() === "video/mp4" || name.toLowerCase().endsWith(".mp4")) return "video/mp4";
  return null;
}

export async function uploadInput(bytes: Uint8Array, contentType: string) {
  if (!MEDIA_TYPES.has(contentType)) {
    throw new StudioError("Use a JPEG, PNG, WebP, GIF, or MP4.", 400);
  }

  const created = await higgsFetch("/files/generate-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType }),
  });

  if (!created.ok) {
    throw new StudioError(await errorMessage(created), created.status);
  }

  const ticket = (await created.json()) as {
    public_url?: unknown;
    upload_url?: unknown;
    upload_headers?: unknown;
  };

  const publicUrl = httpsMedia(ticket.public_url);
  if (typeof ticket.upload_url !== "string" || !publicUrl) {
    throw new StudioError("Higgsfield did not return an upload location.", 502);
  }

  const headers = new Headers();
  if (ticket.upload_headers && typeof ticket.upload_headers === "object") {
    for (const [key, value] of Object.entries(ticket.upload_headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", contentType);

  let uploaded: Response;
  try {
    uploaded = await fetch(ticket.upload_url, {
      method: "PUT",
      headers,
      body: Buffer.from(bytes),
      signal: AbortSignal.timeout(contentType === "video/mp4" ? 120_000 : 60_000),
    });
  } catch {
    throw new StudioError("The image did not finish uploading.", 502);
  }

  if (!uploaded.ok) {
    throw new StudioError("The image upload was rejected.", uploaded.status || 502);
  }

  return publicUrl;
}
