export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export function fmtDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtGB(bytes: string | number | null | undefined): string {
  const n = typeof bytes === "string" ? Number(bytes) : (bytes ?? 0);
  return `${(n / 1e9).toFixed(1)} GB`;
}
