import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import type { Transform } from "../config/transforms/loadEffectiveTransforms";

interface TransformPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transforms: Transform[];
}

// Static "how it works" preview (no live LLM call — matches the reference
// onboarding popup). Shows the two builtin transforms side by side against
// the original text so a user can see what Transforms do before creating
// their own.
export default function TransformPreviewDialog({
  open,
  onOpenChange,
  transforms,
}: TransformPreviewDialogProps) {
  const { t } = useTranslation();
  const previewTransforms = transforms.filter((tr) => tr.builtin).slice(0, 2);
  const original = t("transforms.preview.exampleText");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="font-serif italic text-2xl text-center text-foreground px-4 font-normal">
          {t("transforms.preview.title")}
        </DialogTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground mb-2">
              {t("transforms.preview.original")}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{original}</p>
          </div>
          {previewTransforms.map((tr) => (
            <div key={tr.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground mb-2">{tr.name}</p>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
                {tr.prompt}
              </p>
            </div>
          ))}
        </div>
        <div className="flex justify-center pt-2">
          <Button onClick={() => onOpenChange(false)}>{t("transforms.preview.tryItOut")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
