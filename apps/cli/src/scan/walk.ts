/**
 * Recursive, read-only filesystem walk (spec §14). Pre-order (a directory is
 * yielded before its children), with a symlink-loop guard (tracks visited real
 * directory paths) and a depth limit. Never writes to the source.
 */
import fs from "node:fs";
import path from "node:path";
import { isSystemName } from "@mdb/core";

export interface WalkEntry {
  absPath: string;
  /** POSIX path relative to the scan root — stable across machines. */
  relPath: string;
  name: string;
  isDir: boolean;
  depth: number;
  /** Parent's relPath ("" for entries directly under the root). */
  parentRelPath: string;
}

export interface WalkOptions {
  maxDepth?: number;
  /** Called on per-entry I/O errors; the walk continues (spec §14). */
  onError?: (err: unknown, absPath: string) => void;
}

const toPosix = (p: string): string => p.split(path.sep).join("/");

export async function* walk(
  root: string,
  options: WalkOptions = {},
): AsyncGenerator<WalkEntry> {
  const maxDepth = options.maxDepth ?? 64;
  const onError = options.onError ?? (() => {});
  const visited = new Set<string>();

  try {
    visited.add(await fs.promises.realpath(root));
  } catch {
    // if realpath fails we still attempt to read it below
  }

  yield* walkDir(root, "", 0, maxDepth, visited, onError);
}

async function* walkDir(
  absDir: string,
  relDir: string,
  depth: number,
  maxDepth: number,
  visited: Set<string>,
  onError: (err: unknown, absPath: string) => void,
): AsyncGenerator<WalkEntry> {
  if (depth >= maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(absDir, { withFileTypes: true });
  } catch (err) {
    onError(err, absDir);
    return;
  }

  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const dirent of entries) {
    const absPath = path.join(absDir, dirent.name);
    const relPath = relDir ? `${relDir}/${dirent.name}` : dirent.name;

    let isDir = dirent.isDirectory();
    const isSymlink = dirent.isSymbolicLink();

    if (isSymlink) {
      // Resolve the target to decide whether it's a dir and whether it loops.
      try {
        const stat = await fs.promises.stat(absPath);
        isDir = stat.isDirectory();
      } catch (err) {
        onError(err, absPath);
        continue;
      }
    }

    const entry: WalkEntry = {
      absPath,
      relPath: toPosix(relPath),
      name: dirent.name,
      isDir,
      depth,
      parentRelPath: toPosix(relDir),
    };

    yield entry;

    if (isDir) {
      // Catalogue the directory entry, but don't descend into unreadable system
      // dirs (macOS .Spotlight-V100 / .Trashes / .fseventsd, Windows recycle bin).
      if (isSystemName(dirent.name)) continue;
      let real: string | undefined;
      try {
        real = await fs.promises.realpath(absPath);
      } catch (err) {
        onError(err, absPath);
        continue;
      }
      if (visited.has(real)) continue; // symlink/junction loop guard
      visited.add(real);
      yield* walkDir(absPath, relPath, depth + 1, maxDepth, visited, onError);
    }
  }
}
