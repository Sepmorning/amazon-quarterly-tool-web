export async function filesFromEntry(entry) {
  if (entry?.isFile) {
    return new Promise((resolve) => entry.file((file) => resolve([file]), () => resolve([])));
  }
  if (!entry?.isDirectory) return [];
  const reader = entry.createReader();
  const children = [];
  while (true) {
    const batch = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(filesFromEntry))).flat();
}

export async function filesFromHandle(handle) {
  if (handle?.kind === "file") {
    try {
      return [await handle.getFile()];
    } catch {
      return [];
    }
  }
  if (handle?.kind !== "directory") return [];
  const children = [];
  try {
    const iterator = typeof handle.values === "function" ? handle.values() : handle.entries();
    for await (const item of iterator) {
      children.push(Array.isArray(item) ? item[1] : item);
    }
  } catch {
    return [];
  }
  return (await Promise.all(children.map(filesFromHandle))).flat();
}

export async function droppedFiles(dataTransfer) {
  const fallback = Array.from(dataTransfer?.files || []);
  const items = Array.from(dataTransfer?.items || []).filter((item) => !item.kind || item.kind === "file");
  const handles = (await Promise.all(items.map(async (item) => {
    try {
      return await item.getAsFileSystemHandle?.();
    } catch {
      return null;
    }
  }))).filter(Boolean);
  if (handles.length) {
    const files = (await Promise.all(handles.map(filesFromHandle))).flat();
    if (files.length) return files;
  }
  const entries = items.map((item) => {
    try {
      return item.webkitGetAsEntry?.() || null;
    } catch {
      return null;
    }
  }).filter(Boolean);
  if (!entries.length) return fallback;
  try {
    const files = (await Promise.all(entries.map(filesFromEntry))).flat();
    return files.length ? files : fallback;
  } catch {
    return fallback;
  }
}
