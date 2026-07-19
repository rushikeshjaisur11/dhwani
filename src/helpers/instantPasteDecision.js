// Guardrails before replacing an already-pasted raw transcript with the
// cleaned-up version. All four must hold; if any fails, the raw paste
// simply stays as the final pasted text.
export function shouldAttemptReplace({
  autoPasteEnabled,
  textChanged,
  dictationIdMatches,
  foregroundAppMatches,
}) {
  return !!(autoPasteEnabled && textChanged && dictationIdMatches && foregroundAppMatches);
}
