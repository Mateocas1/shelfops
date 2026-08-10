export type EffectiveRange = Readonly<{ effectiveAt: string; effectiveUntil?: string }>;
export function validateEffectiveRange(effectiveAt: string, effectiveUntil?: string): EffectiveRange {
  const start = Date.parse(effectiveAt); const end = effectiveUntil === undefined ? undefined : Date.parse(effectiveUntil);
  if (Number.isNaN(start)) throw new Error("effectiveAt must be an instant");
  if (end !== undefined && (Number.isNaN(end) || end <= start)) throw new Error("effectiveUntil must be after effectiveAt");
  return { effectiveAt, effectiveUntil };
}
