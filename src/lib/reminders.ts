// Deadline reminders (Premium): scheduled on the phone, so they arrive even if the app isn't opened.
// Re-planned every time the dashboard loads, which keeps the hours in them as fresh as the last visit.
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { PlannedReminder } from "./reminderPlan";

const KEY = "cpe-keeper:reminders";
export type ReminderPref = "on" | "off" | null; // null = never chosen
let pref: ReminderPref = null;
let loaded = false;
const listeners = new Set<(p: ReminderPref) => void>();
const supported = Platform.OS === "ios" || Platform.OS === "android";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function load() {
  if (loaded) return pref;
  loaded = true;
  const v = await AsyncStorage.getItem(KEY).catch(() => null);
  pref = v === "on" || v === "off" ? v : null;
  listeners.forEach(l => l(pref));
  return pref;
}

export function useReminderPref(): ReminderPref {
  const [p, setP] = useState(pref);
  useEffect(() => { listeners.add(setP); load(); return () => { listeners.delete(setP); }; }, []);
  return p;
}

// Turning reminders on asks iOS for permission. Returns false if the user said no.
export async function setReminderPref(p: "on" | "off"): Promise<boolean> {
  if (p === "on" && supported) {
    const cur = await Notifications.getPermissionsAsync();
    const ok = cur.granted || (cur.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!ok) { await save("off"); return false; }
  }
  await save(p);
  if (p === "off") await clearReminders();
  return true;
}

async function save(p: "on" | "off") {
  pref = p; loaded = true;
  await AsyncStorage.setItem(KEY, p).catch(() => {});
  listeners.forEach(l => l(p));
}

export async function clearReminders() {
  if (supported) await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

// Replaces every scheduled reminder with this plan.
export async function scheduleReminders(plan: PlannedReminder[]) {
  if (!supported) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { source: "cpe-keeper-deadline" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date },
    });
  }
}

export async function nextReminder(): Promise<Date | null> {
  if (!supported) return null;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const dates = all.map(n => (n.trigger as any)?.value ?? (n.trigger as any)?.date).filter(Boolean).map((v: any) => new Date(v));
  return dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
}

// Development only: fire a sample reminder in 10 seconds to check notifications work on this phone.
export async function sendTestReminder() {
  if (!supported) return false;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && !(await Notifications.requestPermissionsAsync()).granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: "California CPE due in 30 days", body: "You had 12 hrs to go (due Jan 31, 2028) when you last opened CPE Keeper. Open the app to see what's left." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10 },
  });
  return true;
}
