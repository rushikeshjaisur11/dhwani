import { useTranslation } from "react-i18next";
import { m } from "framer-motion";
import { useMicLevel } from "../../hooks/useMicLevel";

// Live mic visualizer for the activation step: reuses the pill's
// useMicLevel hook (14 bar levels) and drives one orb's glow/scale from
// the average level. Mic is only open while this component is mounted.
export default function MicTestOrb({ active = true }: { active?: boolean }) {
  const { t } = useTranslation();
  const levels = useMicLevel(active);
  const avg = levels.reduce((sum, v) => sum + v, 0) / levels.length;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-10 w-10 shrink-0">
        <m.div
          animate={{ scale: 1 + avg * 0.5, opacity: 0.35 + avg * 0.65 }}
          transition={{ duration: 0.1, ease: "linear" }}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, var(--color-flow-accent), var(--color-flow-accent-strong))",
            boxShadow: `0 0 ${Math.round(avg * 28)}px var(--color-flow-accent)`,
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("onboarding.activation.micTestHint")}</p>
    </div>
  );
}
