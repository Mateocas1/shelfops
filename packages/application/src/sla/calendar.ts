export interface SlaCalendar { add(startedAt: Date, seconds: number): Date; }
export const continuousUtcCalendar: SlaCalendar = Object.freeze({ add: (startedAt: Date, seconds: number) => new Date(startedAt.getTime() + seconds * 1_000) });
