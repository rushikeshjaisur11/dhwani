import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { m, useReducedMotion } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { stepSpring } from "./motion";

// Scripted, looping in-app demo of one dictation: hotkey press -> speaking
// orb -> text typing into a faux window -> done. No mic, no IPC — pure
// animation so it runs identically on every machine.

type Phase = "idle" | "press" | "speaking" | "typing" | "done";

// Canned "voice" amplitude frames driving the orb pulse while speaking.
const SPEECH_AMPLITUDES = [0.3, 0.7, 0.5, 0.9, 0.6, 1, 0.5, 0.8, 0.4, 0.9, 0.7, 0.5];

const PRESS_MS = 900;
const SPEAK_MS = 2600;
const TYPE_CHAR_MS = 34;
const DONE_HOLD_MS = 2200;

interface DemoStepProps {
  hotkeyLabel: string;
}

export default function DemoStep({ hotkeyLabel }: DemoStepProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedCount, setTypedCount] = useState(0);
  const [runId, setRunId] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const sentence = t("onboarding.demo.typedText");

  useEffect(() => {
    const timers = timersRef.current;
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    setTypedCount(0);
    setPhase("press");
    later(() => setPhase("speaking"), PRESS_MS);
    later(() => setPhase("typing"), PRESS_MS + SPEAK_MS);

    const typeStart = PRESS_MS + SPEAK_MS;
    for (let i = 1; i <= sentence.length; i++) {
      later(() => setTypedCount(i), typeStart + i * TYPE_CHAR_MS);
    }

    const typeEnd = typeStart + sentence.length * TYPE_CHAR_MS;
    later(() => setPhase("done"), typeEnd + 200);
    later(() => setRunId((id) => id + 1), typeEnd + 200 + DONE_HOLD_MS);

    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, [runId, sentence]);

  const speaking = phase === "speaking";
  const orbScale = reducedMotion ? 1 : speaking ? SPEECH_AMPLITUDES.map((a) => 1 + a * 0.28) : 1;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-0.5">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          {t("onboarding.demo.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("onboarding.demo.description")}</p>
      </div>

      {/* Stage */}
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-6 flex flex-col items-center gap-5">
        {/* Hotkey chip */}
        <m.div
          animate={
            phase === "press"
              ? { scale: [1, 0.92, 1], boxShadow: "0 0 24px 2px var(--color-flow-accent)" }
              : { scale: 1, boxShadow: "0 0 0px 0px transparent" }
          }
          transition={{ duration: 0.5 }}
          className="rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-sm text-foreground"
        >
          {hotkeyLabel}
        </m.div>

        {/* Voice orb */}
        <div className="relative h-16 w-16">
          <m.div
            animate={{
              scale: orbScale,
              opacity: speaking ? 1 : 0.55,
            }}
            transition={speaking ? { duration: SPEAK_MS / 1000, ease: "easeInOut" } : stepSpring}
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 35%, var(--color-flow-accent), var(--color-flow-accent-strong))",
              filter: speaking ? "saturate(1.2)" : "saturate(0.8)",
            }}
          />
          {phase === "done" && (
            <m.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={stepSpring}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-green-500"
            >
              <Check className="h-7 w-7 text-white" />
            </m.div>
          )}
        </div>

        {/* Faux target window the sentence types into */}
        <div className="w-full max-w-md rounded-lg border border-border bg-background shadow-sm overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          </div>
          <div className="min-h-[72px] px-4 py-3 text-sm text-foreground">
            {sentence.slice(0, typedCount)}
            {(phase === "typing" || phase === "speaking" || phase === "press") && (
              <m.span
                animate={reducedMotion ? {} : { opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="inline-block w-0.5 h-4 bg-foreground align-text-bottom ml-px"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          onClick={() => setRunId((id) => id + 1)}
          className="h-8 px-4 rounded-full text-xs text-muted-foreground"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t("onboarding.demo.replay")}
        </Button>
      </div>
    </div>
  );
}
