import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST_DIRECTORY = fileURLToPath(new URL("../dist/", import.meta.url));
const MAX_COMPRESSED_BYTES = 500 * 1024;
const COUNTED_EXTENSIONS = new Set([".css", ".html", ".js", ".webmanifest"]);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

const files = (await listFiles(DIST_DIRECTORY)).filter((file) =>
  COUNTED_EXTENSIONS.has(extname(file)),
);
const measuredFiles = await Promise.all(
  files.map(async (file) => {
    const contents = await readFile(file);
    return {
      file: relative(DIST_DIRECTORY, file),
      compressedBytes: gzipSync(contents, { level: 9 }).byteLength,
    };
  }),
);
const totalCompressedBytes = measuredFiles.reduce(
  (total, result) => total + result.compressedBytes,
  0,
);

console.log(
  `Compressed app shell: ${(totalCompressedBytes / 1024).toFixed(1)} KiB / ${MAX_COMPRESSED_BYTES / 1024} KiB`,
);

if (totalCompressedBytes > MAX_COMPRESSED_BYTES) {
  for (const result of measuredFiles.toSorted(
    (left, right) => right.compressedBytes - left.compressedBytes,
  )) {
    console.error(`${result.file}: ${(result.compressedBytes / 1024).toFixed(1)} KiB`);
  }
  process.exitCode = 1;
}
