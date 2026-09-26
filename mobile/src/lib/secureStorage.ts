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
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  try {
    const SecureStore = await getSecureStore();
    const val = await SecureStore.getItemAsync(key);
    if (val !== null) return val;
    return AsyncStorage.getItem(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(key, value);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}
