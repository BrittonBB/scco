import { supabase } from "./supabase";

export async function loadKey(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("scco_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? JSON.parse(data.value) : fallback;
  } catch (e) {
    console.error("loadKey failed", key, e);
    return fallback;
  }
}

export async function saveKey(key, value) {
  try {
    const { error } = await supabase
      .from("scco_state")
      .upsert({ key, value: JSON.stringify(value) }, { onConflict: "key" });
    if (error) throw error;
  } catch (e) {
    console.error("saveKey failed", key, e);
  }
}

export function subscribeToChanges(onUpdate) {
  const channel = supabase
    .channel("scco_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "scco_state" },
      (payload) => onUpdate(payload.new?.key)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
