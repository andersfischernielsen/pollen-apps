const fileManager = FileManager.local();
const cacheDir = fileManager.documentsDirectory();
const cachePath = fileManager.joinPath(
  cacheDir,
  "scriptable-pollen-cache.json",
);

export const saveCache = async (data: {
  pollenText: string;
  allergensText: string;
}) => {
  fileManager.writeString(cachePath, JSON.stringify(data));
};

export const loadCache = () => {
  if (!fileManager.fileExists(cachePath)) {
    return undefined;
  }
  const contents = fileManager.readString(cachePath);
  return JSON.parse(contents) as { pollenText: string; allergensText: string };
};
