const DEFAULT_RETRY_STATUSES = new Set([429, 502, 503, 504]);

export async function runTaskPool(taskFactories, options = {}) {
  const tasks = Array.isArray(taskFactories) ? taskFactories : [];
  const concurrency = Math.max(1, Math.min(32, Number(options.concurrency) || 8));
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      if (options.signal?.aborted) throw abortError();
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (error) {
        if (options.signal?.aborted || error?.name === "AbortError") throw error;
        results[index] = { status: "rejected", reason: error };
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total: tasks.length });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );
  return results;
}

export async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const retries = Math.max(0, Number(retryOptions.retries ?? 2));
  const retryStatuses = retryOptions.retryStatuses || DEFAULT_RETRY_STATUSES;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    try {
      const response = await fetch(url, options);
      if (!retryStatuses.has(response.status) || attempt === retries) return response;
      lastError = new Error(`HTTP ${response.status}`);
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (error?.name === "AbortError" || options.signal?.aborted) throw error;
      lastError = error;
      if (attempt === retries) throw error;
    }
    await delay(Math.min(2000, 250 * (2 ** attempt)), options.signal);
  }
  throw lastError || new Error("Request failed.");
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    if (!signal) return;
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(abortError());
    }, { once: true });
  });
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}
