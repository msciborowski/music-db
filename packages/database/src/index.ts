import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

export interface PrismaClientOptions {
  /** Postgres connection string. Defaults to `process.env.DATABASE_URL`. */
  connectionString?: string;
  /** Extra PrismaClient log levels (e.g. ["query", "warn"]). */
  log?: ConstructorParameters<typeof PrismaClient>[0] extends { log?: infer L }
    ? L
    : never;
}

/**
 * Shared Prisma client factory (spec §4). API (NestJS) and CLI (commander) both
 * import from here, so there is a single place configuring the Postgres driver
 * adapter (Prisma 7 driver adapters) and logging.
 */
export function createPrismaClient(options: PrismaClientOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Provide it via .env or PrismaClientOptions.connectionString.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter, ...(options.log ? { log: options.log } : {}) });
}

let singleton: PrismaClient | undefined;

/** Lazily-created, process-wide client (convenient for the CLI). */
export function getPrisma(): PrismaClient {
  singleton ??= createPrismaClient();
  return singleton;
}

export async function disconnectPrisma(): Promise<void> {
  if (singleton) {
    await singleton.$disconnect();
    singleton = undefined;
  }
}
