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

  useEffect(() => {
    if (!message) {
      setTyped("");
      setComplete(false);
      setSpeaking(false);
      return;
    }

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

    /** Fallback: constant-rate reveal. */
    const type = (msPerChar: number) => {
      if (cancelled) return;
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

    /** Alignment-driven reveal, clocked off the audio element itself. */
    const typeWithAlignment = (audio: HTMLAudioElement, alignment: TtsAlignment) => {
      const starts = alignment.character_start_times_seconds;
      const chars = alignment.characters ?? [];
      // ElevenLabs may normalize text (numbers, abbreviations), so the aligned
      // string can differ in length from the displayed message. When it matches
      // we index 1:1; otherwise we scale the aligned index onto the message.
      const exact = chars.join("") === message;
      const scale = starts.length > 0 ? message.length / starts.length : 1;

      const tick = () => {
        if (cancelled) return;
        const t = audio.currentTime;
        // Advance while the next character's start time has already passed.
        let i = 0;
        // starts is ascending; binary search keeps this cheap on long messages.
        let lo = 0;
        let hi = starts.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if ((starts[mid] ?? 0) <= t) lo = mid + 1;
          else hi = mid;
        }
        i = lo;

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
              type(30);
            }
          });
        }

        if (alignment && alignment.character_start_times_seconds.length > 0) {
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
            const utt = new SpeechSynthesisUtterance(message);
            utt.rate = 1.05;
            window.speechSynthesis.speak(utt);
          } catch {
            // ignore speech synthesis failures
          }
        }
        type(30);
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
