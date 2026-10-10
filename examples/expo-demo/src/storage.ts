import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "yunidesk-react-native";

/** Keeps an anonymous visitor's conversations across app launches. */
export const asyncStorage: KeyValueStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};
