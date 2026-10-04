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
  if (/Email not confirmed/i.test(msg)) return "Confirm your email with the code we sent first.";
  if (/token has expired|token.*invalid|otp.*(expired|invalid)/i.test(msg)) return "That code is wrong or has expired. Check the latest email, or send a new code.";
  if (/User already registered/i.test(msg)) return "There's already an account with this email. Sign in instead.";
  if (/rate limit|too many requests|security purposes/i.test(msg)) return "Too many tries. Wait a minute, then try again.";
  if (/same.*password|different from the old/i.test(msg)) return "Choose a password you haven't used before.";
  return msg;
}
