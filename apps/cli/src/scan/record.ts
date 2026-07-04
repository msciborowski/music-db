/**
 * Build the persistable core fields of a File from its path (spec §6/§7/§8).
 * Pure — no I/O — so it is fully unit-testable.
 */
import { classifyFile, filenameKeys, type FileTypeName } from "@mdb/core";

export interface FileRecordCore {
  relPath: string;
  filename: string;
  filenameLower: string;
  filenameNorm: string;
  filenameNormAscii: string;
  extension: string;
  fileType: FileTypeName;
  isHidden: boolean;
  isSystem: boolean;
}

export function buildFileRecord(relPath: string, filename: string): FileRecordCore {
  const classification = classifyFile(filename);
  const keys = filenameKeys(filename);
  return {
    relPath,
    filename,
    filenameLower: keys.lower,
    filenameNorm: keys.norm,
    filenameNormAscii: keys.normAscii,
    extension: classification.extension,
    fileType: classification.fileType,
    isHidden: classification.isHidden,
    isSystem: classification.isSystem,
  };
}
