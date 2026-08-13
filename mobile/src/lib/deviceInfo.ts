import { Platform } from "react-native";
import Constants from "expo-constants";

/** Sent at login/register so the server can label this device session. */
export function deviceAuthMeta() {
  const model =
    Constants.deviceName?.trim() ||
    (Platform.OS === "ios"
      ? Constants.platform?.ios?.model
      : undefined) ||
    (Platform.OS === "android" ? "Android" : Platform.OS === "ios" ? "iPhone" : "Device");
  const osLabel = Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Mobile";
  return {
    deviceName: `${model} · ${osLabel}`.slice(0, 120),
    platform: Platform.OS,
    client: "hollow-mobile" as const,
  };
}
