import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const palette = useSettingsStore((s) => s.palette);
  const accentColor = useSettingsStore((s) => s.accentColor);

  useEffect(() => {
    const htmlElement = document.documentElement;

    // Apply palette
    if (palette === "default") {
      htmlElement.removeAttribute("data-palette");
    } else {
      htmlElement.setAttribute("data-palette", palette);
    }

    // Apply accent color
    if (accentColor) {
      htmlElement.style.setProperty("--color-primary", accentColor);
      htmlElement.style.setProperty("--color-ring", accentColor);
      htmlElement.style.setProperty("--color-accent", accentColor);
      document.body.style.setProperty("--color-primary", accentColor);
      document.body.style.setProperty("--color-ring", accentColor);
      document.body.style.setProperty("--color-accent", accentColor);
    } else {
      htmlElement.style.removeProperty("--color-primary");
      htmlElement.style.removeProperty("--color-ring");
      htmlElement.style.removeProperty("--color-accent");
      document.body.style.removeProperty("--color-primary");
      document.body.style.removeProperty("--color-ring");
      document.body.style.removeProperty("--color-accent");
    }

    // Determine effective theme
    const effectiveTheme: "light" | "dark" =
      theme === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;

    // Apply dark class
    if (effectiveTheme === "dark") {
      htmlElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      htmlElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }

    // Listen for system preference changes (only when auto)
    if (theme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          htmlElement.classList.add("dark");
          document.body.classList.add("dark");
        } else {
          htmlElement.classList.remove("dark");
          document.body.classList.remove("dark");
        }
      };

      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme, palette, accentColor]);

  return { theme, setTheme };
}
