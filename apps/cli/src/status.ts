/**
 * `mdb status` (spec §15) — recent runs across volumes and resume hints.
 */
import { db } from "./db.js";

export async function showStatus(): Promise<void> {
  const prisma = db();
  const runs = (await prisma.run.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    include: { volume: { select: { label: true } } },
  })) as Array<{
    kind: string;
    status: string;
    startedAt: Date;
    filesSeen: number;
    audioSeen: number;
    errors: number;
    volume: { label: string } | null;
  }>;

  if (runs.length === 0) {
    console.log("No runs yet. Start with: mdb scan <path> --volume <id|label>");
    return;
  }

  console.log("Recent runs:");
  for (const r of runs) {
    const when = r.startedAt.toISOString().replace("T", " ").slice(0, 19);
    console.log(
      `  ${when}  ${r.kind.padEnd(11)} ${r.status.padEnd(11)} ` +
        `vol=${r.volume?.label ?? "-"}  files=${r.filesSeen} audio=${r.audioSeen} err=${r.errors}`,
    );
  }

  const interrupted = runs.filter((r) => r.status === "INTERRUPTED");
  if (interrupted.length > 0) {
    console.log(
      `\n${interrupted.length} interrupted run(s). Re-run 'mdb scan <path> --resume' to continue where it stopped.`,
    );
  }
}
