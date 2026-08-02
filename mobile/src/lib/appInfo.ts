import { Platform } from "react-native";
import Constants from "expo-constants";

/** Client-facing product metadata shown in Settings → About. */
export const APP_NAME = "Hollow";
export const APP_TAGLINE = "Self-hosted notes, notebooks, and tasks.";
export const APP_VERSION =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "1.0.0";
export const APP_BUILD =
  Constants.expoConfig?.ios?.buildNumber ??
  Constants.expoConfig?.android?.versionCode?.toString() ??
  Constants.nativeBuildVersion ??
  "1";
export const APP_PLATFORM =
  Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Mobile";
export const APP_COPYRIGHT = `© ${new Date().getFullYear()} Hollow`;
