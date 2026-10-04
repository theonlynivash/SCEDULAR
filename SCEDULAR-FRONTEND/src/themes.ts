// Colour themes. The colour values themselves live in index.css as :root[data-theme='<id>'] blocks;
// this list only names them for the pickers (top bar and HOD Settings → Appearance).
export type ThemeInfo = { id: string; name: string; tagline: string; dots: string[]; ink: string; paper: string }

export const THEMES: ThemeInfo[] = [
  { id: "orchid", name: "Orchid & Sandal", tagline: "Royal purple with sandalwood and rose", dots: ["#5b3a9a", "#d4b98c", "#c2527a"], ink: "#25143f", paper: "#f6f1e8" },
  { id: "pine", name: "Pine & Brass", tagline: "Deep green with warm brass", dots: ["#1f6a63", "#c9a24a", "#6f8f4e"], ink: "#0f2f2d", paper: "#f2efe8" },
  { id: "dusk", name: "Dusk Indigo", tagline: "Indigo night with sand and coral", dots: ["#3b4fa6", "#e3c08d", "#e0705a"], ink: "#172042", paper: "#f4f1ea" },
  { id: "slate", name: "Slate & Copper", tagline: "Graphite with a warm copper accent", dots: ["#3f4f63", "#d19a6e", "#c25a4a"], ink: "#20262e", paper: "#f3f0ec" },
  { id: "burgundy", name: "Burgundy & Ivory", tagline: "Deep wine with ivory and soft gold", dots: ["#7a2638", "#d9c39a", "#d1694f"], ink: "#3a1420", paper: "#f6f0e6" },
  { id: "ocean", name: "Ocean Navy & Sand", tagline: "Navy blue with warm sand, very formal", dots: ["#1f5a8f", "#e0c9a0", "#d9694f"], ink: "#0f2740", paper: "#f4f1ea" },
  { id: "rose", name: "Midnight & Rose Gold", tagline: "Charcoal-navy with rose gold", dots: ["#454e73", "#e0aa9c", "#d0645a"], ink: "#1f2230", paper: "#f6efec" },
  { id: "emerald", name: "Emerald & Ivory", tagline: "Fresh emerald with ivory and gold", dots: ["#1d7a5a", "#e6d7a8", "#d0694f"], ink: "#0d3b2e", paper: "#f5f3ea" },
]

export const DEFAULT_THEME = 'orchid'

export function currentTheme(): string {
  const t = document.documentElement.dataset.theme
  return t && THEMES.some(x => x.id === t) ? t : DEFAULT_THEME
}

export function applyTheme(id: string) {
  document.documentElement.dataset.theme = id
  try { localStorage.setItem('scedular-theme', id) } catch { /* private window: the choice just is not remembered */ }
  window.dispatchEvent(new Event('scedular-theme'))
}
