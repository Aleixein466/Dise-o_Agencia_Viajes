import { createDbClient } from "@ricaurte/db";
import { PortfolioImportService } from "./portfolio-import.service";

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.PORTFOLIO_IMPORT_ACTOR_EMAIL?.trim().toLowerCase();
  if (!url || !email) throw new Error("DATABASE_URL and PORTFOLIO_IMPORT_ACTOR_EMAIL are required");
  const client = createDbClient(url);
  try {
    const actor = await client.user.findFirst({
      where: { email, status: "ACTIVE", roles: { some: { roleCode: "ADMIN" } } },
      select: { id: true },
    });
    if (!actor) throw new Error("An active ADMIN actor is required for portfolio import");
    const service = new PortfolioImportService({ client: async () => client } as never);
    const report = process.argv.includes("--apply") ? await service.import(actor.id) : service.preview();
    console.log(JSON.stringify(report));
  } finally {
    await client.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Portfolio import failed");
  process.exit(1);
});
