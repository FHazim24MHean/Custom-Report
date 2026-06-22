const API_CONFIG = {
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

const NOMINAL_METRIC_DEFINITIONS = {
  U_EFFECTIVE: { keyPrefix: "V", displayPrefix: "Voltage, V", unitColumn: "VUnit" },
  I_EFFECTIVE: { keyPrefix: "A", displayPrefix: "Current, A", unitColumn: "AUnit" },
};

const NOMINAL_EXTRA_SUFFIXES = ["Min", "Max"];
const VOLTAGE_CLASS_VALUES = ["33kV", "11kV", "400V"];
const DEFAULT_VOLTAGE_CLASS = "400V";
const VOLTAGE_CLASS_TOLERANCES = {
  "33kV": { min: 31350, max: 34650 },
  "11kV": { min: 10450, max: 11550 },
  "400V": { min: 376.0, max: 440.0 },
};
const METRIC_TOLERANCES = {
  // Adjust these compliance limits per metric as needed.
  TOP_OIL_TEMPERATURE: { min: 0.0, max: 90.0 },
  WINDING_TEMPERATURE: { min: 0.0, max: 120.0 },
  LOAD_PERCENT: { min: 0.0, max: 100.0 },
  TRANSFORMATION_RATIO: { min: 0.0, max: 100.0 },
  V_UNBALANCE: { min: 0.0, max: 2.0 },
  A_UNBALANCE: { min: 0.0, max: 5.0 },
  POWER_FACTOR: { min: 0.9, max: 1.0 },
};

const EXTRA_NOMINAL_METRIC_DEFINITIONS = [
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
    column: "Load %",
    unitColumn: "LoadPercentUnit",
    unitValue: "%",
    unitLabel: "Load (%)",
  },
  {
    key: "TRANSFORMATION_RATIO",
    column: "Transformation Ratio",
    unitValue: "",
    unitLabel: "Transformation Ratio",
  },
  {
    key: "V_UNBALANCE",
    queryValue: "V_UNBALANCE",
    column: "V Unbalance",
    unitColumn: "VUnbalanceUnit",
    unitValue: "%",
    unitLabel: "Voltage Unbalance (%)",
  },
  {
    key: "A_UNBALANCE",
    queryValue: "A_UNBALANCE",
    column: "A Unbalance",
    unitColumn: "AUnbalanceUnit",
    unitValue: "%",
    unitLabel: "Current Unbalance (%)",
  },
  {
    key: "POWER_FACTOR",
    queryValue: "POWER_FACTOR",
    column: "Power Factor",
    unitColumn: "PowerFactorUnit",
    unitValue: "",
    unitLabel: "Power Factor",
  },
];

const NOMINAL_STATUS_COLUMNS = [
  "Top Oil Temperature",
  "Winding Temperature",
  "Load %",
  "Transformation Ratio",
  "V Unbalance",
  "A Unbalance",
  "Power Factor",
];

const LEGEND_GAP_ROWS = 5;
const CONFIG_STORAGE_KEY = "custom-report-device-threshold-config-v1";
const TRANSFORMER_MAPPING_STORAGE_KEY = "custom-report-transformer-mappings-v1";
const DEMO_DATA_CONFIG = {
  projectId: "__demo_project__",
  projectName: "Demo Project",
  devicePrefix: "DEMO-DEV",
  deviceNamePrefix: "Demo Device",
  deviceCount: 50,
};
const MAIN_INTAKE_REPORT_COLUMNS = [
  "Main Intake",
  "Device",
  "LV Voltage",
  "HV Voltage",
  "Load",
  "Power Factor",
  "Voltage Unbalance",
  "Current Unbalance",
  "TX Voltage Ratio",
  "TX Oil Level",
  "TX Temperature",
  "TX Pressure",
  "Power Quality (Event)",
];

const state = {
  projects: [],
  devices: [],
  configDevices: [],
  selectedDeviceIds: new Set(),
  selectedType: "histvalues",
  selectedTimeRange: "today",
  projectName: API_CONFIG.defaultProjectName,
  configProjectName: API_CONFIG.defaultProjectName,
  latestReportRows: [],
  latestReportColumns: [],
  latestCellClasses: {},
  latestColumnGroups: [],
  latestDeviceTables: [],
  latestDateTables: [],
  latestDatasetColumns: [],
  latestDatasetColumnGroups: [],
  activeDeviceTab: "",
  activeDateTab: "",
  latestApiUrls: [],
  activePage: "report",
  configDeviceSearch: "",
  configSelectedDeviceIds: new Set(),
  thresholdOverridesByDevice: loadThresholdOverrides(),
  substationMappingsByProject: loadSubstationMappings(),
  transformerMappings: loadTransformerMappings(),
};

const projectSelect = document.getElementById("projectSelect");
const refreshProjectsButton = document.getElementById("refreshProjectsButton");
const deviceDropdown = document.getElementById("deviceDropdown");
const deviceDropdownButton = document.getElementById("deviceDropdownButton");
const deviceDropdownMenu = document.getElementById("deviceDropdownMenu");
const deviceOptions = document.getElementById("deviceOptions");
const typeSelect = document.getElementById("typeSelect");
const timeRangeSelect = document.getElementById("timeRangeSelect");
const customDateRange = document.getElementById("customDateRange");
const customStartDate = document.getElementById("customStartDate");
const customEndDate = document.getElementById("customEndDate");
const generateReportButton = document.getElementById("generateReportButton");
const exportFormatSelect = document.getElementById("exportFormatSelect");
const exportReportButton = document.getElementById("exportReportButton");
const reportTableHead = document.querySelector("#reportTable thead");
const reportTableBody = document.querySelector("#reportTable tbody");
const mainIntakeReportSection = document.getElementById("mainIntakeReportSection");
const mainIntakeReportTableHead = document.querySelector("#mainIntakeReportTable thead");
const mainIntakeReportTableBody = document.querySelector("#mainIntakeReportTable tbody");
const deviceTabs = document.getElementById("deviceTabs");
const dateTabs = document.getElementById("dateTabs");
const statusMessage = document.getElementById("statusMessage");
const selectedDevices = document.getElementById("selectedDevices");
const showReportPageButton = document.getElementById("showReportPageButton");
const showConfigPageButton = document.getElementById("showConfigPageButton");
const reportPage = document.getElementById("reportPage");
const configPage = document.getElementById("configPage");
const configProjectSummary = document.getElementById("configProjectSummary");
const configMetricForm = document.getElementById("configMetricForm");
const configProjectSelect = document.getElementById("configProjectSelect");
const configDeviceSearch = document.getElementById("configDeviceSearch");
const selectAllFilteredConfigButton = document.getElementById("selectAllFilteredConfigButton");
const clearFilteredConfigButton = document.getElementById("clearFilteredConfigButton");
const configDeviceCount = document.getElementById("configDeviceCount");
const configDeviceList = document.getElementById("configDeviceList");
const substationNameInput = document.getElementById("substationNameInput");
const addSubstationButton = document.getElementById("addSubstationButton");
const substationAssignmentSelect = document.getElementById("substationAssignmentSelect");
const assignSelectedSubstationButton = document.getElementById("assignSelectedSubstationButton");
const clearSelectedSubstationButton = document.getElementById("clearSelectedSubstationButton");
const substationCount = document.getElementById("substationCount");
const substationList = document.getElementById("substationList");
const mainIntakeNameInput = document.getElementById("mainIntakeNameInput");
const addMainIntakeButton = document.getElementById("addMainIntakeButton");
const mainIntakeAssignmentSelect = document.getElementById("mainIntakeAssignmentSelect");
const assignSelectedMainIntakeButton = document.getElementById("assignSelectedMainIntakeButton");
const clearSelectedMainIntakeButton = document.getElementById("clearSelectedMainIntakeButton");
const mainIntakeCount = document.getElementById("mainIntakeCount");
const mainIntakeList = document.getElementById("mainIntakeList");
const applyConfigButton = document.getElementById("applyConfigButton");
const monthlyThresholdMonth = document.getElementById("monthlyThresholdMonth");
const monthlyThresholdHint = document.getElementById("monthlyThresholdHint");
const applyMonthlyThresholdButton = document.getElementById("applyMonthlyThresholdButton");
const resetConfigSelectionButton = document.getElementById("resetConfigSelectionButton");
const transformerHtDeviceSelect = document.getElementById("transformerHtDeviceSelect");
const transformerLvDeviceSelect = document.getElementById("transformerLvDeviceSelect");
const addTransformerMappingButton = document.getElementById("addTransformerMappingButton");
const transformerMappingList = document.getElementById("transformerMappingList");

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  toggleCustomDateRange(false);
  renderConfigMetricForm();
  initializeMonthlyThresholdMonth();
  renderActivePage();
  renderDeviceTables([]);
  renderMainIntakeReportTable();
  await loadProjects();
});

function bindEvents() {
  showReportPageButton.addEventListener("click", () => {
    state.activePage = "report";
    renderActivePage();
  });

  showConfigPageButton.addEventListener("click", () => {
    state.activePage = "config";
    renderActivePage();
  });

  deviceDropdownButton.addEventListener("click", () => {
    const isHidden = deviceDropdownMenu.classList.contains("hidden");
    deviceDropdownMenu.classList.toggle("hidden", !isHidden);
    deviceDropdownButton.setAttribute("aria-expanded", String(isHidden));
  });

  document.addEventListener("click", (event) => {
    if (!deviceDropdown.contains(event.target)) {
      deviceDropdownMenu.classList.add("hidden");
      deviceDropdownButton.setAttribute("aria-expanded", "false");
    }
  });

  refreshProjectsButton.addEventListener("click", loadProjects);

  projectSelect.addEventListener("change", async (event) => {
    state.projectName = event.target.value;
    await loadDevices();
  });

  configProjectSelect.addEventListener("change", async (event) => {
    state.configProjectName = String(event.target.value || "");
    await loadConfigDevices();
  });

  typeSelect.addEventListener("change", (event) => {
    state.selectedType = event.target.value;
  });

  timeRangeSelect.addEventListener("change", (event) => {
    state.selectedTimeRange = event.target.value;
    toggleCustomDateRange(state.selectedTimeRange === "custom");
  });

  configDeviceSearch.addEventListener("input", (event) => {
    state.configDeviceSearch = String(event.target.value || "");
    renderConfigFilteredControls();
  });

  if (monthlyThresholdMonth) {
    monthlyThresholdMonth.addEventListener("change", updateMonthlyThresholdHint);
  }

  selectAllFilteredConfigButton.addEventListener("click", () => {
    getFilteredConfigDevices().forEach((device) => {
      state.configSelectedDeviceIds.add(device.devid);
    });
    renderConfigDeviceList();
    updateConfigMetricCurrentThresholds();
  });

  clearFilteredConfigButton.addEventListener("click", () => {
    getFilteredConfigDevices().forEach((device) => {
      state.configSelectedDeviceIds.delete(device.devid);
    });
    renderConfigDeviceList();
    updateConfigMetricCurrentThresholds();
  });

  addSubstationButton.addEventListener("click", addSubstationForConfigProject);
  assignSelectedSubstationButton.addEventListener("click", assignSelectedDevicesToSubstation);
  clearSelectedSubstationButton.addEventListener("click", clearSelectedDeviceSubstations);
  if (addMainIntakeButton) {
    addMainIntakeButton.addEventListener("click", addMainIntakeForConfigProject);
  }
  if (assignSelectedMainIntakeButton) {
    assignSelectedMainIntakeButton.addEventListener("click", assignSelectedDevicesToMainIntake);
  }
  if (clearSelectedMainIntakeButton) {
    clearSelectedMainIntakeButton.addEventListener("click", clearSelectedDeviceMainIntakes);
  }

  if (applyConfigButton) {
    applyConfigButton.addEventListener("click", applyThresholdConfigToSelectedDevices);
  }
  if (applyMonthlyThresholdButton) {
    applyMonthlyThresholdButton.addEventListener("click", applyMonthlyThresholdsToSelectedDevices);
  }
  if (resetConfigSelectionButton) {
    resetConfigSelectionButton.addEventListener("click", clearThresholdConfigForSelectedDevices);
  }
  addTransformerMappingButton.addEventListener("click", saveTransformerMapping);

  generateReportButton.addEventListener("click", onGenerateReport);
  exportReportButton.addEventListener("click", onExportReport);
}

function loadThresholdOverrides() {
  try {
    const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveThresholdOverrides() {
  try {
    window.localStorage.setItem(
      CONFIG_STORAGE_KEY,
      JSON.stringify(state.thresholdOverridesByDevice || {})
    );
  } catch (_error) {
    // Ignore storage failures and keep runtime state only.
  }
}

function loadSubstationMappings() {
  return {};
}

function saveSubstationMappings() {
  // Substation mappings are persisted on the server in Postgres.
}

function loadTransformerMappings() {
  try {
    const stored = window.localStorage.getItem(TRANSFORMER_MAPPING_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

function saveTransformerMappings() {
  try {
    window.localStorage.setItem(
      TRANSFORMER_MAPPING_STORAGE_KEY,
      JSON.stringify(state.transformerMappings || [])
    );
  } catch (_error) {
    // Ignore storage failures and keep runtime state only.
  }
}

function getConfigMetricDefinitions() {
  return EXTRA_NOMINAL_METRIC_DEFINITIONS.filter((definition) =>
    NOMINAL_STATUS_COLUMNS.includes(definition.column)
  );
}

function getMonthlyThresholdMetricDefinitions() {
  return getConfigMetricDefinitions().filter((definition) =>
    definition?.key &&
    definition.key !== "TRANSFORMATION_RATIO" &&
    String(definition?.queryValue || "").trim()
  );
}

function initializeMonthlyThresholdMonth() {
  if (monthlyThresholdMonth && !monthlyThresholdMonth.value) {
    monthlyThresholdMonth.value = getPreviousMonthInputValue();
  }
  updateMonthlyThresholdHint();
}

function getPreviousMonthInputValue() {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRangeFromInput(monthValue) {
  const match = String(monthValue || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    monthValue: `${match[1]}-${match[2]}`,
    startDate: `${match[1]}-${match[2]}-01`,
    endDate: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(
      end.getUTCDate()
    ).padStart(2, "0")}`,
    label: start.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function updateMonthlyThresholdHint() {
  if (!monthlyThresholdHint) {
    return;
  }
  const range = getMonthRangeFromInput(monthlyThresholdMonth?.value);
  const monthLabel = range?.label || "the selected month";
  monthlyThresholdHint.textContent =
    `For the selected devices, use ${monthLabel}'s daily aggregates to set ` +
    "min = average Min and max = average Max. The month's average Avg is stored as reference metadata. " +
    "Transformation Ratio is left unchanged.";
}

function getConfigMetricInputId(metricKey, bound) {
  return `config-${String(metricKey || "").toLowerCase()}-${String(bound || "").toLowerCase()}`;
}

function getConfigMetricCurrentThresholdId(metricKey) {
  return `config-${String(metricKey || "").toLowerCase()}-current-threshold`;
}

function renderConfigMetricForm() {
  if (!configMetricForm) {
    return;
  }
  configMetricForm.innerHTML = "";
  getConfigMetricDefinitions().forEach((definition) => {
    const wrapper = document.createElement("section");
    wrapper.className = "config-metric-card";

    const title = document.createElement("h4");
    title.className = "config-metric-title";
    title.textContent = definition.column;

    const currentThreshold = document.createElement("p");
    currentThreshold.id = getConfigMetricCurrentThresholdId(definition.key);
    currentThreshold.className = "config-metric-current";

    const grid = document.createElement("div");
    grid.className = "config-metric-grid";

    ["min", "max"].forEach((bound) => {
      const field = document.createElement("label");
      field.className = "field-group";
      field.htmlFor = getConfigMetricInputId(definition.key, bound);

      const label = document.createElement("span");
      label.className = "field-label";
      label.textContent = `${bound === "min" ? "Minimum" : "Maximum"}${definition.unitValue ? ` (${definition.unitValue})` : ""}`;

      const input = document.createElement("input");
      input.id = getConfigMetricInputId(definition.key, bound);
      input.className = "input-control";
      input.type = "number";
      input.step = "any";
      input.value = String(METRIC_TOLERANCES?.[definition.key]?.[bound] ?? "");

      field.appendChild(label);
      field.appendChild(input);
      grid.appendChild(field);
    });

    wrapper.appendChild(title);
    wrapper.appendChild(currentThreshold);
    wrapper.appendChild(grid);
    configMetricForm.appendChild(wrapper);
  });
  updateConfigMetricCurrentThresholds();
}

function updateConfigMetricCurrentThresholds() {
  getConfigMetricDefinitions().forEach((definition) => {
    const summaryNode = document.getElementById(getConfigMetricCurrentThresholdId(definition.key));
    if (!summaryNode) {
      return;
    }
    summaryNode.textContent = buildConfigMetricCurrentThresholdText(definition.key);
  });
}

function buildConfigMetricCurrentThresholdText(metricKey) {
  const normalizedMetricKey = normalizeMetricKey(metricKey);
  const unit = getToleranceUnitByMetricKey(normalizedMetricKey);
  const selectedDeviceIds = [...state.configSelectedDeviceIds].filter(Boolean);

  if (!selectedDeviceIds.length) {
    const tolerance = getMetricTolerance(normalizedMetricKey);
    return `Current: ${formatConfigThresholdRange(tolerance, unit)} (default)`;
  }

  const toleranceRanges = [];
  const monthlySources = new Set();
  let customCount = 0;

  selectedDeviceIds.forEach((deviceId) => {
    const tolerance = getMetricTolerance(normalizedMetricKey, { deviceId });
    if (Number.isFinite(tolerance?.min) && Number.isFinite(tolerance?.max)) {
      toleranceRanges.push(formatConfigThresholdRange(tolerance, unit));
    }

    const override = state.thresholdOverridesByDevice?.[String(deviceId || "")]?.[normalizedMetricKey];
    if (Number.isFinite(override?.min) && Number.isFinite(override?.max)) {
      customCount += 1;
      if (String(override?.sourceLabel || "").trim()) {
        monthlySources.add(String(override.sourceLabel).trim());
      }
    }
  });

  if (!toleranceRanges.length) {
    return "Current: -";
  }

  const uniqueRanges = Array.from(new Set(toleranceRanges));
  if (uniqueRanges.length > 1) {
    return `Current: Mixed across ${selectedDeviceIds.length} selected device(s)`;
  }

  const suffix =
    customCount === 0
      ? "default"
      : customCount === selectedDeviceIds.length
        ? "custom"
        : `${customCount}/${selectedDeviceIds.length} custom`;
  const sourceText =
    monthlySources.size === 1 && customCount === selectedDeviceIds.length
      ? ` | source ${Array.from(monthlySources)[0]}`
      : "";
  return `Current: ${uniqueRanges[0]} (${suffix})${sourceText}`;
}

function formatConfigThresholdRange(tolerance, unit = "") {
  if (!Number.isFinite(tolerance?.min) || !Number.isFinite(tolerance?.max)) {
    return "-";
  }
  return `${formatToleranceValue(tolerance.min, unit)} to ${formatToleranceValue(tolerance.max, unit)}`;
}

function renderActivePage() {
  const showingConfig = state.activePage === "config";
  reportPage.classList.toggle("hidden", showingConfig);
  configPage.classList.toggle("hidden", !showingConfig);
  showReportPageButton.classList.toggle("active", !showingConfig);
  showConfigPageButton.classList.toggle("active", showingConfig);
  if (showingConfig) {
    renderConfigPage();
  }
}

function renderConfigPage() {
  const projectLabel = state.configProjectName
    ? getProjectDisplayName(state.configProjectName)
    : "No project selected";
  configProjectSummary.textContent = state.configDevices.length
    ? `${projectLabel} | ${state.configDevices.length} device(s)`
    : "Select a project to configure device mappings.";
  updateMonthlyThresholdHint();
  renderSubstationControls();
  renderConfigFilteredControls();
  updateConfigMetricCurrentThresholds();
  renderTransformerMappingList();
}

function normalizeSubstationName(value) {
  return String(value || "").trim();
}

function getProjectSubstationConfig(projectName) {
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    return {
      substations: [],
      deviceAssignments: {},
      deviceLabels: {},
      mainIntakes: [],
      mainIntakeAssignments: {},
    };
  }

  const config = state.substationMappingsByProject?.[safeProjectName];
  if (!config || typeof config !== "object") {
    return {
      substations: [],
      deviceAssignments: {},
      deviceLabels: {},
      mainIntakes: [],
      mainIntakeAssignments: {},
    };
  }

  return {
    substations: Array.isArray(config.substations)
      ? [...config.substations].sort(
          (left, right) =>
            compareTextValues(left?.name, right?.name) || compareTextValues(left?.id, right?.id)
        )
      : [],
    deviceAssignments:
      config.deviceAssignments && typeof config.deviceAssignments === "object"
        ? { ...config.deviceAssignments }
        : {},
    deviceLabels:
      config.deviceLabels && typeof config.deviceLabels === "object"
        ? { ...config.deviceLabels }
        : {},
    mainIntakes: Array.isArray(config.mainIntakes)
      ? [...config.mainIntakes].sort(
          (left, right) =>
            compareTextValues(left?.name, right?.name) || compareTextValues(left?.id, right?.id)
        )
      : [],
    mainIntakeAssignments:
      config.mainIntakeAssignments && typeof config.mainIntakeAssignments === "object"
        ? { ...config.mainIntakeAssignments }
        : {},
  };
}

function setProjectSubstationConfig(projectName, nextConfig) {
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    return;
  }

  state.substationMappingsByProject[safeProjectName] = {
    substations: Array.isArray(nextConfig?.substations) ? [...nextConfig.substations] : [],
    deviceAssignments:
      nextConfig?.deviceAssignments && typeof nextConfig.deviceAssignments === "object"
        ? { ...nextConfig.deviceAssignments }
        : {},
    deviceLabels:
      nextConfig?.deviceLabels && typeof nextConfig.deviceLabels === "object"
        ? { ...nextConfig.deviceLabels }
        : {},
    mainIntakes: Array.isArray(nextConfig?.mainIntakes) ? [...nextConfig.mainIntakes] : [],
    mainIntakeAssignments:
      nextConfig?.mainIntakeAssignments && typeof nextConfig.mainIntakeAssignments === "object"
        ? { ...nextConfig.mainIntakeAssignments }
        : {},
  };
}

function normalizeSubstationApiConfig(projectName, payload) {
  const safeProjectName = String(projectName || "").trim();
  const substations = (Array.isArray(payload?.substations) ? payload.substations : [])
    .map((substation) => {
      const id = String(substation?.id || "").trim();
      const name = normalizeSubstationName(substation?.name);
      if (!id || !name) {
        return null;
      }
      return {
        id,
        name,
        projectName: safeProjectName,
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareTextValues(left?.name, right?.name) || compareTextValues(left?.id, right?.id));

  const substationLookup = new Map(substations.map((substation) => [substation.id, substation]));
  const deviceAssignments = {};
  (Array.isArray(payload?.deviceAssignments) ? payload.deviceAssignments : []).forEach((assignment) => {
    const deviceId = String(assignment?.deviceId || "").trim();
    const substationId = String(assignment?.substationId || "").trim();
    const substation = substationLookup.get(substationId);
    if (!deviceId || !substationId || !substation) {
      return;
    }
    deviceAssignments[deviceId] = {
      substationId,
      substationName: substation.name,
    };
  });

  const deviceLabels = {};
  (Array.isArray(payload?.deviceLabels) ? payload.deviceLabels : []).forEach((entry) => {
    const deviceId = String(entry?.deviceId || "").trim();
    const label = String(entry?.label || "").trim();
    if (!deviceId || !label) {
      return;
    }
    deviceLabels[deviceId] = label;
  });

  const mainIntakes = (Array.isArray(payload?.mainIntakes) ? payload.mainIntakes : [])
    .map((item) => {
      const id = String(item?.id || "").trim();
      const name = String(item?.name || "").trim();
      if (!id || !name) {
        return null;
      }
      return {
        id,
        name,
        projectName: safeProjectName,
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        compareTextValues(left?.name, right?.name) || compareTextValues(left?.id, right?.id)
    );

  const mainIntakeLookup = new Map(mainIntakes.map((item) => [item.id, item]));
  const mainIntakeAssignments = {};
  (Array.isArray(payload?.mainIntakeAssignments) ? payload.mainIntakeAssignments : []).forEach((entry) => {
    const deviceId = String(entry?.deviceId || "").trim();
    const mainIntakeId = String(entry?.mainIntakeId || "").trim();
    const mainIntake = mainIntakeLookup.get(mainIntakeId);
    if (!deviceId || !mainIntakeId || !mainIntake) {
      return;
    }
    mainIntakeAssignments[deviceId] = {
      mainIntakeId,
      mainIntakeName: mainIntake.name,
    };
  });

  return {
    substations,
    deviceAssignments,
    deviceLabels,
    mainIntakes,
    mainIntakeAssignments,
  };
}

async function fetchProjectSubstationConfig(projectName, { force = false } = {}) {
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    return {
      substations: [],
      deviceAssignments: {},
      deviceLabels: {},
      mainIntakes: [],
      mainIntakeAssignments: {},
    };
  }

  if (!force && state.substationMappingsByProject?.[safeProjectName]) {
    return getProjectSubstationConfig(safeProjectName);
  }

  const payload = await requestJson(buildAppApiPath("projects", safeProjectName, "substations"));
  const config = normalizeSubstationApiConfig(safeProjectName, payload);
  setProjectSubstationConfig(safeProjectName, config);
  return config;
}

function getProjectSubstations(projectName) {
  return getProjectSubstationConfig(projectName).substations;
}

function getProjectDeviceAssignments(projectName) {
  return getProjectSubstationConfig(projectName).deviceAssignments;
}

function getProjectDeviceLabels(projectName) {
  return getProjectSubstationConfig(projectName).deviceLabels;
}

function getProjectMainIntakes(projectName) {
  return getProjectSubstationConfig(projectName).mainIntakes;
}

function getProjectMainIntakeAssignments(projectName) {
  return getProjectSubstationConfig(projectName).mainIntakeAssignments;
}

function getProjectSubstationById(projectName, substationId) {
  const safeSubstationId = String(substationId || "").trim();
  return getProjectSubstations(projectName).find(
    (substation) => String(substation?.id || "") === safeSubstationId
  ) || null;
}

function getProjectAssignedSubstationId(projectName, deviceId) {
  const assignments = getProjectDeviceAssignments(projectName);
  return String(assignments[String(deviceId || "").trim()]?.substationId || "");
}

function getProjectAssignedSubstation(projectName, deviceId) {
  const assignments = getProjectDeviceAssignments(projectName);
  return normalizeSubstationName(assignments[String(deviceId || "").trim()]?.substationName) || "Unassigned";
}

function getProjectDeviceLabel(projectName, deviceId) {
  const labels = getProjectDeviceLabels(projectName);
  return String(labels[String(deviceId || "").trim()] || "").trim();
}

function getProjectMainIntakeById(projectName, mainIntakeId) {
  const safeMainIntakeId = String(mainIntakeId || "").trim();
  return getProjectMainIntakes(projectName).find(
    (mainIntake) => String(mainIntake?.id || "") === safeMainIntakeId
  ) || null;
}

function getProjectAssignedMainIntakeId(projectName, deviceId) {
  const assignments = getProjectMainIntakeAssignments(projectName);
  return String(assignments[String(deviceId || "").trim()]?.mainIntakeId || "");
}

function getProjectAssignedMainIntake(projectName, deviceId) {
  const assignments = getProjectMainIntakeAssignments(projectName);
  return String(assignments[String(deviceId || "").trim()]?.mainIntakeName || "").trim() || "Unassigned";
}

function getDeterministicDummyNumber(seedText, min, max, decimals = 1) {
  const text = String(seedText || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100000;
  }
  const value = min + (hash / 99999) * (max - min);
  return Number(value.toFixed(decimals));
}

function buildDummyMainIntakeMetrics(deviceId) {
  const seed = String(deviceId || "");
  return {
    "LV Voltage": `${getDeterministicDummyNumber(`${seed}:lv`, 397, 420, 1)} V`,
    "HV Voltage": `${getDeterministicDummyNumber(`${seed}:hv`, 10.8, 11.4, 2)} kV`,
    Load: `${getDeterministicDummyNumber(`${seed}:load`, 42, 86, 1)} %`,
    "Power Factor": getDeterministicDummyNumber(`${seed}:pf`, 0.91, 0.99, 2).toFixed(2),
    "Voltage Unbalance": `${getDeterministicDummyNumber(`${seed}:vu`, 0.3, 1.8, 2)} %`,
    "Current Unbalance": `${getDeterministicDummyNumber(`${seed}:cu`, 1.2, 4.7, 2)} %`,
    "TX Voltage Ratio": getDeterministicDummyNumber(`${seed}:ratio`, 0.97, 1.03, 3).toFixed(3),
    "TX Oil Level": `${getDeterministicDummyNumber(`${seed}:oil`, 72, 96, 1)} %`,
    "TX Temperature": `${getDeterministicDummyNumber(`${seed}:temp`, 48, 78, 1)} degC`,
    "TX Pressure": `${getDeterministicDummyNumber(`${seed}:pressure`, 1.1, 2.6, 2)} bar`,
    "Power Quality (Event)": getDeterministicDummyNumber(`${seed}:events`, 0, 4, 0) > 2 ? "Review" : "Normal",
  };
}

function buildMainIntakeReportRows(projectName) {
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    return [];
  }

  const assignments = getProjectMainIntakeAssignments(safeProjectName);
  const rows = [];

  Object.entries(assignments).forEach(([deviceId, assignment]) => {
    const mainIntakeName = String(assignment?.mainIntakeName || "").trim();
    if (!mainIntakeName) {
      return;
    }
    rows.push({
      "Main Intake": mainIntakeName,
      Device: getDeviceDisplayName(deviceId),
      ...buildDummyMainIntakeMetrics(deviceId),
    });
  });

  rows.sort(
    (left, right) =>
      compareTextValues(left?.["Main Intake"], right?.["Main Intake"]) ||
      compareTextValues(left?.Device, right?.Device)
  );
  return rows;
}

function applyProjectSubstationMappings(devices, projectName) {
  const mappedDevices = cloneDeviceList(devices).map((device) => ({
    ...device,
    site: getProjectAssignedSubstation(projectName, device?.devid),
    customLabel: getProjectDeviceLabel(projectName, device?.devid),
  }));
  mappedDevices.sort(
    (left, right) =>
      compareTextValues(getDeviceSite(left), getDeviceSite(right)) ||
      compareTextValues(left?.name, right?.name) ||
      compareTextValues(left?.devid, right?.devid)
  );
  return mappedDevices;
}

function syncLoadedDevicesForProject(projectName) {
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    return;
  }

  if (state.projectName === safeProjectName) {
    state.devices = applyProjectSubstationMappings(state.devices, safeProjectName);
    renderDeviceOptions();
    if (state.latestDeviceTables.length) {
      const nextDeviceTables = state.latestDeviceTables.map((deviceTable) => ({
        ...deviceTable,
        substation: getProjectAssignedSubstation(safeProjectName, deviceTable.deviceId),
      }));
      renderDeviceTables(nextDeviceTables, state.latestDatasetColumns, state.latestDatasetColumnGroups);
    }
    renderMainIntakeReportTable();
  }

  if (state.configProjectName === safeProjectName) {
    state.configDevices = applyProjectSubstationMappings(state.configDevices, safeProjectName);
  }
}

async function saveDeviceLabelForProject(projectName, deviceId, label) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceId = String(deviceId || "").trim();
  if (!safeProjectName || !safeDeviceId) {
    throw new Error("Project and device are required.");
  }

  const payload = await requestJson(buildAppApiPath("projects", safeProjectName, "device-labels"), {
    method: "PUT",
    body: {
      deviceId: safeDeviceId,
      label: String(label || "").trim(),
    },
  });
  setProjectSubstationConfig(
    safeProjectName,
    normalizeSubstationApiConfig(safeProjectName, payload)
  );
  syncLoadedDevicesForProject(safeProjectName);
  return getProjectDeviceLabel(safeProjectName, safeDeviceId);
}

async function addMainIntakeForConfigProject() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before adding a main intake.", true);
    return;
  }

  const mainIntakeName = String(mainIntakeNameInput?.value || "").trim();
  if (!mainIntakeName) {
    setStatus("Enter a main intake name before adding it.", true);
    return;
  }

  const config = getProjectSubstationConfig(state.configProjectName);
  if (config.mainIntakes.some((mainIntake) => mainIntake?.name === mainIntakeName)) {
    setStatus(`Main intake "${mainIntakeName}" already exists for this project.`, true);
    return;
  }

  try {
    const payload = await requestJson(buildAppApiPath("projects", state.configProjectName, "main-intakes"), {
      method: "POST",
      body: { name: mainIntakeName },
    });
    setProjectSubstationConfig(
      state.configProjectName,
      normalizeSubstationApiConfig(state.configProjectName, payload)
    );
    syncLoadedDevicesForProject(state.configProjectName);
    mainIntakeNameInput.value = "";
    renderConfigPage();
    setStatus(`Main intake "${mainIntakeName}" added.`);
  } catch (error) {
    setStatus(`Failed to add main intake. ${error.message}`, true);
  }
}

async function saveMainIntakeMappingForProject(projectName, deviceIds, mainIntakeId) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceIds = (Array.isArray(deviceIds) ? deviceIds : [])
    .map((deviceId) => String(deviceId || "").trim())
    .filter(Boolean);
  if (!safeProjectName || !safeDeviceIds.length) {
    throw new Error("Project and device are required.");
  }

  const payload = await requestJson(buildAppApiPath("projects", safeProjectName, "main-intakes"), {
    method: "PUT",
    body: {
      deviceIds: safeDeviceIds,
      mainIntakeId: String(mainIntakeId || "").trim() || null,
    },
  });
  setProjectSubstationConfig(
    safeProjectName,
    normalizeSubstationApiConfig(safeProjectName, payload)
  );
  syncLoadedDevicesForProject(safeProjectName);
  return safeDeviceIds.length;
}

function getPreferredDeviceLabel(deviceOrId, options = {}) {
  const projectName = String(options?.projectName || state.projectName || state.configProjectName || "").trim();
  if (deviceOrId && typeof deviceOrId === "object") {
    return String(deviceOrId?.customLabel || "").trim() || String(deviceOrId?.name || deviceOrId?.devid || "").trim();
  }

  const device = getDeviceRecordById(deviceOrId);
  const configuredLabel =
    String(device?.customLabel || "").trim() || getProjectDeviceLabel(projectName, deviceOrId);
  if (configuredLabel) {
    return configuredLabel;
  }
  return String(device?.name || deviceOrId || "").trim();
}

function buildSubstationOptionMarkup(projectName, selectedSubstation = "") {
  const safeSelectedSubstation = String(selectedSubstation || "").trim();
  const options = ['<option value="">Unassigned</option>'];
  getProjectSubstations(projectName).forEach((substation) => {
    const isSelected = String(substation?.id || "") === safeSelectedSubstation ? ' selected' : "";
    options.push(
      `<option value="${escapeHtml(substation?.id || "")}"${isSelected}>${escapeHtml(substation?.name || "")}</option>`
    );
  });
  return options.join("");
}

function buildMainIntakeOptionMarkup(projectName, selectedMainIntakeId = "") {
  const safeSelectedMainIntakeId = String(selectedMainIntakeId || "").trim();
  const options = ['<option value="">Unassigned</option>'];
  getProjectMainIntakes(projectName).forEach((mainIntake) => {
    const mainIntakeId = String(mainIntake?.id || "").trim();
    if (!mainIntakeId) {
      return;
    }
    const isSelected = mainIntakeId === safeSelectedMainIntakeId ? ' selected' : "";
    options.push(
      `<option value="${escapeHtml(mainIntakeId)}"${isSelected}>${escapeHtml(mainIntake?.name || "")}</option>`
    );
  });
  return options.join("");
}

function renderSubstationControls() {
  const substations = getProjectSubstations(state.configProjectName);
  const mainIntakes = getProjectMainIntakes(state.configProjectName);
  substationCount.textContent = `${substations.length} substation(s)`;
  substationAssignmentSelect.innerHTML = `<option value="">Select substation</option>${substations
    .map(
      (substation) =>
        `<option value="${escapeHtml(substation?.id || "")}">${escapeHtml(substation?.name || "")}</option>`
    )
    .join("")}`;
  if (mainIntakeCount) {
    mainIntakeCount.textContent = `${mainIntakes.length} main intake(s)`;
  }
  if (mainIntakeAssignmentSelect) {
    mainIntakeAssignmentSelect.innerHTML = `<option value="">Select main intake</option>${mainIntakes
      .map(
        (mainIntake) =>
          `<option value="${escapeHtml(mainIntake?.id || "")}">${escapeHtml(mainIntake?.name || "")}</option>`
      )
      .join("")}`;
  }

  substationList.innerHTML = "";
  if (mainIntakeList) {
    mainIntakeList.innerHTML = "";
  }
  if (!state.configProjectName) {
    substationList.innerHTML = '<div class="config-empty">Select a project before managing substations.</div>';
    if (mainIntakeList) {
      mainIntakeList.innerHTML =
        '<div class="config-empty">Select a project before managing main intake mappings.</div>';
    }
    return;
  }

  if (!substations.length) {
    substationList.innerHTML = '<div class="config-empty">No substations configured for this project.</div>';
  }

  if (mainIntakeList && !mainIntakes.length) {
    mainIntakeList.innerHTML = '<div class="config-empty">No main intakes configured for this project.</div>';
  }

  if (substations.length) {
    const assignments = getProjectDeviceAssignments(state.configProjectName);
    substations.forEach((substation) => {
      const assignedDeviceCount = Object.values(assignments).filter(
        (value) => String(value?.substationId || "") === String(substation?.id || "")
      ).length;
      const row = document.createElement("div");
      row.className = "substation-list-row";

      const text = document.createElement("div");
      text.innerHTML = `
        <div class="config-device-name">${escapeHtml(substation?.name || "")}</div>
        <div class="config-device-subtext">${assignedDeviceCount} device(s) mapped</div>
      `;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "secondary-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", async () => {
        await removeSubstationDefinition(state.configProjectName, substation?.id);
      });

      row.appendChild(text);
      row.appendChild(removeButton);
      substationList.appendChild(row);
    });
  }

  if (!mainIntakeList) {
    return;
  }

  const mainIntakeAssignments = getProjectMainIntakeAssignments(state.configProjectName);
  mainIntakes.forEach((mainIntake) => {
    const row = document.createElement("div");
    row.className = "main-intake-row";

    const text = document.createElement("div");
    const assignedDeviceCount = Object.values(mainIntakeAssignments).filter(
      (value) => String(value?.mainIntakeId || "") === String(mainIntake?.id || "")
    ).length;
    text.innerHTML = `
      <div class="config-device-name">${escapeHtml(mainIntake?.name || "")}</div>
      <div class="config-device-subtext">${assignedDeviceCount} device(s) mapped</div>
    `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", async () => {
      await removeMainIntakeDefinition(state.configProjectName, mainIntake?.id);
    });

    row.appendChild(text);
    row.appendChild(removeButton);
    mainIntakeList.appendChild(row);
  });
}

async function addSubstationForConfigProject() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before adding a substation.", true);
    return;
  }

  const substationName = normalizeSubstationName(substationNameInput?.value);
  if (!substationName) {
    setStatus("Enter a substation name before adding it.", true);
    return;
  }

  const config = getProjectSubstationConfig(state.configProjectName);
  if (config.substations.some((substation) => substation?.name === substationName)) {
    setStatus(`Substation "${substationName}" already exists for this project.`, true);
    return;
  }

  try {
    const payload = await requestJson(buildAppApiPath("projects", state.configProjectName, "substations"), {
      method: "POST",
      body: { name: substationName },
    });
    setProjectSubstationConfig(
      state.configProjectName,
      normalizeSubstationApiConfig(state.configProjectName, payload)
    );
    syncLoadedDevicesForProject(state.configProjectName);
    substationNameInput.value = "";
    renderConfigPage();
    setStatus(`Substation "${substationName}" added.`);
  } catch (error) {
    setStatus(`Failed to add substation. ${error.message}`, true);
  }
}

async function assignDevicesToProjectSubstation(projectName, deviceIds, substationId = "") {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceIds = (Array.isArray(deviceIds) ? deviceIds : [])
    .map((deviceId) => String(deviceId || "").trim())
    .filter(Boolean);
  if (!safeProjectName || !safeDeviceIds.length) {
    return 0;
  }

  const payload = await requestJson(buildAppApiPath("projects", safeProjectName, "device-substations"), {
    method: "PUT",
    body: {
      deviceIds: safeDeviceIds,
      substationId: String(substationId || "").trim() || null,
    },
  });
  setProjectSubstationConfig(
    safeProjectName,
    normalizeSubstationApiConfig(safeProjectName, payload)
  );
  syncLoadedDevicesForProject(safeProjectName);
  return safeDeviceIds.length;
}

async function assignSelectedDevicesToSubstation() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before mapping devices.", true);
    return;
  }
  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device before assigning a substation.", true);
    return;
  }

  const selectedSubstationId = String(substationAssignmentSelect?.value || "").trim();
  if (!selectedSubstationId) {
    setStatus("Choose a substation before assigning the selected devices.", true);
    return;
  }

  try {
    const mappedCount = await assignDevicesToProjectSubstation(
      state.configProjectName,
      [...state.configSelectedDeviceIds],
      selectedSubstationId
    );
    const selectedSubstation = getProjectSubstationById(state.configProjectName, selectedSubstationId);
    renderConfigPage();
    setStatus(`Mapped ${mappedCount} device(s) to "${selectedSubstation?.name || selectedSubstationId}".`);
  } catch (error) {
    setStatus(`Failed to map devices. ${error.message}`, true);
  }
}

async function clearSelectedDeviceSubstations() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before clearing mappings.", true);
    return;
  }
  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device before clearing its substation mapping.", true);
    return;
  }

  try {
    const clearedCount = await assignDevicesToProjectSubstation(
      state.configProjectName,
      [...state.configSelectedDeviceIds],
      ""
    );
    renderConfigPage();
    setStatus(`Cleared substation mapping for ${clearedCount} device(s).`);
  } catch (error) {
    setStatus(`Failed to clear substation mappings. ${error.message}`, true);
  }
}

async function assignSelectedDevicesToMainIntake() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before mapping main intakes.", true);
    return;
  }
  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device before assigning a main intake.", true);
    return;
  }

  const selectedMainIntakeId = String(mainIntakeAssignmentSelect?.value || "").trim();
  if (!selectedMainIntakeId) {
    setStatus("Choose a main intake before assigning the selected devices.", true);
    return;
  }

  try {
    const mappedCount = await saveMainIntakeMappingForProject(
      state.configProjectName,
      [...state.configSelectedDeviceIds],
      selectedMainIntakeId
    );
    const selectedMainIntake = getProjectMainIntakeById(state.configProjectName, selectedMainIntakeId);
    renderConfigPage();
    setStatus(
      `Mapped ${mappedCount} device(s) to main intake "${selectedMainIntake?.name || selectedMainIntakeId}".`
    );
  } catch (error) {
    setStatus(`Failed to map main intake devices. ${error.message}`, true);
  }
}

async function clearSelectedDeviceMainIntakes() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before clearing main intake mappings.", true);
    return;
  }
  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device before clearing its main intake mapping.", true);
    return;
  }

  try {
    const clearedCount = await saveMainIntakeMappingForProject(
      state.configProjectName,
      [...state.configSelectedDeviceIds],
      ""
    );
    renderConfigPage();
    setStatus(`Cleared main intake mapping for ${clearedCount} device(s).`);
  } catch (error) {
    setStatus(`Failed to clear main intake mappings. ${error.message}`, true);
  }
}

async function removeSubstationDefinition(projectName, substationId) {
  const safeProjectName = String(projectName || "").trim();
  const safeSubstationId = String(substationId || "").trim();
  if (!safeProjectName || !safeSubstationId) {
    return;
  }

  const removedSubstation = getProjectSubstationById(safeProjectName, safeSubstationId);
  try {
    const payload = await requestJson(
      buildAppApiPath("projects", safeProjectName, "substations", safeSubstationId),
      { method: "DELETE" }
    );
    setProjectSubstationConfig(
      safeProjectName,
      normalizeSubstationApiConfig(safeProjectName, payload)
    );
    syncLoadedDevicesForProject(safeProjectName);
    renderConfigPage();
    setStatus(`Substation "${removedSubstation?.name || safeSubstationId}" removed.`);
  } catch (error) {
    setStatus(`Failed to remove substation. ${error.message}`, true);
  }
}

async function removeMainIntakeDefinition(projectName, mainIntakeId) {
  const safeProjectName = String(projectName || "").trim();
  const safeMainIntakeId = String(mainIntakeId || "").trim();
  if (!safeProjectName || !safeMainIntakeId) {
    return;
  }

  const removedMainIntake = getProjectMainIntakeById(safeProjectName, safeMainIntakeId);
  try {
    const payload = await requestJson(
      buildAppApiPath("projects", safeProjectName, "main-intakes", safeMainIntakeId),
      { method: "DELETE" }
    );
    setProjectSubstationConfig(
      safeProjectName,
      normalizeSubstationApiConfig(safeProjectName, payload)
    );
    syncLoadedDevicesForProject(safeProjectName);
    renderConfigPage();
    setStatus(`Main intake "${removedMainIntake?.name || safeMainIntakeId}" removed.`);
  } catch (error) {
    setStatus(`Failed to remove main intake. ${error.message}`, true);
  }
}

function getDeviceSite(device) {
  const siteText = String(device?.site || "").trim();
  return siteText || "Unassigned";
}

function normalizeDeviceSite(deviceLike) {
  const candidates = [
    deviceLike?.substation,
    deviceLike?.substationName,
    deviceLike?.substation_name,
    deviceLike?.Substation,
    deviceLike?.["Substation Name"],
    deviceLike?.site,
    deviceLike?.siteName,
    deviceLike?.site_name,
    deviceLike?.Site,
    deviceLike?.location,
    deviceLike?.Location,
    deviceLike?.station,
    deviceLike?.stationName,
    deviceLike?.area,
    deviceLike?.region,
  ];
  const siteValue = candidates.find((value) => String(value || "").trim());
  return String(siteValue || "Unassigned").trim();
}

function getAvailableSites() {
  return Array.from(
    new Set((Array.isArray(state.devices) ? state.devices : []).map((device) => getDeviceSite(device)))
  ).sort((left, right) => left.localeCompare(right));
}

function compareTextValues(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getDeviceRecordById(deviceId, devices = state.devices) {
  const safeDeviceId = String(deviceId || "");
  const devicePool =
    Array.isArray(devices) && devices.length
      ? devices
      : [...(Array.isArray(state.devices) ? state.devices : []), ...(Array.isArray(state.configDevices) ? state.configDevices : [])];
  return devicePool.find(
    (device) => String(device?.devid || "") === safeDeviceId
  ) || null;
}

function getDeviceSubstation(deviceOrId, devices = state.devices) {
  if (deviceOrId && typeof deviceOrId === "object") {
    return getDeviceSite(deviceOrId);
  }
  return getDeviceSite(getDeviceRecordById(deviceOrId, devices));
}

function compareDeviceEntriesBySubstation(leftEntry, rightEntry) {
  return (
    compareTextValues(leftEntry?.substation, rightEntry?.substation) ||
    compareTextValues(leftEntry?.label, rightEntry?.label) ||
    compareTextValues(leftEntry?.deviceId, rightEntry?.deviceId)
  );
}

function compareNominalReportEntries(leftEntry, rightEntry, includeDate = true) {
  return (
    compareTextValues(leftEntry?.row?.Substation, rightEntry?.row?.Substation) ||
    compareTextValues(leftEntry?.row?.Device, rightEntry?.row?.Device) ||
    (includeDate ? compareTextValues(leftEntry?.row?.Date, rightEntry?.row?.Date) : 0)
  );
}

function getFilteredConfigDevices() {
  const searchFilter = String(state.configDeviceSearch || "").trim().toLowerCase();
  return (Array.isArray(state.configDevices) ? state.configDevices : []).filter((device) => {
    const deviceText =
      `${device?.name || ""} ${device?.devid || ""} ${device?.customLabel || ""} ${getDeviceSite(device)} ${getProjectAssignedMainIntake(state.configProjectName, device?.devid)}`.toLowerCase();
    return !searchFilter || deviceText.includes(searchFilter);
  });
}

function renderConfigDeviceList() {
  const filteredDevices = getFilteredConfigDevices();
  configDeviceCount.textContent = `${filteredDevices.length} filtered device(s)`;
  configDeviceList.innerHTML = "";

  if (!filteredDevices.length) {
    configDeviceList.innerHTML = '<div class="config-empty">No devices match the current filter.</div>';
    return;
  }

  filteredDevices.forEach((device) => {
    const row = document.createElement("div");
    row.className = "config-device-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.configSelectedDeviceIds.has(device.devid);
    checkbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        state.configSelectedDeviceIds.add(device.devid);
      } else {
        state.configSelectedDeviceIds.delete(device.devid);
      }
      renderConfigDeviceList();
      updateConfigMetricCurrentThresholds();
    });

    const meta = document.createElement("div");
    meta.className = "config-device-meta";
    meta.innerHTML = `
      <div class="config-device-name">${escapeHtml(device.name || device.devid || "")}</div>
      <div class="config-device-subtext">${escapeHtml(device.devid || "")}</div>
    `;

    const labelField = document.createElement("label");
    labelField.className = "config-device-mapping";
    labelField.innerHTML = `<span class="field-label">Report Label</span>`;

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "input-control";
    labelInput.placeholder = "Optional short label";
    labelInput.value = String(device?.customLabel || "").trim();
    labelInput.addEventListener("change", async (event) => {
      const nextLabel = String(event.target.value || "").trim();
      try {
        const savedLabel = await saveDeviceLabelForProject(state.configProjectName, device.devid, nextLabel);
        renderConfigPage();
        setStatus(
          savedLabel
            ? `Saved label "${savedLabel}" for ${device.name || device.devid}.`
            : `Cleared label for ${device.name || device.devid}.`
        );
      } catch (error) {
        setStatus(`Failed to save device label. ${error.message}`, true);
        renderConfigPage();
      }
    });
    labelField.appendChild(labelInput);

    const mappingField = document.createElement("label");
    mappingField.className = "config-device-mapping";
    mappingField.innerHTML = `<span class="field-label">Substation</span>`;

    const mappingSelect = document.createElement("select");
    mappingSelect.className = "input-control";
    mappingSelect.innerHTML = buildSubstationOptionMarkup(
      state.configProjectName,
      getProjectAssignedSubstationId(state.configProjectName, device.devid)
    );
    mappingSelect.addEventListener("change", async (event) => {
      const nextSubstationId = String(event.target.value || "").trim();
      try {
        await assignDevicesToProjectSubstation(state.configProjectName, [device.devid], nextSubstationId);
        const nextSubstation = getProjectSubstationById(state.configProjectName, nextSubstationId);
        renderConfigPage();
        setStatus(
          nextSubstationId
            ? `Mapped ${device.name || device.devid} to "${nextSubstation?.name || nextSubstationId}".`
            : `Cleared substation mapping for ${device.name || device.devid}.`
        );
      } catch (error) {
        setStatus(`Failed to update substation mapping. ${error.message}`, true);
        renderConfigPage();
      }
    });
    mappingField.appendChild(mappingSelect);

    const mainIntakeField = document.createElement("label");
    mainIntakeField.className = "config-device-mapping";
    mainIntakeField.innerHTML = `<span class="field-label">Main Intake</span>`;

    const mainIntakeSelect = document.createElement("select");
    mainIntakeSelect.className = "input-control";
    mainIntakeSelect.innerHTML = buildMainIntakeOptionMarkup(
      state.configProjectName,
      getProjectAssignedMainIntakeId(state.configProjectName, device.devid)
    );
    mainIntakeSelect.addEventListener("change", async (event) => {
      const nextMainIntakeId = String(event.target.value || "").trim();
      try {
        await saveMainIntakeMappingForProject(state.configProjectName, [device.devid], nextMainIntakeId);
        const nextMainIntake = getProjectMainIntakeById(state.configProjectName, nextMainIntakeId);
        renderConfigPage();
        setStatus(
          nextMainIntakeId
            ? `Mapped ${device.name || device.devid} to main intake "${nextMainIntake?.name || nextMainIntakeId}".`
            : `Cleared main intake mapping for ${device.name || device.devid}.`
        );
      } catch (error) {
        setStatus(`Failed to update main intake mapping. ${error.message}`, true);
        renderConfigPage();
      }
    });
    mainIntakeField.appendChild(mainIntakeSelect);

    row.appendChild(checkbox);
    row.appendChild(meta);
    row.appendChild(labelField);
    row.appendChild(mappingField);
    row.appendChild(mainIntakeField);
    configDeviceList.appendChild(row);
  });
}

function renderConfigFilteredControls() {
  renderConfigDeviceList();
  renderTransformerDeviceOptions();
  updateConfigMetricCurrentThresholds();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getConfigFormThresholds() {
  const thresholds = {};
  getConfigMetricDefinitions().forEach((definition) => {
    const minInput = document.getElementById(getConfigMetricInputId(definition.key, "min"));
    const maxInput = document.getElementById(getConfigMetricInputId(definition.key, "max"));
    thresholds[definition.key] = {
      min: Number.parseFloat(minInput?.value ?? ""),
      max: Number.parseFloat(maxInput?.value ?? ""),
    };
  });
  return thresholds;
}

function applyThresholdConfigToSelectedDevices() {
  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device on the Configuration page.", true);
    return;
  }

  const thresholds = getConfigFormThresholds();
  const hasInvalidRange = Object.values(thresholds).some((range) =>
    !Number.isFinite(range?.min) || !Number.isFinite(range?.max) || range.min > range.max
  );
  if (hasInvalidRange) {
    setStatus("Configuration values must have numeric min/max thresholds with min <= max.", true);
    return;
  }

  state.configSelectedDeviceIds.forEach((deviceId) => {
    state.thresholdOverridesByDevice[deviceId] = JSON.parse(JSON.stringify(thresholds));
  });
  saveThresholdOverrides();
  renderConfigDeviceList();
  updateConfigMetricCurrentThresholds();
  setStatus(`Applied configuration to ${state.configSelectedDeviceIds.size} device(s).`);
}

async function applyMonthlyThresholdsToSelectedDevices() {
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before applying month averages.", true);
    return;
  }

  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device on the Configuration page.", true);
    return;
  }

  const monthRange = getMonthRangeFromInput(monthlyThresholdMonth?.value);
  if (!monthRange) {
    setStatus("Select a valid source month before applying month averages.", true);
    return;
  }

  const selectedDeviceIds = [...state.configSelectedDeviceIds];
  setStatus(`Deriving thresholds from ${monthRange.label} daily aggregates...`);

  try {
    const readings = await fetchMonthlyThresholdReadings(
      state.configProjectName,
      selectedDeviceIds,
      monthRange
    );
    const summary = applyDerivedThresholdsFromMonthlyReadings(
      readings,
      selectedDeviceIds,
      monthRange
    );

    if (!summary.appliedDeviceCount) {
      setStatus(
        `No usable monthly readings were found for the selected devices in ${monthRange.label}.`,
        true
      );
      return;
    }

    saveThresholdOverrides();
    renderConfigDeviceList();
    updateConfigMetricCurrentThresholds();
    setStatus(
      `Applied ${summary.appliedMetricCount} derived thresholds to ` +
      `${summary.appliedDeviceCount} device(s) using ${monthRange.label}.`
    );
  } catch (error) {
    const urlHint = state.latestApiUrls[0] ? ` | URL: ${state.latestApiUrls[0]}` : "";
    setStatus(`Monthly threshold update failed. ${error.message}${urlHint}`, true);
  }
}

async function fetchMonthlyThresholdReadings(projectName, deviceIds, monthRange) {
  const metricDefinitions = getMonthlyThresholdMetricDefinitions();
  if (!metricDefinitions.length) {
    return [];
  }

  const filters = {
    type: "histvalues",
    range: "custom",
    startDate: monthRange?.startDate,
    endDate: monthRange?.endDate,
  };

  if (isDemoProjectName(projectName)) {
    return buildDemoNominalReadings(deviceIds, filters);
  }

  state.latestApiUrls = [];
  const requests = [];

  deviceIds.forEach((deviceId, deviceIndex) => {
    metricDefinitions.forEach((definition, metricIndex) => {
      requests.push(
        (async () => {
          const requestUrl = buildHistoryUrl(projectName, deviceId, filters, {
            metric: definition.queryValue || definition.key,
            phase: null,
          });
          state.latestApiUrls.push(requestUrl);
          if (deviceIndex === 0 && metricIndex === 0) {
            setStatus(`Calling API: ${requestUrl}`);
          }
          const xmlText = await getText(requestUrl, "application/xml");
          return normalizeNominalValueXml(xmlText, deviceId, definition.key, "");
        })()
      );
    });
  });

  const settled = await Promise.allSettled(requests);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  if (!fulfilled.length) {
    const builtUrls = state.latestApiUrls.filter(Boolean);
    if (builtUrls.length) {
      throw new Error(`All monthly threshold requests failed. Built URL(s): ${builtUrls.join(" | ")}`);
    }
    throw new Error("All monthly threshold requests failed.");
  }

  return fulfilled.flatMap((item) => item.value);
}

function applyDerivedThresholdsFromMonthlyReadings(readings, deviceIds, monthRange) {
  const safeReadings = Array.isArray(readings) ? readings : [];
  const metricDefinitions = getMonthlyThresholdMetricDefinitions();
  const readingsByDevice = new Map();

  safeReadings.forEach((reading) => {
    const deviceId = String(reading?.deviceId || "");
    if (!deviceId) {
      return;
    }
    if (!readingsByDevice.has(deviceId)) {
      readingsByDevice.set(deviceId, []);
    }
    readingsByDevice.get(deviceId).push(reading);
  });

  let appliedDeviceCount = 0;
  let appliedMetricCount = 0;

  deviceIds.forEach((deviceId) => {
    const deviceReadings = readingsByDevice.get(String(deviceId)) || [];
    if (!deviceReadings.length) {
      return;
    }

    const nextOverride = {
      ...(state.thresholdOverridesByDevice?.[String(deviceId || "")] || {}),
    };
    let deviceAppliedMetricCount = 0;

    metricDefinitions.forEach((definition) => {
      const summary = summarizeMonthlyMetricReadings(deviceReadings, definition.key);
      if (!summary) {
        return;
      }

      nextOverride[definition.key] = {
        min: summary.avgMin,
        max: summary.avgMax,
        avg: summary.avgAvg,
        sourceMonth: monthRange?.monthValue || "",
        sourceLabel: monthRange?.label || "",
        sampleCount: summary.sampleCount,
      };
      deviceAppliedMetricCount += 1;
    });

    if (!deviceAppliedMetricCount) {
      return;
    }

    state.thresholdOverridesByDevice[String(deviceId)] = nextOverride;
    appliedDeviceCount += 1;
    appliedMetricCount += deviceAppliedMetricCount;
  });

  return { appliedDeviceCount, appliedMetricCount };
}

function summarizeMonthlyMetricReadings(readings, metricKey) {
  const avgValues = [];
  const minValues = [];
  const maxValues = [];

  (Array.isArray(readings) ? readings : []).forEach((reading) => {
    const metrics = reading?.metrics || {};
    const avgValue = parseNumericValue(metrics[metricKey]);
    const minValue = parseNumericValue(metrics[`${metricKey}_Min`]);
    const maxValue = parseNumericValue(metrics[`${metricKey}_Max`]);

    if (Number.isFinite(avgValue)) {
      avgValues.push(avgValue);
    }
    if (Number.isFinite(minValue)) {
      minValues.push(minValue);
    }
    if (Number.isFinite(maxValue)) {
      maxValues.push(maxValue);
    }
  });

  const avgAvg = calculateNumericAverage(avgValues);
  const avgMin = calculateNumericAverage(minValues);
  const avgMax = calculateNumericAverage(maxValues);

  if (!Number.isFinite(avgAvg) || !Number.isFinite(avgMin) || !Number.isFinite(avgMax) || avgMin > avgMax) {
    return null;
  }

  return {
    avgAvg: Number(avgAvg.toFixed(2)),
    avgMin: Number(avgMin.toFixed(2)),
    avgMax: Number(avgMax.toFixed(2)),
    sampleCount: Math.min(avgValues.length, minValues.length, maxValues.length),
  };
}

function calculateNumericAverage(values) {
  const numericValues = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (!numericValues.length) {
    return Number.NaN;
  }
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function clearThresholdConfigForSelectedDevices() {
  if (!state.configSelectedDeviceIds.size) {
    setStatus("Select at least one device on the Configuration page.", true);
    return;
  }
  state.configSelectedDeviceIds.forEach((deviceId) => {
    delete state.thresholdOverridesByDevice[deviceId];
  });
  saveThresholdOverrides();
  renderConfigDeviceList();
  updateConfigMetricCurrentThresholds();
  setStatus(`Cleared custom configuration for ${state.configSelectedDeviceIds.size} device(s).`);
}

function hasDeviceThresholdOverride(deviceId) {
  const override = state.thresholdOverridesByDevice?.[String(deviceId || "")];
  return Boolean(override && typeof override === "object" && Object.keys(override).length);
}

function renderTransformerMappingControls() {
  renderConfigFilteredControls();
  renderTransformerMappingList();
}

function renderTransformerDeviceOptions() {
  const selectMarkup = '<option value="">Select device</option>';
  const previousHtValue = transformerHtDeviceSelect.value;
  const previousLvValue = transformerLvDeviceSelect.value;
  const filteredDevices = getFilteredConfigDevices();
  transformerHtDeviceSelect.innerHTML = selectMarkup;
  transformerLvDeviceSelect.innerHTML = selectMarkup;

  filteredDevices.forEach((device) => {
    const displayName = getPreferredDeviceLabel(device, { projectName: state.configProjectName });
    const labelText = `${displayName} (${device.devid}) | ${getDeviceSite(device)}`;
    const htOption = document.createElement("option");
    htOption.value = device.devid;
    htOption.textContent = labelText;
    transformerHtDeviceSelect.appendChild(htOption);

    const lvOption = document.createElement("option");
    lvOption.value = device.devid;
    lvOption.textContent = labelText;
    transformerLvDeviceSelect.appendChild(lvOption);
  });

  if (filteredDevices.some((device) => device.devid === previousHtValue)) {
    transformerHtDeviceSelect.value = previousHtValue;
  }
  if (filteredDevices.some((device) => device.devid === previousLvValue)) {
    transformerLvDeviceSelect.value = previousLvValue;
  }
}

function renderTransformerMappingList() {
  transformerMappingList.innerHTML = "";
  const mappings = getProjectTransformerMappings(state.configProjectName);
  if (!mappings.length) {
    transformerMappingList.innerHTML = '<div class="config-empty">No transformer mappings configured for this project.</div>';
    return;
  }

  mappings.forEach((mapping) => {
    const row = document.createElement("div");
    row.className = "mapping-row";

    const text = document.createElement("div");
    const htLabel = getDeviceDisplayName(mapping.htDeviceId);
    const lvLabel = getDeviceDisplayName(mapping.lvDeviceId);
    text.innerHTML = `
      <div class="config-device-name">${escapeHtml(mapping.label || `${htLabel} -> ${lvLabel}`)}</div>
      <div class="config-device-subtext">HT: ${escapeHtml(htLabel)} | LV: ${escapeHtml(lvLabel)}</div>
    `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      state.transformerMappings = state.transformerMappings.filter(
        (item) =>
          !(
            item.projectName === mapping.projectName &&
            item.htDeviceId === mapping.htDeviceId &&
            item.lvDeviceId === mapping.lvDeviceId
          )
      );
      saveTransformerMappings();
      renderTransformerMappingList();
    });

    row.appendChild(text);
    row.appendChild(removeButton);
    transformerMappingList.appendChild(row);
  });
}

function saveTransformerMapping() {
  const htDeviceId = String(transformerHtDeviceSelect.value || "").trim();
  const lvDeviceId = String(transformerLvDeviceSelect.value || "").trim();
  if (!state.configProjectName) {
    setStatus("Select a project on the Configuration page before saving a transformer mapping.", true);
    return;
  }
  if (!htDeviceId || !lvDeviceId) {
    setStatus("Select both HT and LV devices for the transformer mapping.", true);
    return;
  }
  if (htDeviceId === lvDeviceId) {
    setStatus("HT and LV devices must be different.", true);
    return;
  }

  const nextMapping = {
    projectName: state.configProjectName,
    htDeviceId,
    lvDeviceId,
    label: `${getDeviceDisplayName(htDeviceId)} -> ${getDeviceDisplayName(lvDeviceId)}`,
  };
  state.transformerMappings = (state.transformerMappings || []).filter(
    (mapping) =>
      !(
        mapping.projectName === state.configProjectName &&
        (mapping.htDeviceId === htDeviceId ||
          mapping.lvDeviceId === lvDeviceId ||
          (mapping.htDeviceId === lvDeviceId && mapping.lvDeviceId === htDeviceId))
      )
  );
  state.transformerMappings.push(nextMapping);
  saveTransformerMappings();
  renderTransformerMappingList();
  setStatus("Transformer mapping saved.");
}

function getProjectTransformerMappings(projectName = state.projectName) {
  return (Array.isArray(state.transformerMappings) ? state.transformerMappings : []).filter(
    (mapping) => String(mapping?.projectName || "") === String(projectName || "")
  );
}

function getTransformerMappingForDevice(deviceId, projectName = state.projectName) {
  const safeDeviceId = String(deviceId || "");
  return getProjectTransformerMappings(projectName).find(
    (mapping) => mapping.htDeviceId === safeDeviceId || mapping.lvDeviceId === safeDeviceId
  ) || null;
}

function toggleCustomDateRange(show) {
  customDateRange.classList.toggle("hidden", !show);
}

function logApi(message, extra = null) {
  if (!API_CONFIG.debugApi) {
    return;
  }
  if (extra === null) {
    console.log(`[API] ${message}`);
    return;
  }
  console.log(`[API] ${message}`, extra);
}

function buildApiPath(...segments) {
  const cleaned = segments
    .filter((segment) => segment !== null && segment !== undefined && segment !== "")
    .map((segment) => encodeURIComponent(String(segment)));
  return `/${encodeURIComponent(API_CONFIG.apiVersion)}/${cleaned.join("/")}`;
}

function buildUrl(path) {
  const base = API_CONFIG.baseUrl.replace(/\/$/, "");
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${safePath}`;
}

function buildAppApiPath(...segments) {
  const cleaned = segments
    .filter((segment) => segment !== null && segment !== undefined && segment !== "")
    .map((segment) => encodeURIComponent(String(segment)));
  return `/app-api/${cleaned.join("/")}`;
}

async function requestJson(url, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  };

  if (options.body !== undefined) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, requestOptions);
  const bodyText = await response.text();
  if (!response.ok) {
    const details = bodyText.trim();
    throw new Error(
      details
        ? `Request failed (${response.status}): ${details}`
        : `Request failed (${response.status})`
    );
  }

  if (!bodyText.trim()) {
    return [];
  }

  try {
    return JSON.parse(bodyText);
  } catch (_error) {
    throw new Error(`Response is not valid JSON (status ${response.status}).`);
  }
}

async function getJson(url) {
  logApi(`GET ${url}`);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  logApi(`RESPONSE ${response.status} ${url}`);

  if (response.status === 204) {
    return [];
  }

  const bodyText = await response.text();
  if (!response.ok) {
    const details = bodyText.trim();
    throw new Error(
      details
        ? `API request failed (${response.status}): ${details}`
        : `API request failed (${response.status})`
    );
  }

  if (!bodyText.trim()) {
    return [];
  }

  try {
    return JSON.parse(bodyText);
  } catch (_error) {
    throw new Error(`API response is not valid JSON (status ${response.status}).`);
  }
}

async function getText(url, acceptType = "application/xml") {
  logApi(`GET ${url}`);
  const response = await fetch(url, {
    headers: { Accept: acceptType },
  });
  logApi(`RESPONSE ${response.status} ${url}`);

  if (response.status === 204) {
    return "";
  }

  const bodyText = await response.text();
  if (!response.ok) {
    const details = bodyText.trim();
    throw new Error(
      details
        ? `API request failed (${response.status}): ${details}`
        : `API request failed (${response.status})`
    );
  }

  return bodyText;
}

async function loadProjects() {
  setStatus("Loading projects...");

  try {
    const url = buildUrl(buildApiPath("projects"));
    const payload = await getJson(url);
    state.projects = ensureDemoProject(normalizeProjects(payload));
    if (!state.projects.length) {
      throw new Error("Projects API returned no usable records.");
    }

    renderProjectOptions();
    const exists = state.projects.some((project) => project.pname === state.projectName);
    if (!state.projectName || !exists) {
      state.projectName = state.projects[0].pname;
      projectSelect.value = state.projectName;
    }
    const configExists = state.projects.some((project) => project.pname === state.configProjectName);
    if (!state.configProjectName || !configExists) {
      state.configProjectName = state.projectName;
      configProjectSelect.value = state.configProjectName;
    }

    await loadDevices();
    await loadConfigDevices();
    setStatus(`Projects loaded. Selected project: ${getProjectDisplayName(state.projectName)}`);
  } catch (error) {
    state.projects = ensureDemoProject([]);
    state.devices = [];
    state.selectedDeviceIds.clear();
    renderProjectOptions();

    state.projectName = getDemoProjectRecord().pname;
    state.configProjectName = state.projectName;
    projectSelect.value = state.projectName;
    configProjectSelect.value = state.configProjectName;
    await loadDevices();
    await loadConfigDevices();
    renderDeviceTables([]);
    setStatus(`Projects API unavailable (${error.message}). Loaded Demo Project.`);
  }
}

function normalizeProjects(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.project || payload?.projects || payload?.data || payload?.items || [];

  return list
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return { pname: String(item), name: String(item) };
      }
      const pname =
        item?.pname ??
        item?.name ??
        item?.projectName ??
        item?.projectId ??
        item?.id ??
        item?.value;
      const name = item?.name ?? item?.projectName ?? item?.label ?? item?.description ?? pname;
      return pname ? { pname: String(pname), name: String(name) } : null;
    })
    .filter(Boolean);
}

function getDemoProjectRecord() {
  return {
    pname: DEMO_DATA_CONFIG.projectId,
    name: DEMO_DATA_CONFIG.projectName,
  };
}

function ensureDemoProject(projects) {
  const safeProjects = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (!safeProjects.some((project) => project?.pname === DEMO_DATA_CONFIG.projectId)) {
    safeProjects.push(getDemoProjectRecord());
  }
  return safeProjects;
}

function isDemoProjectName(projectName) {
  return String(projectName || "") === DEMO_DATA_CONFIG.projectId;
}

function normalizeVoltageClass(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "33kv" || text === "33 kv" || text === "33") {
    return "33kV";
  }
  if (text === "11kv" || text === "11 kv" || text === "11") {
    return "11kV";
  }
  if (text === "400v" || text === "400 v" || text === "400") {
    return "400V";
  }
  return DEFAULT_VOLTAGE_CLASS;
}

function inferVoltageClassFromText(value) {
  const text = String(value || "").toLowerCase();
  if (!text) {
    return "";
  }
  if (/(^|[^0-9])33\s*k?v([^0-9]|$)/i.test(text)) {
    return "33kV";
  }
  if (/(^|[^0-9])11\s*k?v([^0-9]|$)/i.test(text)) {
    return "11kV";
  }
  if (/(^|[^0-9])400\s*v([^0-9]|$)/i.test(text)) {
    return "400V";
  }
  return "";
}

function inferVoltageClassForDevice(deviceLike) {
  if (!deviceLike || typeof deviceLike !== "object") {
    return DEFAULT_VOLTAGE_CLASS;
  }
  const explicitCandidates = [
    deviceLike.voltageClass,
    deviceLike.voltage_level,
    deviceLike.voltageLevel,
    deviceLike.vclass,
    deviceLike.vClass,
  ];
  const hasExplicitCandidate = explicitCandidates.some((value) => String(value || "").trim());
  const explicit = normalizeVoltageClass(
    explicitCandidates.find((value) => String(value || "").trim())
  );
  if (hasExplicitCandidate) {
    return explicit;
  }

  const candidates = [
    deviceLike.name,
    deviceLike.deviceName,
    deviceLike.label,
    deviceLike.description,
    deviceLike.devid,
    deviceLike.deviceId,
    deviceLike.deviceID,
    deviceLike.id,
  ];
  for (const candidate of candidates) {
    const inferred = inferVoltageClassFromText(candidate);
    if (inferred) {
      return inferred;
    }
  }
  return DEFAULT_VOLTAGE_CLASS;
}

function getDeviceVoltageClass(deviceId) {
  const idText = String(deviceId || "");
  const match = state.devices.find((device) => String(device?.devid || "") === idText);
  return normalizeVoltageClass(match?.voltageClass);
}

function getVoltageToleranceForClass(voltageClass) {
  const normalizedClass = normalizeVoltageClass(voltageClass);
  return VOLTAGE_CLASS_TOLERANCES[normalizedClass] || VOLTAGE_CLASS_TOLERANCES[DEFAULT_VOLTAGE_CLASS];
}

function getVoltageClassLegendRows() {
  return VOLTAGE_CLASS_VALUES.map((voltageClass) => ({
    metric: `Voltage (${voltageClass} class)`,
    requirement: "All phase Min/Max values must stay within tolerance.",
    tolerance: getToleranceRangeForVoltageClass(voltageClass, { includeUnits: true }),
  }));
}

function buildDemoDevices() {
  return Array.from({ length: DEMO_DATA_CONFIG.deviceCount }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const voltageClass = VOLTAGE_CLASS_VALUES[index % VOLTAGE_CLASS_VALUES.length];
    const siteNumber = Math.floor(index / 10) + 1;
    return {
      devid: `${DEMO_DATA_CONFIG.devicePrefix}-${number}`,
      name: `${DEMO_DATA_CONFIG.deviceNamePrefix} ${number}`,
      voltageClass,
      site: `Site ${siteNumber}`,
    };
  });
}

function cloneDeviceList(devices) {
  return (Array.isArray(devices) ? devices : []).map((device) => ({ ...device }));
}

async function fetchProjectDevices(projectName) {
  if (!projectName) {
    return [];
  }
  if (isDemoProjectName(projectName)) {
    return buildDemoDevices();
  }
  const url = buildUrl(buildApiPath("projects", projectName, "devices"));
  const payload = await getJson(url);
  return normalizeDevices(payload);
}

function getDemoDeviceNumber(deviceId) {
  const match = String(deviceId || "").match(/(\d+)\s*$/);
  if (!match) {
    return Number.NaN;
  }
  return Number.parseInt(match[1], 10);
}

function isDemoDeviceMostlyCompliant(deviceId) {
  const deviceNumber = getDemoDeviceNumber(deviceId);
  if (!Number.isFinite(deviceNumber)) {
    return false;
  }
  return deviceNumber <= 5;
}

function renderProjectOptions() {
  projectSelect.innerHTML = "";
  configProjectSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select project";
  projectSelect.appendChild(placeholder);
  configProjectSelect.appendChild(placeholder.cloneNode(true));

  state.projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.pname;
    option.textContent = project.name;
    projectSelect.appendChild(option);

    const configOption = document.createElement("option");
    configOption.value = project.pname;
    configOption.textContent = project.name;
    configProjectSelect.appendChild(configOption);
  });

  projectSelect.value = state.projectName || "";
  configProjectSelect.value = state.configProjectName || "";
}

async function loadDevices() {
  state.projectName = projectSelect.value;
  state.selectedDeviceIds.clear();
  updateDeviceSummary();

  if (!state.projectName) {
    state.devices = [];
    renderDeviceOptions();
    setStatus("Select a project to load devices.", true);
    return;
  }

  setStatus("Loading devices...");
  try {
    let mappingWarning = "";
    try {
      await fetchProjectSubstationConfig(state.projectName, { force: true });
    } catch (error) {
      delete state.substationMappingsByProject[state.projectName];
      mappingWarning = ` | App metadata DB unavailable: ${error.message}`;
    }
    const devices = await fetchProjectDevices(state.projectName);
    state.devices = applyProjectSubstationMappings(devices, state.projectName);
    renderDeviceOptions();
    const sourceLabel = isDemoProjectName(state.projectName) ? "demo devices" : "devices";
    setStatus(`Loaded ${sourceLabel}: ${state.devices.length}${mappingWarning}`);
  } catch (error) {
    state.devices = [];
    renderDeviceOptions();
    setStatus(`Devices request failed for "${state.projectName}". ${error.message}`, true);
  }
}

async function loadConfigDevices() {
  state.configProjectName = configProjectSelect.value;
  state.configSelectedDeviceIds.clear();

  if (!state.configProjectName) {
    state.configDevices = [];
    renderConfigPage();
    return;
  }

  try {
    let mappingWarning = "";
    try {
      await fetchProjectSubstationConfig(state.configProjectName, { force: true });
    } catch (error) {
      delete state.substationMappingsByProject[state.configProjectName];
      mappingWarning = ` App metadata DB unavailable: ${error.message}`;
    }
    const devices = await fetchProjectDevices(state.configProjectName);
    state.configDevices = applyProjectSubstationMappings(devices, state.configProjectName);
    renderConfigPage();
    if (mappingWarning) {
      setStatus(mappingWarning.trim(), true);
    }
  } catch (error) {
    state.configDevices = [];
    renderConfigPage();
    setStatus(`Configuration devices request failed for "${state.configProjectName}". ${error.message}`, true);
  }
}

function normalizeDevices(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.device || payload?.devices || payload?.data || payload?.items || [];

  return list
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        const text = String(item);
        return {
          devid: text,
          name: text,
          voltageClass: normalizeVoltageClass(inferVoltageClassFromText(text)),
          site: "Unassigned",
        };
      }
      const devid =
        item?.devid ??
        item?.deviceId ??
        item?.deviceID ??
        item?.id ??
        item?.value;
      const name = item?.name ?? item?.deviceName ?? item?.label ?? item?.description ?? devid;
      return devid
        ? {
            devid: String(devid),
            name: String(name),
            voltageClass: inferVoltageClassForDevice(item),
            site: "Unassigned",
          }
        : null;
    })
    .filter(Boolean);
}

function renderDeviceOptions() {
  deviceOptions.innerHTML = "";
  updateDeviceSummary();

  if (state.devices.length) {
    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "device-option select-all-option";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "selectAllDevicesCheckbox";
    selectAllCheckbox.setAttribute("aria-label", "Select all devices");
    selectAllCheckbox.addEventListener("change", (event) => {
      setAllDevicesSelected(Boolean(event.target.checked));
    });

    const selectAllText = document.createElement("span");
    selectAllText.textContent = "Select all";

    selectAllLabel.appendChild(selectAllCheckbox);
    selectAllLabel.appendChild(selectAllText);
    deviceOptions.appendChild(selectAllLabel);
  }

  state.devices.forEach((device) => {
    const label = document.createElement("label");
    label.className = "device-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = device.devid;
    checkbox.dataset.deviceCheckbox = "true";
    checkbox.setAttribute("aria-label", device.name);
    checkbox.checked = state.selectedDeviceIds.has(device.devid);
    checkbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selectedDeviceIds.add(device.devid);
      } else {
        state.selectedDeviceIds.delete(device.devid);
      }
      updateDeviceSummary();
      updateSelectAllDeviceCheckboxState();
    });

    const text = document.createElement("span");
    text.textContent = `${getPreferredDeviceLabel(device, { projectName: state.projectName })} (${device.devid}) | ${getDeviceSite(device)}`;

    label.appendChild(checkbox);
    label.appendChild(text);
    deviceOptions.appendChild(label);
  });

  updateSelectAllDeviceCheckboxState();
}

function updateDeviceSummary() {
  const count = state.selectedDeviceIds.size;
  deviceDropdownButton.textContent = count ? `${count} device(s) selected` : "Select device(s)";

  selectedDevices.innerHTML = "";
  state.devices
    .filter((device) => state.selectedDeviceIds.has(device.devid))
    .forEach((device) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = getPreferredDeviceLabel(device, { projectName: state.projectName });
      selectedDevices.appendChild(chip);
    });
}

function setAllDevicesSelected(shouldSelect) {
  if (shouldSelect) {
    state.devices.forEach((device) => state.selectedDeviceIds.add(device.devid));
  } else {
    state.selectedDeviceIds.clear();
  }

  deviceOptions.querySelectorAll('input[data-device-checkbox="true"]').forEach((checkbox) => {
    checkbox.checked = shouldSelect;
  });
  updateDeviceSummary();
  updateSelectAllDeviceCheckboxState();
}

function updateSelectAllDeviceCheckboxState() {
  const selectAllCheckbox = document.getElementById("selectAllDevicesCheckbox");
  if (!selectAllCheckbox) {
    return;
  }

  const total = state.devices.length;
  const selected = state.selectedDeviceIds.size;
  selectAllCheckbox.checked = total > 0 && selected === total;
  selectAllCheckbox.indeterminate = selected > 0 && selected < total;
}

async function onGenerateReport() {
  state.projectName = projectSelect.value;
  if (!state.projectName) {
    setStatus("Select a project before generating a report.", true);
    return;
  }

  if (!state.selectedDeviceIds.size) {
    setStatus("Select at least one device before generating a report.", true);
    return;
  }

  if (state.selectedTimeRange === "custom") {
    if (!customStartDate.value || !customEndDate.value) {
      setStatus("Select both start and end date for custom range.", true);
      return;
    }
    if (customStartDate.value > customEndDate.value) {
      setStatus("Invalid custom range. End date must be after start date.", true);
      return;
    }
  }

  setStatus("Generating report...");
  try {
    const filters = {
      type: state.selectedType,
      range: state.selectedTimeRange,
      startDate: customStartDate.value,
      endDate: customEndDate.value,
    };

    const readings = await fetchReportRows(state.projectName, [...state.selectedDeviceIds], filters);
    const table = buildDeviceMetricsTable(readings, [...state.selectedDeviceIds]);
    renderDeviceTables(table.deviceTables, table.columns, table.columnGroups);
    renderMainIntakeReportTable();

    const urlHint = state.latestApiUrls[0] ? ` | URL: ${state.latestApiUrls[0]}` : "";
    setStatus(
      `Report generated. Devices: ${table.deviceCount} | Readings: ${table.readingCount}${urlHint}`
    );
  } catch (error) {
    renderDeviceTables([]);
    renderMainIntakeReportTable([]);
    const urlHint = state.latestApiUrls[0] ? ` | URL: ${state.latestApiUrls[0]}` : "";
    setStatus(`Report request failed. ${error.message}${urlHint}`, true);
  }
}

async function fetchReportRows(projectName, deviceIds, filters) {
  logApi("Generate report filters", { projectName, deviceIds, filters });
  state.latestApiUrls = [];

  if (isDemoProjectName(projectName)) {
    return buildDemoReadings(deviceIds, filters);
  }

  const requests = [];
  if (filters.type === "hist-events") {
    deviceIds.forEach((deviceId, index) => {
      requests.push(
        (async () => {
          const requestUrl = buildHistoryUrl(projectName, deviceId, filters);
          state.latestApiUrls.push(requestUrl);
          if (index === 0) {
            setStatus(`Calling API: ${requestUrl}`);
          }
          const payload = await getJson(requestUrl);
          return normalizeHistoricalEvents(payload, deviceId);
        })()
      );
    });
  } else {
    deviceIds.forEach((deviceId, deviceIndex) => {
      API_CONFIG.nominalValueMetrics.forEach((metric) => {
        API_CONFIG.nominalValuePhases.forEach((phase) => {
          requests.push(
            (async () => {
              const requestUrl = buildHistoryUrl(projectName, deviceId, filters, { metric, phase });
              state.latestApiUrls.push(requestUrl);
              if (deviceIndex === 0 && metric === API_CONFIG.nominalValueMetrics[0] && phase === API_CONFIG.nominalValuePhases[0]) {
                setStatus(`Calling API: ${requestUrl}`);
              }
              const xmlText = await getText(requestUrl, "application/xml");
              return normalizeNominalValueXml(xmlText, deviceId, metric, phase);
            })()
          );
        });
      });
      EXTRA_NOMINAL_METRIC_DEFINITIONS
        .filter((definition) => String(definition?.queryValue || "").trim())
        .forEach((definition) => {
        requests.push(
          (async () => {
            const requestUrl = buildHistoryUrl(projectName, deviceId, filters, {
              metric: definition.queryValue || definition.key,
              phase: null,
            });
            state.latestApiUrls.push(requestUrl);
            const xmlText = await getText(requestUrl, "application/xml");
            return normalizeNominalValueXml(xmlText, deviceId, definition.key, "");
          })()
        );
      });
    });
  }

  const settled = await Promise.allSettled(requests);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  if (!fulfilled.length) {
    const builtUrls = state.latestApiUrls.filter(Boolean);
    if (builtUrls.length) {
      console.error("All device history requests failed. Built URL(s):\n" + builtUrls.join("\n"));
      throw new Error(`All device history requests failed. Built URL(s): ${builtUrls.join(" | ")}`);
    }
    throw new Error("All device history requests failed.");
  }

  return fulfilled.flatMap((item) => item.value);
}

function buildDemoReadings(deviceIds, filters) {
  if (filters.type === "hist-events") {
    return buildDemoEventReadings(deviceIds, filters);
  }
  return buildDemoNominalReadings(deviceIds, filters);
}

function buildDemoNominalReadings(deviceIds, filters) {
  const timestamps = buildDemoTimestamps(filters);
  const readings = [];
  const deviceVoltageClassById = new Map(
    (Array.isArray(state.devices) ? state.devices : []).map((device) => [
      String(device?.devid || ""),
      normalizeVoltageClass(device?.voltageClass),
    ])
  );

  deviceIds.forEach((deviceId) => {
    const deviceSeed = hashText(deviceId);
    const mostlyCompliantDevice = isDemoDeviceMostlyCompliant(deviceId);
    const deviceVoltageClass = normalizeVoltageClass(
      deviceVoltageClassById.get(String(deviceId))
    );
    const voltageTolerance = getVoltageToleranceForClass(deviceVoltageClass);
    const voltageRange = Math.max(1, voltageTolerance.max - voltageTolerance.min);
    timestamps.forEach((capturedAt, timeIndex) => {
      API_CONFIG.nominalValueMetrics.forEach((metricName, metricIndex) => {
        API_CONFIG.nominalValuePhases.forEach((phaseName, phaseIndex) => {
          const targetColumn = getNominalColumnKey(metricName, phaseName);
          const unitColumn = getNominalUnitColumnKey(metricName);
          if (!targetColumn) {
            return;
          }

          const seed = (deviceSeed + (timeIndex + 1) * 97 + (metricIndex + 1) * 31 + (phaseIndex + 1) * 17) % 1000;
          const isVoltage = targetColumn.startsWith("V");
          const step = (seed % 100) / 100;
          const avg = isVoltage
            ? voltageTolerance.min + voltageRange * (0.42 + step * 0.16)
            : 4.8 + step * 0.35;
          const band = isVoltage
            ? voltageRange * (0.015 + ((seed % 3) / 200))
            : 0.08 + (seed % 4) / 100;
          let min = avg - band;
          let max = avg + band;

          readings.push({
            deviceId,
            capturedAt,
            metrics: {
              [targetColumn]: avg.toFixed(2),
              [`${targetColumn}_Min`]: min.toFixed(2),
              [`${targetColumn}_Max`]: max.toFixed(2),
              ...(unitColumn ? { [unitColumn]: isVoltage ? "V" : "A" } : {}),
            },
          });
        });
      });

      const shouldInjectForcedNonCompliant =
        !mostlyCompliantDevice;
      const extraMetrics = buildDemoExtraNominalMetrics(
        deviceSeed,
        timeIndex,
        {
          mostlyCompliantDevice,
          forceNonCompliant: shouldInjectForcedNonCompliant,
        }
      );
      readings.push({
        deviceId,
        capturedAt,
        metrics: extraMetrics,
      });
    });
  });

  return readings;
}

function buildDemoExtraNominalMetrics(
  deviceSeed,
  timeIndex,
  { mostlyCompliantDevice = false, forceNonCompliant = false } = {}
) {
  const baseSeed = (deviceSeed + (timeIndex + 1) * 113) % 1000;
  const failingMetricPairs = [
    ["TOP_OIL_TEMPERATURE", "WINDING_TEMPERATURE"],
    ["TOP_OIL_TEMPERATURE", "LOAD_PERCENT"],
    ["TOP_OIL_TEMPERATURE", "V_UNBALANCE"],
    ["TOP_OIL_TEMPERATURE", "A_UNBALANCE"],
    ["TOP_OIL_TEMPERATURE", "POWER_FACTOR"],
    ["WINDING_TEMPERATURE", "LOAD_PERCENT"],
    ["WINDING_TEMPERATURE", "V_UNBALANCE"],
    ["WINDING_TEMPERATURE", "A_UNBALANCE"],
    ["WINDING_TEMPERATURE", "POWER_FACTOR"],
    ["LOAD_PERCENT", "V_UNBALANCE"],
    ["LOAD_PERCENT", "A_UNBALANCE"],
    ["LOAD_PERCENT", "POWER_FACTOR"],
    ["V_UNBALANCE", "A_UNBALANCE"],
    ["V_UNBALANCE", "POWER_FACTOR"],
    ["A_UNBALANCE", "POWER_FACTOR"],
  ];
  const failedMetrics = forceNonCompliant
    ? new Set(failingMetricPairs[deviceSeed % failingMetricPairs.length])
    : new Set();

  const topOilRaw = failedMetrics.has("TOP_OIL_TEMPERATURE")
    ? 96 + ((baseSeed % 20) / 10)
    : 58 + ((baseSeed % 160) / 10);
  const windingRaw = failedMetrics.has("WINDING_TEMPERATURE")
    ? 124 + ((baseSeed % 20) / 10)
    : 72 + ((baseSeed % 180) / 10);
  const loadPercentRaw = failedMetrics.has("LOAD_PERCENT")
    ? 104 + ((baseSeed % 30) / 10)
    : 48 + ((baseSeed % 340) / 10);
  const vUnbalanceRaw = failedMetrics.has("V_UNBALANCE")
    ? 2.35 + ((baseSeed % 20) / 100)
    : 0.45 + ((baseSeed % 95) / 100);
  const aUnbalanceRaw = failedMetrics.has("A_UNBALANCE")
    ? 5.40 + ((baseSeed % 40) / 100)
    : 1.20 + ((baseSeed % 250) / 100);
  const powerFactorRaw = failedMetrics.has("POWER_FACTOR")
    ? 0.84 + ((baseSeed % 20) / 1000)
    : 0.95 + ((baseSeed % 35) / 1000);

  const topOilBand = failedMetrics.has("TOP_OIL_TEMPERATURE") ? 4.8 : 1.6;
  const windingBand = failedMetrics.has("WINDING_TEMPERATURE") ? 6.2 : 2.1;
  const loadPercentBand = failedMetrics.has("LOAD_PERCENT") ? 8.5 : 3.5;
  const vUnbalanceBand = failedMetrics.has("V_UNBALANCE") ? 0.4 : 0.15;
  const aUnbalanceBand = failedMetrics.has("A_UNBALANCE") ? 0.75 : 0.35;
  const powerFactorBand = failedMetrics.has("POWER_FACTOR") ? 0.03 : 0.01;

  return {
    TOP_OIL_TEMPERATURE: topOilRaw.toFixed(2),
    TOP_OIL_TEMPERATURE_Min: (topOilRaw - topOilBand).toFixed(2),
    TOP_OIL_TEMPERATURE_Max: (topOilRaw + topOilBand).toFixed(2),
    WINDING_TEMPERATURE: windingRaw.toFixed(2),
    WINDING_TEMPERATURE_Min: (windingRaw - windingBand).toFixed(2),
    WINDING_TEMPERATURE_Max: (windingRaw + windingBand).toFixed(2),
    LOAD_PERCENT: loadPercentRaw.toFixed(2),
    LOAD_PERCENT_Min: Math.max(0, loadPercentRaw - loadPercentBand).toFixed(2),
    LOAD_PERCENT_Max: (loadPercentRaw + loadPercentBand).toFixed(2),
    V_UNBALANCE: vUnbalanceRaw.toFixed(2),
    V_UNBALANCE_Min: Math.max(0, vUnbalanceRaw - vUnbalanceBand).toFixed(2),
    V_UNBALANCE_Max: (vUnbalanceRaw + vUnbalanceBand).toFixed(2),
    A_UNBALANCE: aUnbalanceRaw.toFixed(2),
    A_UNBALANCE_Min: Math.max(0, aUnbalanceRaw - aUnbalanceBand).toFixed(2),
    A_UNBALANCE_Max: (aUnbalanceRaw + aUnbalanceBand).toFixed(2),
    POWER_FACTOR: powerFactorRaw.toFixed(2),
    POWER_FACTOR_Min: Math.max(0, powerFactorRaw - powerFactorBand).toFixed(2),
    POWER_FACTOR_Max: Math.min(1.2, powerFactorRaw + powerFactorBand).toFixed(2),
    TopOilTemperatureUnit: "degC",
    WindingTemperatureUnit: "degC",
    LoadPercentUnit: "%",
    VUnbalanceUnit: "%",
    AUnbalanceUnit: "%",
    PowerFactorUnit: "",
  };
}

function buildDemoEventReadings(deviceIds, filters) {
  const timestamps = buildDemoTimestamps(filters);
  const eventCatalog = [
    "Breaker closed",
    "Breaker opened",
    "Power restored",
    "Voltage dip detected",
    "Current spike detected",
    "Communication restored",
    "Device restarted",
  ];
  const readings = [];

  deviceIds.forEach((deviceId) => {
    const deviceSeed = hashText(deviceId);
    timestamps.forEach((capturedAt, timeIndex) => {
      const shouldEmit = timeIndex === 0 || (deviceSeed + timeIndex) % 3 === 0;
      if (!shouldEmit) {
        return;
      }

      const eventText = eventCatalog[(deviceSeed + timeIndex) % eventCatalog.length];
      readings.push({
        deviceId,
        capturedAt,
        metrics: {
          Event: eventText,
        },
      });
    });
  });

  return readings;
}

function buildDemoTimestamps(filters) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);

  switch (filters?.range) {
    case "today":
      break;
    case "yesterday":
      start = new Date(now.getTime() - DAY_MS);
      end = new Date(now.getTime() - DAY_MS);
      break;
    case "last7":
      start = new Date(now.getTime() - 6 * DAY_MS);
      break;
    case "last30":
      start = new Date(now.getTime() - 29 * DAY_MS);
      break;
    case "last365":
      start = new Date(now.getTime() - 364 * DAY_MS);
      break;
    case "lastyear": {
      const year = now.getFullYear() - 1;
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      break;
    }
    case "custom":
      if (filters?.startDate) {
        start = new Date(`${filters.startDate}T00:00:00`);
      }
      if (filters?.endDate) {
        end = new Date(`${filters.endDate}T00:00:00`);
      }
      break;
    default:
      break;
  }

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [new Date(now.setHours(12, 0, 0, 0)).toISOString()];
  }

  if (start.getTime() > end.getTime()) {
    const temp = start;
    start = end;
    end = temp;
  }

  const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1);
  let targetPoints = totalDays;
  if (totalDays > 14 && totalDays <= 45) {
    targetPoints = 15;
  } else if (totalDays > 45) {
    targetPoints = 18;
  }
  targetPoints = Math.max(1, targetPoints);

  const timestamps = [];
  const seen = new Set();
  for (let index = 0; index < targetPoints; index += 1) {
    const ratio = targetPoints === 1 ? 0 : index / (targetPoints - 1);
    const dayOffset = Math.round(ratio * (totalDays - 1));
    const date = new Date(start.getTime() + dayOffset * DAY_MS);
    date.setHours(12, 0, 0, 0);
    const iso = date.toISOString();
    if (!seen.has(iso)) {
      seen.add(iso);
      timestamps.push(iso);
    }
  }

  return timestamps.length ? timestamps : [new Date(now.setHours(12, 0, 0, 0)).toISOString()];
}

function hashText(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildHistoryUrl(projectName, deviceId, filters, nominalOptions = null) {
  const endpoint = filters.type === "hist-events" ? ["hist", "events"] : [API_CONFIG.nominalEndpointPath];
  const path = buildApiPath("projects", projectName, "devices", deviceId, ...endpoint);
  const url = new URL(buildUrl(path), window.location.origin);
  const windowQuery = buildTimeWindowQuery(filters);
  const params = new URLSearchParams();

  if (filters.type === "hist-events") {
    params.set("start", windowQuery.start);
    params.set("end", windowQuery.end);
    if (windowQuery.anchor) {
      params.set("anchor", windowQuery.anchor);
    }
    if (API_CONFIG.eventsTypes) {
      params.set("types", API_CONFIG.eventsTypes);
    }
  } else {
    // Keep the query parameter order as requested: value, type, timebase, start, end.
    const metric = nominalOptions?.metric || API_CONFIG.nominalValueMetrics[0];
    const hasExplicitPhase = Object.prototype.hasOwnProperty.call(nominalOptions || {}, "phase");
    const phase = hasExplicitPhase ? nominalOptions?.phase : API_CONFIG.nominalValuePhases[0];
    params.set("value", metric);
    if (phase !== null && phase !== undefined && String(phase).trim()) {
      params.set("type", phase);
    }
    params.set("timebase", String(API_CONFIG.nominalValueTimebase));
    params.set("start", windowQuery.start);
    params.set("end", windowQuery.end);
    params.set("aggregate", "true");
    if (windowQuery.anchor) {
      params.set("anchor", windowQuery.anchor);
    }
  }

  url.search = params.toString();

  return url.toString();
}

function buildTimeWindowQuery(filters) {
  if (filters.range === "custom" && filters.startDate && filters.endDate) {
    // Custom dates come from <input type="date"> and should map to UTC day bounds.
    const startDate = new Date(`${filters.startDate}T00:00:00Z`);
    const endDate = new Date(`${filters.endDate}T23:59:59Z`);
    return {
      start: `UTCSEC_${Math.floor(startDate.getTime() / 1000)}`,
      end: `UTCSEC_${Math.floor(endDate.getTime() / 1000)}`,
    };
  }

  const named = API_CONFIG.namedRanges[filters.range];
  if (named) {
    return {
      start: named.start,
      end: named.end,
      anchor: API_CONFIG.namedAnchor || "",
    };
  }

  const days = API_CONFIG.utcRelativeRangesInDays[filters.range];
  if (days) {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      start: `UTCSEC_${Math.floor(startDate.getTime() / 1000)}`,
      end: `UTCSEC_${Math.floor(now.getTime() / 1000)}`,
    };
  }

  return {
    start: "NAMED_Today",
    end: "NAMED_Today",
    anchor: API_CONFIG.namedAnchor || "",
  };
}

function normalizeNominalValueXml(xmlText, defaultDeviceId, metricName, phaseType) {
  if (!xmlText || !xmlText.trim()) {
    return [];
  }

  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("NominalValue response is not valid XML.");
  }

  const typeNode = xml.querySelector("valuelist > valueType");
  const responseMetric = typeNode?.querySelector("value")?.textContent?.trim() || metricName;
  const responsePhase = typeNode?.querySelector("type")?.textContent?.trim() || phaseType;
  const responseUnit = typeNode?.querySelector("unit")?.textContent?.trim() || "";
  const extraMetricDefinition =
    getExtraNominalMetricDefinition(metricName) || getExtraNominalMetricDefinition(responseMetric);
  const targetColumn =
    getNominalColumnKey(metricName, phaseType) ||
    getNominalColumnKey(responseMetric, responsePhase) ||
    extraMetricDefinition?.key ||
    "";
  const unitColumn =
    getNominalUnitColumnKey(metricName) ||
    getNominalUnitColumnKey(responseMetric) ||
    extraMetricDefinition?.unitColumn ||
    "";
  if (!targetColumn) {
    logApi("Nominal value mapping failed", {
      metricName,
      phaseType,
      responseMetric,
      responsePhase,
    });
    return [];
  }

  const valueNodes = Array.from(xml.querySelectorAll("valuelist > values"));
  return valueNodes.map((node) => {
    const startTimeNs = node.querySelector("startTime")?.textContent?.trim() || "";
    const capturedAt = nanoEpochToIso(startTimeNs) || startTimeNs;
    const minValue = roundTo2Decimals(readXmlNodeText(node, ["min"]));
    const maxValue = roundTo2Decimals(readXmlNodeText(node, ["max"]));
    const avgRaw = readXmlNodeText(node, ["avg", "average", "mean", "value"]);
    const avgValue = roundTo2Decimals(avgRaw) || deriveAverageFromBounds(minValue, maxValue);

    return {
      deviceId: String(defaultDeviceId),
      capturedAt,
      metrics: {
        [targetColumn]: avgValue,
        [`${targetColumn}_Min`]: minValue,
        [`${targetColumn}_Max`]: maxValue,
        ...(unitColumn ? { [unitColumn]: responseUnit } : {}),
      },
    };
  });
}

function readXmlNodeText(node, candidates) {
  for (const candidate of candidates) {
    const text = (node.querySelector(candidate)?.textContent || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function deriveAverageFromBounds(minValue, maxValue) {
  const minNum = Number(minValue);
  const maxNum = Number(maxValue);
  if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) {
    return "";
  }
  return ((minNum + maxNum) / 2).toFixed(2);
}

function roundTo2Decimals(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) {
    return "";
  }
  const num = Number(text);
  if (!Number.isFinite(num)) {
    return text;
  }
  return num.toFixed(2);
}

function normalizeHistoricalEvents(payload, defaultDeviceId) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.events || payload?.data || payload?.items || [];

  const readings = [];
  list.forEach((item) => {
    const deviceId = String(
      item?.devid ??
        item?.deviceId ??
        item?.deviceID ??
        item?.device_id ??
        item?.id ??
        defaultDeviceId ??
        ""
    );
    const capturedAt =
      item?.capturedAt ??
      item?.timestamp ??
      item?.time ??
      item?.date ??
      item?.eventTime ??
      item?.ts ??
      "";
    const eventText =
      item?.event ??
      item?.eventName ??
      item?.name ??
      item?.description ??
      item?.message ??
      item?.status ??
      item?.value ??
      "";

    if (!deviceId || !capturedAt) {
      return;
    }

    readings.push({
      deviceId,
      capturedAt: String(capturedAt),
      metrics: {
        Event: String(eventText),
      },
    });
  });

  return readings;
}

function getNominalMetricDefinition(metricName) {
  const metric = String(metricName || "").toUpperCase();
  return NOMINAL_METRIC_DEFINITIONS[metric] || null;
}

function getExtraNominalMetricDefinitionByColumn(columnName) {
  const safeColumn = String(columnName || "").trim();
  return EXTRA_NOMINAL_METRIC_DEFINITIONS.find((definition) => definition.column === safeColumn) || null;
}

function getExtraNominalMetricDefinition(metricName) {
  const safeMetricName = String(metricName || "").trim().toUpperCase();
  if (!safeMetricName) {
    return null;
  }
  return (
    EXTRA_NOMINAL_METRIC_DEFINITIONS.find((definition) => {
      const definitionKey = String(definition?.key || "").trim().toUpperCase();
      const queryValue = String(definition?.queryValue || "").trim().toUpperCase();
      const column = String(definition?.column || "").trim().toUpperCase();
      return (
        safeMetricName === definitionKey ||
        safeMetricName === queryValue ||
        safeMetricName === column
      );
    }) || null
  );
}

function getPhaseNumber(phaseType) {
  const phaseText = String(phaseType || "").toUpperCase();
  const parsed = Number.parseInt(phaseText.replace(/[^\d]/g, ""), 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  const phaseIndex = API_CONFIG.nominalValuePhases.findIndex(
    (phase) => String(phase || "").toUpperCase() === phaseText
  );
  if (phaseIndex >= 0) {
    return phaseIndex + 1;
  }
  return 0;
}

function getNominalColumnKey(metricName, phaseType) {
  const metricDef = getNominalMetricDefinition(metricName);
  const phaseNumber = getPhaseNumber(phaseType);
  if (!metricDef || !phaseNumber) {
    return "";
  }
  return `${metricDef.keyPrefix || metricDef.prefix || ""}${phaseNumber}`;
}

function getNominalUnitColumnKey(metricName) {
  const metricDef = getNominalMetricDefinition(metricName);
  return metricDef ? metricDef.unitColumn : "";
}

function buildNominalColumnLayout() {
  const tableColumns = [];
  const displayColumns = [];
  const valueColumns = [];
  const valueToUnitColumn = {};
  const unitColumns = new Set();
  const groups = [];

  API_CONFIG.nominalValueMetrics.forEach((metricName) => {
    const metricDef = getNominalMetricDefinition(metricName);
    if (!metricDef) {
      return;
    }

    API_CONFIG.nominalValuePhases.forEach((phaseName, phaseIndex) => {
      const phaseNumber = getPhaseNumber(phaseName) || phaseIndex + 1;
      const baseColumn = `${metricDef.keyPrefix || metricDef.prefix || ""}${phaseNumber}`;
      const groupColumns = [
        baseColumn,
        ...NOMINAL_EXTRA_SUFFIXES.map((suffix) => `${baseColumn}_${suffix}`),
      ];
      const start = tableColumns.length + displayColumns.length;

      displayColumns.push(...groupColumns);
      valueColumns.push(...groupColumns);
      groupColumns.forEach((columnName) => {
        valueToUnitColumn[columnName] = metricDef.unitColumn;
      });
      unitColumns.add(metricDef.unitColumn);

      groups.push({
        id: baseColumn,
        start,
        end: start + groupColumns.length - 1,
        columns: groupColumns,
        subHeaders: groupColumns.map((columnName, columnIndex) =>
          getNominalSubHeaderLabel(baseColumn, columnName, columnIndex)
        ),
      });
    });
  });

  EXTRA_NOMINAL_METRIC_DEFINITIONS.forEach((definition) => {
    if (!definition?.key) {
      return;
    }
    displayColumns.push(definition.key);
    valueColumns.push(definition.key);
    if (definition.unitColumn) {
      valueToUnitColumn[definition.key] = definition.unitColumn;
      unitColumns.add(definition.unitColumn);
    }
  });

  return {
    columns: [...tableColumns, ...displayColumns],
    displayColumns,
    valueColumns,
    valueToUnitColumn,
    groups,
    metricKeys: [...valueColumns, ...Array.from(unitColumns)],
  };
}

function getNominalSubHeaderLabel(baseColumn, columnName, columnIndex) {
  if (columnIndex === 0 || columnName === baseColumn) {
    return "Avg";
  }
  const suffix = columnName.slice(baseColumn.length + 1);
  return suffix || columnName;
}

function nanoEpochToIso(value) {
  try {
    const ns = BigInt(String(value));
    const ms = Number(ns / 1000000n);
    if (!Number.isFinite(ms)) {
      return "";
    }
    return new Date(ms).toISOString();
  } catch (_error) {
    return "";
  }
}

function buildDeviceMetricsTable(readings, selectedDeviceIds) {
  const isEvents = state.selectedType === "hist-events";
  const nominalLayout = isEvents ? null : buildNominalColumnLayout();
  const includeDate = shouldIncludeDateColumn();
  const columns = isEvents
    ? includeDate
      ? ["Date", "Time", "Event"]
      : ["Time", "Event"]
    : nominalLayout.columns;
  const deviceTables = [];
  const selectedSet = new Set(selectedDeviceIds);
  const byDevice = new Map();

  readings.forEach((reading) => {
    if (!selectedSet.has(reading.deviceId)) {
      return;
    }
    if (!byDevice.has(reading.deviceId)) {
      byDevice.set(reading.deviceId, []);
    }
    byDevice.get(reading.deviceId).push(reading);
  });

  selectedDeviceIds.forEach((deviceId) => {
    const deviceRows = [];
    if (isEvents) {
      const deviceReadings = (byDevice.get(deviceId) || []).sort(
        (left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime()
      );
      deviceReadings.forEach((reading) => {
        const capturedAt = formatTimestamp(reading.capturedAt);
        deviceRows.push({
          _capturedAt: capturedAt,
          Date: getDateKey(capturedAt),
          Time: getTimeKey(capturedAt),
          Event: reading.metrics?.Event ?? "",
        });
      });
    } else {
      const byTimestamp = new Map();
      (byDevice.get(deviceId) || []).forEach((reading) => {
        const key = String(reading.capturedAt || "");
        if (!key) {
          return;
        }
        if (!byTimestamp.has(key)) {
          byTimestamp.set(key, {
            capturedAt: key,
            metrics: Object.fromEntries(nominalLayout.metricKeys.map((column) => [column, ""])),
          });
        }
        const target = byTimestamp.get(key);
        Object.entries(reading.metrics || {}).forEach(([column, value]) => {
          if (target.metrics[column] !== undefined) {
            target.metrics[column] = value;
          }
        });
      });

      const mergedRows = Array.from(byTimestamp.values()).sort(
        (left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime()
      );

      mergedRows.forEach((entry) => {
        const capturedAt = formatTimestamp(entry.capturedAt);
        const row = {
          _capturedAt: capturedAt,
        };
        nominalLayout.displayColumns.forEach((column) => {
          const unitColumn = nominalLayout.valueToUnitColumn[column];
          row[column] = formatValueWithUnit(
            entry.metrics[column],
            unitColumn ? entry.metrics[unitColumn] : ""
          );
        });
        deviceRows.push(row);
      });
    }

    const deviceRecord = getDeviceRecordById(deviceId);
    deviceTables.push({
      deviceId,
      label: getDeviceDisplayName(deviceId),
      substation: getDeviceSubstation(deviceRecord || deviceId),
      rows: deviceRows,
    });
  });

  deviceTables.sort(compareDeviceEntriesBySubstation);

  return {
    columns,
    columnGroups: [],
    deviceTables,
    deviceCount: selectedDeviceIds.length,
    readingCount: readings.filter((reading) => selectedSet.has(reading.deviceId)).length,
  };
}

function formatValueWithUnit(value, unit) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) {
    return "";
  }
  const unitText = unit === null || unit === undefined ? "" : String(unit).trim();
  return unitText ? `${text} ${unitText}` : text;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function shouldIncludeDateColumn() {
  const range = String(state.selectedTimeRange || "");
  if (range === "today" || range === "yesterday") {
    return false;
  }
  if (range === "custom") {
    if (!customStartDate.value || !customEndDate.value) {
      return true;
    }
    return customStartDate.value !== customEndDate.value;
  }
  return true;
}

function getNominalReportColumns(includeDate = true) {
  const columns = [
    "Substation",
    "Device",
    ...(includeDate ? ["Date"] : []),
    "Top Oil Temperature",
    "Winding Temperature",
    "Load %",
    "Transformation Ratio",
    "V Unbalance",
    "A Unbalance",
    "Power Factor",
  ];
  return columns;
}

function getDeviceDisplayName(deviceId) {
  const match = getDeviceRecordById(deviceId);
  if (!match) {
    return deviceId;
  }
  const preferredLabel = getPreferredDeviceLabel(match);
  return preferredLabel || `${match.name} (${match.devid})`;
}

function getProjectDisplayName(projectName) {
  const match = state.projects.find((project) => project.pname === projectName);
  return match ? `${match.name} (${match.pname})` : projectName;
}

function renderDeviceTables(deviceTables, columnsOverride = null, columnGroupsOverride = null) {
  state.latestDeviceTables = Array.isArray(deviceTables) ? deviceTables : [];
  state.latestDatasetColumns = columnsOverride || [];
  state.latestDatasetColumnGroups = columnGroupsOverride || [];

  if (!state.latestDeviceTables.length) {
    state.activeDeviceTab = "";
    state.activeDateTab = "";
    state.latestDateTables = [];
    renderDeviceTabs();
    renderDateTabs();
    renderTable([], state.latestDatasetColumns, state.latestDatasetColumnGroups);
    return;
  }

  if (state.selectedType !== "hist-events") {
    state.activeDeviceTab = "";
    renderDeviceTabs();
    renderNominalCombinedTable();
    return;
  }

  const hasActiveDevice = state.latestDeviceTables.some(
    (deviceTable) => deviceTable.deviceId === state.activeDeviceTab
  );
  if (!hasActiveDevice) {
    state.activeDeviceTab = state.latestDeviceTables[0].deviceId;
  }

  renderDeviceTabs();
  renderActiveDeviceTable();
}

function renderDeviceTabs() {
  if (!deviceTabs) {
    return;
  }

  deviceTabs.innerHTML = "";
  if (state.selectedType !== "hist-events" || state.latestDeviceTables.length <= 1) {
    deviceTabs.classList.add("hidden");
    return;
  }

  deviceTabs.classList.remove("hidden");
  state.latestDeviceTables.forEach((deviceTable) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "device-tab";
    if (deviceTable.deviceId === state.activeDeviceTab) {
      button.classList.add("active");
    }
    button.textContent = deviceTable.label;
    button.addEventListener("click", () => {
      state.activeDeviceTab = deviceTable.deviceId;
      state.activeDateTab = "";
      renderDeviceTabs();
      renderActiveDeviceTable();
    });
    deviceTabs.appendChild(button);
  });
}

function renderNominalCombinedTable() {
  const includeDate = shouldIncludeDateColumn();
  const nominalColumns = getNominalReportColumns(includeDate);
  const nominalTable = buildNominalRowsTable(
    state.latestDeviceTables,
    state.latestDatasetColumns,
    includeDate
  );
  state.latestDateTables = [];
  state.activeDateTab = "";
  renderDateTabs();

  renderTable(
    nominalTable?.rows || [],
    nominalTable?.columns || nominalColumns,
    [],
    nominalTable?.cellClasses || {}
  );
}

function renderMainIntakeReportTable(rows = null) {
  if (!mainIntakeReportSection || !mainIntakeReportTableHead || !mainIntakeReportTableBody) {
    return;
  }

  const safeRows =
    rows === null ? buildMainIntakeReportRows(state.projectName) : Array.isArray(rows) ? rows : [];
  mainIntakeReportTableHead.innerHTML = "";
  mainIntakeReportTableBody.innerHTML = "";

  if (!safeRows.length || !state.latestReportRows.length) {
    mainIntakeReportSection.classList.add("hidden");
    return;
  }

  mainIntakeReportSection.classList.remove("hidden");
  const columns = MAIN_INTAKE_REPORT_COLUMNS;
  const mergedCellSpanMap = {
    "Main Intake": {},
  };
  let rowIndex = 0;
  while (rowIndex < safeRows.length) {
    const currentValue = String(safeRows[rowIndex]?.["Main Intake"] ?? "");
    let span = 1;
    while (
      rowIndex + span < safeRows.length &&
      String(safeRows[rowIndex + span]?.["Main Intake"] ?? "") === currentValue
    ) {
      span += 1;
    }
    mergedCellSpanMap["Main Intake"][rowIndex] = span;
    for (let offset = 1; offset < span; offset += 1) {
      mergedCellSpanMap["Main Intake"][rowIndex + offset] = 0;
    }
    rowIndex += span;
  }

  const headerRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column;
    headerRow.appendChild(th);
  });
  mainIntakeReportTableHead.appendChild(headerRow);

  safeRows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const rowSpan = mergedCellSpanMap?.[column]?.[rowIndex];
      if (rowSpan === 0) {
        return;
      }
      const td = document.createElement("td");
      td.textContent = row?.[column] ?? "";
      if (Number.isFinite(rowSpan) && rowSpan > 1) {
        td.rowSpan = rowSpan;
      }
      tr.appendChild(td);
    });
    mainIntakeReportTableBody.appendChild(tr);
  });
}

function renderActiveDeviceTable() {
  const activeDeviceTable =
    state.latestDeviceTables.find((deviceTable) => deviceTable.deviceId === state.activeDeviceTab) ||
    state.latestDeviceTables[0];

  if (!activeDeviceTable) {
    state.activeDateTab = "";
    state.latestDateTables = [];
    renderDateTabs();
    renderTable([], state.latestDatasetColumns, state.latestDatasetColumnGroups);
    return;
  }

  if (state.selectedType === "hist-events") {
    state.activeDateTab = "";
    state.latestDateTables = [];
    renderDateTabs();
    renderTable(activeDeviceTable.rows || [], state.latestDatasetColumns, []);
    return;
  }
}

function buildNominalRowsTable(deviceTables, metricColumns, includeDate = true) {
  const nominalColumns = getNominalReportColumns(includeDate);
  const byDate = new Map();

  (Array.isArray(deviceTables) ? deviceTables : []).forEach((deviceTable) => {
    const rows = Array.isArray(deviceTable?.rows) ? deviceTable.rows : [];
    rows.forEach((row) => {
      const dateKey = getDateKey(row?._capturedAt || row?.Date);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, new Map());
      }
      const byDevice = byDate.get(dateKey);
      if (!byDevice.has(deviceTable.deviceId)) {
        byDevice.set(deviceTable.deviceId, []);
      }
      byDevice.get(deviceTable.deviceId).push(row);
    });
  });

  const sortedDateKeys = Array.from(byDate.keys()).sort((left, right) =>
    String(left).localeCompare(String(right))
  );

  const outputEntries = [];

  sortedDateKeys.forEach((dateKey) => {
    const dateDeviceRows = byDate.get(dateKey) || new Map();

    (Array.isArray(deviceTables) ? deviceTables : []).forEach((deviceTable) => {
      const complianceRow = buildNominalDeviceComplianceRow(
        deviceTable.deviceId,
        deviceTable.label || deviceTable.deviceId || "",
        deviceTable.substation || getDeviceSubstation(deviceTable.deviceId),
        dateDeviceRows.get(deviceTable.deviceId) || [],
        metricColumns,
        dateDeviceRows
      );
      if (!complianceRow) {
        return;
      }
      const outputRow = {
        ...complianceRow.row,
      };
      if (includeDate) {
        outputRow.Date = dateKey;
      }
      outputEntries.push({
        row: outputRow,
        cellClasses: complianceRow.cellClasses || {},
      });
    });
  });

  outputEntries.sort((leftEntry, rightEntry) =>
    compareNominalReportEntries(leftEntry, rightEntry, includeDate)
  );

  const rowsOut = [];
  const cellClasses = {};
  outputEntries.forEach((entry, index) => {
    rowsOut.push(entry.row);
    cellClasses[index] = entry.cellClasses || {};
  });

  return {
    columns: nominalColumns,
    rows: rowsOut,
    cellClasses,
  };
}

function buildNominalDeviceComplianceRow(
  deviceId,
  deviceLabel,
  substationLabel,
  rows,
  metricColumns,
  groupedRowsByDevice = new Map()
) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return null;
  }

  const latestRow = safeRows[safeRows.length - 1] || {};
  const transformationRatioMetrics = buildTransformationRatioMetrics(
    deviceId,
    latestRow,
    metricColumns,
    groupedRowsByDevice
  );
  const ratioRow = {
    ...latestRow,
    ...transformationRatioMetrics,
  };
  const topOilTemperatureCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "TOP_OIL_TEMPERATURE",
    "Top Oil Temperature",
    { deviceId }
  );
  const windingTemperatureCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "WINDING_TEMPERATURE",
    "Winding Temperature",
    { deviceId }
  );
  const loadPercentCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "LOAD_PERCENT",
    "Load %",
    { deviceId }
  );
  const transformationRatioCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "TRANSFORMATION_RATIO",
    "Transformation Ratio",
    { deviceId }
  );
  const vUnbalanceCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "V_UNBALANCE",
    "V Unbalance",
    { deviceId }
  );
  const aUnbalanceCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "A_UNBALANCE",
    "A Unbalance",
    { deviceId }
  );
  const powerFactorCompliance = evaluateSingleMetricCompliance(
    ratioRow,
    "POWER_FACTOR",
    "Power Factor",
    { deviceId }
  );
  const deviceHighlightComplianceResults = [
    topOilTemperatureCompliance,
    windingTemperatureCompliance,
    loadPercentCompliance,
    transformationRatioCompliance,
    vUnbalanceCompliance,
    aUnbalanceCompliance,
    powerFactorCompliance,
  ].filter((result) => result?.available);
  const isFullyCompliant =
    deviceHighlightComplianceResults.length > 0 &&
    deviceHighlightComplianceResults.every((result) => result?.available && result.pass);

  return {
    row: {
      Substation: substationLabel || getDeviceSubstation(deviceId),
      Device: deviceLabel,
      "Top Oil Temperature": getMetricCellDisplayValue(
        topOilTemperatureCompliance,
        formatMeasuredValue(
          latestRow?.TOP_OIL_TEMPERATURE,
          parseNumericValue(latestRow?.TOP_OIL_TEMPERATURE),
          "degC",
          5
        )
      ),
      "Winding Temperature": getMetricCellDisplayValue(
        windingTemperatureCompliance,
        formatMeasuredValue(
          latestRow?.WINDING_TEMPERATURE,
          parseNumericValue(latestRow?.WINDING_TEMPERATURE),
          "degC",
          5
        )
      ),
      "Load %": getMetricCellDisplayValue(
        loadPercentCompliance,
        formatMeasuredValue(latestRow?.LOAD_PERCENT, parseNumericValue(latestRow?.LOAD_PERCENT), "%", 5)
      ),
      "Transformation Ratio": getMetricCellDisplayValue(
        transformationRatioCompliance,
        formatMeasuredValue(
          ratioRow?.TRANSFORMATION_RATIO,
          parseNumericValue(ratioRow?.TRANSFORMATION_RATIO),
          "",
          5
        ),
        { showValueWhenCompliant: true }
      ),
      "V Unbalance": getMetricCellDisplayValue(
        vUnbalanceCompliance,
        formatMeasuredValue(latestRow?.V_UNBALANCE, parseNumericValue(latestRow?.V_UNBALANCE), "%", 5)
      ),
      "A Unbalance": getMetricCellDisplayValue(
        aUnbalanceCompliance,
        formatMeasuredValue(latestRow?.A_UNBALANCE, parseNumericValue(latestRow?.A_UNBALANCE), "%", 5)
      ),
      "Power Factor": getMetricCellDisplayValue(
        powerFactorCompliance,
        formatMeasuredValue(latestRow?.POWER_FACTOR, parseNumericValue(latestRow?.POWER_FACTOR), "", 5)
      ),
    },
    cellClasses: {
      "Top Oil Temperature": getComplianceStatusClass(topOilTemperatureCompliance),
      "Winding Temperature": getComplianceStatusClass(windingTemperatureCompliance),
      "Load %": getComplianceStatusClass(loadPercentCompliance),
      "Transformation Ratio": getComplianceStatusClass(transformationRatioCompliance),
      "V Unbalance": getComplianceStatusClass(vUnbalanceCompliance),
      "A Unbalance": getComplianceStatusClass(aUnbalanceCompliance),
      "Power Factor": getComplianceStatusClass(powerFactorCompliance),
      _row: isFullyCompliant ? "row-compliant" : "",
    },
  };
}

function getBaseMetricsByPrefix(metricColumns, prefix) {
  const safePrefix = String(prefix || "").toUpperCase();
  const safeColumns = Array.isArray(metricColumns) ? metricColumns : [];
  const metricPattern = safePrefix === "V" ? /^V\d+$/ : /^A\d+$/;
  const metrics = safeColumns
    .filter((column) => typeof column === "string" && column && !column.includes("_"))
    .map((column) => normalizeMetricKey(column))
    .filter((metric) => metricPattern.test(metric));

  const unique = Array.from(new Set(metrics));
  unique.sort((left, right) => {
    const leftOrder = Number.parseInt(String(left).replace(/^[^\d]+/, ""), 10);
    const rightOrder = Number.parseInt(String(right).replace(/^[^\d]+/, ""), 10);
    return (Number.isFinite(leftOrder) ? leftOrder : 0) - (Number.isFinite(rightOrder) ? rightOrder : 0);
  });
  return unique;
}

function buildTransformationRatioMetrics(deviceId, latestRow, metricColumns, groupedRowsByDevice) {
  const mapping = getTransformerMappingForDevice(deviceId);
  if (!mapping) {
    return {};
  }

  const voltageMetrics = getBaseMetricsByPrefix(metricColumns, "V");
  if (!voltageMetrics.length) {
    return {};
  }

  const htRows = groupedRowsByDevice?.get(mapping.htDeviceId) || [];
  const lvRows = groupedRowsByDevice?.get(mapping.lvDeviceId) || [];
  const htLatestRow = htRows[htRows.length - 1] || (mapping.htDeviceId === deviceId ? latestRow : null);
  const lvLatestRow = lvRows[lvRows.length - 1] || (mapping.lvDeviceId === deviceId ? latestRow : null);
  const htAverage = getMetricGroupAverageNumericValue(htLatestRow, voltageMetrics);
  const lvAverage = getMetricGroupAverageNumericValue(lvLatestRow, voltageMetrics);
  if (!Number.isFinite(htAverage) || !Number.isFinite(lvAverage) || lvAverage <= 0) {
    return {};
  }

  return {
    TRANSFORMATION_RATIO: (htAverage / lvAverage).toFixed(2),
  };
}

function getMetricChannelLabel(metric) {
  const normalized = normalizeMetricKey(metric);
  const match = normalized.match(/^[VA](\d+)$/);
  if (!match) {
    return normalized;
  }

  const channelNumber = Number.parseInt(match[1], 10);
  if (channelNumber === 1) {
    return "1";
  }
  if (channelNumber === 2) {
    return "2";
  }
  if (channelNumber === 3) {
    return "3";
  }
  return `Channel ${channelNumber}`;
}

function formatMetricGroupAverageValue(latestRow, metrics) {
  if (!Array.isArray(metrics) || !metrics.length) {
    return "";
  }

  const avg = getMetricGroupAverageNumericValue(latestRow, metrics);
  if (!Number.isFinite(avg)) {
    return "";
  }
  return avg.toFixed(2);
}

function getMetricGroupAverageNumericValue(latestRow, metrics) {
  const numericValues = (Array.isArray(metrics) ? metrics : [])
    .map((metric) => parseNumericValue(latestRow?.[metric]))
    .filter((value) => Number.isFinite(value));
  if (!numericValues.length) {
    return Number.NaN;
  }
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function evaluateMetricGroupCompliance(latestRow, metrics, context = {}) {
  if (!Array.isArray(metrics) || !metrics.length) {
    return {
      available: false,
      pass: false,
      failedChannels: [],
      failedDetails: [],
    };
  }

  const failedChannels = [];
  const failedDetails = [];
  let evaluatedMetricCount = 0;
  let pass = true;

  metrics.forEach((metric) => {
    const tolerance = getMetricTolerance(metric, context);
    const channelLabel = getMetricChannelLabel(metric);
    const groupLabel = String(metric || "").toUpperCase().startsWith("V") ? "V" : "A";
    const unit = groupLabel === "V" ? "V" : "A";
    const minRaw = latestRow?.[`${metric}_Min`];
    const maxRaw = latestRow?.[`${metric}_Max`];
    const minNumeric = parseNumericValue(minRaw);
    const maxNumeric = parseNumericValue(maxRaw);
    const hasTolerance =
      Number.isFinite(tolerance?.min) && Number.isFinite(tolerance?.max);
    if (!hasTolerance) {
      return;
    }
    evaluatedMetricCount += 1;
    const minPass = hasTolerance && Number.isFinite(minNumeric) && minNumeric >= tolerance.min;
    const maxPass = hasTolerance && Number.isFinite(maxNumeric) && maxNumeric <= tolerance.max;
    const metricPass = minPass && maxPass;

    if (!metricPass) {
      pass = false;
      failedChannels.push(channelLabel);
    }

    if (!minPass) {
      failedDetails.push({
        parameter: groupLabel,
        channel: channelLabel,
        bound: "Min",
        value: formatMeasuredValue(minRaw, minNumeric, unit, 5),
        limit: formatToleranceValue(tolerance?.min, unit, 5),
        operator: "<",
      });
    }
    if (!maxPass) {
      failedDetails.push({
        parameter: groupLabel,
        channel: channelLabel,
        bound: "Max",
        value: formatMeasuredValue(maxRaw, maxNumeric, unit, 5),
        limit: formatToleranceValue(tolerance?.max, unit, 5),
        operator: ">",
      });
    }
  });

  if (!evaluatedMetricCount) {
    return {
      available: false,
      pass: false,
      failedChannels: [],
      failedDetails: [],
    };
  }

  return { available: true, pass, failedChannels, failedDetails };
}

function evaluateSingleMetricCompliance(latestRow, metricKey, parameterLabel, context = {}) {
  const tolerance = getMetricTolerance(metricKey, context);
  const rawValue = latestRow?.[metricKey];
  const numericValue = parseNumericValue(rawValue);
  const minRaw = latestRow?.[`${metricKey}_Min`];
  const maxRaw = latestRow?.[`${metricKey}_Max`];
  const minNumeric = parseNumericValue(minRaw);
  const maxNumeric = parseNumericValue(maxRaw);
  const unit = getMetricUnitForParameter(parameterLabel);
  const hasTolerance =
    Number.isFinite(tolerance?.min) && Number.isFinite(tolerance?.max);

  if (
    !hasTolerance ||
    (!Number.isFinite(numericValue) && !Number.isFinite(minNumeric) && !Number.isFinite(maxNumeric))
  ) {
    return {
      available: false,
      pass: false,
      failedChannels: [],
      failedDetails: [],
    };
  }

  const minPass = !Number.isFinite(minNumeric) || minNumeric >= tolerance.min;
  const maxPass = !Number.isFinite(maxNumeric) || maxNumeric <= tolerance.max;
  const valuePass =
    !Number.isFinite(numericValue) ||
    (numericValue >= tolerance.min && numericValue <= tolerance.max);
  const pass = minPass && maxPass && valuePass;
  if (pass) {
    return {
      available: true,
      pass: true,
      failedChannels: [],
      failedDetails: [],
    };
  }

  const failedDetails = [];
  if (!minPass) {
    failedDetails.push({
      parameter: parameterLabel,
      bound: "Min",
      value: formatMeasuredValue(minRaw, minNumeric, unit, 5),
      limit: formatToleranceValue(tolerance.min, unit, 5),
      operator: "<",
    });
  }
  if (!maxPass) {
    failedDetails.push({
      parameter: parameterLabel,
      bound: "Max",
      value: formatMeasuredValue(maxRaw, maxNumeric, unit, 5),
      limit: formatToleranceValue(tolerance.max, unit, 5),
      operator: ">",
    });
  }
  if (!failedDetails.length && !valuePass) {
    const isBelow = numericValue < tolerance.min;
    failedDetails.push({
      parameter: parameterLabel,
      bound: "Value",
      value: formatMeasuredValue(rawValue, numericValue, unit, 5),
      limit: formatToleranceValue(isBelow ? tolerance.min : tolerance.max, unit, 5),
      operator: isBelow ? "<" : ">",
    });
  }

  return {
    available: true,
    pass: false,
    failedChannels: [],
    failedDetails,
  };
}

function getMetricCellDisplayValue(complianceResult, fallbackValue = "", options = {}) {
  const showValueWhenCompliant = Boolean(options?.showValueWhenCompliant);
  if (!complianceResult?.available) {
    return "N/A";
  }
  if (complianceResult.pass) {
    const valueText = String(fallbackValue ?? "").trim();
    return showValueWhenCompliant ? valueText || "OK" : "OK";
  }
  const failedDetail = Array.isArray(complianceResult?.failedDetails)
    ? complianceResult.failedDetails[0]
    : null;
  const failedDetailText = formatFailedDetailForMetricCell(failedDetail);
  if (failedDetailText) {
    return failedDetailText;
  }
  const valueText = String(fallbackValue ?? "").trim();
  return valueText || "Non-Comply";
}

function formatFailedDetailForMetricCell(detail) {
  if (!detail || typeof detail !== "object") {
    return "";
  }
  const parameter = String(detail.parameter || "Metric").trim();
  const channel = String(detail.channel || "").trim();
  const bound = String(detail.bound || "Value").trim();
  const valueText = String(detail.value || "N/A").trim();
  const operator = String(detail.operator || "").trim();
  const limitText = String(detail.limit || "").trim();
  const compareText = operator && limitText ? `${valueText} ${operator} ${limitText}` : valueText;

  if (bound.toUpperCase() === "VALUE") {
    return `${parameter}: ${compareText}`;
  }
  const suffix = channel ? `${parameter}${channel}` : parameter;
  return `${bound} ${suffix}: ${compareText}`;
}

function getComplianceStatusClass(complianceResult) {
  if (!complianceResult?.available) {
    return "";
  }
  return complianceResult.pass ? "value-pass" : "value-fail";
}

function getMetricUnitForParameter(parameterLabel) {
  const key = String(parameterLabel || "").trim().toUpperCase();
  if (key === "TOP OIL TEMPERATURE" || key === "WINDING TEMPERATURE") {
    return "degC";
  }
  if (
    key === "LOAD %" ||
    key === "LOAD_PERCENT" ||
    key === "V UNBALANCE" ||
    key === "A UNBALANCE"
  ) {
    return "%";
  }
  return "";
}

function formatMeasuredValue(rawValue, numericValue, unit = "", significantDigits = 5) {
  if (Number.isFinite(numericValue)) {
    const numberText = formatCompactNumber(numericValue, significantDigits);
    return unit ? `${numberText}${unit}` : numberText;
  }
  const text = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
  return text || "N/A";
}

function getDateKey(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  if (!text) {
    return "Unknown";
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTimeKey(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  const match = text.match(/\b(\d{2}:\d{2}:\d{2})\b/);
  if (match) {
    return match[1];
  }
  return text || "Unknown";
}

function buildMetricSummaryTable(rows, metricColumns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = ["Metric", "Avg", "Min", "Max", "Remark"];
  if (!safeRows.length) {
    return { columns, rows: [], cellClasses: {} };
  }

  const latestRow = safeRows[safeRows.length - 1] || {};

  const baseMetrics = Array.from(
    new Set(
      (Array.isArray(metricColumns) ? metricColumns : [])
        .filter((column) => typeof column === "string" && column && !column.includes("_"))
        .map((column) => column.trim())
    )
  );

  const rowsOut = [];
  const cellClasses = {};

  baseMetrics.forEach((metric, rowIndex) => {
    const tolerance = getMetricTolerance(metric);
    const avgValue = latestRow[metric] ?? "";
    const minValue = latestRow[`${metric}_Min`] ?? "";
    const maxValue = latestRow[`${metric}_Max`] ?? "";
    const avgCheck = evaluateTolerance(avgValue, tolerance);
    const minCheck = evaluateTolerance(minValue, tolerance);
    const maxCheck = evaluateTolerance(maxValue, tolerance);
    const isComply = avgCheck.pass && minCheck.pass && maxCheck.pass;

    rowsOut.push({
      Metric: getMetricDisplayName(metric),
      _TolMin: formatToleranceValue(tolerance?.min),
      _TolMax: formatToleranceValue(tolerance?.max),
      Avg: avgValue,
      Min: minValue,
      Max: maxValue,
      Remark: isComply ? "Comply" : "Not Comply",
    });

    cellClasses[rowIndex] = {
      Avg: avgCheck.pass ? "value-pass" : "value-fail",
      Min: minCheck.pass ? "value-pass" : "value-fail",
      Max: maxCheck.pass ? "value-pass" : "value-fail",
      Remark: isComply ? "remark-pass" : "remark-fail",
    };
  });

  return {
    columns,
    rows: rowsOut,
    cellClasses,
  };
}

function getMetricTolerance(metric, context = {}) {
  const metricKey = normalizeMetricKey(metric);
  const deviceOverride = state.thresholdOverridesByDevice?.[String(context?.deviceId || "")]?.[metricKey];
  if (
    Number.isFinite(deviceOverride?.min) &&
    Number.isFinite(deviceOverride?.max)
  ) {
    return {
      min: Number(deviceOverride.min),
      max: Number(deviceOverride.max),
    };
  }
  if (/^V\d+$/.test(metricKey)) {
    const voltageClass = normalizeVoltageClass(context?.voltageClass || getDeviceVoltageClass(context?.deviceId));
    return getVoltageToleranceForClass(voltageClass);
  }
  return METRIC_TOLERANCES[metricKey] || null;
}

function getMetricDisplayName(metric) {
  const metricKey = normalizeMetricKey(metric);
  for (const definition of Object.values(NOMINAL_METRIC_DEFINITIONS)) {
    const keyPrefix = String(definition.keyPrefix || definition.prefix || "").toUpperCase();
    const displayPrefix = String(definition.displayPrefix || keyPrefix);
    if (keyPrefix && metricKey.startsWith(keyPrefix)) {
      return metricKey.replace(keyPrefix, displayPrefix);
    }
  }
  return metricKey;
}

function normalizeMetricKey(metric) {
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

function evaluateTolerance(value, tolerance) {
  if (!tolerance) {
    return { pass: false };
  }
  const numeric = parseNumericValue(value);
  if (!Number.isFinite(numeric)) {
    return { pass: false };
  }
  return {
    pass: numeric >= tolerance.min && numeric <= tolerance.max,
  };
}

function parseNumericValue(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) {
    return Number.NaN;
  }
  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return Number.NaN;
  }
  return Number(match[0]);
}

function formatToleranceValue(value, unit = "", significantDigits = 5) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const numberText = formatCompactNumber(value, significantDigits);
  return unit ? `${numberText}${unit}` : numberText;
}

function formatCompactNumber(value, significantDigits = 5) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const safeDigits = Math.max(1, Number(significantDigits) || 5);
  const absolute = Math.abs(value);
  let scaled = value;
  let suffix = "";

  if (absolute >= 1000) {
    scaled = value / 1000;
    suffix = "k";
  }

  const scaledAbs = Math.abs(scaled);
  const digitsBeforeDecimal =
    scaledAbs > 0 ? Math.floor(Math.log10(scaledAbs)) + 1 : 1;
  const decimals = Math.max(0, safeDigits - digitsBeforeDecimal);
  const fixed = scaled.toFixed(decimals);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
  return `${trimmed}${suffix}`;
}

function shouldRenderNominalToleranceHeader(columns, hasGroupedHeader) {
  if (hasGroupedHeader || state.selectedType === "hist-events") {
    return false;
  }
  const safeColumns = Array.isArray(columns) ? columns : [];
  return NOMINAL_STATUS_COLUMNS.some((column) => safeColumns.includes(column));
}

function getNominalHeaderUnitLabel(columnName) {
  const column = String(columnName || "");
  const extraMetricDefinition = getExtraNominalMetricDefinitionByColumn(column);
  if (extraMetricDefinition?.unitLabel) {
    return extraMetricDefinition.unitLabel;
  }
  return column;
}

function getNominalHeaderToleranceLabel(columnName) {
  const column = String(columnName || "");
  const extraMetricDefinition = getExtraNominalMetricDefinitionByColumn(column);
  if (extraMetricDefinition?.key) {
    return getToleranceRangeByMetricKey(extraMetricDefinition.key);
  }
  return "-";
}

function getToleranceRangeByPrefix(prefix, options = {}) {
  const includeUnits = Boolean(options?.includeUnits);
  const safePrefix = String(prefix || "").toUpperCase();
  if (safePrefix === "V") {
    return includeUnits ? "By class (V)" : "By class";
  }
  const ranges = Object.entries(METRIC_TOLERANCES || {})
    .filter(([metricKey, tolerance]) => {
      const normalized = normalizeMetricKey(metricKey);
      const isPhaseMetric =
        safePrefix === "V" ? /^V\d+$/.test(normalized) : /^A\d+$/.test(normalized);
      return isPhaseMetric && Number.isFinite(tolerance?.min) && Number.isFinite(tolerance?.max);
    })
    .map(([_metricKey, tolerance]) => {
      const unit = includeUnits ? (safePrefix === "A" ? "A" : "") : "";
      return `${formatToleranceValue(tolerance.min, unit)}-${formatToleranceValue(tolerance.max, unit)}`;
    });

  const uniqueRanges = Array.from(new Set(ranges));
  if (!uniqueRanges.length) {
    if (safePrefix === "A") {
      return "TBA";
    }
    return "-";
  }
  return uniqueRanges.length === 1 ? uniqueRanges[0] : uniqueRanges.join(", ");
}

function getToleranceRangeForVoltageClass(voltageClass, options = {}) {
  const includeUnits = Boolean(options?.includeUnits);
  const unit = includeUnits ? "V" : "";
  const tolerance = getVoltageToleranceForClass(voltageClass);
  if (!Number.isFinite(tolerance?.min) || !Number.isFinite(tolerance?.max)) {
    return "-";
  }
  return `${formatToleranceValue(tolerance.min, unit)}-${formatToleranceValue(tolerance.max, unit)}`;
}

function getToleranceRangeByMetricKey(metricKey, options = {}) {
  const activeDeviceRange = getActiveDeviceToleranceRange(metricKey, options);
  if (activeDeviceRange) {
    return activeDeviceRange;
  }

  const includeUnits = Boolean(options?.includeUnits);
  const unit = includeUnits ? getToleranceUnitByMetricKey(metricKey) : "";
  const tolerance = getMetricTolerance(metricKey);
  if (!Number.isFinite(tolerance?.min) || !Number.isFinite(tolerance?.max)) {
    return "-";
  }
  return `${formatToleranceValue(tolerance.min, unit)}-${formatToleranceValue(tolerance.max, unit)}`;
}

function getActiveDeviceToleranceRange(metricKey, options = {}) {
  const safeMetricKey = normalizeMetricKey(metricKey);
  const includeUnits = Boolean(options?.includeUnits);
  const unit = includeUnits ? getToleranceUnitByMetricKey(safeMetricKey) : "";
  const deviceIds = Array.from(
    new Set(
      (Array.isArray(state.latestDeviceTables) ? state.latestDeviceTables : [])
        .map((deviceTable) => String(deviceTable?.deviceId || ""))
        .filter(Boolean)
    )
  );

  if (!deviceIds.length) {
    return "";
  }

  const ranges = [];
  let hasOverride = false;

  deviceIds.forEach((deviceId) => {
    const override = state.thresholdOverridesByDevice?.[deviceId]?.[safeMetricKey];
    if (Number.isFinite(override?.min) && Number.isFinite(override?.max)) {
      hasOverride = true;
    }

    const tolerance = getMetricTolerance(safeMetricKey, { deviceId });
    if (!Number.isFinite(tolerance?.min) || !Number.isFinite(tolerance?.max)) {
      return;
    }
    ranges.push(
      `${formatToleranceValue(tolerance.min, unit)}-${formatToleranceValue(tolerance.max, unit)}`
    );
  });

  if (!hasOverride || !ranges.length) {
    return "";
  }

  const uniqueRanges = Array.from(new Set(ranges));
  return uniqueRanges.length === 1 ? uniqueRanges[0] : "Device-specific";
}

function getToleranceUnitByMetricKey(metricKey) {
  const normalizedKey = String(metricKey || "").trim().toUpperCase();
  if (normalizedKey === "TOP_OIL_TEMPERATURE" || normalizedKey === "WINDING_TEMPERATURE") {
    return "degC";
  }
  if (
    normalizedKey === "LOAD_PERCENT" ||
    normalizedKey === "V_UNBALANCE" ||
    normalizedKey === "A_UNBALANCE"
  ) {
    return "%";
  }
  return "";
}

function shouldUseTwoRowToleranceHeader(columns) {
  return shouldRenderNominalToleranceHeader(columns, false);
}

function buildTwoRowHeaderContent(columns) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  return {
    unitRow: safeColumns.map((column) => getNominalHeaderUnitLabel(column)),
    toleranceRow: safeColumns.map((column) => getNominalHeaderToleranceLabel(column)),
  };
}

function getRequirementToleranceLegendRows() {
  return [
    {
      metric: "Top Oil Temperature",
      requirement: "Measured value must stay within the transformer top oil limit.",
      tolerance: getToleranceRangeByMetricKey("TOP_OIL_TEMPERATURE", { includeUnits: true }),
    },
    {
      metric: "Winding Temperature",
      requirement: "Measured value must stay within the transformer winding limit.",
      tolerance: getToleranceRangeByMetricKey("WINDING_TEMPERATURE", { includeUnits: true }),
    },
    {
      metric: "Load %",
      requirement: "Measured transformer loading must remain within rated capacity.",
      tolerance: getToleranceRangeByMetricKey("LOAD_PERCENT", { includeUnits: true }),
    },
    {
      metric: "Transformation Ratio",
      requirement: "Calculated from mapped HT/LV devices using average phase voltage for each side.",
      tolerance: getToleranceRangeByMetricKey("TRANSFORMATION_RATIO", { includeUnits: true }),
    },
    {
      metric: "V Unbalance",
      requirement: "Measured value must stay within tolerance range.",
      tolerance: getToleranceRangeByMetricKey("V_UNBALANCE", { includeUnits: true }),
    },
    {
      metric: "A Unbalance",
      requirement: "Measured value must stay within tolerance range.",
      tolerance: getToleranceRangeByMetricKey("A_UNBALANCE", { includeUnits: true }),
    },
    {
      metric: "Power Factor",
      requirement: "Measured value must stay within tolerance range.",
      tolerance: getToleranceRangeByMetricKey("POWER_FACTOR", { includeUnits: true }),
    },
  ];
}

function renderDateTabs() {
  if (!dateTabs) {
    return;
  }

  dateTabs.innerHTML = "";
  dateTabs.classList.add("hidden");
}

function buildMergedCellSpanMap(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  if (state.selectedType === "hist-events" || !safeColumns.includes("Substation")) {
    return {};
  }

  const spanMap = {
    Substation: {},
  };
  let rowIndex = 0;

  while (rowIndex < safeRows.length) {
    const currentValue = String(safeRows[rowIndex]?.Substation ?? "");
    let span = 1;
    while (
      rowIndex + span < safeRows.length &&
      String(safeRows[rowIndex + span]?.Substation ?? "") === currentValue
    ) {
      span += 1;
    }

    spanMap.Substation[rowIndex] = span;
    for (let offset = 1; offset < span; offset += 1) {
      spanMap.Substation[rowIndex + offset] = 0;
    }
    rowIndex += span;
  }

  return spanMap;
}

function renderTable(
  rows,
  columnsOverride = null,
  columnGroupsOverride = null,
  cellClassesOverride = null
) {
  reportTableHead.innerHTML = "";
  reportTableBody.innerHTML = "";
  state.latestReportRows = rows;
  state.latestReportColumns = columnsOverride || (rows.length ? Object.keys(rows[0]) : []);
  state.latestColumnGroups = columnGroupsOverride || [];
  state.latestCellClasses = cellClassesOverride || {};
  updateExportAvailability();

  if (!rows.length) {
    const colSpan = Math.max(1, state.latestReportColumns.length);
    reportTableBody.innerHTML = `<tr class="empty-row"><td colspan="${colSpan}">No report rows yet. Select devices and click "Generate Report".</td></tr>`;
    return;
  }

  const columns = state.latestReportColumns;
  const groupStartIndexes = new Set(state.latestColumnGroups.map((group) => group.start));
  const groupEndIndexes = new Set(state.latestColumnGroups.map((group) => group.end));
  const hasGroupedHeader = state.latestColumnGroups.length > 0;
  const mergedCellSpanMap = buildMergedCellSpanMap(rows, columns);

  if (hasGroupedHeader) {
    const topHeaderRow = document.createElement("tr");
    const childHeaderRow = document.createElement("tr");
    const firstGroupStart = state.latestColumnGroups[0].start;

    for (let columnIndex = 0; columnIndex < firstGroupStart; columnIndex += 1) {
      const th = document.createElement("th");
      th.textContent = columns[columnIndex];
      th.rowSpan = 2;
      topHeaderRow.appendChild(th);
    }

    state.latestColumnGroups.forEach((group) => {
      const groupHeader = document.createElement("th");
      groupHeader.textContent = group.id;
      groupHeader.colSpan = group.end - group.start + 1;
      groupHeader.classList.add("group-parent", "group-start", "group-end");
      topHeaderRow.appendChild(groupHeader);

      (group.subHeaders || []).forEach((label, offset) => {
        const columnIndex = group.start + offset;
        const th = document.createElement("th");
        th.textContent = label || columns[columnIndex];
        if (groupStartIndexes.has(columnIndex)) {
          th.classList.add("group-start");
        }
        if (groupEndIndexes.has(columnIndex)) {
          th.classList.add("group-end");
        }
        childHeaderRow.appendChild(th);
      });
    });

    reportTableHead.appendChild(topHeaderRow);
    reportTableHead.appendChild(childHeaderRow);
  } else if (shouldRenderNominalToleranceHeader(columns, hasGroupedHeader)) {
    const unitHeaderRow = document.createElement("tr");
    const toleranceHeaderRow = document.createElement("tr");

    columns.forEach((column, columnIndex) => {
      const unitTh = document.createElement("th");
      unitTh.textContent = getNominalHeaderUnitLabel(column);
      if (groupStartIndexes.has(columnIndex)) {
        unitTh.classList.add("group-start");
      }
      if (groupEndIndexes.has(columnIndex)) {
        unitTh.classList.add("group-end");
      }
      unitHeaderRow.appendChild(unitTh);

      const toleranceTh = document.createElement("th");
      toleranceTh.textContent = getNominalHeaderToleranceLabel(column);
      toleranceTh.classList.add("tolerance-header");
      if (groupStartIndexes.has(columnIndex)) {
        toleranceTh.classList.add("group-start");
      }
      if (groupEndIndexes.has(columnIndex)) {
        toleranceTh.classList.add("group-end");
      }
      toleranceHeaderRow.appendChild(toleranceTh);
    });

    reportTableHead.appendChild(unitHeaderRow);
    reportTableHead.appendChild(toleranceHeaderRow);
  } else {
    const headerRow = document.createElement("tr");
    columns.forEach((column, columnIndex) => {
      const th = document.createElement("th");
      th.textContent = column;
      if (groupStartIndexes.has(columnIndex)) {
        th.classList.add("group-start");
      }
      if (groupEndIndexes.has(columnIndex)) {
        th.classList.add("group-end");
      }
      headerRow.appendChild(th);
    });
    reportTableHead.appendChild(headerRow);
  }

  rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    const rowClass = state.latestCellClasses?.[rowIndex]?._row;
    if (rowClass) {
      tr.classList.add(...String(rowClass).split(/\s+/).filter(Boolean));
    }
    columns.forEach((column, columnIndex) => {
      const rowSpan = mergedCellSpanMap?.[column]?.[rowIndex];
      if (rowSpan === 0) {
        return;
      }
      const td = document.createElement("td");
      const value = row[column];
      td.textContent = value === null || value === undefined ? "" : String(value);
      if (Number.isFinite(rowSpan) && rowSpan > 1) {
        td.rowSpan = rowSpan;
      }
      if (groupStartIndexes.has(columnIndex)) {
        td.classList.add("group-start");
      }
      if (groupEndIndexes.has(columnIndex)) {
        td.classList.add("group-end");
      }
      const cellClass = state.latestCellClasses?.[rowIndex]?.[column];
      if (cellClass) {
        td.classList.add(...String(cellClass).split(/\s+/).filter(Boolean));
      }
      if (column === "Device" && tr.classList.contains("row-compliant")) {
        td.classList.add("device-compliant");
      }
      tr.appendChild(td);
    });
    reportTableBody.appendChild(tr);
  });
}

function updateExportAvailability() {
  exportReportButton.disabled = !state.latestReportRows.length;
}

async function onExportReport() {
  if (!state.latestReportRows.length) {
    setStatus("No rows available to export.", true);
    return;
  }

  const format = exportFormatSelect.value;
  try {
    if (format === "csv") {
      exportCsv();
    } else if (format === "xlsx") {
      await exportExcel();
    } else if (format === "pdf") {
      exportPdf();
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
    setStatus(`Export complete: ${format.toUpperCase()}`);
  } catch (error) {
    setStatus(`Export failed. ${error.message}`, true);
  }
}

function getExportFileBaseName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const projectSegment = state.projectName || "project";
  return `${projectSegment}-report-${state.selectedType}-${state.selectedTimeRange}-${timestamp}`;
}

function exportCsv() {
  const datasets = buildRenderedTableDatasets();
  if (!datasets.length) {
    throw new Error("No device data available for CSV export.");
  }

  const dataset = datasets[0];
  const lines = [
    dataset.columns.map((column) => csvEscape(column)).join(","),
    ...dataset.rows.map((row) => dataset.columns.map((column) => csvEscape(row[column])).join(",")),
  ];
  downloadBlob(
    lines.join("\r\n"),
    "text/csv;charset=utf-8;",
    `${getExportFileBaseName()}.csv`
  );
}

async function exportExcel() {
  const datasets = buildRenderedTableDatasets();
  if (!datasets.length) {
    throw new Error("No device data available for Excel export.");
  }
  const exportDatasets = buildDatasetsWithNonCompliantAppendix(datasets[0]);

  if (window.ExcelJS && window.ExcelJS.Workbook) {
    await exportExcelWithStyles(exportDatasets);
    return;
  }

  if (!window.XLSX) {
    throw new Error("Excel library not loaded.");
  }

  const workbook = window.XLSX.utils.book_new();
  exportDatasets.forEach((dataset, index) => {
    const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
    const useTwoRowHeader = shouldUseTwoRowToleranceHeader(columns);
    const headerContent = buildTwoRowHeaderContent(columns);
    const bodyRows = (Array.isArray(dataset.rows) ? dataset.rows : []).map((row) =>
      columns.map((column) => row?.[column] ?? "")
    );
    const legendRows = getRequirementToleranceLegendRows().map((item) => [
      item.metric,
      item.requirement,
      item.tolerance,
    ]);
    const worksheet = useTwoRowHeader
      ? window.XLSX.utils.aoa_to_sheet([
          headerContent.unitRow,
          headerContent.toleranceRow,
          ...bodyRows,
          ...Array.from({ length: LEGEND_GAP_ROWS }, () => []),
          ["Requirement/Tolerance Legend"],
          ["Metric", "Requirement", "Tolerance"],
          ...legendRows,
        ])
      : window.XLSX.utils.json_to_sheet(dataset.rows, { header: columns });
    const fallbackName = `Device ${index + 1}`;
    window.XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      toSafeSheetName(dataset.label || dataset.deviceId || fallbackName)
    );
  });
  window.XLSX.writeFile(workbook, `${getExportFileBaseName()}.xlsx`);
}

function buildRenderedTableDatasets() {
  const columns = Array.isArray(state.latestReportColumns) ? state.latestReportColumns : [];
  const rows = Array.isArray(state.latestReportRows) ? state.latestReportRows : [];
  if (!columns.length || !rows.length) {
    return [];
  }

  const exportRows = rows.map((row, rowIndex) => {
    const exportRow = {};
    columns.forEach((column) => {
      exportRow[column] = row?.[column] ?? "";
    });
    const rowCellClasses = {
      ...(state.latestCellClasses?.[rowIndex] || {}),
    };
    if (
      columns.includes("Device") &&
      String(rowCellClasses._row || "")
        .split(/\s+/)
        .includes("row-compliant")
    ) {
      rowCellClasses.Device = appendCssClassName(rowCellClasses.Device, "device-compliant");
    }
    exportRow._cellClasses = rowCellClasses;
    return exportRow;
  });

  const reportLabel = state.selectedType === "hist-events"
    ? `${state.projectName || "Report"} - ${state.activeDeviceTab || "Events"}`
    : `${state.projectName || "Report"} - Summary`;

  return [
    {
      deviceId: state.activeDeviceTab || "report",
      label: reportLabel,
      columns,
      rows: exportRows,
    },
  ];
}

function buildDatasetsWithNonCompliantAppendix(primaryDataset) {
  const mainDataset = primaryDataset || null;
  if (!mainDataset) {
    return [];
  }

  const appendixDataset = buildNonCompliantOnlyDataset(mainDataset);
  if (!appendixDataset) {
    return [mainDataset];
  }
  return [mainDataset, appendixDataset];
}

function buildNonCompliantOnlyDataset(primaryDataset) {
  const columns = Array.isArray(primaryDataset?.columns) ? primaryDataset.columns : [];
  const rows = Array.isArray(primaryDataset?.rows) ? primaryDataset.rows : [];
  if (!columns.length || !hasNonCompliantColumns(columns)) {
    return null;
  }

  const filteredRows = rows
    .filter((row) => isNonCompliantRow(row, columns))
    .map((row) => ({
      ...row,
      _cellClasses: row?._cellClasses || {},
    }));

  const nonCompliantRows = filteredRows.length
    ? filteredRows
    : [buildEmptyMessageRow(columns, "No non-compliant rows.")];

  return {
    deviceId: `${primaryDataset.deviceId || "report"}-non-compliant`,
    label: `${primaryDataset.label || "Report"} - Non-Compliant`,
    columns: [...columns],
    rows: nonCompliantRows,
  };
}

function hasNonCompliantColumns(columns) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  return NOMINAL_STATUS_COLUMNS.some((column) => safeColumns.includes(column));
}

function isNonCompliantRow(row, columns) {
  const safeRow = row || {};
  const safeColumns = Array.isArray(columns) ? columns : [];
  const rowCellClasses = safeRow?._cellClasses || {};
  return NOMINAL_STATUS_COLUMNS.some((column) => {
    if (!safeColumns.includes(column)) {
      return false;
    }
    const className = String(rowCellClasses[column] || "").trim();
    return className.split(/\s+/).includes("value-fail");
  });
}

function buildEmptyMessageRow(columns, message) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const row = {};
  safeColumns.forEach((column, index) => {
    row[column] = index === 0 ? String(message || "") : "";
  });
  row._cellClasses = {};
  return row;
}

function buildExcelDatasetsFromRenderedTable() {
  const datasets = buildRenderedTableDatasets();
  if (!datasets.length) {
    return [];
  }
  return buildDatasetsWithNonCompliantAppendix(datasets[0]);
}

async function exportExcelWithStyles(datasets) {
  const workbook = new window.ExcelJS.Workbook();
  datasets.forEach((dataset, index) => {
    const fallbackName = `Device ${index + 1}`;
    const worksheet = workbook.addWorksheet(
      toSafeSheetName(dataset.label || dataset.deviceId || fallbackName)
    );

    const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
    const useTwoRowHeader = shouldUseTwoRowToleranceHeader(columns);
    worksheet.columns = columns.map((column) => ({
      key: column,
      width: Math.max(14, Math.min(60, String(column).length + 6)),
    }));

    let headerRowCount = 1;
    if (useTwoRowHeader) {
      const headerContent = buildTwoRowHeaderContent(columns);
      const unitHeaderRow = worksheet.addRow(headerContent.unitRow);
      const toleranceHeaderRow = worksheet.addRow(headerContent.toleranceRow);
      styleExcelHeaderRow(unitHeaderRow, false);
      styleExcelHeaderRow(toleranceHeaderRow, true);
      headerRowCount = 2;
    } else {
      const headerRow = worksheet.addRow(columns);
      styleExcelHeaderRow(headerRow, false);
    }

    dataset.rows.forEach((row) => {
      const rowValues = {};
      columns.forEach((column) => {
        rowValues[column] = row[column] ?? "";
      });
      const excelRow = worksheet.addRow(rowValues);
      columns.forEach((column, columnIndex) => {
        const cell = excelRow.getCell(columnIndex + 1);
        applyExcelCellStyle(cell, row?._cellClasses?.[column]);
      });
    });

    mergeExcelSubstationCells(worksheet, columns, headerRowCount, dataset.rows);

    if (useTwoRowHeader) {
      appendExcelRequirementLegend(worksheet);
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowCount) {
        return;
      }
      row.eachCell((cell) => {
        if (!cell.border) {
          cell.border = {
            bottom: { style: "thin", color: { argb: "FFE3E8F1" } },
          };
        }
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `${getExportFileBaseName()}.xlsx`
  );
}

function mergeExcelSubstationCells(worksheet, columns, headerRowCount, rows) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const substationColumnIndex = safeColumns.indexOf("Substation");
  if (substationColumnIndex < 0 || !safeRows.length) {
    return;
  }

  let startIndex = 0;
  while (startIndex < safeRows.length) {
    const currentValue = String(safeRows[startIndex]?.Substation ?? "");
    let span = 1;
    while (
      startIndex + span < safeRows.length &&
      String(safeRows[startIndex + span]?.Substation ?? "") === currentValue
    ) {
      span += 1;
    }

    if (span > 1) {
      const firstRowNumber = headerRowCount + startIndex + 1;
      const lastRowNumber = firstRowNumber + span - 1;
      const excelColumnNumber = substationColumnIndex + 1;
      worksheet.mergeCells(firstRowNumber, excelColumnNumber, lastRowNumber, excelColumnNumber);
      worksheet.getCell(firstRowNumber, excelColumnNumber).alignment = {
        vertical: "middle",
        horizontal: "left",
      };
    }

    startIndex += span;
  }
}

function styleExcelHeaderRow(row, isToleranceRow = false) {
  row.font = {
    bold: true,
    color: { argb: isToleranceRow ? "FF5B6472" : "FF1F2937" },
  };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isToleranceRow ? "FFF3F6FB" : "FFF3F4F6" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD2D8E3" } },
      left: { style: "thin", color: { argb: "FFD2D8E3" } },
      bottom: { style: "thin", color: { argb: "FFD2D8E3" } },
      right: { style: "thin", color: { argb: "FFD2D8E3" } },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
}

function appendExcelRequirementLegend(worksheet) {
  for (let index = 0; index < LEGEND_GAP_ROWS; index += 1) {
    worksheet.addRow([]);
  }

  const titleRow = worksheet.addRow([]);
  titleRow.getCell(1).value = "Requirement/Tolerance Legend";
  titleRow.getCell(1).font = { bold: true, color: { argb: "FF1F2937" } };

  const headerRow = worksheet.addRow([]);
  headerRow.getCell(1).value = "Metric";
  headerRow.getCell(2).value = "Requirement";
  headerRow.getCell(3).value = "Tolerance";
  styleExcelHeaderRow(headerRow, false);

  getRequirementToleranceLegendRows().forEach((item) => {
    const row = worksheet.addRow([]);
    row.getCell(1).value = item.metric;
    row.getCell(2).value = item.requirement;
    row.getCell(3).value = item.tolerance;
    for (let cellIndex = 1; cellIndex <= 3; cellIndex += 1) {
      const cell = row.getCell(cellIndex);
      cell.border = {
        top: { style: "thin", color: { argb: "FFE3E8F1" } },
        left: { style: "thin", color: { argb: "FFE3E8F1" } },
        bottom: { style: "thin", color: { argb: "FFE3E8F1" } },
        right: { style: "thin", color: { argb: "FFE3E8F1" } },
      };
    }
  });
}

function applyExcelCellStyle(cell, cssClassName) {
  const resolvedStyle = getConditionalCellStyle(cssClassName);
  if (!resolvedStyle) {
    return;
  }

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: resolvedStyle.excelFill },
  };
  cell.font = {
    color: { argb: resolvedStyle.excelFont },
    bold: Boolean(resolvedStyle.bold),
  };
}

function getConditionalCellStyle(cssClassName) {
  const styleMap = {
    "device-compliant": {
      excelFill: "FFDCFCE7",
      excelFont: "FF166534",
      pdfFill: [220, 252, 231],
      pdfText: [22, 101, 52],
      bold: true,
    },
    "value-pass": {
      excelFill: "FFEDFDF3",
      excelFont: "FF166534",
      pdfFill: [237, 253, 243],
      pdfText: [22, 101, 52],
      bold: true,
    },
    "value-fail": {
      excelFill: "FFFEF2F2",
      excelFont: "FFB42318",
      pdfFill: [254, 242, 242],
      pdfText: [180, 35, 24],
      bold: true,
    },
    "remark-pass": {
      excelFill: "FFDCFCE7",
      excelFont: "FF166534",
      pdfFill: [220, 252, 231],
      pdfText: [22, 101, 52],
      bold: true,
    },
    "remark-fail": {
      excelFill: "FFFEE2E2",
      excelFont: "FFB42318",
      pdfFill: [254, 226, 226],
      pdfText: [180, 35, 24],
      bold: true,
    },
  };

  const classNames = String(cssClassName || "")
    .split(/\s+/)
    .map((className) => className.trim())
    .filter(Boolean);
  for (const className of classNames) {
    if (styleMap[className]) {
      return styleMap[className];
    }
  }
  return null;
}

function appendCssClassName(existingClassName, nextClassName) {
  const classNames = new Set(
    String(existingClassName || "")
      .split(/\s+/)
      .map((className) => className.trim())
      .filter(Boolean)
  );
  if (String(nextClassName || "").trim()) {
    classNames.add(String(nextClassName).trim());
  }
  return Array.from(classNames).join(" ");
}

function buildExportDatasetsByDevice() {
  const deviceTables = Array.isArray(state.latestDeviceTables) ? state.latestDeviceTables : [];
  if (!deviceTables.length) {
    return [];
  }

  const includeDate = shouldIncludeDateColumn();

  if (state.selectedType === "hist-events") {
    return deviceTables.map((deviceTable) => ({
      deviceId: deviceTable.deviceId,
      label: deviceTable.label,
      columns: includeDate ? ["Date", "Time", "Event"] : ["Time", "Event"],
      rows: buildEventExportRows(deviceTable.rows || []),
    }));
  }

  return deviceTables.map((deviceTable) => ({
    deviceId: deviceTable.deviceId,
    label: deviceTable.label,
    columns: getNominalReportColumns(includeDate),
    rows: buildNominalExportRows(deviceTable.rows || [], deviceTable, includeDate),
  }));
}

function buildEventExportRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const exportRows = [];
  let previousDateKey = "";

  safeRows.forEach((row) => {
    const capturedAt = row?._capturedAt || row?.Date || "";
    const currentDateKey = getDateKey(capturedAt);
    if (previousDateKey && currentDateKey !== previousDateKey) {
      exportRows.push({
        Date: "",
        Time: "",
        Event: "",
      });
    }

    exportRows.push({
      Date: currentDateKey,
      Time: getTimeKey(capturedAt || row?.Time || ""),
      Event: row?.Event ?? "",
    });
    previousDateKey = currentDateKey;
  });

  return exportRows;
}

function buildNominalExportRows(rows, deviceTable = null, includeDate = true) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return [];
  }

  const byDate = new Map();
  safeRows.forEach((row) => {
    const dateKey = getDateKey(row?._capturedAt || row?.Date || "");
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey).push(row);
  });

  const sortedDates = Array.from(byDate.keys()).sort((left, right) =>
    String(left).localeCompare(String(right))
  );
  const exportRows = [];
  const deviceId = deviceTable?.deviceId || "";
  const deviceLabel = deviceTable?.label || deviceTable?.deviceId || "";
  const substationLabel = deviceTable?.substation || getDeviceSubstation(deviceId);

  sortedDates.forEach((dateKey) => {
    const complianceRow = buildNominalDeviceComplianceRow(
      deviceId,
      deviceLabel,
      substationLabel,
      byDate.get(dateKey) || [],
      state.latestDatasetColumns,
      new Map([[deviceId, byDate.get(dateKey) || []]])
    );
    if (!complianceRow) {
      return;
    }

    const exportRow = {
      Substation: complianceRow.row?.Substation ?? substationLabel,
      Device: complianceRow.row?.Device ?? deviceLabel,
      "Top Oil Temperature": complianceRow.row?.["Top Oil Temperature"] ?? "",
      "Winding Temperature": complianceRow.row?.["Winding Temperature"] ?? "",
      "Load %": complianceRow.row?.["Load %"] ?? "",
      "Transformation Ratio": complianceRow.row?.["Transformation Ratio"] ?? "",
      "V Unbalance": complianceRow.row?.["V Unbalance"] ?? "",
      "A Unbalance": complianceRow.row?.["A Unbalance"] ?? "",
      "Power Factor": complianceRow.row?.["Power Factor"] ?? "",
      _cellClasses: complianceRow.cellClasses || {},
    };
    if (includeDate) {
      exportRow.Date = dateKey;
    }
    exportRows.push(exportRow);
  });

  return exportRows;
}

function toSafeSheetName(value) {
  const text = String(value ?? "Sheet").replace(/[\\/*?:[\]]/g, " ").trim();
  if (!text) {
    return "Sheet";
  }
  return text.slice(0, 31);
}

function toSafeFileSegment(value) {
  const text = String(value ?? "device").replace(/[<>:\"/\\|?*\x00-\x1F]/g, " ").trim();
  if (!text) {
    return "device";
  }
  return text.replace(/\s+/g, "-");
}

function exportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("PDF library not loaded.");
  }

  const datasets = buildRenderedTableDatasets();
  if (!datasets.length) {
    throw new Error("No device data available for PDF export.");
  }
  const exportDatasets = buildDatasetsWithNonCompliantAppendix(datasets[0]);

  if (typeof window.jspdf.jsPDF.API?.autoTable !== "function") {
    throw new Error("PDF table plugin not loaded.");
  }

  const doc = new window.jspdf.jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  exportDatasets.forEach((dataset, index) => {
    if (index > 0) {
      doc.addPage("a4", "portrait");
    }
    const columns = dataset.columns || [];
    const rows = dataset.rows || [];
    const useTwoRowHeader = shouldUseTwoRowToleranceHeader(columns);
    const headerContent = buildTwoRowHeaderContent(columns);
    const headerRows = useTwoRowHeader
      ? [headerContent.unitRow, headerContent.toleranceRow]
      : [columns];

    doc.setFontSize(10);
    doc.text(`Report (${state.selectedType}, ${state.selectedTimeRange})`, 18, 18);
    doc.setFontSize(8);
    doc.text(`View: ${dataset.label || dataset.deviceId || "Report"}`, 18, 30);

    doc.autoTable({
      head: headerRows,
      body: rows.map((row) =>
        columns.map((column) => (row[column] === null || row[column] === undefined ? "" : String(row[column])))
      ),
      startY: 36,
      margin: { top: 18, right: 18, bottom: 14, left: 18 },
      tableWidth: "auto",
      styles: {
        fontSize: 6,
        cellPadding: { top: 1, right: 1.6, bottom: 1, left: 1.6 },
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        overflow: "linebreak",
        cellWidth: "auto",
        minCellHeight: 9.8,
      },
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        fontSize: 6.2,
        cellPadding: { top: 1.2, right: 1.6, bottom: 1.2, left: 1.6 },
      },
      columnStyles: getPdfColumnStyles(columns),
      didParseCell: (hookData) => {
        if (hookData.section === "head" && useTwoRowHeader && hookData.row.index === 1) {
          hookData.cell.styles.fillColor = [243, 246, 251];
          hookData.cell.styles.textColor = [91, 100, 114];
          hookData.cell.styles.fontStyle = "bold";
          return;
        }

        if (hookData.section !== "body") {
          return;
        }

        const rowData = rows[hookData.row.index] || {};
        const columnName = columns[hookData.column.index];
        const cssClassName = rowData?._cellClasses?.[columnName];
        const resolvedStyle = getConditionalCellStyle(cssClassName);
        if (!resolvedStyle) {
          return;
        }

        hookData.cell.styles.fillColor = resolvedStyle.pdfFill;
        hookData.cell.styles.textColor = resolvedStyle.pdfText;
        if (resolvedStyle.bold) {
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });

    if (useTwoRowHeader) {
      const pageHeight = doc.internal.pageSize.getHeight();
      let legendStartY = (doc.lastAutoTable?.finalY || 36) + LEGEND_GAP_ROWS * 10;
      if (legendStartY > pageHeight - 120) {
        doc.addPage("a4", "portrait");
        legendStartY = 36;
      }

      const legendRows = getRequirementToleranceLegendRows().map((item) => [
        item.metric,
        item.requirement,
        item.tolerance,
      ]);
      doc.setFontSize(8);
      doc.text("Requirement/Tolerance Legend", 18, legendStartY - 6);
      doc.autoTable({
        head: [["Metric", "Requirement", "Tolerance"]],
        body: legendRows,
        startY: legendStartY,
        margin: { top: 18, right: 18, bottom: 14, left: 18 },
        tableWidth: "auto",
        styles: {
          fontSize: 6.2,
          cellPadding: { top: 1.2, right: 1.6, bottom: 1.2, left: 1.6 },
          lineColor: [226, 232, 240],
          lineWidth: 0.25,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: [255, 255, 255],
          fontSize: 6.4,
        },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 300 },
          2: { cellWidth: 90 },
        },
      });
    }
  });

  doc.save(`${getExportFileBaseName()}.pdf`);
}

function getPdfColumnStyles(columns) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const styles = {};

  if (safeColumns.includes("Power Factor")) {
    safeColumns.forEach((_column, index) => {
      styles[index] = {
        cellWidth: "auto",
        overflow: "linebreak",
      };
    });
    return styles;
  }

  if (safeColumns.includes("Event")) {
    const widthByColumn = {
      Date: 60,
      Time: 54,
      Event: "auto",
    };
    safeColumns.forEach((column, index) => {
      styles[index] = {
        cellWidth: widthByColumn[column] || "auto",
        overflow: "linebreak",
      };
    });
    return styles;
  }

  safeColumns.forEach((_column, index) => {
    styles[index] = {
      cellWidth: "auto",
      overflow: "linebreak",
    };
  });
  return styles;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}
