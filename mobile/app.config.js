// Expo app config. EXPO_PUBLIC_API_URL is inlined at build time (Metro / EAS).
// For production builds set it in eas.json → build.<profile>.env (must end with /api).

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").trim().replace(/\/$/, "");

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "Hollow",
  slug: "hollow",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/hollow-logo.png",
  scheme: "hollow",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/hollow-logo.png",
    resizeMode: "contain",
    backgroundColor: "#0f1012",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.hollow.notes",
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
    adaptiveIcon: {
      backgroundColor: "#0f1012",
      foregroundImage: "./assets/hollow-logo.png",
    },
    predictiveBackGestureEnabled: false,
    // Required for http:// API hosts on release builds.
    usesCleartextTraffic: true,
    // Shrink the window when the keyboard opens so inputs aren't covered.
    softwareKeyboardLayoutMode: "resize",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-secure-store",
    "expo-font",
    "@react-native-community/datetimepicker",
    [
      "expo-notifications",
      {
        color: "#62d9ae",
      },
    ],
  ],
  extra: {
    apiUrl,
    eas: {
      projectId: "6e1ac3c1-8713-453d-8d2a-888553fa49f4",
    },
  },
};

module.exports = { expo: config };
