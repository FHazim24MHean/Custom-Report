const EMPTY_CELL_MARKERS = new Set(["", "-", "--", "N/A", "NA", "NO DATA", "NOT AVAILABLE"]);

export function hasTableCellData(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return true;
  return !EMPTY_CELL_MARKERS.has(value.trim().toUpperCase());
}

export function getColumnsWithData(columns, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (Array.isArray(columns) ? columns : []).filter((column, index, allColumns) => {
    if (allColumns.indexOf(column) !== index) return false;
    return safeRows.some((row) => hasTableCellData(row?.[column]));
  });
}

export function filterColumnGroups(columnGroups, originalColumns, visibleColumns) {
  const safeGroups = Array.isArray(columnGroups) ? columnGroups : [];
  if (!safeGroups.length) return [];

  const safeOriginalColumns = Array.isArray(originalColumns) ? originalColumns : [];
  const safeVisibleColumns = Array.isArray(visibleColumns) ? visibleColumns : [];
  const visibleSet = new Set(safeVisibleColumns);

  return safeGroups.flatMap((group) => {
    const groupColumns = Array.isArray(group?.columns) && group.columns.length
      ? group.columns
      : safeOriginalColumns.slice(group?.start, Number(group?.end) + 1);
    const keptEntries = groupColumns
      .map((column, index) => ({ column, label: group?.subHeaders?.[index] }))
      .filter(({ column }) => visibleSet.has(column));
    if (!keptEntries.length) return [];

    const start = safeVisibleColumns.indexOf(keptEntries[0].column);
    return [{
      ...group,
      start,
      end: start + keptEntries.length - 1,
      columns: keptEntries.map(({ column }) => column),
      subHeaders: keptEntries.map(({ column, label }) => label || column),
    }];
  });
}
