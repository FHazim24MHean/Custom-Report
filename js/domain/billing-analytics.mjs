const DEFAULT_TARIFF = Object.freeze({
  currency: "MYR",
  energyRate: 0,
  exportRate: 0,
  demandRate: 0,
  fixedCharge: 0,
  taxPercent: 0,
});

export function buildBillingAnalytics(meters = [], tariffInput = {}) {
  const tariff = normalizeTariff(tariffInput);
  const rows = (Array.isArray(meters) ? meters : [])
    .map((meter) => summarizeMeter(meter, tariff))
    .sort(
      (left, right) =>
        left.groupType.localeCompare(right.groupType) ||
        left.groupName.localeCompare(right.groupName) ||
        left.deviceName.localeCompare(right.deviceName)
    );
  const availableRows = rows.filter((row) => row.available);

  return {
    tariff,
    rows,
    availableMeterCount: availableRows.length,
    unavailableMeterCount: rows.length - availableRows.length,
    totalImportedKwh: round(sum(availableRows.map((row) => row.importedKwh)), 3),
    totalExportedKwh: round(sum(availableRows.map((row) => row.exportedKwh)), 3),
    peakDemandKw: round(max(availableRows.map((row) => row.maxDemandKw)), 3),
    averageCoveragePercent: availableRows.length
      ? round(sum(availableRows.map((row) => row.coveragePercent)) / availableRows.length, 1)
      : 0,
    totalCharge: round(sum(availableRows.map((row) => row.totalCharge)), 2),
  };
}

export function normalizeTariff(input = {}) {
  return {
    currency: String(input?.currency || DEFAULT_TARIFF.currency).trim().toUpperCase() || DEFAULT_TARIFF.currency,
    energyRate: nonNegative(input?.energyRate),
    exportRate: nonNegative(input?.exportRate),
    demandRate: nonNegative(input?.demandRate),
    fixedCharge: nonNegative(input?.fixedCharge),
    taxPercent: nonNegative(input?.taxPercent),
  };
}

function summarizeMeter(meter, tariff) {
  const readings = (Array.isArray(meter?.readings) ? meter.readings : [])
    .map(normalizeReading)
    .filter((reading) => reading.timestamp > 0)
    .sort((left, right) => left.timestamp - right.timestamp);
  const importIntervals = readings.filter(
    (reading) => Number.isFinite(reading.importMinWh) && Number.isFinite(reading.importMaxWh)
  );
  const exportIntervals = readings.filter(
    (reading) => Number.isFinite(reading.exportMinWh) && Number.isFinite(reading.exportMaxWh)
  );
  const importedWh = sum(importIntervals.map((reading) => positiveIntervalDelta(reading.importMinWh, reading.importMaxWh)));
  const exportedWh = sum(exportIntervals.map((reading) => positiveIntervalDelta(reading.exportMinWh, reading.exportMaxWh)));
  const available = importIntervals.length > 0;
  const importedKwh = available ? importedWh / 1000 : 0;
  const exportedKwh = exportedWh / 1000;
  const maxDemandKw = max(
    readings
      .map((reading) => reading.activePowerMaxW)
      .filter(Number.isFinite)
      .map((value) => Math.max(0, value) / 1000)
  );
  const powerFactors = readings.map((reading) => reading.powerFactor).filter(Number.isFinite);
  const energyCharge = importedKwh * tariff.energyRate;
  const exportCredit = exportedKwh * tariff.exportRate;
  const demandCharge = maxDemandKw * tariff.demandRate;
  const subtotal = Math.max(0, energyCharge - exportCredit + demandCharge + tariff.fixedCharge);
  const taxAmount = subtotal * (tariff.taxPercent / 100);

  return {
    deviceId: String(meter?.deviceId || ""),
    deviceName: String(meter?.deviceName || meter?.deviceId || "Unknown meter"),
    groupType: String(meter?.groupType || "unassigned"),
    groupName: String(meter?.groupName || "Unassigned"),
    available,
    openingKwh: available ? round(importIntervals[0].importMinWh / 1000, 3) : null,
    closingKwh: available ? round(importIntervals[importIntervals.length - 1].importMaxWh / 1000, 3) : null,
    importedKwh: round(importedKwh, 3),
    exportedKwh: round(exportedKwh, 3),
    maxDemandKw: round(maxDemandKw, 3),
    averagePowerFactor: powerFactors.length ? round(sum(powerFactors) / powerFactors.length, 3) : null,
    coveragePercent: readings.length ? round((importIntervals.length / readings.length) * 100, 1) : 0,
    energyCharge: round(energyCharge, 2),
    exportCredit: round(exportCredit, 2),
    demandCharge: round(demandCharge, 2),
    fixedCharge: available ? round(tariff.fixedCharge, 2) : 0,
    taxAmount: round(taxAmount, 2),
    totalCharge: available ? round(subtotal + taxAmount, 2) : 0,
  };
}

function normalizeReading(reading = {}) {
  return {
    timestamp: parseTimestamp(reading?.capturedAt),
    importMinWh: finiteNumber(reading?.importMinWh),
    importMaxWh: finiteNumber(reading?.importMaxWh),
    exportMinWh: finiteNumber(reading?.exportMinWh),
    exportMaxWh: finiteNumber(reading?.exportMaxWh),
    activePowerMaxW: finiteNumber(reading?.activePowerMaxW),
    powerFactor: finiteNumber(reading?.powerFactor),
  };
}

function positiveIntervalDelta(minimum, maximum) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) return 0;
  return maximum - minimum;
}

function parseTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function nonNegative(value) {
  const numeric = finiteNumber(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function max(values) {
  const numericValues = values.filter(Number.isFinite);
  return numericValues.length ? Math.max(...numericValues) : 0;
}

function round(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
