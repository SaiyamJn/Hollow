import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// expo-secure-store has no web implementation (throws
// getValueWithKeyAsync is not a function). On native we use the Keychain /
// Keystore-backed SecureStore; on web we fall back to AsyncStorage so Expo
// web / browser preview still works.
type SecureStoreModule = typeof import("expo-secure-store");
let secureStorePromise: Promise<SecureStoreModule> | null = null;

function getSecureStore() {
  if (!secureStorePromise) secureStorePromise = import("expo-secure-store");
  return secureStorePromise;
}

export async function getSecureItem(key: string): Promise<string | null> {
  // Always try AsyncStorage first — fast, reliable across all Android & iOS devices,
  // immune to Android Keystore / EncryptedSharedPreferences loss/corruption across app restarts.
  try {
    const val = await AsyncStorage.getItem(key);
    if (val !== null && val !== undefined && val !== "") {
      return val;
    }
  } catch {
    // continue to SecureStore fallback
  }

  if (Platform.OS !== "web") {
    try {
      const SecureStore = await getSecureStore();
      const val = await SecureStore.getItemAsync(key);
      if (val !== null && val !== undefined && val !== "") {
        // Backfill into AsyncStorage so subsequent reads are immediate
        void AsyncStorage.setItem(key, val).catch(() => {});
        return val;
      }
    } catch {
      // ignore SecureStore errors
    }
  }

  return null;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  // Always write to AsyncStorage first for guaranteed persistence across app restarts
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    console.warn("AsyncStorage setItem error:", err);
  }

  if (Platform.OS !== "web") {
    try {
      const SecureStore = await getSecureStore();
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore SecureStore errors on devices with Keystore issues
    }
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }

  if (Platform.OS !== "web") {
    try {
      const SecureStore = await getSecureStore();
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  }
}
