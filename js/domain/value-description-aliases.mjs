const USER_DEFINED_REPORT_ALIASES = [
  { metricName: "TX_TEMPERATURE", label: "TEMP" },
  { metricName: "TX_PRESSURE", label: "PRESSURE" },
];

export function buildUserDefinedReportRequestSpecs(valueDescriptions) {
  const descriptions = Array.isArray(valueDescriptions) ? valueDescriptions : [];

  return USER_DEFINED_REPORT_ALIASES.flatMap((alias) => {
    const source = descriptions.find((description) => {
      if (normalize(description?.value) !== "USERDEFINED") return false;
      return [description?.typeName, description?.valueName]
        .map(normalize)
        .includes(alias.label);
    });
    if (!source) return [];

    return [{
      metricName: alias.metricName,
      queryValue: String(source.value || "UserDefined").trim(),
      phase: String(source.type || "").trim() || null,
    }];
  });
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}
