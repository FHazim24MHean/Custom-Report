export const DEFAULT_GRIDVIS_EVENT_TYPES = [
  "VoltageOver",
  "VoltageUnder",
  "VoltageOutage",
  "VoltageFastChange",
  "CurrentOver",
  "PowerFailure",
  "PowerRecovery",
  "DigitalInputActivated",
  "DigitalInputDeactivated",
  "ComparatorOutputActivated",
  "ComparatorOutputDeactivated",
  "TariffActivated",
  "EmaxChannelActivated",
  "EmaxChannelDeactivated",
];

export function appendGridVisEventTypes(
  searchParams,
  eventTypes = DEFAULT_GRIDVIS_EVENT_TYPES
) {
  if (!searchParams || typeof searchParams.append !== "function") return searchParams;
  const seen = new Set();
  (Array.isArray(eventTypes) ? eventTypes : []).forEach((eventType) => {
    const value = String(eventType || "").trim();
    const key = value.toUpperCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    searchParams.append("type", value);
  });
  return searchParams;
}
