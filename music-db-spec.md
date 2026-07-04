# Music DB (`mdb`) — specyfikacja projektu / prompt wdrożeniowy

> Zadanie: zainicjuj nowy projekt **Music DB** według poniższej specyfikacji. Zbuduj **w pełni Milestone 1** (faza Scan → katalog w bazie). Kolejne fazy — **Fingerprint** (faza dyskowa), **Analyze**, **Enrich**, **Web** — zaprojektuj na poziomie schematu i interfejsów oraz przygotuj szkielet zgodnie z §17 (Fingerprint jako mały, samodzielny krok dyskowy; reszta szkielet). Szczegóły zakresu na końcu dokumentu.

---

## 1. Cel i kontekst źródła

Narzędzie do **katalogowania archiwów muzycznych** z kilku dysków zewnętrznych. Najpierw tylko **czytamy, analizujemy i zapisujemy do bazy** — żadnych modyfikacji ani przenoszenia plików audio (split ripów, deduplikacja fizyczna itd. to przyszłe fazy).

Założenia o źródle, które muszą kształtować decyzje projektowe:

- **Kilka dysków** (na start dwa, później dojdą kolejne). Aplikacja używana naprzemiennie z **PC (Windows)** i **Maca** — czyli ten sam dysk pojawia się pod różnymi ścieżkami montowania (`E:/...` vs `/Volumes/.../...`).
- **Dyski zewnętrzne** podpinane naprzemiennie. Operacje na źródle wyłącznie **read-only** (nie modyfikujemy archiwum), z odpornością na pojedyncze błędy I/O — to zwykła higiena, nie zakładamy awaryjności sprzętu.
- Zawartość: w większości **MP3**, ale też **FLAC, AAC/M4A, OGG/Opus, WAV, ALAC, APE/WV** i inne. Obok audio: okładki (`cover*.jpg`, `front/back`), pliki `.cue`, `.txt`/`.nfo`, logi ripów `.log`, playlisty, pliki systemowe.
- Muzyka **głównie polskojęzyczna** → realny problem **kodowania znaków** (ID3v1 i nazwy plików w cp1250/ISO-8859-2, mojibake).
- **Ripy całych płyt**: jeden długi plik (50–74 min, czasem MP3, częściej FLAC) + `.cue` z podziałem na ścieżki. Na teraz tylko katalogujemy ze statusem „do splitu".
- **Duplikaty międzydyskowe** — ten sam plik skopiowany na oba dyski to główny przypadek użycia („to na dysku A jest tym samym co na dysku B").

---

## 2. Architektura procesowa — cztery fazy

Pipeline: **Scan → Fingerprint → Analyze → Enrich.** Pierwsze dwie fazy wymagają podłączonego dysku i są zaprojektowane jako dwa kolejne kroki, żeby całą pracę dyskową wykonać za jednym podpięciem. Analyze i Enrich działają już bez dysku.

| Faza | Wymaga | Co robi |
|---|---|---|
| **1. Scan** | dysku | Rekurencyjny obchód FS. Zapis każdego pliku/katalogu (audio i nie-audio), rozmiary, mtime, klasyfikacja typu, **hash treści**, parsing `.cue`, odczyt tagów + właściwości technicznych audio. Idempotentny, wznawialny, wsadowy. |
| **2. Fingerprint** | dysku | **Generowanie fingerprintów akustycznych** (Chromaprint/`fpcalc`) dla plików audio i zapis (`fingerprint`, `fingerprintDur`). Uruchamiana po `scan`, przy wciąż podłączonym dysku. Druga i ostatnia faza dotykająca fizycznego dysku. |
| **3. Analyze** | niczego (czysta baza/CPU) | Normalizacja nazw/tagów, **wykrywanie duplikatów** (po hashu / **porównaniu fingerprintów offline** / znormalizowanej nazwie, **w poprzek wolumenów**), wykrycie ripów albumów i potrzeby splitu, wykrycie albumów wielopłytowych, rekoncyliacja metadanych (tag vs nazwa pliku). Można uruchamiać wielokrotnie, na maszynie bez podłączonego dysku. |
| **4. Enrich** | sieci | Odpytanie zewnętrznych baz (AcoustID/MusicBrainz/Discogs), cache surowych odpowiedzi w `jsonb`, doklejenie tagów. Wolne, rate-limitowane, cache'owane, odpytywanie na poziomie albumu (nie per track). |

Rozdział fingerprintu: **generowanie** to faza 2 (dysk), **porównanie/klastrowanie** dzieje się offline w fazie Analyze, a **lookup online** (nazwanie) dopiero w fazie Enrich — szczegóły w §11.

---

## 3. Stack technologiczny

**Stack i wersje muszą odpowiadać istniejącemu projektowi referencyjnemu Nafin** (ten sam właściciel, spójny toolchain). Skład rdzenia identyczny jak Nafin:

- **Monorepo:** Turborepo + **pnpm** (`pnpm-workspace.yaml`, `turbo.json`).
- **Język:** TypeScript (strict) na całości. Node.js LTS.
- **Backend API:** **NestJS**.
- **ORM / migracje:** **Prisma**.
- **Baza:** **PostgreSQL**.
- **Walidacja / typy domenowe:** **Zod** (w `packages/core`/`domain`).
- **Klient API (web):** typowany, **TanStack Query**.
- **Web (faza późniejsza):** **React** + Next.js (App Router), **MUI** jako biblioteka UI — jak w Nafin.
- **CLI:** w monorepo, binarka `mdb` (Nafin nie ma CLI — to dodatek Music DB, patrz niżej).

> **Wersje — krytyczne.** Przypnij wersje **1:1 do referencyjnego Nafin** (`package.json` / `pnpm-lock.yaml`). **Nie rozwiązuj wersji od zera i nie używaj pływających zakresów** (`^`/`~`). Jeśli `package.json` Nafin jest dołączony do tego zadania — użyj dokładnie tych wersji. Jeśli nie jest dołączony — użyj **najnowszych stabilnych** każdego pakietu w momencie inicjalizacji i **zafiksuj dokładne wersje** (bez starych wydań, bez pływających zakresów).

Dodatki **specyficzne dla Music DB** (nie występują w Nafin — katalog audio i CLI). Najnowsze stabilne, przypięte:

- Odczyt metadanych audio: **`music-metadata`** (ID3v1/v2, Vorbis, MP4/AAC, FLAC, APE, własności techniczne). Uwaga: nowsze wersje są **ESM-only** — ustaw moduły adekwatnie.
- Hash treści: **`hash-wasm`** (xxhash64/xxhash3, bez natywnego buildu — ważne przy PC+Mac). Alternatywa: `node:crypto` SHA-256 (wolniejsze, ale zero zależności, większa odporność na kolizje).
- Detekcja kodowania (hint, nie wyrocznia): **`jschardet`** / `chardet`.
- Fingerprint akustyczny: **Chromaprint `fpcalc`** — *zewnętrzna binarka natywna* (instalacja: `brew install chromaprint` / `apt install libchromaprint-tools`). Udokumentuj jako zależność systemową; potrzebna w fazie Fingerprint (faza 2).
- CLI: **`commander`** (parser flag/subkomend) + **`cli-progress`** (paski postępu są konieczne przy dziesiątkach tysięcy plików) + **`@clack/prompts`** lub **`@inquirer/prompts`** (tryb interaktywny/wizard — patrz §15).
- Logowanie: **`pino`** (strukturalne).
- Parsing `.cue`: rozważ istniejącą bibliotekę, ale bądź gotów napisać własny parser (format jest liniowy, ~100 linii) — biblioteki bywają zawodne, a my potrzebujemy kontroli nad kodowaniem.

---

## 4. Struktura monorepo

```
apps/
  api/        NestJS — REST do przeglądania katalogu (importuje core + database)
  cli/        binarka `mdb` na commander (importuje core + database)
  web/        React — przeglądarka danych (FAZA PÓŹNIEJSZA: tylko szkielet)
packages/
  core/       czysta logika domenowa, bez frameworków i I/O:
                normalizacja nazw, parser nazw plików, klasyfikator typów,
                parser .cue, algorytmy wykrywania duplikatów, typy domenowe.
                W pełni jednostkowo testowalne.
  database/   Prisma: schema, klient, migracje, seedy. Współdzielone przez api + cli.
```

Zasada: **`core` jest framework-agnostyczne** (sama logika, deterministyczna, testowalna), a `api` (NestJS) i `cli` (commander) to cienkie adaptery wokół `core` + `database`. Faktyczny obchód FS i zapis do bazy orkiestruje CLI, korzystając z prymitywów z `core`.

> Alternatywa, jeśli preferowane współdzielenie Nest DI: CLI na `nest-commander` współdzielące serwisy z API. Domyślnie jednak idziemy w lekkie commander + czyste `core` (szybszy start batcha, mniejsze sprzężenie).

---

## 5. Model tożsamości: Volume vs Run

To kluczowa decyzja (patrz §1: ten sam dysk, różne maszyny i litery).

- **Volume** — trwała tożsamość fizycznego dysku. Klucz dopasowania: **numer seryjny woluminu (Windows) / UUID filesystemu (macOS/Linux)**. Dodatkowo label, typ FS, całkowity rozmiar.
- **Run** — pojedyncze uruchomienie fazy. Zawiera `kind` (SCAN/ANALYZE/ENRICH), `status`, `startedAt/finishedAt`, liczniki, a dla skanu: `hostname`, `mountPath` (np. `E:/Muzyka` — **nietrwałe, tylko zapis z danej chwili**), `rootRelPath`.

Pozyskiwanie stabilnego identyfikatora (zaimplementuj mały, świadomy platformy resolver z fallbackiem):

- **Windows:** numer seryjny woluminu (PowerShell `Get-CimInstance Win32_Volume` / `Get-Volume`, albo biblioteka).
- **macOS:** `diskutil info <mount>` → Volume UUID.
- **Linux:** `blkid` / `lsblk -o UUID`.
- Cross-platform pomocniczo: `drivelist` (poziom urządzenia); dla UUID FS może być potrzebny shell per-platforma.
- **Fallback** gdy brak stabilnego ID: miękki klucz `(label + totalBytes + fsType)` + potwierdzenie użytkownika, albo wymuszenie przez `--volume <id>`.
- **Nigdy nie zapisujemy znacznika na źródłowym dysku** (honorujemy read-only) — tożsamość trzymamy w bazie.

Katalogi i pliki należą do **Volume** (przez ścieżkę względną do roota wolumenu — stabilną między maszynami), nie do Run. Run tylko rejestruje fakt skanu i aktualizuje `firstSeen/lastSeen`.

---

## 6. Model danych (szkic Prisma — agent finalizuje indeksy/migracje)

Poniżej **model logiczny** (modele PascalCase, pola camelCase). W rzeczywistym `schema.prisma` **fizyczne nazwy w Postgresie są snake_case**: każdy model dostaje `@@map`, każde wielowyrazowe pole `@map`, każdy enum `@@map` — pełna konwencja i lista tabel pod blokiem. **Nie twórz tabel/kolumn w mixedCase.**

```prisma
// ---------- ENUMS ----------
enum FileType { AUDIO CUE PLAYLIST IMAGE TEXT LOG METADATA ARCHIVE SYSTEM OTHER }
enum ScanStatus { DISCOVERED HASHED METADATA_READ FINGERPRINTED ERROR }
enum BitrateMode { CBR VBR ABR UNKNOWN }
enum DirectoryType { ALBUM ALBUM_RIP MULTIDISC_PARENT MULTIDISC_CHILD MIXED NON_AUDIO UNKNOWN }
enum RunKind { SCAN FINGERPRINT ANALYZE ENRICH }
enum RunStatus { RUNNING COMPLETED FAILED INTERRUPTED }
enum DuplicateKind { EXACT_HASH AUDIO_FINGERPRINT FUZZY_NAME }
enum ExternalSource { ACOUSTID MUSICBRAINZ DISCOGS }
enum MetaScope { FILE ALBUM FINGERPRINT }
enum VersionType { UNKNOWN ORIGINAL RADIO_EDIT EXTENDED CLUB_MIX INSTRUMENTAL ACAPELLA REMIX DUB LIVE DEMO REMASTER EDIT OTHER }

// ---------- IDENTITY / RUNS ----------
model Volume {
  id           String   @id @default(uuid())
  label        String
  serialNumber String?  @unique   // Windows volume serial / Mac+Linux FS UUID — stabilny klucz
  fsType       String?
  totalBytes   BigInt?
  notes        String?
  firstSeenAt  DateTime @default(now())
  directories  Directory[]
  files        File[]
  runs         Run[]
}

model Run {
  id          String    @id @default(uuid())
  kind        RunKind
  status      RunStatus @default(RUNNING)
  volume      Volume?   @relation(fields: [volumeId], references: [id])
  volumeId    String?
  hostname    String?   // która maszyna PC/Mac
  mountPath   String?   // np. "E:/Muzyka" — NIETRWAŁE, tylko z danej chwili
  rootRelPath String?
  options     Json?
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  dirsSeen    Int       @default(0)
  filesSeen   Int       @default(0)
  audioSeen   Int       @default(0)
  errors      Int       @default(0)
  bytesSeen   BigInt    @default(0)
}

// ---------- TREE ----------
model Directory {
  id                String        @id @default(uuid())
  volume            Volume        @relation(fields: [volumeId], references: [id])
  volumeId          String
  relPath           String        // względem roota wolumenu — stabilne między maszynami
  name              String
  parent            Directory?    @relation("DirTree", fields: [parentId], references: [id])
  parentId          String?
  children          Directory[]   @relation("DirTree")
  depth             Int
  fileCount         Int           @default(0)
  audioCount        Int           @default(0)
  hasCue            Boolean       @default(false)
  type              DirectoryType @default(UNKNOWN)
  multidiscParent   Directory?    @relation("Multidisc", fields: [multidiscParentId], references: [id])
  multidiscParentId String?
  multidiscChildren Directory[]   @relation("Multidisc")
  files             File[]
  firstSeenRunId    String?
  lastSeenRunId     String?
  @@unique([volumeId, relPath])
  @@index([parentId])
  @@index([hasCue])
}

model File {
  id                String      @id @default(uuid())
  directory         Directory   @relation(fields: [directoryId], references: [id])
  directoryId       String
  volume            Volume      @relation(fields: [volumeId], references: [id])
  volumeId          String
  relPath           String      // pełna ścieżka względem roota wolumenu (dir + filename)
  filename          String      // oryginał, dokładna wielkość liter
  filenameLower     String      // lowercase (wymóg wprost)
  filenameNorm      String      // mocno znormalizowany klucz fuzzy (z diakrytykami)
  filenameNormAscii String      // klucz fuzzy, diakrytyki spłaszczone
  extension         String      // lowercase, bez kropki
  fileType          FileType
  sizeBytes         BigInt
  mtime             DateTime?
  ctime             DateTime?
  contentHash       String?     // xxhash64 / sha256
  hashAlgo          String?
  isHidden          Boolean     @default(false)
  isSystem          Boolean     @default(false)
  scanStatus        ScanStatus  @default(DISCOVERED)
  scanError         String?
  firstSeenRunId    String?
  lastSeenRunId     String?
  audio             AudioFile?
  cueSheet          CueSheet?            // gdy ten plik JEST .cue
  tags              FileTag[]
  dupMemberships    DuplicateMember[]
  @@unique([volumeId, relPath])
  @@index([contentHash])
  @@index([filenameLower])
  @@index([filenameNorm])
  @@index([fileType])
  @@index([scanStatus])
}

model AudioFile {
  fileId          String      @id
  file            File        @relation(fields: [fileId], references: [id])
  // techniczne
  codec           String?     // mp3, aac, flac, alac, opus...
  durationSec     Float?
  bitrate         Int?
  bitrateMode     BitrateMode @default(UNKNOWN)
  sampleRate      Int?
  channels        Int?
  lossless        Boolean     @default(false)
  // tagi surowe (jak odczytane)
  tagTitle        String?
  tagArtist       String?
  tagAlbum        String?
  tagAlbumArtist  String?
  tagTrackNo      Int?
  tagDiscNo       Int?
  tagYear         Int?
  tagGenre        String?
  tagComment      String?
  hasId3v1        Boolean     @default(false)
  hasId3v2        Boolean     @default(false)
  id3v2Version    String?
  encodingGuess   String?     // cp1250 / iso-8859-2 / utf-8 ...
  rawTagBytes     Bytes?      // trzymane przy podejrzeniu mojibake — by re-dekodować bez powrotu do dysku
  // sparsowane z nazwy pliku
  parsedTitle     String?
  parsedArtist    String?
  parsedTrackNo   Int?
  // znormalizowane (faza Analyze)
  normTitle       String?
  normTitleAscii  String?
  normArtist      String?
  normArtistAscii String?
  // fingerprint (faza dysk/Enrich)
  fingerprint     String?
  fingerprintDur  Float?
  acoustId        String?
  // flagi ripu (faza Analyze)
  isAlbumRip      Boolean     @default(false)
  needsSplit      Boolean     @default(false)
  cueSheet        CueSheet?   @relation("RipCue", fields: [cueSheetId], references: [id])
  cueSheetId      String?
  // rekoncyliacja
  resolvedTitle   String?
  resolvedArtist  String?
  resolvedSource  String?     // TAG / FILENAME / EXTERNAL / MANUAL
  // wersja + utwór (faza Analyze)
  versionType     VersionType @default(UNKNOWN)
  versionLabel    String?     // surowy deskryptor, np. "Extended Club Mix"
  baseTitleNorm   String?     // tytuł bez deskryptora wersji — klucz do Work
  work            Work?       @relation(fields: [workId], references: [id])
  workId          String?
  @@index([normTitle])
  @@index([normArtist])
  @@index([acoustId])
  @@index([isAlbumRip])
  @@index([needsSplit])
  @@index([workId])
  @@index([baseTitleNorm])
}

model Work {
  id         String      @id @default(uuid())
  titleNorm  String      // tytuł bazowy (bez deskryptora wersji), znormalizowany
  artistNorm String?
  title      String?     // reprezentatywny tytuł do wyświetlenia
  artist     String?
  mbWorkId   String?     // MusicBrainz Work ID (faza Enrich)
  confidence Float?      // pewność heurystycznego klastrowania
  createdAt  DateTime    @default(now())
  audioFiles AudioFile[]
  @@index([titleNorm, artistNorm])
}

// ---------- CUE ----------
model CueSheet {
  id             String      @id @default(uuid())
  file           File        @relation(fields: [fileId], references: [id])
  fileId         String      @unique
  refAudioFileId String?     // plik audio FILE "...", do którego wskazuje (rozwiązany w obrębie katalogu)
  rawText        String
  encodingGuess  String?
  parseStatus    String?     // OK / PARTIAL / ERROR
  parseError     String?
  tracks         CueTrack[]
  rips           AudioFile[] @relation("RipCue")
}

model CueTrack {
  id         String   @id @default(uuid())
  cueSheet   CueSheet @relation(fields: [cueSheetId], references: [id])
  cueSheetId String
  trackNo    Int
  title      String?
  performer  String?
  startMs    Int?     // wyliczone z INDEX
  endMs      Int?     // wyliczone z następnego tracku / długości pliku
  @@index([cueSheetId])
}

// ---------- ENRICH / TAGS / DUPLICATES ----------
model ExternalMeta {
  id         String         @id @default(uuid())
  scope      MetaScope
  source     ExternalSource
  refFileId  String?        // gdy scope=FILE
  refDirId   String?        // gdy scope=ALBUM
  externalId String?
  queryUsed  String?        // co odpytano — do cache/dedup
  raw        Json
  fetchedAt  DateTime       @default(now())
  @@index([source])
  @@index([refFileId])
  @@index([refDirId])
}

model Tag {
  id     String    @id @default(uuid())
  name   String
  kind   String?   // genre / style / mood ...
  source String?
  files  FileTag[]
  @@unique([name, source])
}

model FileTag {
  file       File    @relation(fields: [fileId], references: [id])
  fileId     String
  tag        Tag     @relation(fields: [tagId], references: [id])
  tagId      String
  confidence Float?
  source     String?
  @@id([fileId, tagId])
}

model DuplicateGroup {
  id              String            @id @default(uuid())
  kind            DuplicateKind
  canonicalFileId String?           // wybrana kopia „do zachowania" (przyszłość)
  createdAt       DateTime          @default(now())
  members         DuplicateMember[]
}

model DuplicateMember {
  group   DuplicateGroup @relation(fields: [groupId], references: [id])
  groupId String
  file    File           @relation(fields: [fileId], references: [id])
  fileId  String
  score   Float?
  @@id([groupId, fileId])
}
```

### Konwencja nazewnictwa — fizyczne nazwy w Postgres (snake_case)

Modele i pola w Prisma zostają konwencjonalne (PascalCase / camelCase), ale **w bazie wszystko jest snake_case** przez `@@map` (tabele) i `@map` (kolumny). Pola jednowyrazowe (już lowercase, np. `id`, `scope`, `raw`, `name`) mapują się identycznie i `@map` nie potrzebują — `@map` dotyczy tylko nazw wielowyrazowych (camelCase). `@@index` referuje **nazwy pól Prisma** (nie fizyczne), Prisma sama je mapuje.

Wzorzec na `ExternalMeta` (z `fetched_at` i `query_used`):

```prisma
model ExternalMeta {
  id         String         @id @default(uuid())
  scope      MetaScope
  source     ExternalSource
  refFileId  String?        @map("ref_file_id")
  refDirId   String?        @map("ref_dir_id")
  externalId String?        @map("external_id")
  queryUsed  String?        @map("query_used")
  raw        Json
  fetchedAt  DateTime       @default(now()) @map("fetched_at")

  @@map("external_meta")
  @@index([source])
  @@index([refFileId])
  @@index([refDirId])
}
```

Pełna lista fizycznych nazw tabel (snake_case, liczba mnoga):

| Model Prisma | Tabela Postgres |
|---|---|
| `Volume` | `volumes` |
| `Run` | `runs` |
| `Directory` | `directories` |
| `File` | `files` |
| `AudioFile` | `audio_files` |
| `CueSheet` | `cue_sheets` |
| `CueTrack` | `cue_tracks` |
| `ExternalMeta` | `external_meta` |
| `Tag` | `tags` |
| `FileTag` | `file_tags` |
| `DuplicateGroup` | `duplicate_groups` |
| `DuplicateMember` | `duplicate_members` |
| `Work` | `works` |

Kolumny — przykłady mapowań (zastosuj `@map` do **wszystkich** kolumn camelCase wg tego wzorca): `contentHash`→`content_hash`, `hashAlgo`→`hash_algo`, `filenameLower`→`filename_lower`, `filenameNorm`→`filename_norm`, `filenameNormAscii`→`filename_norm_ascii`, `relPath`→`rel_path`, `sizeBytes`→`size_bytes`, `scanStatus`→`scan_status`, `scanError`→`scan_error`, `isHidden`→`is_hidden`, `isSystem`→`is_system`, `firstSeenRunId`→`first_seen_run_id`, `lastSeenRunId`→`last_seen_run_id`, `durationSec`→`duration_sec`, `bitrateMode`→`bitrate_mode`, `sampleRate`→`sample_rate`, `tagAlbumArtist`→`tag_album_artist`, `tagTrackNo`→`tag_track_no`, `hasId3v2`→`has_id3v2`, `id3v2Version`→`id3v2_version`, `encodingGuess`→`encoding_guess`, `rawTagBytes`→`raw_tag_bytes`, `parsedTrackNo`→`parsed_track_no`, `normTitleAscii`→`norm_title_ascii`, `fingerprintDur`→`fingerprint_dur`, `acoustId`→`acoust_id`, `isAlbumRip`→`is_album_rip`, `needsSplit`→`needs_split`, `cueSheetId`→`cue_sheet_id`, `resolvedSource`→`resolved_source`, `multidiscParentId`→`multidisc_parent_id`, `mountPath`→`mount_path`, `rootRelPath`→`root_rel_path`, `totalBytes`→`total_bytes`, `firstSeenAt`→`first_seen_at`, `versionType`→`version_type`, `versionLabel`→`version_label`, `baseTitleNorm`→`base_title_norm`, `workId`→`work_id`, `titleNorm`→`title_norm`, `artistNorm`→`artist_norm`, `mbWorkId`→`mb_work_id`.

Enumy — typ enuma też `@@map` na snake_case: `FileType`→`file_type`, `ScanStatus`→`scan_status`, `BitrateMode`→`bitrate_mode`, `DirectoryType`→`directory_type`, `RunKind`→`run_kind`, `RunStatus`→`run_status`, `DuplicateKind`→`duplicate_kind`, `ExternalSource`→`external_source`, `MetaScope`→`meta_scope`, `VersionType`→`version_type`. **Wartości** enuma zostają UPPER_CASE (`SCAN`, `ALBUM_RIP`, `EXACT_HASH`, `RADIO_EDIT`...) — to poprawne etykiety w PG.

> Tabele w liczbie mnogiej to konwencja — jeśli wolisz pojedynczą (`file`, `volume`), zmień globalnie, byle spójnie. To samo dotyczy wyboru, czy enum-typ ma kolidować nazwą z kolumną (`scan_status`); w PG typy i kolumny są w osobnych przestrzeniach nazw, więc jest to legalne, ale jeśli przeszkadza — dodaj sufiks do typów (np. `..._enum`).

---

## 7. Klasyfikacja plików (faza Scan)

Każdy plik dostaje `FileType` na podstawie rozszerzenia/nazwy. **Pliki ukryte i systemowe też katalogujemy** (flagi `isHidden`/`isSystem` + typ `SYSTEM`) — żeby później dało się je odnaleźć i usunąć.

- **AUDIO:** `mp3 flac aac m4a ogg opus wav wma ape wv alac aiff aif mpc dsf dff`
- **CUE:** `cue`
- **PLAYLIST:** `m3u m3u8 pls wpl xspf`
- **IMAGE:** `jpg jpeg png gif bmp webp tiff` (okładki — dodatkowo rozpoznaj rolę po nazwie: `front/cover/folder/back/cd/disc/inlay/booklet`)
- **TEXT:** `txt nfo md`
- **LOG:** `log` (logi ripów EAC/XLD)
- **METADATA:** `sfv md5 accurip toc`
- **ARCHIVE:** `zip rar 7z iso nrg` (odnotuj, **nie rozpakowuj** — poza zakresem)
- **SYSTEM/HIDDEN:** `Thumbs.db`, `desktop.ini`, `.DS_Store`, AppleDouble `._*`, `.Spotlight-*`, `$RECYCLE.BIN`, `System Volume Information`, `.Trashes` → flaguj `isSystem`
- **OTHER:** reszta (`pdf`, `doc`...)

`Directory.hasCue` ustaw, gdy w katalogu jest plik `.cue`. Klasyfikacja katalogu (`DirectoryType`) liczona w fazie Analyze.

---

## 8. Normalizacja nazw i parsing (core, czyste funkcje)

`filenameLower` = sam lowercase oryginału.

`filenameNorm` (klucz fuzzy do klastrowania duplikatów), kroki:
1. Usuń rozszerzenie.
2. Unicode **NFC**.
3. Lowercase.
4. Usuń wiodące numery tracków: `01 -`, `01.`, `01_`, `1)`, oraz winylowe `A1`/`B2`.
5. Zamień separatory `[-_.\s]+` → pojedyncza spacja.
6. Zwiń wielokrotne spacje, przytnij.

`filenameNormAscii` = jak wyżej, ale **diakrytyki spłaszczone** (`Żółć` → `zolc`). Trzymamy **obie** wersje (z diakrytykami i ASCII) — polskie nazwy bywają zapisane różnie. Normalizacja to **podpowiedź do klastrowania, nie dowód** tożsamości (dowodem są hash i fingerprint).

Parser nazwy pliku (rozpoznaj wzorce, zapisz `parsedArtist/parsedTitle/parsedTrackNo`, oznacz niejednoznaczność — bez nadmiernej kreatywności, zapisuj raw + best guess):
- `Artysta - Tytuł`
- `01 - Artysta - Tytuł`
- `01 - Tytuł` (artysta z folderu/tagu)
- `01. Tytuł`
- `Artysta - Album - 01 - Tytuł`
- `01_Tytuł`
- winyl: `A1`, `B2` (strona + numer)

**Trzymaj osobno metadane z tagów i z nazwy pliku — nie ufaj na ślepo żadnym.** Wybór, które źródło wygrywa (rekoncyliacja → `resolved*`), to krok fazy Analyze na danych już w bazie.

Dodatkowo, na potrzeby grupowania wersji, w fazie Analyze licz **tytuł bazowy** — tytuł po zdjęciu deskryptora wersji (np. „(Extended Mix)") — i jego znormalizowaną postać `baseTitleNorm`. Szczegóły w §11.

---

## 9. Obsługa kodowania (mojibake PL)

ID3v1 nie ma pola kodowania → bajty to zwykle Windows-1250/ISO-8859-2, a naiwne dekodowanie jako Latin-1 daje mojibake (`¯ó³æ` zamiast `Żółć`). To samo dotyczy nazw plików na starych FAT/NTFS oraz treści `.cue`.

- Użyj detekcji kodowania (`jschardet`) jako **hintu**; zapisz `encodingGuess`.
- Przy podejrzeniu mojibake **zachowaj surowe bajty** (`rawTagBytes`), żeby móc re-dekodować później **bez powrotu do fizycznego dysku**.
- To samo podejście dla plików `.cue` (`CueSheet.encodingGuess`).

---

## 10. `.cue` i ripy albumów

Parser `.cue` zrób od razu (tani), mimo że split jest w przyszłości:
- Wyciągnij `TRACK`/`TITLE`/`PERFORMER`/`INDEX` → `CueTrack` (z `startMs`, a `endMs` wylicz z kolejnego tracku lub długości pliku).
- Rozwiąż `FILE "..."` do konkretnego pliku audio w tym samym katalogu (`refAudioFileId`).

Detekcja ripu (faza Analyze — **łącz sygnały, sam czas to za mało**):
- obecność `.cue` wskazującego na plik audio w katalogu, **oraz**
- nietypowo długi czas pliku audio (> ~20–25 min), **oraz**
- mało plików audio w katalogu (często 1).
→ ustaw `AudioFile.isAlbumRip = true`, `needsSplit = true`, podlinkuj `cueSheetId`.

Rozróżnij wariant **redundantny**: `.cue` obecny, ale album już posplitowany na wiele krótkich tracków → `needsSplit = false`. Obsłuż też przypadki: `.cue` + jeden wielki FLAC (najczęstszy lossless), `.cue` + wielki MP3, `.cue` wskazujący kilka plików (album gapless).

---

## 11. Duplikaty i wersje utworu (faza Analyze)

Warstwowo, od najpewniejszego sygnału. **Grupy duplikatów są osobną encją i działają w poprzek wolumenów** (główny cel: ten sam plik na dysku A i B).

1. **`EXACT_HASH`** — identyczny `contentHash`. Najtańszy, najpewniejszy sygnał „dokładnie to samo". Przy dwóch dyskach takich będzie mnóstwo.
2. **`AUDIO_FINGERPRINT`** — ten sam materiał dźwiękowy w innym kontenerze/bitrate (**fingerprint całego nagrania**, Chromaprint/AcoustID). Właściwe narzędzie do stwierdzenia „ten sam utwór" niezależnie od nazwy/taga. Rozdziel trzy operacje:
   - **Generowanie** (`fpcalc`) — czyta audio, produkuje fingerprint. Faza dysk/Scan (`--fingerprint`).
   - **Porównanie** — **offline, w fazie Analyze**. Fingerprint to ciąg liczb; dopasowanie (alignment + bit-error-rate) jest deterministyczne, **nie wymaga sieci**. Kandydatów generuj przez wspólne sub-fingerprinty (Postgres `intarray`/GIN, wzorem serwera AcoustID), potem doważaj parami. To wystarcza do *wykrycia*, że pliki są tym samym nagraniem.
   - **Lookup online** (AcoustID → MusicBrainz) — daje *kanoniczną nazwę/tożsamość*. To faza Enrich, potrzebna tylko do **nazwania**, nie do dedupu.

   Schemat już to przyjmuje (`fingerprint`, `fingerprintDur`, `acoustId`) — implementacja może przyjść później, ale **pola gotowe od początku**.
3. **`FUZZY_NAME`** — po `filenameNorm`/`normTitle`. Tylko podpowiedź, nie dowód.

`DuplicateGroup.canonicalFileId` przewiduje przyszły wybór kopii „do zachowania" — poza zakresem teraz.

> **Uwaga — to NIE jest to samo, co szukanie fragmentu w nagraniu.** `AUDIO_FINGERPRINT` powyżej dopasowuje *całe nagrania*. Wyszukiwanie *fragmentu* utworu wewnątrz dłuższego pliku (np. „w której minucie tego 70-min miksu jest ten track") to inny algorytm (landmark/constellation, Shazam-style) i inne narzędzia (audfprint / dejavu / Panako / Olaf — Python/Java/C, w Node jako **sidecar**, osobny magazyn fingerprintów landmarkowych). **Decyzja: odłożone bezterminowo — kiedyś albo nigdy. Nie implementować i nie projektować teraz** (pole/architektura niepotrzebne na tym etapie). To stoi *poza* czterema fazami pipeline'u (§2). Patrz §17.

### Wersje utworu (grupowanie w utwory / Work)

**Inna oś niż duplikaty.** Duplikaty mówią „to ten sam plik / to samo nagranie"; wersje mówią „to ten sam **utwór** (kompozycja), ale inne nagranie" — radio edit, extended/club mix, instrumental, acapella, remix, live. Radio edit i extended **nie** złapią się jako `AUDIO_FINGERPRINT` (inne audio → inne fingerprinty), więc wymagają osobnego grupowania. Model jak w MusicBrainz: **`Work`** (kompozycja) → wiele wersji/nagrań.

Model (lekki, pod katalog): encja **`Work`** + pola na pliku audio: `versionType` (enum, domyślnie `UNKNOWN`), `versionLabel` (surowy deskryptor, np. „Extended Club Mix"), `baseTitleNorm` (tytuł bez deskryptora — klucz do `Work`), `workId`.

Wykrywanie (faza Analyze, heurystyka jak `FUZZY_NAME` — sugestia, nie dowód):
1. Z tytułu (tag) i/lub nazwy pliku wyłuskaj deskryptor wersji w nawiasach/po myślniku. Tokeny: `radio edit`/`radio version`, `extended`/`12"`, `club mix`, `instrumental`/`inst.`, `acapella`/`a cappella`, `dub`, `remix`/`rmx`, `original mix`, `live`, `demo`, `remaster(ed)`, `edit`, `VIP`… → sklasyfikuj do `versionType`, surowiec zachowaj w `versionLabel`.
2. Zdejmij deskryptor z tytułu → **tytuł bazowy** → normalizuj (jak w §8) → `baseTitleNorm`.
3. Klastruj pliki w `Work` po `(baseTitleNorm, artistNorm)`, z `confidence`.
4. **„Dostępne wersje utworu"** = wyróżnione `versionType`/`versionLabel` w obrębie `Work`; pliki identycznej wersji (ten sam radio edit jako mp3 i flac) zwijają się przez istniejące grupy `AUDIO_FINGERPRINT`/hash. Wyświetlasz: tytuł utworu → lista wersji z czasami (`durationSec`) i lokalizacjami plików.

Później (Enrich): AcoustID → MusicBrainz recording→work daje **autorytatywne** grupowanie (`mbWorkId`), które bije heurystykę z nazw.

Znane ograniczenia (zanotuj, nie rozwiązuj teraz):
- **Remiks kredytowany remikserowi** (inny `artist`) — klucz z artystą może rozdzielić wersje; `mbWorkId` później to scali.
- **Cover** (ten sam utwór, inny wykonawca) — klucz z artystą ich **nie** połączy (dla katalogu zwykle OK; Work z MusicBrainz by połączył).
- Złożone etykiety („Extended Instrumental") — wybierz typ wiodący, surowiec trzymaj w `versionLabel`.

> **Wariant rygorystyczny (opcjonalny, domyślnie poza zakresem):** wstaw warstwę **`Recording`** między `Work` a `File` (MusicBrainz Work → Recording → Track) — wtedy „wersja" to wiersz, a nie zapytanie, i pliki tej samej wersji zwijają się strukturalnie. Dla katalogu `Work` + pola wersji + istniejące grupy `AUDIO_FINGERPRINT` wystarczą; `Recording` dorzuć tylko gdy zależy Ci na twardej tożsamości wersji.

---

## 12. Albumy wielopłytowe (faza Analyze)

Wykryj sąsiednie katalogi `CD1`/`CD2`, `Disc 1`/`Disc 2`, `Płyta 1`/`Płyta 2` pod wspólnym rodzicem → powiąż jako jeden logiczny album (`Directory.multidiscParentId`, typy `MULTIDISC_PARENT`/`MULTIDISC_CHILD`). Uwzględnij rozróżnienie album-artist vs track-artist (Various Artists).

---

## 13. Idempotencja i wznawialność (faza Scan)

- **Stabilny klucz pliku:** `(volumeId, relPath)`. Re-skan dopasowuje istniejący wiersz.
- **Skan inkrementalny:** jeśli `size` + `mtime` bez zmian → pomiń kosztowną pracę (już zhashowane/odczytane). Zmienione → przelicz.
- **Wznawialność:** zapis postępu **przyrostowo**, status per plik (`scanStatus`). Po crashu/przerwaniu nowy run dobiera pliki w stanie `DISCOVERED`/`ERROR`; przerwane runy oznacz `INTERRUPTED`.
- **Wsady:** insert/upsert wsadowy (`createMany`/chunki ~500–1000), **nigdy** wiersz-per-transakcja. Dla hot-path bulk-insertu rozważ surowe `pg`/`COPY`, jeśli Prisma za wolna.
- **Nigdy nie owijaj całego skanu w jedną transakcję** — postęp musi przeżyć crash.
- **Błąd pojedynczego pliku ≠ przerwanie skanu:** `try/catch` per plik, zapis `scanError`, `scanStatus = ERROR`, kontynuacja.

---

## 14. Obchód FS i higiena skanu (faza Scan)

- **Read-only na źródle.** Zero zapisów na skanowanym wolumenie (nie modyfikujemy archiwum).
- Współbieżność konfigurowalna, **domyślnie umiarkowana (4–6)**; na HDD równoległe seeki i tak nie pomagają (thrashing), więc nie ma sensu pompować jej w górę. Flaga do zmiany w razie potrzeby.
- Graceful handling błędów I/O / nieczytelnych plików / braku uprawnień → log + `ERROR` + kontynuacja (pojedynczy zły plik nie wywala skanu).
- **Guard przeciw pętlom** symlinków/junctionów (śledź odwiedzone ścieżki rzeczywiste/inody, limit głębokości).

---

## 15. Powierzchnia CLI (`mdb`)

> Uwaga: pierwotny `mdb analyze <ścieżka>` rozdzielono na **`scan`** (faza 1, dysk), **`fingerprint`** (faza 2, dysk) i **`analyze`** (faza 3, czysta baza).

```
mdb volume register --label "DYSK_..." [--path E:/Muzyka]   # rejestracja tożsamości wolumenu
mdb volume list

mdb scan <path> [--volume <id|label>] [--concurrency N]
               [--hash] [--metadata] [--dry-run] [--resume]         # FAZA 1 (dysk)
mdb fingerprint [--volume <id>] [--concurrency N] [--resume]        # FAZA 2 (dysk): generowanie fingerprintów (fpcalc)

mdb analyze [--volume <id>]      # FAZA 3 (bez dysku): normalizacja, duplikaty (w tym porównanie fingerprintów), ripy, wielopłytowe, rekoncyliacja
mdb enrich  [--source discogs|musicbrainz|acoustid] [--scope album|file]       # FAZA 4 (sieć)

mdb search <query>     # wyszukiwanie + KONTEKST KATALOGU (rodzeństwo plików)
mdb duplicates [--kind exact|audio|fuzzy]
mdb stats
mdb status             # stan ostatnich runów / wznowienie
```

Wszystkie komendy: paski postępu (`cli-progress`), strukturalne logi (`pino`), błędy do bazy (nie wyrzucanie całego procesu), `--dry-run` gdzie ma sens.

**`search` musi zwracać kontekst katalogu** — to wymóg wprost: po znalezieniu „yellow submarine" pokaż pozostałe pliki w tym samym katalogu pogrupowane po typie (inne audio: „love me do", „hey jude" + nie-audio: `coverfront.jpg`, `info.txt`). Model to obsługuje trywialnie przez `directoryId`.

### Tryb interaktywny (wizard)

Poza interfejsem flagowym powyżej, uruchomienie **`mdb` bez argumentów** wchodzi w **interaktywny wizard**: nawigacja strzałkami ↑/↓, zatwierdzenie Enterem.

- Rekomendowana biblioteka: **`@clack/prompts`** (`select` = menu strzałkami, `text` = wpisanie ścieżki, `confirm`, `spinner`, `isCancel` na Ctrl+C) lub **`@inquirer/prompts`** (więcej typów, w tym file-picker). Do bogatego, żywo aktualizowanego TUI podczas długiego skanu — opcjonalnie `Ink`.
- **Warstwa interaktywna to tylko front-end** zbierający te same parametry co flagi i wywołujący **te same handlery** — bez duplikacji logiki. Cała robota siedzi w `core`/handlerach; wizard i parser flag (commander) to dwa wejścia do tego samego.
- Przepływ (fazy mają kolejność i zależności, więc bogatszy niż płaskie menu):
  1. wybór wolumenu (lub „zarejestruj nowy"),
  2. wybór fazy — `Scan` / `Fingerprint` / `Analyze` / `Enrich`, **ze statusem** (np. `Fingerprint — czeka, wymaga Scan`; niedostępne fazy wyszarzone/zablokowane),
  3. parametry fazy (dla `Scan`: ścieżka jako `text` z walidacją istnienia; współbieżność itd.),
  4. podsumowanie + `confirm`,
  5. uruchomienie z paskiem postępu.
  - Jeśli wizard wykryje **przerwany run** (`INTERRUPTED`), proponuje „Wznowić?".
- **Detekcja TTY:** gdy `process.stdin.isTTY` jest fałszywe (pipe, CI, log do pliku) — **nie** uruchamiaj wizarda; wymagaj flag / subkomend albo pokaż jasny komunikat. To drugi powód, dla którego interfejs flagowy zostaje pełnoprawny.
- Cross-platform (Windows Terminal + macOS) — biblioteki keypress to obsługują. Obsłuż czyste wyjście na Ctrl+C.

---

## 16. Wymagania jakościowe

- **Testy jednostkowe** dla deterministycznej logiki w `core`: normalizacja, parser nazw plików, klasyfikator typów, parser `.cue`, algorytmy duplikatów. To najwyżej-wartościowe, najłatwiej testowalne elementy.
- Konfiguracja w jednym miejscu: `DATABASE_URL`, współbieżność, klucze API (Discogs token, AcoustID key — później) przez `.env`.
- `jsonb` na surowe odpowiedzi zewnętrzne i `options` runów.
- Migracje Prisma od początku; seed deweloperski.
- README z instrukcją uruchomienia (w tym zależność systemowa `fpcalc`).

---

## 17. Zakres: co budować teraz vs później

**Milestone 1 — zbuduj w pełni (faza 1, katalog „wiemy co mamy"):**
- Monorepo (Turborepo + pnpm), wszystkie pakiety/apki utworzone (web może być pustym szkieletem).
- `packages/database`: pełny schemat Prisma + migracje.
- `packages/core`: normalizacja, parser nazw, klasyfikator, parser `.cue`, typy — z testami.
- `apps/cli`: `volume register/list`, `scan` (z hashem, metadanymi, parsingiem `.cue`, klasyfikacją, idempotencją, wznawialnością, read-only, batch insert), `status`, podstawowy `search` z kontekstem katalogu, `stats`.
- Resolver tożsamości wolumenu (Windows/macOS/Linux) z fallbackiem.

**Milestone 2 — `fingerprint` (faza 2, dyskowa):** generowanie fingerprintów akustycznych (`fpcalc`) dla plików audio i zapis (`fingerprint`, `fingerprintDur`, `scanStatus = FINGERPRINTED`). Idempotentne i wznawialne jak `scan`. Druga (ostatnia) faza wymagająca podłączonego dysku — uruchamiana zaraz po `scan`.

**Milestone 3 — `analyze` (faza 3, czysta baza):** normalizacja do `norm*`, wykrywanie duplikatów (`EXACT_HASH`, `AUDIO_FINGERPRINT` — **porównanie/klastrowanie fingerprintów offline**, `FUZZY_NAME`), **wykrywanie wersji i grupowanie w utwory** (`Work`: deskryptor → `versionType`/`versionLabel`, tytuł bazowy → `baseTitleNorm`, klastrowanie po `(baseTitleNorm, artistNorm)`), detekcja ripów i `needsSplit`, albumy wielopłytowe, rekoncyliacja.

**Milestone 4+ (tylko schemat + szkielet, nie implementuj):** `enrich` (faza 4 — AcoustID lookup → MusicBrainz/Discogs, cache, rate-limit, per album; w tym autorytatywny `mbWorkId` do grupowania utworów), `apps/web` (React — przeglądarka katalogu), `cleanup` (lista plików systemowych/ukrytych do usunięcia), split ripów (FFmpeg + INDEX-y z `.cue`).

**Odłożone bezterminowo (kiedyś albo nigdy — poza pipeline'em, NIE projektować teraz):** wyszukiwanie *fragmentu* utworu w nagraniu (landmark/Shazam-style, sidecar Python/Java — patrz §11), np. lokalizacja pojedynczych tracków w miksach DJ-skich.

---

## 18. Poza zakresem (non-goals)

- Jakiekolwiek **modyfikacje, przenoszenie lub kasowanie** plików na źródłowych dyskach.
- Rozpakowywanie archiwów.
- Faktyczny **split** ripów (tylko katalogowanie + flaga `needsSplit`).
- Fizyczna deduplikacja (tylko wykrywanie grup).
- Odtwarzanie/transkodowanie audio.

---

## 19. Kryteria akceptacji Milestone 1

1. `mdb volume register` zapisuje Volume ze stabilnym identyfikatorem (lub fallbackiem) — ten sam fizyczny dysk podpięty pod inną literą/ścieżką dopasowuje się do istniejącego Volume.
2. `mdb scan <path>` przechodzi rekurencyjnie cały katalog, zapisuje wszystkie pliki i katalogi (w tym ukryte/systemowe z flagami), z rozmiarem, mtime, typem, hashem; dla audio — kodek, czas, bitrate (+ tryb), sample rate, kanały oraz tagi i `parsed*`; dla `.cue` — sparsowane ścieżki.
3. Powtórne `scan` **nie duplikuje** wierszy; niezmienione pliki są pomijane; przerwany skan wznawia się od miejsca przerwania.
4. Skan przeżywa nieczytelny/uszkodzony plik (zapis `ERROR`, kontynuacja) i nie zapętla się na symlinkach.
5. `mdb search <query>` zwraca trafienie wraz z rodzeństwem plików w tym samym katalogu (audio i nie-audio osobno).
6. Operacje na źródle są wyłącznie read-only; insert do bazy jest wsadowy; widać pasek postępu.
7. Logika w `core` pokryta testami jednostkowymi.
