export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "finance_theme";

function applyThemeClass(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && prefersDark),
  );
}

export function syncTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyThemeClass(theme);
}

export function initializeTheme() {
  const cachedTheme = localStorage.getItem(THEME_KEY);
  const theme: Theme = cachedTheme === "light" || cachedTheme === "dark" ? cachedTheme : "system";

  applyThemeClass(theme);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    const currentTheme = localStorage.getItem(THEME_KEY);
    if (currentTheme === "system" || currentTheme === null) {
      applyThemeClass("system");
    }
  });
}
