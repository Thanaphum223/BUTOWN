export const amount = (value: unknown) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Chosen preset reasons followed by the person's own words. */
export const composeReason = (picked: string[], note?: string) =>
  [picked.join(" / "), note?.trim()].filter(Boolean).join(" — ");
