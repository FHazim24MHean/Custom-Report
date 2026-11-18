function toUtcSecondToken(date) {
  return `UTCSEC_${Math.floor(date.getTime() / 1000)}`;
}

function subtractUtcMonths(date, months) {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const finalDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0
  )).getUTCDate();
  result.setUTCDate(Math.min(originalDay, finalDay));
  return result;
}

export function buildCalendarTimeWindowQuery(range, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("A valid current date is required.");
  }

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  let startDate;
  let endDate;

  if (range === "thismonth") {
    startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0) - 1000);
  } else if (range === "lastmonth") {
    startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0) - 1000);
  } else if (range === "last6") {
    startDate = subtractUtcMonths(now, 6);
    endDate = new Date(now.getTime());
  } else {
    return null;
  }

  return {
    start: toUtcSecondToken(startDate),
    end: toUtcSecondToken(endDate),
  };
}
