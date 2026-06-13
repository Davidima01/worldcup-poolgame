import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "fp-theme";

function getInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const t = getInitial();
    setThemeState(t);
    apply(t);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, setTheme, toggle };
}
