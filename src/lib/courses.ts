import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { supabase, friendlyError, CpeRow } from "./supabase";
import { findDuplicateIds } from "./duplicates";

// The user's courses plus which ones look like duplicates. Shared by the Dashboard and Courses tabs.
export function useCourses() {
  const [rows, setRows] = useState<CpeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cpe_records").select("*").order("completed_on", { ascending: false });
    setLoading(false);
    if (error) return setError(friendlyError(error.message));
    setError(null);
    setRows(data as CpeRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dupeIds = useMemo(() => findDuplicateIds(rows.map(r => ({ id: r.id, title: r.title, date: r.completed_on, hours: Number(r.hours), createdAt: r.created_at }))), [rows]);

  function confirmDelete(row: CpeRow) {
    Alert.alert("Delete course?", row.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("cpe_records").delete().eq("id", row.id);
        if (error) setError(friendlyError(error.message)); else load();
      } },
    ]);
  }

  return { rows, loading, error, setError, load, dupeIds, confirmDelete };
}
