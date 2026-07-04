import path from "node:path";
import dotenv from "dotenv";
import { getPrisma } from "@mdb/database";

let loaded = false;
function ensureEnv(): void {
  if (loaded) return;
  // Web app cwd is apps/web; the shared DATABASE_URL lives at the monorepo root.
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
  dotenv.config();
  loaded = true;
}

export function prisma(): ReturnType<typeof getPrisma> {
  ensureEnv();
  return getPrisma();
}
