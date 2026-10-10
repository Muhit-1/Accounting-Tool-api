import { BadRequestException } from '@nestjs/common';

const EARLIEST_ENTRY_DATE = new Date('2000-01-01T00:00:00Z');
// Servers run in UTC while the owner is ahead of it (Bangladesh is UTC+6), so
// "today" for the user can already be tomorrow here. One day of slack keeps
// same-day entries working without opening the door to far-future ones.
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

// Entries record money that has already moved; a typo like 2062 instead of 2026
// would otherwise silently fall outside every report period.
export function assertPlausibleEntryDate(value: string, now: Date = new Date()): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date < EARLIEST_ENTRY_DATE) {
    throw new BadRequestException('That date is not valid');
  }
  if (date.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    throw new BadRequestException('Entries cannot be dated in the future');
  }
  return date;
}
