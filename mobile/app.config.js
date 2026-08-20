// Expo app config. EXPO_PUBLIC_API_URL is inlined at build time (Metro / EAS).
// For production builds set it in eas.json → build.<profile>.env (must end with /api).

const { version, versionCode } = require("./appVersion");

/** Production Hollow API — used when env is unset so release builds never ship empty. */
const DEFAULT_API_URL = "http://203.192.206.63/api";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).trim().replace(/\/$/, "");

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "Hollow",
  slug: "hollow",
  owner: "snoey",
  version,
  orientation: "portrait",
  // Launcher icons use Wally-sized safe-zone padding (~43% mark).
  // In-app BrandMark still uses hollow-logo.png (full rounded mark).
  icon: "./assets/icon.png",
  scheme: "hollow",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.hollow.notes",
    buildNumber: String(versionCode),
    infoPlist: {
      // Required while the API is served over plain HTTP (public IP / LAN).
      // Remove when you switch to HTTPS (Cloudflare Tunnel, reverse proxy TLS, etc.).
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
  },
  android: {
    package: "com.hollow.notes",
    versionCode,
    // Avoid edge-to-edge drawing under the status bar on modern Android.
    edgeToEdgeEnabled: false,
    adaptiveIcon: {
      backgroundColor: "#ffffff",
      foregroundImage: "./assets/adaptive-icon.png",
    },
    predictiveBackGestureEnabled: false,
    // Required for http:// API hosts on release builds.
    usesCleartextTraffic: true,
    // Shrink the window when the keyboard opens so inputs aren't covered.
    softwareKeyboardLayoutMode: "resize",
    permissions: [
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
      "android.permission.VIBRATE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ],
  },
  androidStatusBar: {
    // Solid status bar so stack/tab headers never draw underneath on phones.
    translucent: false,
    backgroundColor: "#0f1012",
    barStyle: "light-content",
  },
  androidNavigationBar: {
    backgroundColor: "#0f1012",
  },
  web: {
    favicon: "./assets/hollow-logo.png",
  },
  plugins: [
    "expo-secure-store",
    "expo-font",
    "@react-native-community/datetimepicker",
    [
      "expo-notifications",
      {
        color: "#62d9ae",
        defaultChannel: "reminders",
      },
    ],
    "./plugins/withHollowAndroid",
  ],
  extra: {
    apiUrl,
    eas: {
      projectId: "5f85a8c7-5c18-43e6-acd9-301b4dfb376f",
    },
  },
};

module.exports = { expo: config };
