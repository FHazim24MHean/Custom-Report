export const API_CONFIG = {
  baseUrl: "/rest",
  apiVersion: "1",
  nominalEndpointPath: "histvalues",
  nominalValueMetrics: ["U_Effective", "I_Effective"],
  nominalValuePhases: ["L1", "L2", "L3"],
  nominalValueTimebase: 86400,
  namedAnchor: "",
  namedRanges: {
    today: { start: "NAMED_Today", end: "NAMED_Today" },
    yesterday: { start: "NAMED_Yesterday", end: "NAMED_Yesterday" },
    lastyear: { start: "NAMED_LastYear", end: "NAMED_ThisYear" },
  },
  utcRelativeRangesInDays: {
    last7: 7,
    last30: 30,
    last365: 365,
  },
  defaultProjectName: "",
  eventsTypes: "",
  debugApi: true,
};

export const NOMINAL_METRIC_DEFINITIONS = {
  U_EFFECTIVE: { keyPrefix: "V", displayPrefix: "Voltage, V", unitColumn: "VUnit" },
  I_EFFECTIVE: { keyPrefix: "A", displayPrefix: "Current, A", unitColumn: "AUnit" },
};

export const NOMINAL_EXTRA_SUFFIXES = ["Min", "Max"];
export const VOLTAGE_CLASS_VALUES = ["33kV", "11kV", "400V"];
export const ELECTRICAL_SIDES = ["HT", "LV"];
export const DEFAULT_VOLTAGE_CLASS = "400V";
export const VOLTAGE_CLASS_TOLERANCES = {
  "33kV": { min: 31350, max: 34650 },
  "11kV": { min: 10450, max: 11550 },
  "400V": { min: 376.0, max: 440.0 },
};
export const METRIC_TOLERANCES = {
  // Adjust these compliance limits per metric as needed.
  TOP_OIL_TEMPERATURE: { min: 0.0, max: 90.0 },
  WINDING_TEMPERATURE: { min: 0.0, max: 120.0 },
  LOAD_PERCENT: { min: 0.0, max: 100.0 },
  TRANSFORMATION_RATIO: { min: 0.0, max: 100.0 },
  V_UNBALANCE: { min: 0.0, max: 2.0 },
  A_UNBALANCE: { min: 0.0, max: 5.0 },
  POWER_FACTOR: { min: 0.9, max: 1.0 },
};

export const EXTRA_NOMINAL_METRIC_DEFINITIONS = [
  {
    key: "TOP_OIL_TEMPERATURE",
    queryValue: "TOP_OIL_TEMPERATURE",
    column: "Top Oil Temperature",
    unitColumn: "TopOilTemperatureUnit",
    unitValue: "degC",
    unitLabel: "Top Oil Temperature (degC)",
  },
  {
    key: "WINDING_TEMPERATURE",
    queryValue: "WINDING_TEMPERATURE",
    column: "Winding Temperature",
    unitColumn: "WindingTemperatureUnit",
    unitValue: "degC",
    unitLabel: "Winding Temperature (degC)",
  },
  {
    key: "LOAD_PERCENT",
    queryValue: "LOAD_PERCENT",
    column: "Load",
    unitColumn: "LoadPercentUnit",
    unitValue: "%",
    unitLabel: "Load (%)",
  },
  {
    key: "TRANSFORMATION_RATIO",
    column: "TX Voltage Ratio",
    unitValue: "",
    unitLabel: "TX Voltage Ratio",
  },
  {
    key: "V_UNBALANCE",
    queryValue: "V_UNBALANCE",
    column: "LV Voltage Unbalance",
    unitColumn: "VUnbalanceUnit",
    unitValue: "%",
    unitLabel: "LV Voltage Unbalance (%)",
  },
  {
    key: "A_UNBALANCE",
    queryValue: "A_UNBALANCE",
    column: "LV Current Unbalance",
    unitColumn: "AUnbalanceUnit",
    unitValue: "%",
    unitLabel: "LV Current Unbalance (%)",
  },
  {
    key: "POWER_FACTOR",
    queryValue: "POWER_FACTOR",
    column: "LV Power Factor",
    unitColumn: "PowerFactorUnit",
    unitValue: "",
    unitLabel: "LV Power Factor",
  },
  {
    key: "POWER_ACTIVE_SUM",
    queryValue: "PowerActive",
    column: "POWER_ACTIVE_SUM",
    unitColumn: "PowerActiveSumUnit",
    unitValue: "W",
    unitLabel: "POWER_ACTIVE_SUM",
  },
  {
    key: "POWER_APPARENT_SUM",
    queryValue: "PowerApparent",
    column: "POWER_APPARENT_SUM",
    unitColumn: "PowerApparentSumUnit",
    unitValue: "VA",
    unitLabel: "POWER_APPARENT_SUM",
  },
  {
    key: "TEMPERATURE_EXTERNAL",
    queryValue: "Temperature",
    column: "TEMPERATURE_EXTERNAL",
    unitColumn: "TemperatureExternalUnit",
    unitValue: "degC",
    unitLabel: "TEMPERATURE_EXTERNAL",
  },
  {
    key: "ACTIVE_ENERGY_CONSUMED",
    queryValue: "ActiveEnergyConsumed",
    column: "ACTIVE_ENERGY_CONSUMED",
    unitColumn: "ActiveEnergyConsumedUnit",
    unitValue: "Wh",
    unitLabel: "Imported Active Energy",
  },
  {
    key: "ACTIVE_ENERGY_SUPPLIED",
    queryValue: "ActiveEnergySupplied",
    column: "ACTIVE_ENERGY_SUPPLIED",
    unitColumn: "ActiveEnergySuppliedUnit",
    unitValue: "Wh",
    unitLabel: "Exported Active Energy",
  },
];

export const HIDDEN_NOMINAL_METRIC_KEYS = [
  "POWER_ACTIVE_SUM",
  "POWER_ACTIVE_SUM_Min",
  "POWER_ACTIVE_SUM_Max",
  "POWER_APPARENT_SUM",
  "POWER_APPARENT_SUM_Min",
  "POWER_APPARENT_SUM_Max",
  "TEMPERATURE_EXTERNAL",
  "TEMPERATURE_EXTERNAL_Min",
  "TEMPERATURE_EXTERNAL_Max",
  "ACTIVE_ENERGY_CONSUMED",
  "ACTIVE_ENERGY_CONSUMED_Min",
  "ACTIVE_ENERGY_CONSUMED_Max",
  "ACTIVE_ENERGY_SUPPLIED",
  "ACTIVE_ENERGY_SUPPLIED_Min",
  "ACTIVE_ENERGY_SUPPLIED_Max",
];

export const CAPABILITY_TYPE_PREFERENCES = {
  POWER_FACTOR: ["SUM13", "SUM14", "SUM", "TOTAL", "L1", "L2", "L3"],
  POWER_ACTIVE_SUM: ["SUM13", "SUM14", "SUM", "TOTAL"],
  POWER_APPARENT_SUM: ["SUM13", "SUM14", "SUM", "TOTAL"],
  ACTIVE_ENERGY: ["SUM13", "SUM14", "SUM", "TOTAL"],
};

export const REPORT_METRIC_COLUMNS = [
  "LV Voltage",
  "HV Voltage",
  "Load",
  "LV MSB Temp (from PLC)",
  "LV Power Factor",
  "LV Voltage Unbalance",
  "LV Current Unbalance",
  "TX Voltage Ratio",
  "TX Oil Pressure",
  "TX Temperature",
  "TX Pressure",
];
export const NON_POWER_DATA_PLACEHOLDER = "N/A";
export const SUBSTATION_VOLTAGE_CONTEXT = {
  lvClass: "400V",
  hvClass: "11kV",
};
export const MAIN_INTAKE_VOLTAGE_CONTEXT = {
  lvClass: "11kV",
  hvClass: "33kV",
};
export const NOMINAL_STATUS_COLUMNS = [
  "LV Voltage",
  "HV Voltage",
  "Load",
  "LV Power Factor",
  "LV Voltage Unbalance",
  "LV Current Unbalance",
  "TX Voltage Ratio",
];

export const LEGEND_GAP_ROWS = 5;
export const CONFIG_STORAGE_KEY = "custom-report-device-threshold-config-v1";
export const TRANSFORMER_MAPPING_STORAGE_KEY = "custom-report-transformer-mappings-v1";
export const DEMO_DATA_CONFIG = {
  projectId: "__demo_project__",
  projectName: "Demo Project",
  devicePrefix: "DEMO-DEV",
  deviceNamePrefix: "Demo Device",
  deviceCount: 50,
};
export const MAIN_INTAKE_REPORT_COLUMNS = [
  "Main Intake",
  "Device",
  ...REPORT_METRIC_COLUMNS,
];
export const POWER_QUALITY_REPORT_BASE_COLUMNS = [
  "Category",
  "Device",
  "Start Time",
  "Duration (ms)",
  "Min. Voltage",
  "Max. Voltage",
  "Event Type",
  "Phase",
  "Voltage Sag",
];
