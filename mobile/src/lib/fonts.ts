import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
} from "@expo-google-fonts/be-vietnam-pro";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { Lexend_400Regular, Lexend_500Medium } from "@expo-google-fonts/lexend";
import {
  NunitoSans_400Regular,
  NunitoSans_500Medium,
} from "@expo-google-fonts/nunito-sans";
import {
  RethinkSans_400Regular,
  RethinkSans_500Medium,
} from "@expo-google-fonts/rethink-sans";
import { Sora_400Regular, Sora_500Medium } from "@expo-google-fonts/sora";

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
  sample: string;
  /** undefined = device system font */
  regular?: number;
  medium?: number;
  familyName?: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "sora",
    label: "Sora",
    sample: "Aa · modern geometric",
    regular: Sora_400Regular,
    medium: Sora_500Medium,
    familyName: "Sora_400Regular",
  },
  {
    id: "rethink",
    label: "Rethink Sans",
    sample: "Aa · clean & open",
    regular: RethinkSans_400Regular,
    medium: RethinkSans_500Medium,
    familyName: "RethinkSans_400Regular",
  },
  {
    id: "be-vietnam",
    label: "Be Vietnam Pro",
    sample: "Aa · friendly humanist",
    regular: BeVietnamPro_400Regular,
    medium: BeVietnamPro_500Medium,
    familyName: "BeVietnamPro_400Regular",
  },
  {
    id: "lexend",
    label: "Lexend",
    sample: "Aa · readable",
    regular: Lexend_400Regular,
    medium: Lexend_500Medium,
    familyName: "Lexend_400Regular",
  },
  {
    id: "nunito",
    label: "Nunito Sans",
    sample: "Aa · soft rounded",
    regular: NunitoSans_400Regular,
    medium: NunitoSans_500Medium,
    familyName: "NunitoSans_400Regular",
  },
  {
    id: "inter",
    label: "Inter",
    sample: "Aa · classic UI",
    regular: Inter_400Regular,
    medium: Inter_500Medium,
    familyName: "Inter_400Regular",
  },
  {
    id: "system",
    label: "System",
    sample: "Aa · your device default",
  },
];

export const DEFAULT_FONT: FontId = "sora";
export const FONT_STORAGE_KEY = "hollow-font";

/** Map for expo-font useFonts() — load every custom face once. */
export const FONT_ASSETS = Object.fromEntries(
  FONT_OPTIONS.flatMap((opt) => {
    const entries: [string, number][] = [];
    if (opt.regular) entries.push([`${opt.id}-regular`, opt.regular]);
    if (opt.medium) entries.push([`${opt.id}-medium`, opt.medium]);
    return entries;
  })
);

export function familyFor(id: FontId): string | undefined {
  if (id === "system") return undefined;
  return `${id}-regular`;
}

export function isFontId(value: string | null | undefined): value is FontId {
  return !!value && FONT_OPTIONS.some((f) => f.id === value);
}
