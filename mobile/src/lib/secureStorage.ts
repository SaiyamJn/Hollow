import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// expo-secure-store has no web implementation (throws
// getValueWithKeyAsync is not a function). On native we use the Keychain /
// Keystore-backed SecureStore; on web we fall back to AsyncStorage so Expo
// web / browser preview still works.
async function getSecureStore() {
  return await import("expo-secure-store");
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  const SecureStore = await getSecureStore();
  return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  const SecureStore = await getSecureStore();
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  const SecureStore = await getSecureStore();
  await SecureStore.deleteItemAsync(key);
}
