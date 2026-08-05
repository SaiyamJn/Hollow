/** App typeface options — Google Fonts + a couple of system basics. */

export type FontId =
  | "sora"
  | "rethink"
  | "be-vietnam"
  | "lexend"
  | "nunito"
  | "inter"
  | "system";

export interface FontOption {
  id: FontId;
  label: string;
  /** CSS font-family stack */
  family: string;
  /** Sample hint under the name in Settings */
  sample: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "sora", label: "Sora", family: '"Sora", ui-sans-serif, system-ui, sans-serif', sample: "Aa · modern geometric" },
  { id: "rethink", label: "Rethink Sans", family: '"Rethink Sans", ui-sans-serif, system-ui, sans-serif', sample: "Aa · clean & open" },
  { id: "be-vietnam", label: "Be Vietnam Pro", family: '"Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif', sample: "Aa · friendly humanist" },
  { id: "lexend", label: "Lexend", family: '"Lexend", ui-sans-serif, system-ui, sans-serif', sample: "Aa · readable" },
  { id: "nunito", label: "Nunito Sans", family: '"Nunito Sans", ui-sans-serif, system-ui, sans-serif', sample: "Aa · soft rounded" },
  { id: "inter", label: "Inter", family: '"Inter", ui-sans-serif, system-ui, sans-serif', sample: "Aa · classic UI" },
  { id: "system", label: "System", family: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', sample: "Aa · your device default" },
];

export const DEFAULT_FONT: FontId = "sora";
export const FONT_STORAGE_KEY = "hollow-font";

export function isFontId(value: string | null | undefined): value is FontId {
  return !!value && FONT_OPTIONS.some((f) => f.id === value);
}

function fontFamilyFor(id: FontId): string {
  return FONT_OPTIONS.find((f) => f.id === id)?.family ?? FONT_OPTIONS[0].family;
}

export function applyFontToDocument(id: FontId) {
  document.documentElement.style.setProperty("--font-sans", fontFamilyFor(id));
  document.documentElement.dataset.font = id;
}
