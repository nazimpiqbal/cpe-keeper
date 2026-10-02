// The user's appearance choice — Match system (default), Light or Dark — saved on the device.
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyTheme, ThemePref } from "./ui";

const KEY = "cpe-keeper:theme";
let pref: ThemePref = "system";
const listeners = new Set<(p: ThemePref) => void>();

export function setThemePref(p: ThemePref) {
  pref = p;
  AsyncStorage.setItem(KEY, p).catch(() => {});
  listeners.forEach(l => l(p));
}

export function useThemePref(): ThemePref {
  const [p, setP] = useState(pref);
  useEffect(() => { listeners.add(setP); return () => { listeners.delete(setP); }; }, []);
  return p;
}

// Used once at the top of the app: loads the saved choice, follows the system when set to "system",
// and applies the palette before children render. Returns whether the app is dark (for the status bar).
export function useAppTheme(): { dark: boolean; ready: boolean } {
  const system = useColorScheme();
  const p = useThemePref();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v === "light" || v === "dark" || v === "system") { pref = v; listeners.forEach(l => l(v)); }
    }).catch(() => {}).finally(() => setReady(true));
  }, []);
  const dark = p === "dark" || (p === "system" && system === "dark");
  applyTheme(dark);
  return { dark, ready };
}
