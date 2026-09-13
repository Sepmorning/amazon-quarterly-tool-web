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

export async function droppedFiles(dataTransfer) {
  const fallback = Array.from(dataTransfer?.files || []);
  const entries = Array.from(dataTransfer?.items || []).map((item) => {
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
