// ponytail: hand-rolled SVG arc — no chart lib installed in this repo, and one
// gauge doesn't justify adding one. Swap for a lib if more gauges show up.
interface RadialGaugeProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}

export default function RadialGauge({
  value,
  max,
  size = 120,
  strokeWidth = 10,
}: RadialGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI; // half circle
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const dashOffset = circumference * (1 - progress);
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size / 2 + strokeWidth / 2}
      viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}
    >
      <path
        d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
        fill="none"
        stroke="var(--color-progress-track)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
        fill="none"
        stroke="currentColor"
        className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
}
