import type { AuraTelemetry } from "./aura-types";

/**
 * Base URL of the AURA FastAPI backend.
 * Override with VITE_AURA_API_URL (e.g. https://aura.example.com).
 */
export const API_BASE: string = (
  (import.meta.env["VITE_AURA_API_URL"] as string | undefined) ?? "http://localhost:8000"
).replace(/\/$/, "");

export const WS_URL: string =
  (import.meta.env["VITE_AURA_WS_URL"] as string | undefined) ??
  `${API_BASE.replace(/^http/, "ws")}/ws/live`;

function init(signal?: AbortSignal, extra: RequestInit = {}): RequestInit {
  return signal ? { ...extra, signal } : extra;
}

/** GET /latest — most recent telemetry frame. */
export async function getLatest(signal?: AbortSignal): Promise<AuraTelemetry> {
  const res = await fetch(`${API_BASE}/latest`, init(signal));
  if (!res.ok) throw new Error(`GET /latest failed: ${res.status}`);
  return (await res.json()) as AuraTelemetry;
}

/** GET /health — used to detect whether the backend is reachable at all. */
export async function getHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, init(signal));
    return res.ok;
  } catch {
    return false;
  }
}

/** Per-character timing returned by ElevenLabs alignment data. */
export interface TtsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TtsResult {
  /** Playable source for an Audio element (data URI or object URL). */
  src: string;
  /** Revokes an object URL when one was created; no-op for data URIs. */
  release: () => void;
  /** Null when the backend returned plain audio without timing data. */
  alignment: TtsAlignment | null;
}

/**
 * POST /tts — server-side ElevenLabs synthesis.
 * Accepts either a JSON body `{ audio_base64, alignment }` (preferred, gives
 * real per-character timestamps) or a raw audio/mpeg body (alignment: null).
 * Throws on any non-2xx so the caller can fall back to text-only.
 */
export async function postTts(text: string, signal?: AbortSignal): Promise<TtsResult> {
  const res = await fetch(
    `${API_BASE}/tts`,
    init(signal, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`POST /tts failed: ${res.status} ${detail}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await res.json()) as {
      audio_base64?: string;
      alignment?: TtsAlignment | null;
      normalized_alignment?: TtsAlignment | null;
    };
    if (!data.audio_base64) throw new Error("POST /tts returned no audio_base64");
    const alignment = data.alignment ?? data.normalized_alignment ?? null;
    return {
      src: `data:audio/mpeg;base64,${data.audio_base64}`,
      release: () => undefined,
      alignment:
        alignment && Array.isArray(alignment.character_start_times_seconds)
          ? alignment
          : null,
    };
  }

  const url = URL.createObjectURL(await res.blob());
  return { src: url, release: () => URL.revokeObjectURL(url), alignment: null };
}
