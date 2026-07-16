import type { Variants, Transition } from "framer-motion";

// Shared motion vocabulary for the onboarding flow. One spring, used
// everywhere, so every step change feels like the same physical object.
export const stepSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.9,
};

// Step-level enter/exit used with <AnimatePresence mode="wait">.
export const stepVariants: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: stepSpring },
  exit: { opacity: 0, y: -14, scale: 0.99, transition: { duration: 0.18, ease: "easeIn" } },
};

// Container that staggers its children on mount.
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

// Child items inside a stagger container.
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: stepSpring },
};
