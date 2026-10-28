const fs = require("fs");
const path = require("path");

const STORE_VERSION = 2;
const REPORT_LINK_RANGES = new Set([
  "today",
  "yesterday",
  "last7",
  "last30",
  "last365",
  "lastyear",
  "custom",
]);
const REPORT_LINK_TYPES = new Set(["histvalues", "hist-events"]);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

class MetadataStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.backupPath = `${this.filePath}.bak`;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      return normalizeStore(JSON.parse(await fs.promises.readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") {
        try {
          const backup = normalizeStore(
            JSON.parse(await fs.promises.readFile(this.backupPath, "utf8"))
          );
          await this.writeAtomic(backup, { preserveBackup: true });
          return backup;
        } catch (backupError) {
          if (backupError.code === "ENOENT") return createEmptyStore();
          throw new Error(`Metadata backup could not be recovered: ${backupError.message}`);
        }
      }
      if (error instanceof SyntaxError) {
        try {
          const backup = normalizeStore(
            JSON.parse(await fs.promises.readFile(this.backupPath, "utf8"))
          );
          await this.writeAtomic(backup, { preserveBackup: true });
          return backup;
        } catch (backupError) {
          throw new Error(
            `Metadata is invalid and its backup could not be recovered: ${backupError.message}`
          );
        }
      }
      throw error;
    }
  }

  async mutate(mutator) {
    const nextWrite = this.writeQueue.then(async () => {
      const store = await this.read();
      const result = await mutator(store);
      await this.writeAtomic(store);
      return result;
    });
    this.writeQueue = nextWrite.catch(() => {});
    return nextWrite;
  }

  async writeAtomic(store, options = {}) {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const normalized = normalizeStore(store);
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

    let movedCurrentToBackup = false;
    try {
      if (!options.preserveBackup && await pathExists(this.filePath)) {
        await fs.promises.rm(this.backupPath, { force: true });
        await fs.promises.rename(this.filePath, this.backupPath);
        movedCurrentToBackup = true;
      } else if (await pathExists(this.filePath)) {
        await fs.promises.rm(this.filePath, { force: true });
      }
      await fs.promises.rename(temporaryPath, this.filePath);
    } catch (error) {
      if (movedCurrentToBackup && !(await pathExists(this.filePath))) {
        await fs.promises.copyFile(this.backupPath, this.filePath).catch(() => {});
      }
      throw error;
    } finally {
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  async verify() {
    const store = await this.read();
    return { version: store.version, path: this.filePath };
  }

  async getProject(projectName) {
    return buildProjectPayload(normalizeProjectName(projectName), await this.read());
  }

  async createSubstation(projectName, name) {
    const project = normalizeProjectName(projectName);
    const safeName = requiredText(name, "Substation name");
    return this.mutate((store) => {
      const exists = store.substations.some(
        (row) => row.project_name === project && row.name === safeName
      );
      if (!exists) {
        store.substations.push(newNamedRow(store.substations, project, safeName));
      }
      return buildProjectPayload(project, store);
    });
  }

  async deleteSubstation(projectName, substationId) {
    const project = normalizeProjectName(projectName);
    const id = requiredText(substationId, "Substation ID");
    return this.mutate((store) => {
      store.substations = store.substations.filter(
        (row) => !(row.project_name === project && String(row.id) === id)
      );
      store.deviceSubstationMappings = store.deviceSubstationMappings.filter(
        (row) => !(row.project_name === project && String(row.substation_id) === id)
      );
      store.reportLinks = store.reportLinks.filter(
        (row) => !(row.project_name === project && row.group_type === "substation" && String(row.group_id) === id)
      );
      return buildProjectPayload(project, store);
    });
  }

  async updateSubstationAssignments(projectName, deviceIds, substationId, side) {
    const project = normalizeProjectName(projectName);
    const ids = normalizeDeviceIds(deviceIds);
    const groupId = String(substationId || "").trim();
    const electricalSide = validateElectricalSide(side);
    return this.mutate((store) => {
      if (groupId && !store.substations.some(
        (row) => row.project_name === project && String(row.id) === groupId
      )) {
        throw new HttpError(404, "Substation not found.");
      }
      store.deviceSubstationMappings = store.deviceSubstationMappings.filter(
        (row) => !(row.project_name === project && ids.includes(String(row.device_id)))
      );
      if (groupId) {
        ids.forEach((deviceId) => store.deviceSubstationMappings.push({
          project_name: project,
          device_id: deviceId,
          substation_id: groupId,
          side: electricalSide,
          updated_at: now(),
        }));
      }
      return buildProjectPayload(project, store);
    });
  }

  async createMainIntake(projectName, name) {
    const project = normalizeProjectName(projectName);
    const safeName = requiredText(name, "Main Intake name");
    return this.mutate((store) => {
      const exists = store.mainIntakes.some(
        (row) => row.project_name === project && row.name === safeName
      );
      if (!exists) {
        store.mainIntakes.push(newNamedRow(store.mainIntakes, project, safeName));
      }
      return buildProjectPayload(project, store);
    });
  }

  async deleteMainIntake(projectName, mainIntakeId) {
    const project = normalizeProjectName(projectName);
    const id = requiredText(mainIntakeId, "Main Intake ID");
    return this.mutate((store) => {
      store.mainIntakes = store.mainIntakes.filter(
        (row) => !(row.project_name === project && String(row.id) === id)
      );
      store.deviceMainIntakeMappings = store.deviceMainIntakeMappings.filter(
        (row) => !(row.project_name === project && String(row.main_intake_id) === id)
      );
      store.reportLinks = store.reportLinks.filter(
        (row) => !(row.project_name === project && row.group_type === "main-intake" && String(row.group_id) === id)
      );
      return buildProjectPayload(project, store);
    });
  }

  async updateMainIntakeAssignments(projectName, deviceIds, mainIntakeId, side) {
    const project = normalizeProjectName(projectName);
    const ids = normalizeDeviceIds(deviceIds);
    const groupId = String(mainIntakeId || "").trim();
    const electricalSide = validateElectricalSide(side);
    return this.mutate((store) => {
      if (groupId && !store.mainIntakes.some(
        (row) => row.project_name === project && String(row.id) === groupId
      )) {
        throw new HttpError(404, "Main Intake not found.");
      }
      store.deviceMainIntakeMappings = store.deviceMainIntakeMappings.filter(
        (row) => !(row.project_name === project && ids.includes(String(row.device_id)))
      );
      if (groupId) {
        ids.forEach((deviceId) => store.deviceMainIntakeMappings.push({
          project_name: project,
          device_id: deviceId,
          main_intake_id: groupId,
          side: electricalSide,
          updated_at: now(),
        }));
      }
      return buildProjectPayload(project, store);
    });
  }

  async updateDeviceLabel(projectName, deviceId, label) {
    const project = normalizeProjectName(projectName);
    const id = requiredText(deviceId, "Device ID");
    const safeLabel = String(label || "").trim();
    return this.mutate((store) => {
      store.deviceLabels = store.deviceLabels.filter(
        (row) => !(row.project_name === project && String(row.device_id) === id)
      );
      if (safeLabel) {
        store.deviceLabels.push({ project_name: project, device_id: id, label: safeLabel });
      }
      return buildProjectPayload(project, store);
    });
  }

  async replaceDeviceThresholds(projectName, thresholdsByDevice) {
    const project = normalizeProjectName(projectName);
    const normalized = normalizeThresholdsByDevice(thresholdsByDevice);
    return this.mutate((store) => {
      store.deviceThresholds = store.deviceThresholds.filter((row) => row.project_name !== project);
      Object.entries(normalized).forEach(([deviceId, thresholds]) => {
        store.deviceThresholds.push({
          project_name: project,
          device_id: deviceId,
          thresholds,
          updated_at: now(),
        });
      });
      return buildProjectPayload(project, store);
    });
  }

  async replaceTransformerMappings(projectName, mappings) {
    const project = normalizeProjectName(projectName);
    const normalized = normalizeTransformerMappings(project, mappings);
    return this.mutate((store) => {
      store.transformerMappings = store.transformerMappings.filter(
        (row) => row.project_name !== project
      );
      store.transformerMappings.push(...normalized);
      return buildProjectPayload(project, store);
    });
  }

  async listReportLinks(projectName) {
    const project = normalizeProjectName(projectName);
    const store = await this.read();
    return store.reportLinks
      .filter((row) => row.project_name === project)
      .map((row) => normalizeReportLinkOutput(row, findReportLinkGroup(store, row)))
      .sort((left, right) => left.slug.localeCompare(right.slug));
  }

  async getReportLink(slug, options = {}) {
    const safeSlug = normalizeReportLinkSlug(slug);
    const store = await this.read();
    const row = store.reportLinks.find((item) => item.slug === safeSlug);
    if (!row || (options.enabledOnly && !row.enabled)) {
      throw new HttpError(404, "Report link not found.");
    }
    const group = findReportLinkGroup(store, row);
    if (!group) {
      throw new HttpError(409, "The report link group no longer exists.");
    }
    return normalizeReportLinkOutput(row, group);
  }

  async createReportLink(input) {
    const link = normalizeReportLinkInput(input);
    return this.mutate((store) => {
      if (store.reportLinks.some((row) => row.slug === link.slug)) {
        throw new HttpError(409, `Report link "${link.slug}" already exists.`);
      }
      const group = findReportLinkGroup(store, toReportLinkRow(link));
      if (!group) {
        throw new HttpError(400, "The selected group does not exist for this project.");
      }
      const row = { id: nextId(store.reportLinks), ...toReportLinkRow(link), created_at: now(), updated_at: now() };
      store.reportLinks.push(row);
      return normalizeReportLinkOutput(row, group);
    });
  }

  async updateReportLink(originalSlug, input) {
    const safeOriginalSlug = normalizeReportLinkSlug(originalSlug);
    const link = normalizeReportLinkInput(input);
    return this.mutate((store) => {
      const row = store.reportLinks.find((item) => item.slug === safeOriginalSlug);
      if (!row) throw new HttpError(404, "Report link not found.");
      if (link.slug !== safeOriginalSlug && store.reportLinks.some((item) => item.slug === link.slug)) {
        throw new HttpError(409, `Report link "${link.slug}" already exists.`);
      }
      const candidate = toReportLinkRow(link);
      const group = findReportLinkGroup(store, candidate);
      if (!group) throw new HttpError(400, "The selected group does not exist for this project.");
      Object.assign(row, candidate, { updated_at: now() });
      return normalizeReportLinkOutput(row, group);
    });
  }

  async deleteReportLink(slug) {
    const safeSlug = normalizeReportLinkSlug(slug);
    return this.mutate((store) => {
      const previousLength = store.reportLinks.length;
      store.reportLinks = store.reportLinks.filter((row) => row.slug !== safeSlug);
      if (previousLength === store.reportLinks.length) throw new HttpError(404, "Report link not found.");
      return { status: "deleted", slug: safeSlug };
    });
  }
}

function createEmptyStore() {
  return {
    version: STORE_VERSION,
    substations: [],
    deviceSubstationMappings: [],
    mainIntakes: [],
    deviceMainIntakeMappings: [],
    deviceLabels: [],
    reportLinks: [],
    deviceThresholds: [],
    transformerMappings: [],
  };
}

function normalizeStore(value) {
  const safe = value && typeof value === "object" ? value : {};
  const empty = createEmptyStore();
  Object.keys(empty).forEach((key) => {
    if (key !== "version") empty[key] = Array.isArray(safe[key]) ? safe[key] : [];
  });
  return empty;
}

function buildProjectPayload(project, store) {
  const substations = filterProject(store.substations, project).sort(sortByName);
  const substationIds = new Set(substations.map((row) => String(row.id)));
  const mainIntakes = filterProject(store.mainIntakes, project).sort(sortByName);
  const mainIntakeIds = new Set(mainIntakes.map((row) => String(row.id)));
  const thresholds = {};
  filterProject(store.deviceThresholds, project).forEach((row) => {
    thresholds[String(row.device_id)] = normalizeThresholdMap(row.thresholds);
  });

  return {
    substations: substations.map((row) => ({ id: String(row.id), name: row.name, projectName: project })),
    deviceAssignments: filterProject(store.deviceSubstationMappings, project)
      .filter((row) => substationIds.has(String(row.substation_id)))
      .map((row) => ({ deviceId: String(row.device_id), substationId: String(row.substation_id), side: normalizeElectricalSide(row.side) })),
    deviceLabels: filterProject(store.deviceLabels, project)
      .map((row) => ({ deviceId: String(row.device_id), label: String(row.label) })),
    mainIntakes: mainIntakes.map((row) => ({ id: String(row.id), name: row.name, projectName: project })),
    mainIntakeAssignments: filterProject(store.deviceMainIntakeMappings, project)
      .filter((row) => mainIntakeIds.has(String(row.main_intake_id)))
      .map((row) => ({ deviceId: String(row.device_id), mainIntakeId: String(row.main_intake_id), side: normalizeElectricalSide(row.side) })),
    thresholdOverridesByDevice: thresholds,
    transformerMappings: filterProject(store.transformerMappings, project).map((row) => ({
      projectName: project,
      htDeviceId: String(row.ht_device_id),
      lvDeviceId: String(row.lv_device_id),
      label: String(row.label || ""),
    })),
  };
}

function normalizeThresholdsByDevice(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  Object.entries(value).forEach(([deviceId, thresholds]) => {
    const id = String(deviceId || "").trim();
    const normalized = normalizeThresholdMap(thresholds);
    if (id && Object.keys(normalized).length) result[id] = normalized;
  });
  return result;
}

function normalizeThresholdMap(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  Object.entries(value).forEach(([metric, range]) => {
    const key = String(metric || "").trim().toUpperCase();
    const min = Number(range?.min);
    const max = Number(range?.max);
    if (!key || !Number.isFinite(min) || !Number.isFinite(max) || min > max) return;
    result[key] = { ...range, min, max };
  });
  return result;
}

function normalizeTransformerMappings(project, mappings) {
  const result = [];
  const usedDevices = new Set();
  (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
    const htDeviceId = String(mapping?.htDeviceId || "").trim();
    const lvDeviceId = String(mapping?.lvDeviceId || "").trim();
    if (!htDeviceId || !lvDeviceId || htDeviceId === lvDeviceId) return;
    if (usedDevices.has(htDeviceId) || usedDevices.has(lvDeviceId)) {
      throw new HttpError(400, "A device can only belong to one transformer mapping.");
    }
    usedDevices.add(htDeviceId);
    usedDevices.add(lvDeviceId);
    result.push({
      project_name: project,
      ht_device_id: htDeviceId,
      lv_device_id: lvDeviceId,
      label: String(mapping?.label || "").trim(),
      updated_at: now(),
    });
  });
  return result;
}

function normalizeReportLinkInput(input) {
  const range = String(input?.range || "today").trim().toLowerCase();
  const reportType = String(input?.reportType || "histvalues").trim().toLowerCase();
  const groupType = String(input?.groupType || "").trim().toLowerCase();
  const link = {
    slug: normalizeReportLinkSlug(input?.slug),
    projectName: normalizeProjectName(input?.projectName),
    groupType,
    groupId: requiredText(input?.groupId, "Group ID"),
    side: validateElectricalSide(input?.side),
    range,
    startDate: String(input?.startDate || "").trim(),
    endDate: String(input?.endDate || "").trim(),
    reportType,
    autorun: input?.autorun !== false,
    enabled: input?.enabled !== false,
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.slug)) throw new HttpError(400, "Slug must contain lowercase letters, numbers, and single hyphens only.");
  if (!new Set(["substation", "main-intake"]).has(groupType)) throw new HttpError(400, "Group type must be substation or main-intake.");
  if (!link.side) throw new HttpError(400, "Side must be HT or LV.");
  if (!REPORT_LINK_RANGES.has(range)) throw new HttpError(400, "Unsupported report date range.");
  if (!REPORT_LINK_TYPES.has(reportType)) throw new HttpError(400, "Unsupported report type.");
  if (range === "custom" && (!/^\d{4}-\d{2}-\d{2}$/.test(link.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(link.endDate))) {
    throw new HttpError(400, "Custom links require valid start and end dates.");
  }
  if (range !== "custom") {
    link.startDate = "";
    link.endDate = "";
  }
  return link;
}

function toReportLinkRow(link) {
  return {
    slug: link.slug,
    project_name: link.projectName,
    group_type: link.groupType,
    group_id: link.groupId,
    side: link.side,
    date_range: link.range,
    start_date: link.startDate,
    end_date: link.endDate,
    report_type: link.reportType,
    autorun: link.autorun,
    enabled: link.enabled,
  };
}

function normalizeReportLinkOutput(row, group) {
  return {
    slug: String(row.slug),
    projectName: String(row.project_name),
    groupType: String(row.group_type),
    groupId: String(row.group_id),
    groupName: String(group?.name || ""),
    side: normalizeElectricalSide(row.side),
    range: String(row.date_range || "today"),
    startDate: String(row.start_date || ""),
    endDate: String(row.end_date || ""),
    reportType: String(row.report_type || "histvalues"),
    autorun: row.autorun !== false,
    enabled: row.enabled !== false,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function findReportLinkGroup(store, row) {
  const collection = row.group_type === "main-intake" ? store.mainIntakes : store.substations;
  return collection.find((item) => item.project_name === row.project_name && String(item.id) === String(row.group_id));
}

function normalizeReportLinkSlug(value) {
  return requiredText(value, "Report link slug").toLowerCase();
}

function normalizeProjectName(value) {
  return requiredText(value, "Project name");
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new HttpError(400, `${label} is required.`);
  return text;
}

function normalizeDeviceIds(value) {
  const ids = [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!ids.length) throw new HttpError(400, "At least one device ID is required.");
  return ids;
}

function normalizeElectricalSide(value) {
  const side = String(value || "").trim().toUpperCase();
  return side === "HT" || side === "LV" ? side : "";
}

function validateElectricalSide(value) {
  const raw = String(value || "").trim();
  const side = normalizeElectricalSide(raw);
  if (raw && !side) throw new HttpError(400, 'Side must be either "HT" or "LV".');
  return side;
}

function filterProject(rows, project) {
  return rows.filter((row) => String(row?.project_name || "") === project);
}

function newNamedRow(rows, project, name) {
  return { id: nextId(rows), project_name: project, name, created_at: now() };
}

function nextId(rows) {
  return String(rows.reduce((max, row) => Math.max(max, Number.parseInt(row?.id || "0", 10) || 0), 0) + 1);
}

function sortByName(left, right) {
  return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { numeric: true, sensitivity: "base" });
}

function now() {
  return new Date().toISOString();
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = { HttpError, MetadataStore, STORE_VERSION, createEmptyStore, normalizeStore };
