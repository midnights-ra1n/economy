// iCalendar event of a subscription (RFC 5545), for the CalDAV calendar. Pure: tested with `node --test`.

import { dayInMonth } from "./forecast.ts";

type Sub = { id: number; day: number; every: number; last_posted: string; remind: string | null };

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines are folded at 75 octets, never inside a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/**
 * All-day event repeating every `every` months on the subscription's day, from its last payment, with one alarm per
 * reminder day at 9:00. A day past the 28th falls on the month's last day when the month is shorter, as in the app.
 * `stamp` (DTSTAMP, "YYYYMMDDTHHMMSSZ") is left out when empty, so the text can be hashed to detect changes.
 */
export function icsEvent(r: Sub, o: { uid: string; summary: string; description: string; stamp: string }): string {
  const start = dayInMonth(r.last_posted, r.day).replace(/-/g, "");
  const byDay = r.day <= 28 ? `BYMONTHDAY=${r.day}` : `BYMONTHDAY=${Array.from({ length: r.day - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1`;
  const alarms = (r.remind ? r.remind.split(",").map(Number) : []).flatMap((d) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(o.summary)}`,
    // Relative to midnight on the due date: d days before, at 9:00.
    `TRIGGER:${d ? `-PT${d * 24 - 9}H` : "PT9H"}`,
    "END:VALARM",
  ]);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Economy//Economy//FR",
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    ...(o.stamp ? [`DTSTAMP:${o.stamp}`] : []),
    `DTSTART;VALUE=DATE:${start}`,
    `RRULE:FREQ=MONTHLY;INTERVAL=${r.every};${byDay}`,
    `SUMMARY:${escape(o.summary)}`,
    `DESCRIPTION:${escape(o.description)}`,
    "TRANSP:TRANSPARENT",
    ...alarms,
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}
