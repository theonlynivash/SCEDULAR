// Colour themes. The colour values themselves live in index.css as :root[data-theme='<id>'] blocks;
// this list only names them for the pickers (top bar and HOD Settings → Appearance).
export type ThemeInfo = { id: string; name: string; tagline: string; dots: string[]; ink: string; paper: string }

export const THEMES: ThemeInfo[] = [
  { id: "orchid", name: "Orchid & Sandal", tagline: "PURPLE · royal purple with sandalwood", dots: ["#5b3a9a", "#d4b98c", "#c2527a"], ink: "#25143f", paper: "#f6f1e8" },
  { id: "pine", name: "Pine & Brass", tagline: "GREEN · deep green with warm brass", dots: ["#1f6a63", "#c9a24a", "#6f8f4e"], ink: "#0f2f2d", paper: "#f2efe8" },
  { id: "slate", name: "Slate & Copper", tagline: "GREY · graphite with warm copper", dots: ["#3f4f63", "#d19a6e", "#c25a4a"], ink: "#20262e", paper: "#f3f0ec" },
  { id: "maroon", name: "Maroon & Gold", tagline: "RED · classic maroon with gold", dots: ["#7b1e24", "#dcb64a", "#d1694f"], ink: "#3a0f12", paper: "#f7f1e6" },
  { id: "ocean", name: "Ocean Navy & Gold", tagline: "BLUE · navy with gold, very formal", dots: ["#1f5a8f", "#dcb64a", "#d9694f"], ink: "#0f2740", paper: "#f4f1ea" },
  { id: "rose", name: "Midnight & Rose Gold", tagline: "PINK · charcoal with rose gold", dots: ["#454e73", "#e0aa9c", "#d0645a"], ink: "#1f2230", paper: "#f6efec" },
  { id: "terracotta", name: "Terracotta & Cream", tagline: "ORANGE · warm clay with cream", dots: ["#9a4a2e", "#e8d2b0", "#c9604a"], ink: "#3a2018", paper: "#f7f0e6" },
  { id: "mustard", name: "Mustard & Charcoal", tagline: "YELLOW · mustard gold on charcoal", dots: ["#8a6a12", "#f0d27a", "#c9604a"], ink: "#26231c", paper: "#f7f3e6" },
  { id: "fuchsia", name: "Magenta & Blush", tagline: "MAGENTA · bold magenta with blush", dots: ["#a3256f", "#f2c4d4", "#d9694f"], ink: "#3a1030", paper: "#f8eff2" },
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
