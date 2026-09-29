import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(url, key, {
  auth: { storage: AsyncStorage as any, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Keep the login session fresh only while the app is in the foreground.
AppState.addEventListener("change", state => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export type { License, CpeRow } from "./records";
export { toEngineRecord } from "./records";



// Turns Supabase errors into something a user can act on.
export function friendlyError(msg: string) {
  if (/relation .* does not exist|Could not find the table/i.test(msg)) return "Database isn't set up yet — run the setup SQL in Supabase.";
  if (/column .* does not exist|Could not find the .* column/i.test(msg)) return "Database needs an update — run supabase/002_license_dates.sql in Supabase.";
  if (/Invalid login credentials/i.test(msg)) return "Email or password is incorrect.";
  if (/Email not confirmed/i.test(msg)) return "Check your email and tap the confirmation link first.";
  return msg;
}
