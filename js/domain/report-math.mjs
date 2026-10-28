export function parseNumericValue(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) {
    return Number.NaN;
  }
  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const match = text.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

export function normalizeMetricKey(metric) {
  const metricKey = String(metric || "").trim().toUpperCase();
  const voltageDisplayMatch = metricKey.match(/^VOLTAGE,\s*V(\d+)$/);
  if (voltageDisplayMatch) {
    return `V${voltageDisplayMatch[1]}`;
  }
  const currentDisplayMatch = metricKey.match(/^CURRENT,\s*A(\d+)$/);
  if (currentDisplayMatch) {
    return `A${currentDisplayMatch[1]}`;
  }
  const voltageMatch = metricKey.match(/^VOLTAGE(\d+)$/);
  if (voltageMatch) {
    return `V${voltageMatch[1]}`;
  }
  const currentMatch = metricKey.match(/^CURRENT(\d+)$/);
  if (currentMatch) {
    return `A${currentMatch[1]}`;
  }
  return metricKey;
}

export function calculateAverageFromMetricKeys(row, metricKeys) {
  const numericValues = (Array.isArray(metricKeys) ? metricKeys : [])
    .map((metricKey) => parseNumericValue(row?.[metricKey]))
    .filter((value) => Number.isFinite(value));
  if (!numericValues.length) {
    return Number.NaN;
  }
  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

export function calculatePercentUnbalanceFromMetricKeys(row, metricKeys) {
  const numericValues = (Array.isArray(metricKeys) ? metricKeys : [])
    .map((metricKey) => parseNumericValue(row?.[metricKey]))
    .filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) {
    return Number.NaN;
  }

  const average = numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
  if (!Number.isFinite(average) || average === 0) {
    return Number.NaN;
  }

  const maxDeviation = Math.max(
    ...numericValues.map((value) => Math.abs(value - average))
  );
  return (maxDeviation / average) * 100;
}

export function formatDerivedRatioValue(numerator, denominator, options = {}) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return "";
  }

  let ratio = numerator / denominator;
  if (Number.isFinite(options?.clampMin)) {
    ratio = Math.max(options.clampMin, ratio);
  }
  if (Number.isFinite(options?.clampMax)) {
    ratio = Math.min(options.clampMax, ratio);
  }
  return ratio.toFixed(2);
}

export function deriveRatioMetric(row, numeratorMetricKey, denominatorMetricKey, options = {}) {
  const numeratorValue = parseNumericValue(row?.[numeratorMetricKey]);
  const denominatorValue = parseNumericValue(row?.[denominatorMetricKey]);
  const numeratorMin = parseNumericValue(row?.[`${numeratorMetricKey}_Min`]);
  const numeratorMax = parseNumericValue(row?.[`${numeratorMetricKey}_Max`]);
  const denominatorMin = parseNumericValue(row?.[`${denominatorMetricKey}_Min`]);
  const denominatorMax = parseNumericValue(row?.[`${denominatorMetricKey}_Max`]);

  return {
    value: formatDerivedRatioValue(numeratorValue, denominatorValue, options),
    min: formatDerivedRatioValue(numeratorMin, denominatorMax, options),
    max: formatDerivedRatioValue(numeratorMax, denominatorMin, options),
  };
}

export function isValueWithinToleranceWarningBand(value, tolerance, edgeBandRatio = 0.2) {
  const numericValue = Number(value);
  if (
    !Number.isFinite(numericValue) ||
    !Number.isFinite(tolerance?.min) ||
    !Number.isFinite(tolerance?.max)
  ) {
    return false;
  }

  const span = tolerance.max - tolerance.min;
  if (!Number.isFinite(span) || span <= 0) {
    return false;
  }

  const lowerWarningLimit = tolerance.min + span * edgeBandRatio;
  const upperWarningLimit = tolerance.max - span * edgeBandRatio;
  return numericValue <= lowerWarningLimit || numericValue >= upperWarningLimit;
}

export function buildDerivedNominalMetrics(row) {
  const safeRow = row && typeof row === "object" ? row : {};
  const derived = {};

  addThreePhaseMetrics(derived, safeRow, "V", "V_AVG", "V_UNBALANCE");
  addThreePhaseMetrics(derived, safeRow, "A", "A_AVG", "A_UNBALANCE");

  if (!Number.isFinite(parseNumericValue(safeRow.POWER_FACTOR))) {
    const powerFactor = deriveRatioMetric(
      safeRow,
      "POWER_ACTIVE_SUM",
      "POWER_APPARENT_SUM",
      { clampMin: 0, clampMax: 1.2 }
    );
    if (powerFactor.value) derived.POWER_FACTOR = powerFactor.value;
    if (powerFactor.min) derived.POWER_FACTOR_Min = powerFactor.min;
    if (powerFactor.max) derived.POWER_FACTOR_Max = powerFactor.max;
  }

  return derived;
}

function addThreePhaseMetrics(target, row, phasePrefix, averageKey, unbalanceKey) {
  const suffixes = ["", "_Min", "_Max"];
  suffixes.forEach((suffix) => {
    const phaseKeys = [1, 2, 3].map((phase) => `${phasePrefix}${phase}${suffix}`);
    const average = calculateAverageFromMetricKeys(row, phaseKeys);
    const unbalance = calculatePercentUnbalanceFromMetricKeys(row, phaseKeys);
    const averageTarget = `${averageKey}${suffix}`;
    const unbalanceTarget = `${unbalanceKey}${suffix}`;
    if (Number.isFinite(average) && !Number.isFinite(parseNumericValue(row[averageTarget]))) {
      target[averageTarget] = average.toFixed(2);
    }
    if (Number.isFinite(unbalance) && !Number.isFinite(parseNumericValue(row[unbalanceTarget]))) {
      target[unbalanceTarget] = unbalance.toFixed(2);
    }
  });
}
