/** Clock display: 24h by default; 12h only when the device locale prefers it. */

export function prefers12HourClock(): boolean {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === true;
  } catch {
    return false;
  }
}

/** Full clock time for labels (e.g. 14:05 or 2:05 PM). */
export function formatClockTime(d: Date): string {
  if (prefers12HourClock()) {
    try {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      const h24 = d.getHours();
      const h12 = h24 % 12 || 12;
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ampm = h24 >= 12 ? "PM" : "AM";
      return `${h12}:${mm} ${ampm}`;
    }
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Compact time for calendar cells.
 * 24h: 14:05 / 14 · 12h: locale short (includes AM/PM only when system uses 12h).
 */
export function formatCompactClockTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  if (prefers12HourClock()) {
    try {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: m === 0 ? undefined : "2-digit",
        hour12: true,
      });
    } catch {
      const h12 = h % 12 || 12;
      const ampm = h >= 12 ? "PM" : "AM";
      if (m === 0) return `${h12} ${ampm}`;
      return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    }
  }
  const hh = String(h).padStart(2, "0");
  if (m === 0) return hh;
  return `${hh}:${String(m).padStart(2, "0")}`;
}
