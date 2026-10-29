const DEFAULT_TARIFF = Object.freeze({
  currency: "MYR",
  useTou: false,
  touDataAvailable: true,
  energyRate: 0,
  peakEnergyRate: 0,
  offPeakEnergyRate: 0,
  exportRate: 0,
  demandRate: 0,
  fixedCharge: 0,
  minimumCharge: 0,
  taxPercent: 0,
  afaRate: 0,
  peakStartTime: "08:00",
  peakEndTime: "22:00",
  peakDays: [1, 2, 3, 4, 5],
  sourceLabel: "Temporary tariff",
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
  const chargeRows = availableRows.filter((row) => row.chargeAvailable);

  return {
    tariff,
    rows,
    availableMeterCount: availableRows.length,
    unavailableMeterCount: rows.length - availableRows.length,
    totalImportedKwh: round(sum(availableRows.map((row) => row.importedKwh)), 3),
    totalPeakImportedKwh: round(sum(availableRows.map((row) => row.peakImportedKwh)), 3),
    totalOffPeakImportedKwh: round(sum(availableRows.map((row) => row.offPeakImportedKwh)), 3),
    totalExportedKwh: round(sum(availableRows.map((row) => row.exportedKwh)), 3),
    peakDemandKw: round(max(availableRows.map((row) => row.maxDemandKw)), 3),
    averageCoveragePercent: availableRows.length
      ? round(sum(availableRows.map((row) => row.coveragePercent)) / availableRows.length, 1)
      : 0,
    touBreakdownUnavailable: tariff.useTou && !tariff.touDataAvailable,
    totalCharge: !availableRows.length
      ? 0
      : chargeRows.length
        ? round(sum(chargeRows.map((row) => row.totalCharge)), 2)
        : null,
  };
}

export function normalizeTariff(input = {}) {
  return {
    currency: String(input?.currency || DEFAULT_TARIFF.currency).trim().toUpperCase() || DEFAULT_TARIFF.currency,
    useTou: input?.useTou === true,
    touDataAvailable: input?.touDataAvailable !== false,
    energyRate: nonNegative(input?.energyRate),
    peakEnergyRate: nonNegative(input?.peakEnergyRate),
    offPeakEnergyRate: nonNegative(input?.offPeakEnergyRate),
    exportRate: nonNegative(input?.exportRate),
    demandRate: nonNegative(input?.demandRate),
    fixedCharge: nonNegative(input?.fixedCharge),
    minimumCharge: nonNegative(input?.minimumCharge),
    taxPercent: nonNegative(input?.taxPercent),
    afaRate: signedNumber(input?.afaRate),
    peakStartTime: normalizeTime(input?.peakStartTime, DEFAULT_TARIFF.peakStartTime),
    peakEndTime: normalizeTime(input?.peakEndTime, DEFAULT_TARIFF.peakEndTime),
    peakDays: normalizePeakDays(input?.peakDays),
    sourceLabel: String(input?.sourceLabel || DEFAULT_TARIFF.sourceLabel).trim() || DEFAULT_TARIFF.sourceLabel,
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
  const chargeAvailable = available && (!tariff.useTou || tariff.touDataAvailable);
  const importedKwh = available ? importedWh / 1000 : 0;
  const peakImportedKwh = tariff.useTou && tariff.touDataAvailable
    ? sum(importIntervals
      .filter((reading) => isPeakTimestamp(reading.timestamp, tariff))
      .map((reading) => positiveIntervalDelta(reading.importMinWh, reading.importMaxWh))) / 1000
    : 0;
  const offPeakImportedKwh = tariff.useTou && tariff.touDataAvailable ? Math.max(0, importedKwh - peakImportedKwh) : 0;
  const exportedKwh = exportedWh / 1000;
  const maxDemandKw = max(
    readings
      .map((reading) => reading.activePowerMaxW)
      .filter(Number.isFinite)
      .map((value) => Math.max(0, value) / 1000)
  );
  const powerFactors = readings.map((reading) => reading.powerFactor).filter(Number.isFinite);
  const energyCharge = tariff.useTou && tariff.touDataAvailable
    ? peakImportedKwh * tariff.peakEnergyRate + offPeakImportedKwh * tariff.offPeakEnergyRate
    : tariff.useTou ? 0 : importedKwh * tariff.energyRate;
  const exportCredit = exportedKwh * tariff.exportRate;
  const demandCharge = maxDemandKw * tariff.demandRate;
  const afaCharge = importedKwh * tariff.afaRate;
  const calculatedSubtotal = Math.max(0, energyCharge - exportCredit + afaCharge + demandCharge + tariff.fixedCharge);
  const subtotal = chargeAvailable ? Math.max(calculatedSubtotal, tariff.minimumCharge) : 0;
  const taxAmount = chargeAvailable ? subtotal * (tariff.taxPercent / 100) : 0;

  return {
    deviceId: String(meter?.deviceId || ""),
    deviceName: String(meter?.deviceName || meter?.deviceId || "Unknown meter"),
    groupType: String(meter?.groupType || "unassigned"),
    groupName: String(meter?.groupName || "Unassigned"),
    available,
    chargeAvailable,
    openingKwh: available ? round(importIntervals[0].importMinWh / 1000, 3) : null,
    closingKwh: available ? round(importIntervals[importIntervals.length - 1].importMaxWh / 1000, 3) : null,
    importedKwh: round(importedKwh, 3),
    peakImportedKwh: round(peakImportedKwh, 3),
    offPeakImportedKwh: round(offPeakImportedKwh, 3),
    exportedKwh: round(exportedKwh, 3),
    maxDemandKw: round(maxDemandKw, 3),
    averagePowerFactor: powerFactors.length ? round(sum(powerFactors) / powerFactors.length, 3) : null,
    coveragePercent: readings.length ? round((importIntervals.length / readings.length) * 100, 1) : 0,
    energyCharge: round(energyCharge, 2),
    exportCredit: round(exportCredit, 2),
    afaCharge: round(afaCharge, 2),
    demandCharge: round(demandCharge, 2),
    fixedCharge: chargeAvailable ? round(tariff.fixedCharge, 2) : 0,
    taxAmount: round(taxAmount, 2),
    totalCharge: chargeAvailable ? round(subtotal + taxAmount, 2) : null,
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

function isPeakTimestamp(timestamp, tariff) {
  const date = new Date(timestamp);
  if (!tariff.peakDays.includes(date.getDay())) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = timeToMinutes(tariff.peakStartTime);
  const end = timeToMinutes(tariff.peakEndTime);
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function normalizeTime(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : fallback;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizePeakDays(value) {
  if (!Array.isArray(value)) return [...DEFAULT_TARIFF.peakDays];
  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((left, right) => left - right);
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

function signedNumber(value) {
  const numeric = finiteNumber(value);
  return Number.isFinite(numeric) ? numeric : 0;
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
