export interface DbTableSize {
  name: string;
  dataBytes: string;
  indexBytes: string;
  totalBytes: string;
}

export interface DbSize {
  totalBytes: string;
  dataBytes: string;
  indexBytes: string;
  tables: DbTableSize[];
}

export interface Stats {
  volumes: number;
  directories: number;
  files: number;
  audioFiles: number;
  works: number;
  totalBytes: string;
  lossless: number;
  fingerprinted: number;
  needsSplit: number;
  acoustidMatched: number;
  mbWorks: number;
  byType: Array<{ fileType: string; count: number }>;
  duplicates: Array<{ kind: string; count: number }>;
  topGenres: Array<{ name: string; count: number }>;
  dbSize: DbSize;
}

export interface SearchHit {
  fileId: string;
  title: string | null;
  artist: string | null;
  filename: string;
  relPath: string;
  durationSec: number | null;
  directoryId: string;
  dirRelPath: string;
  coverFileId: string | null;
  otherAudio: Array<{ fileId: string; title: string }>;
  otherFiles: Array<{ filename: string; fileType: string }>;
}

export interface CueHit {
  title: string;
  performer: string | null;
  trackNo: number;
  startMs: number | null;
  endMs: number | null;
  directoryId: string;
  albumName: string;
  dirRelPath: string;
  ripFileId: string | null;
}

export interface VolumeSummary {
  id: string;
  label: string;
  serialNumber: string | null;
  totalBytes: string | null;
  fileCount: number;
  audioCount: number;
  directoryCount: number;
  rootDirId: string | null;
}

export interface DirChild {
  id: string;
  name: string;
  relPath: string;
  type: string;
  audioCount: number;
  fileCount: number;
}

export interface AlbumTrack {
  fileId: string;
  trackNo: number | null;
  title: string;
  artist: string | null;
  durationSec: number | null;
  codec: string | null;
  versionType: string;
  versionLabel: string | null;
  filename: string;
  isAlbumRip: boolean;
  needsSplit: boolean;
  bpm: number | null;
  camelot: string | null;
}

export interface DirectoryDetail {
  id: string;
  name: string;
  relPath: string;
  type: string;
  volumeLabel: string;
  parentId: string | null;
  coverFileId: string | null;
  children: DirChild[];
  tracks: AlbumTrack[];
  otherFiles: Array<{ fileId: string; filename: string; fileType: string; coverRole: string | null }>;
  genres: string[];
  cueTracks: Array<{ trackNo: number; title: string | null; startMs: number | null }>;
}

export interface DuplicateGroupDto {
  id: string;
  kind: string;
  members: Array<{ fileId: string; filename: string; relPath: string; volumeLabel: string; sizeBytes: string }>;
}

export interface WorkVersion {
  fileId: string;
  versionType: string;
  versionLabel: string | null;
  durationSec: number | null;
  codec: string | null;
  relPath: string;
}

export interface WorkDto {
  id: string;
  title: string | null;
  artist: string | null;
  mbWorkId: string | null;
  versions: WorkVersion[];
}
