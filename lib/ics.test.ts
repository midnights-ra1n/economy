import { test } from "node:test";
import assert from "node:assert/strict";
import { icsEvent } from "./ics.ts";

const o = { uid: "economy-1@x", summary: "Netflix, Inc; −13,49 €", description: "a\nb", stamp: "20261103T090000Z" };

test("a monthly subscription becomes a repeating all-day event with its reminders at 9:00", () => {
  const ics = icsEvent({ id: 1, day: 5, every: 1, last_posted: "2026-10", remind: "7,0" }, o);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261005\r\n/);
  assert.match(ics, /\r\nRRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=5\r\n/);
  assert.match(ics, /\r\nSUMMARY:Netflix\\, Inc\\; −13\\,49 €\r\n/);
  assert.match(ics, /\r\nDESCRIPTION:a\\nb\r\n/);
  assert.match(ics, /\r\nTRIGGER:-PT159H\r\n/); // 7 days before, 9:00
  assert.match(ics, /\r\nTRIGGER:PT9H\r\n/); // on the day, 9:00
  assert.ok(!icsEvent({ id: 1, day: 5, every: 1, last_posted: "2026-10", remind: "7,0" }, { ...o, stamp: "" }).includes("DTSTAMP"));
});

test("late days fall on the last day of shorter months, every N months", () => {
  const ics = icsEvent({ id: 2, day: 31, every: 3, last_posted: "2027-02", remind: null }, o);
  assert.match(ics, /DTSTART;VALUE=DATE:20270228/);
  assert.match(ics, /RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=28,29,30,31;BYSETPOS=-1/);
  assert.ok(!ics.includes("VALARM"));
});

test("long lines are folded at 75 octets without splitting a character", () => {
  const ics = icsEvent({ id: 3, day: 1, every: 1, last_posted: "2026-10", remind: null }, { ...o, summary: "é".repeat(80) });
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.equal(ics.split("\r\n").filter((l) => l.startsWith("SUMMARY:") || l.startsWith(" ")).map((l, i) => (i ? l.slice(1) : l.slice(8))).join(""), "é".repeat(80));
});
