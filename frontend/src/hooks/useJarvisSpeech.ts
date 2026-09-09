import { useEffect, useRef, useState } from "react";
import { postTts, type TtsAlignment } from "@/lib/aura-api";

/**
 * Speaks a JARVIS message through the backend /tts endpoint and types it out.
 *
 * Preferred path: /tts returns { audio_base64, alignment }. The alignment gives
 * per-character start timestamps, so a requestAnimationFrame loop reads the
 * audio element's `currentTime` and reveals exactly the characters that have
 * already been spoken. Typing therefore inherits the real speech rhythm
 * (pauses, drawn-out words) instead of a constant rate, and stays correct even
 * if playback stutters or is delayed.
 *
 * Fallback path (alignment null or /tts failure): unchanged — even pacing over
 * the audio duration, or 30ms/char with no audio at all.
 */
export function useJarvisSpeech(message: string | null | undefined) {
  const [typed, setTyped] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [voice, setVoice] = useState<"idle" | "audio" | "text-only">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenMessageRef = useRef<string>("");

  // Global user gesture unlock for browser audio / speech synthesis
  useEffect(() => {
    const unlock = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        } catch {}
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!message) {
      lastSpokenMessageRef.current = "";
      setTyped("");
      setComplete(false);
      setSpeaking(false);
      return;
    }

    if (message === lastSpokenMessageRef.current) {
      return;
    }
    lastSpokenMessageRef.current = message;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let frame: number | null = null;
    let release: (() => void) | null = null;
    const controller = new AbortController();

    setTyped("");
    setComplete(false);
    setSpeaking(true);

    const finish = () => {
      setTyped(message);
      setComplete(true);
      setSpeaking(false);
    };

    /** Fallback / immediate typewriter reveal. */
    const type = (msPerChar: number) => {
      if (cancelled) return;
      if (timer) clearInterval(timer);
      let i = 0;
      timer = setInterval(() => {
        i += 1;
        setTyped(message.slice(0, i));
        if (i >= message.length) {
          if (timer) clearInterval(timer);
          timer = null;
          finish();
        }
      }, Math.max(8, msPerChar));
    };

    // Immediately start character reveal so panel never freezes blank while fetching /tts audio
    type(30);

    /** Alignment-driven reveal, clocked off the audio element itself. */
    const typeWithAlignment = (audio: HTMLAudioElement, alignment: TtsAlignment) => {
      const starts = alignment.character_start_times_seconds;
      const chars = alignment.characters ?? [];
      const exact = chars.join("") === message;
      const scale = starts.length > 0 ? message.length / starts.length : 1;

      const tick = () => {
        if (cancelled) return;
        const t = audio.currentTime;
        let lo = 0;
        let hi = starts.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if ((starts[mid] ?? 0) <= t) lo = mid + 1;
          else hi = mid;
        }
        const i = lo;

        const shown = exact ? i : Math.round(i * scale);
        setTyped(message.slice(0, Math.min(shown, message.length)));

        const done = i >= starts.length && (audio.ended || audio.currentTime >= audio.duration);
        if (done) {
          finish();
          return;
        }
        frame = requestAnimationFrame(tick);
      };

      audio.addEventListener("ended", () => {
        if (!cancelled) finish();
      });
      frame = requestAnimationFrame(tick);
    };

    const run = async () => {
      try {
        const { src, release: rel, alignment } = await postTts(message, controller.signal);
        release = rel;
        if (cancelled) {
          rel();
          return;
        }
        const audio = new Audio(src);
        audioRef.current = audio;
        setVoice("audio");
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("audio decode")), {
            once: true,
          });
          setTimeout(() => reject(new Error("audio timeout")), 6000);
        });
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            if (!cancelled) {
              setVoice("text-only");
            }
          });
        }

        if (alignment && alignment.character_start_times_seconds.length > 0) {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          typeWithAlignment(audio, alignment);
          return;
        }

        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        type(duration ? (duration * 1000) / message.length : 30);
      } catch {
        if (cancelled) return;
        setVoice("text-only");
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
            window.speechSynthesis.resume();
            const utt = new SpeechSynthesisUtterance(message);
            utt.rate = 1.05;
            utt.onboundary = (event) => {
              if (cancelled) return;
              const idx = event.charIndex + (event.charLength || 1);
              setTyped(message.slice(0, idx));
            };
            utt.onend = () => {
              if (!cancelled) finish();
            };
            window.speechSynthesis.speak(utt);
          } catch {
            // ignore speech synthesis failures
          }
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      audioRef.current?.pause();
      audioRef.current = null;
      release?.();
    };
  }, [message]);

  return { typed, speaking, complete, voice };
}
