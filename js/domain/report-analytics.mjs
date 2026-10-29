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

export function buildParameterTrend(samples = []) {
  const normalized = (Array.isArray(samples) ? samples : [])
    .map(normalizeTrendSample)
    .filter((sample) => sample.timestamp > 0 && Number.isFinite(sample.value))
    .sort((left, right) => left.timestamp - right.timestamp);

  if (!normalized.length) {
    return {
      sampleCount: 0,
      annual: { year: null, points: emptyAnnualPoints() },
      monthlyComparison: { current: null, previous: null, days: [] },
    };
  }

  const latestDate = new Date(normalized[normalized.length - 1].timestamp);
  const latestYear = latestDate.getFullYear();
  const latestMonth = latestDate.getMonth();
  const previousMonthDate = new Date(latestYear, latestMonth - 1, 1);
  const annualMonths = Array.from(
    { length: 12 },
    (_, index) => new Date(latestYear, latestMonth - 11 + index, 1)
  );
  const annualMonthIndexes = new Map(
    annualMonths.map((date, index) => [`${date.getFullYear()}-${date.getMonth()}`, index])
  );
  const annualBuckets = annualMonths.map(() => []);
  const currentBuckets = Array.from({ length: daysInMonth(latestYear, latestMonth) }, () => []);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth();
  const previousBuckets = Array.from({ length: daysInMonth(previousYear, previousMonth) }, () => []);

  normalized.forEach((sample) => {
    const date = new Date(sample.timestamp);
    const annualIndex = annualMonthIndexes.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (Number.isInteger(annualIndex)) annualBuckets[annualIndex].push(sample.value);
    if (date.getFullYear() === latestYear && date.getMonth() === latestMonth) {
      currentBuckets[date.getDate() - 1].push(sample.value);
    }
    if (date.getFullYear() === previousYear && date.getMonth() === previousMonth) {
      previousBuckets[date.getDate() - 1].push(sample.value);
    }
  });

  const currentPoints = summarizeDayBuckets(currentBuckets);
  const previousPoints = summarizeDayBuckets(previousBuckets);
  return {
    sampleCount: normalized.length,
    annual: {
      year: latestYear,
      label: `${monthLabel(annualMonths[0].getFullYear(), annualMonths[0].getMonth(), "long")} - ${monthLabel(latestYear, latestMonth, "long")}`,
      points: annualBuckets.map((values, index) => ({
        year: annualMonths[index].getFullYear(),
        month: annualMonths[index].getMonth(),
        label: monthYearShortLabel(annualMonths[index]),
        ...summarizeValues(values),
      })),
    },
    monthlyComparison: {
      current: {
        year: latestYear,
        month: latestMonth,
        label: monthLabel(latestYear, latestMonth, "long"),
        points: currentPoints,
      },
      previous: {
        year: previousYear,
        month: previousMonth,
        label: monthLabel(previousYear, previousMonth, "long"),
        points: previousPoints,
      },
      days: Array.from(
        { length: Math.max(currentPoints.length, previousPoints.length) },
        (_, index) => index + 1
      ),
    },
  };
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

function normalizeTrendSample(sample) {
  const rawTimestamp = String(sample?.capturedAt || "").trim().replace(" ", "T");
  const timestamp = new Date(rawTimestamp).getTime();
  const value = Number(sample?.value);
  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    value: Number.isFinite(value) ? value : Number.NaN,
  };
}

function emptyAnnualPoints() {
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    label: monthLabel(2000, month, "short"),
    average: null,
    min: null,
    max: null,
    count: 0,
  }));
}

function summarizeDayBuckets(buckets) {
  return buckets.map((values, index) => ({ day: index + 1, ...summarizeValues(values) }));
}

function summarizeValues(values) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) return { average: null, min: null, max: null, count: 0 };
  const total = numeric.reduce((sum, value) => sum + value, 0);
  return {
    average: round(total / numeric.length, 4),
    min: round(Math.min(...numeric), 4),
    max: round(Math.max(...numeric), 4),
    count: numeric.length,
  };
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function monthLabel(year, month, length) {
  return new Intl.DateTimeFormat("en-MY", { month: length, year: length === "long" ? "numeric" : undefined })
    .format(new Date(year, month, 1));
}

function monthYearShortLabel(date) {
  const month = new Intl.DateTimeFormat("en-MY", { month: "short" }).format(date);
  return `${month} ${String(date.getFullYear()).slice(-2)}`;
}

function round(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
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
