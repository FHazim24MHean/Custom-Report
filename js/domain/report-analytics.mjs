const STATUS_ORDER = ["pass", "warning", "fail", "unavailable"];

export function buildAnalyticsSummary(records = [], events = [], options = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const safeEvents = Array.isArray(events) ? events : [];
  const scopeKey = String(options?.scopeKey || "all").trim() || "all";
  const filteredRecords = safeRecords.filter((record) => matchesScope(record, scopeKey));
  const filteredEvents = safeEvents.filter((event) => matchesScope(event, scopeKey));

  return {
    scopeKey,
    recordCount: filteredRecords.length,
    deviceCount: countUnique(filteredRecords.map((record) => record?.deviceId)),
    compliantCount: filteredRecords.filter((record) => getRowStatus(record) === "pass").length,
    warningCount: filteredRecords.filter((record) => getRowStatus(record) === "warning").length,
    failedCount: filteredRecords.filter((record) => getRowStatus(record) === "fail").length,
    unavailableCount: filteredRecords.filter((record) => getRowStatus(record) === "unavailable").length,
    complianceRate: calculateComplianceRate(filteredRecords),
    eventCount: filteredEvents.length,
    groups: buildGroupSummaries(filteredRecords, filteredEvents),
    metrics: buildMetricSummaries(filteredRecords),
  };
}

export function getAnalyticsScopeOptions(records = []) {
  const options = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const groupType = String(record?.groupType || "").trim();
    const groupName = String(record?.groupName || "").trim();
    if (!groupType || !groupName) return;
    const key = buildScopeKey(groupType, groupName);
    options.set(key, {
      key,
      groupType,
      groupName,
      label: `${formatGroupType(groupType)}: ${groupName}`,
    });
  });
  return Array.from(options.values()).sort(
    (left, right) =>
      left.groupType.localeCompare(right.groupType) || left.groupName.localeCompare(right.groupName)
  );
}

export function buildScopeKey(groupType, groupName) {
  return `${String(groupType || "").trim()}::${String(groupName || "").trim()}`;
}

export function getRowStatus(record) {
  const statuses = Object.values(record?.metricStatuses || {}).map(normalizeStatus);
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("pass")) return "pass";
  return "unavailable";
}

function matchesScope(item, scopeKey) {
  if (scopeKey === "all") return true;
  return buildScopeKey(item?.groupType, item?.groupName) === scopeKey;
}

function buildGroupSummaries(records, events) {
  const groups = new Map();
  records.forEach((record) => {
    const groupType = String(record?.groupType || "unassigned").trim() || "unassigned";
    const groupName = String(record?.groupName || "Unassigned").trim() || "Unassigned";
    const key = buildScopeKey(groupType, groupName);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        groupType,
        groupName,
        records: [],
        eventCount: 0,
      });
    }
    groups.get(key).records.push(record);
  });

  events.forEach((event) => {
    const key = buildScopeKey(event?.groupType, event?.groupName);
    if (groups.has(key)) groups.get(key).eventCount += 1;
  });

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      groupType: group.groupType,
      groupName: group.groupName,
      deviceCount: countUnique(group.records.map((record) => record?.deviceId)),
      recordCount: group.records.length,
      compliantCount: group.records.filter((record) => getRowStatus(record) === "pass").length,
      warningCount: group.records.filter((record) => getRowStatus(record) === "warning").length,
      failedCount: group.records.filter((record) => getRowStatus(record) === "fail").length,
      complianceRate: calculateComplianceRate(group.records),
      eventCount: group.eventCount,
    }))
    .sort(
      (left, right) =>
        left.groupType.localeCompare(right.groupType) || left.groupName.localeCompare(right.groupName)
    );
}

function buildMetricSummaries(records) {
  const metrics = new Map();
  records.forEach((record) => {
    Object.entries(record?.metricStatuses || {}).forEach(([metric, rawStatus]) => {
      const status = normalizeStatus(rawStatus);
      if (!metrics.has(metric)) {
        metrics.set(metric, {
          metric,
          pass: 0,
          warning: 0,
          fail: 0,
          unavailable: 0,
        });
      }
      metrics.get(metric)[status] += 1;
    });
  });

  return Array.from(metrics.values())
    .map((metric) => {
      const evaluated = metric.pass + metric.warning + metric.fail;
      return {
        ...metric,
        evaluated,
        complianceRate: evaluated ? roundPercent(((metric.pass + metric.warning) / evaluated) * 100) : null,
      };
    })
    .sort((left, right) => right.fail - left.fail || left.metric.localeCompare(right.metric));
}

function calculateComplianceRate(records) {
  const evaluated = records.filter((record) => getRowStatus(record) !== "unavailable");
  if (!evaluated.length) return null;
  const compliant = evaluated.filter((record) => {
    const status = getRowStatus(record);
    return status === "pass" || status === "warning";
  }).length;
  return roundPercent((compliant / evaluated.length) * 100);
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return STATUS_ORDER.includes(status) ? status : "unavailable";
}

function countUnique(values) {
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean)).size;
}

function roundPercent(value) {
  return Number(value.toFixed(1));
}

function formatGroupType(groupType) {
  return groupType === "main-intake" ? "Main Intake" : groupType === "substation" ? "Substation" : "Group";
}
