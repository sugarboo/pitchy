import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const progressPath = fileURLToPath(new URL("../../pitchy-progress/SKILL.md", import.meta.url));
const progress = await readFile(progressPath, "utf8");

function readField(label) {
  const prefix = `- ${label}: \``;
  const line = progress.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  if (!line?.endsWith("`")) {
    throw new Error(`Missing progress field: ${label}`);
  }
  return line.slice(prefix.length, -1);
}

const backlogRows = [
  ...progress.matchAll(/^\| (VT-\d{3}) \| (pending|in-progress|complete|blocked) \| (.*) \|$/gm),
].map(([, id, state, evidence]) => ({ id, state, evidence }));

if (backlogRows.length !== 26) {
  throw new Error(`Expected 26 backlog rows, found ${backlogRows.length}`);
}

const activeRows = backlogRows.filter((row) => row.state === "in-progress");
if (activeRows.length > 1) {
  throw new Error(`Expected at most one in-progress item, found ${activeRows.length}`);
}

const selected = activeRows[0] ?? backlogRows.find((row) => row.state === "pending");
if (!selected) {
  throw new Error("No actionable backlog item remains");
}

const itemNumber = Number.parseInt(selected.id.slice(3), 10);
const route =
  itemNumber <= 2
    ? "foundation"
    : itemNumber <= 7
      ? "audio-thread"
      : itemNumber <= 14
        ? "pitch-dsp"
        : itemNumber <= 19
          ? "practice-ui"
          : itemNumber <= 22
            ? "session-data"
            : itemNumber <= 24
              ? "offline-pwa"
              : "release-qa";

const declaredCurrentItem = readField("Current backlog item");
if (declaredCurrentItem !== selected.id) {
  throw new Error(
    `Current backlog item ${declaredCurrentItem} does not match the actionable table item ${selected.id}`,
  );
}

console.log(
  JSON.stringify(
    {
      milestone: readField("Current milestone"),
      currentItem: selected.id,
      state: selected.state,
      route,
      lastUpdated: readField("Last updated"),
      progressPath,
    },
    null,
    2,
  ),
);
