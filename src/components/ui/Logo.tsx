interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Dhwani's theme-aware wordmark icon — a ring + wave, inline SVG using
 * currentColor so it inherits the app's existing .dark class / palette
 * tokens instead of needing its own theme logic. The accent dot stays a
 * literal #f5a94a (matches --color-flow-warm) in both themes, same as the
 * static logo.svg it does NOT replace (logo.svg is still used by
 * CliIntegrationCard/McpIntegrationCard and is left as-is).
 */
export function Logo({ size = 56, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Dhwani"
    >
      <path
        d="M53 41 A27 27 0 1 1 53 23"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M20 32 Q26 18 32 32 T44 32"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="44" cy="32" r="4" fill="#f5a94a" />
    </svg>
  );
}
