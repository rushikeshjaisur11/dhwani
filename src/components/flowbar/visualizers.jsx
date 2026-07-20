import React from "react";

export const LiveWaveform = ({ levels, isCommandMode }) => {
  const bars = levels.filter((_, i) => i % 2 === 0);
  const gradient = isCommandMode
    ? "linear-gradient(180deg, #fde68a, #f59e0b)"
    : "linear-gradient(180deg, #c4b5fd, #6d4fe0)";

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center gap-[3px] px-1">
      {bars.map((level, i) => (
        <div
          key={i}
          className="w-[4px] rounded-full transition-[height] duration-75"
          style={{
            height: `${8 + level * 26}px`,
            background: gradient,
            transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      ))}
    </div>
  );
};

export const SiriOrbVisualizer = ({ levels, isCommandMode }) => {
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  const scale = 1 + avg * 0.5;
  const coreColor = isCommandMode ? "251,191,36" : "167,139,250";
  const auraColor = isCommandMode ? "245,158,11" : "139,110,240";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      <div
        className="transition-transform duration-100 ease-out"
        style={{ width: "34px", height: "34px", transform: `scale(${scale})` }}
      >
        <div
          className="flow-viz-siri-spin"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: `conic-gradient(from 0deg, rgba(${coreColor},1), rgba(${auraColor},1), rgba(${coreColor},1))`,
            filter: "blur(6px)",
          }}
        />
      </div>
    </div>
  );
};

export const NeonPulseVisualizer = ({ levels, isCommandMode }) => {
  const bars = levels.slice(0, 9);
  const glowColor = isCommandMode ? "rgba(245,158,11,0.9)" : "rgba(167,139,250,0.9)";

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[3px] pointer-events-none">
      {bars.map((level, i) => (
        <div
          key={i}
          className="w-[2.5px] rounded-full bg-white transition-[height] duration-75"
          style={{
            height: `${6 + level * 22}px`,
            boxShadow: `0 0 6px 1px ${glowColor}`,
          }}
        />
      ))}
    </div>
  );
};

export const ParticleSwarmVisualizer = ({ levels, isCommandMode }) => {
  const dotColor = isCommandMode ? "rgba(245,158,11,0.9)" : "rgba(139,110,240,0.9)";
  const dots = [levels[0], levels[2], levels[5], levels[8], levels[11], levels[13]];

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[10px] pointer-events-none">
      {dots.map((level, i) => (
        <div
          key={i}
          className="w-[5px] h-[5px] rounded-full transition-transform duration-100 ease-out"
          style={{
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
            transform: `translateY(${-(level - 0.15) * 16}px) scale(${0.6 + level * 0.8})`,
            opacity: 0.3 + level * 0.7,
          }}
        />
      ))}
    </div>
  );
};

export const RippleWaveVisualizer = ({ levels, isCommandMode }) => {
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  const ringColor = isCommandMode ? "rgba(245,158,11,0.55)" : "rgba(109,79,224,0.55)";

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        className="absolute rounded-full border-2 transition-transform duration-150 ease-out"
        style={{
          width: "16px",
          height: "16px",
          borderColor: ringColor,
          transform: `scale(${1 + avg * 6})`,
          opacity: Math.max(0, 1 - avg * 1.1),
        }}
      />
      <div
        className="absolute rounded-full border-2 transition-transform duration-150 ease-out"
        style={{
          width: "16px",
          height: "16px",
          borderColor: ringColor,
          transform: `scale(${1 + avg * 3.5})`,
          opacity: Math.max(0, 1 - avg * 0.7),
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: "8px", height: "8px", background: ringColor }}
      />
    </div>
  );
};

export const LiquidPlasmaVisualizer = ({ levels, isCommandMode }) => {
  const getBand = (start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += levels[i] || 0.15;
    return sum / (end - start);
  };

  const b1 = getBand(0, 5);
  const b2 = getBand(5, 10);
  const b3 = getBand(10, 14);

  const gradient = isCommandMode
    ? "radial-gradient(ellipse at 30% 50%, #fde68a, #f59e0b 60%, transparent 85%)"
    : "radial-gradient(ellipse at 30% 50%, #c4b5fd, #6d4fe0 60%, transparent 85%)";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      <div
        className="transition-all duration-100 ease-out"
        style={{
          width: `${70 + b1 * 30}px`,
          height: `${22 + b2 * 14}px`,
          background: gradient,
          filter: "blur(6px)",
          borderRadius: `${50 - b3 * 15}% / 50%`,
        }}
      />
    </div>
  );
};
