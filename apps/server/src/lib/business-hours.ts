import { z } from "zod";
import {
  MAX_HOLIDAYS,
  MAX_RANGES_PER_DAY,
  availabilityAt,
  businessHoursProblem,
  isOpenAt,
  nextOpening,
  normalizeBusinessHours,
  type Availability,
  type BusinessHours,
} from "yunidesk";

/** PUT /settings `businessHours`: the shape here, the meaning (zone, ranges, dates) in the shared check. */
export const businessHoursSchema = z
  .object({
    enabled: z.boolean(),
    timezone: z.string().trim().min(1).max(64),
    week: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          ranges: z.array(z.object({ from: z.string().max(5), to: z.string().max(5) })).max(MAX_RANGES_PER_DAY),
        }),
      )
      .max(7),
    holidays: z.array(z.string().max(10)).max(MAX_HOLIDAYS),
  })
  .superRefine((hours, ctx) => {
    const problem = businessHoursProblem(hours);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform(normalizeBusinessHours);

export const awayMessageSchema = z.object({
  en: z.string().trim().max(500).optional(),
  fr: z.string().trim().max(500).optional(),
});

/** Sent with the messenger config: whether the team is open and, if not, when it opens. */
export function teamAvailability(hours: BusinessHours, now: number = Date.now()): Availability {
  return availabilityAt(hours, now);
}

/** Null while the team is open; otherwise when it is back (null inside: never, as the hours stand). */
export function teamAway(hours: BusinessHours, now: number = Date.now()): { backAt: number | null } | null {
  return isOpenAt(hours, now) ? null : { backAt: nextOpening(hours, now) };
}

/**
 * Whether an away message sent at `notifiedAt` still covers `now`: the team hasn't opened in between,
 * so this is the same closed period and the customer has already been told.
 */
export function sameClosedPeriod(hours: BusinessHours, notifiedAt: number | null, now: number): boolean {
  if (notifiedAt === null) return false;
  const reopened = nextOpening(hours, notifiedAt);
  return reopened === null || reopened > now;
}
