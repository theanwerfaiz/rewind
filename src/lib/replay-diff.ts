export type ReplayChange = {
  path: string;
  original: unknown;
  replay: unknown;
  type: "added" | "removed" | "changed";
};

function getPath(parent: string, key: string) {
  if (!parent) {
    return key;
  }

  if (/^\d+$/.test(key)) {
    return `${parent}[${key}]`;
  }

  return `${parent}.${key}`;
}

export function findReplayChanges(
  original: unknown,
  replay: unknown,
  path = "",
): ReplayChange[] {
  if (JSON.stringify(original) === JSON.stringify(replay)) {
    return [];
  }

  const originalIsObject = typeof original === "object" && original !== null;

  const replayIsObject = typeof replay === "object" && replay !== null;

  if (
    !originalIsObject ||
    !replayIsObject ||
    Array.isArray(original) !== Array.isArray(replay)
  ) {
    return [
      {
        path: path || "payload",
        original,
        replay,
        type: "changed",
      },
    ];
  }

  const originalRecord = original as Record<string, unknown>;

  const replayRecord = replay as Record<string, unknown>;

  const keys = new Set([
    ...Object.keys(originalRecord),
    ...Object.keys(replayRecord),
  ]);

  const changes: ReplayChange[] = [];

  for (const key of keys) {
    const childPath = getPath(path, key);

    const existsInOriginal = Object.prototype.hasOwnProperty.call(
      originalRecord,
      key,
    );

    const existsInReplay = Object.prototype.hasOwnProperty.call(
      replayRecord,
      key,
    );

    if (!existsInOriginal && existsInReplay) {
      changes.push({
        path: childPath,
        original: undefined,
        replay: replayRecord[key],
        type: "added",
      });

      continue;
    }

    if (existsInOriginal && !existsInReplay) {
      changes.push({
        path: childPath,
        original: originalRecord[key],
        replay: undefined,
        type: "removed",
      });

      continue;
    }

    changes.push(
      ...findReplayChanges(originalRecord[key], replayRecord[key], childPath),
    );
  }

  return changes;
}
