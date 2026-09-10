import { useEffect, useRef, useState } from "react";
import { postTts, type TtsAlignment } from "@/lib/aura-api";

/**
 * Speaks a JARVIS message through the backend /tts endpoint and types it out in perfect sync.
 * Prevents voice overlaps by cancelling Web SpeechSynthesis and HTML Audio on every new message.
 */
export function useJarvisSpeech(message: string | null | undefined) {
  const [typed, setTyped] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [voice, setVoice] = useState<"idle" | "audio" | "text-only">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenMessageRef = useRef<string>("");

  // Helper to stop all playing audio and speech synthesis immediately
  const stopAllSpeech = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {}
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  };

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
    stopAllSpeech();

    if (!message) {
      lastSpokenMessageRef.current = "";
      setTyped("");
      setComplete(false);
      setSpeaking(false);
      setVoice("idle");
      return;
    }

    if (message === lastSpokenMessageRef.current) {
      return;
    }
    lastSpokenMessageRef.current = message;

    let cancelled = false;
    let typeInterval: ReturnType<typeof setInterval> | null = null;
    let frameId: number | null = null;
    let release: (() => void) | null = null;
    const controller = new AbortController();

    setTyped("");
    setComplete(false);
    setSpeaking(true);

    let audioDone = false;
    let typingDone = false;

    const finish = () => {
      if (cancelled) return;
      if (typeInterval) {
        clearInterval(typeInterval);
        typeInterval = null;
      }
      setTyped(message);
      setComplete(true);
      setSpeaking(false);
    };

    const tryFinish = () => {
      if (audioDone && typingDone) {
        finish();
      }
    };

    // Start typewriter reveal immediately so panel never stays blank
    const startTypewriter = (durationSeconds?: number) => {
      if (typeInterval) clearInterval(typeInterval);
      let charIndex = 0;
      // Calculate ms per character based on audio duration or default ~35ms
      const msPerChar = durationSeconds && durationSeconds > 0
        ? Math.max(15, (durationSeconds * 1000) / message.length)
        : 35;

      typeInterval = setInterval(() => {
        if (cancelled) return;
        charIndex += 1;
        setTyped(message.slice(0, charIndex));

        if (charIndex >= message.length) {
          if (typeInterval) clearInterval(typeInterval);
          typeInterval = null;
          typingDone = true;
          tryFinish();
        }
      }, msPerChar);
    };

    // Begin steady typing fallback right away
    startTypewriter();

    const run = async () => {
      try {
        const { src, release: rel, alignment } = await postTts(message, controller.signal);
        release = rel;
        if (cancelled) {
          rel();
          return;
        }

        stopAllSpeech();
        const audio = new Audio(src);
        audioRef.current = audio;
        setVoice("audio");

        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("audio decode")), { once: true });
          setTimeout(() => reject(new Error("audio timeout")), 6000);
        });

        if (cancelled) return;

        // Recalibrate typewriter speed if audio duration is known
        if (audio.duration && audio.duration > 0) {
          startTypewriter(audio.duration);
        }

        audio.addEventListener("ended", () => {
          if (!cancelled) {
            audioDone = true;
            tryFinish();
          }
        });

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            if (!cancelled) {
              setVoice("text-only");
              audioDone = true;
              tryFinish();
            }
          });
        }
      } catch {
        if (cancelled) return;
        setVoice("text-only");
        stopAllSpeech();

        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            const utt = new SpeechSynthesisUtterance(message);
            utt.rate = 1.0;

            utt.onboundary = (event) => {
              if (cancelled) return;
              const idx = event.charIndex + (event.charLength || 1);
              if (idx > typed.length) {
                setTyped(message.slice(0, idx));
              }
            };

            utt.onend = () => {
              if (!cancelled) {
                audioDone = true;
                typingDone = true;
                finish();
              }
            };

            utt.onerror = () => {
              if (!cancelled) {
                audioDone = true;
                typingDone = true;
                finish();
              }
            };

            window.speechSynthesis.speak(utt);
          } catch {
            audioDone = true;
            // Handled by typewriter fallback
          }
        } else {
          audioDone = true;
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      if (typeInterval) clearInterval(typeInterval);
      if (frameId) cancelAnimationFrame(frameId);
      stopAllSpeech();
      release?.();
    };
  }, [message]);

  return { typed, speaking, complete, voice };
}
