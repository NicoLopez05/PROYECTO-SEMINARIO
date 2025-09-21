import { supabase } from "./supabase";

function sanitize(s: string) {
  return s.replace(/[^a-z0-9\-_\.]+/gi, "_");
}

/** Stringify que:
 *  - elimina funciones
 *  - convierte NaN/Infinity en null
 *  - si detecta objetos tipo AudioParam/Signal con `.value` numérico, usa ese valor
 *  - descarta objetos que parecen nodos WebAudio/Tone (tienen context/input/output)
 *  - evita referencias circulares
 */
function safeStringify(data: any) {
  const seen = new WeakSet();
  return JSON.stringify(data, (_k, v: any) => {
    if (typeof v === "function") return undefined;

    if (typeof v === "number") {
      return Number.isFinite(v) ? v : null;
    }

    if (v && typeof v === "object") {
      // Evitar bucles
      if (seen.has(v)) return undefined;
      seen.add(v);

      // AudioParam / Tone.Signal → usar .value si es número
      if (typeof v.value === "number") {
        return Number.isFinite(v.value) ? v.value : null;
      }

      // Nodos de WebAudio/Tone (no serializables) → descartar
      const suspect = ["context", "_context", "input", "output", "_input", "_output", "destination", "_destination"];
      for (const key of suspect) {
        if (key in v) return undefined;
      }
    }

    return v;
  });
}

export async function uploadPatternJSON(deviceId: string, fileName: string, json: any) {
  const path = `${deviceId}/${Date.now()}_${sanitize(fileName)}.json`;
  const safe = safeStringify(json);
  const blob = new Blob([safe], { type: "application/json" });
  const { error } = await supabase.storage.from("patterns").upload(path, blob, { upsert: false });
  if (error) throw error;
  return path;
}

export async function listCloudPatterns(deviceId: string) {
  const { data, error } = await supabase.storage.from("patterns").list(deviceId, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  // Filtra sólo archivos .json por si hay otros en la carpeta
  return (data ?? []).filter((f: any) => f.name?.toLowerCase().endsWith(".json"));
}

export async function downloadPatternJSON(path: string) {
  const { data, error } = await supabase.storage.from("patterns").download(path);
  if (error) throw error;
  const text = await data.text();
  return JSON.parse(text);
}
