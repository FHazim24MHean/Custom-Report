export const REPORT_DEVICE_GROUP_FILTERS = new Set([
  "all",
  "unassigned",
  "substation",
  "main-intake",
]);

export function normalizeReportDeviceGroupFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return REPORT_DEVICE_GROUP_FILTERS.has(normalized) ? normalized : "all";
}

export function getReportDeviceGroupType(
  deviceId,
  substationAssignments = {},
  mainIntakeAssignments = {}
) {
  const key = String(deviceId || "").trim();
  if (String(mainIntakeAssignments?.[key]?.mainIntakeId || "").trim()) {
    return "main-intake";
  }
  if (String(substationAssignments?.[key]?.substationId || "").trim()) {
    return "substation";
  }
  return "unassigned";
}

export function filterReportDevicesByGroupType(
  devices,
  filterValue,
  substationAssignments = {},
  mainIntakeAssignments = {}
) {
  const filter = normalizeReportDeviceGroupFilter(filterValue);
  const safeDevices = Array.isArray(devices) ? devices : [];
  if (filter === "all") return [...safeDevices];

  return safeDevices.filter((device) =>
    getReportDeviceGroupType(
      device?.devid,
      substationAssignments,
      mainIntakeAssignments
    ) === filter
  );
}
