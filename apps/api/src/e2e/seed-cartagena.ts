import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { createDbClient } from "@ricaurte/db";

const options = { algorithm: 2 as Algorithm, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

async function main() {
  const url = process.env.DATABASE_URL;
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  const email = process.env.E2E_RESTRICTED_EMAIL?.trim().toLowerCase();
  const password = process.env.E2E_RESTRICTED_PASSWORD;
  if (!url || !adminEmail || !adminPassword || !email || !password)
    throw new Error("DATABASE_URL, E2E_ADMIN_*, and E2E_RESTRICTED_* are required");
  const db = createDbClient(url);
  try {
    const admin = await db.user.update({
      where: { email: adminEmail },
      data: {
        status: "ACTIVE",
        passwordHash: await hash(adminPassword.normalize("NFKC"), options),
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: { id: true, passwordHash: true },
    });
    if (!admin.passwordHash || !(await verify(admin.passwordHash, adminPassword, options)))
      throw new Error("E2E administrator password hash could not be verified");
    await db.$transaction([
      db.mfaFactor.deleteMany({ where: { userId: admin.id } }),
      db.mfaRecoveryCode.deleteMany({ where: { userId: admin.id } }),
      db.session.deleteMany({ where: { userId: admin.id } }),
    ]);
    const restricted = await db.user.upsert({
      where: { email },
      update: { name: "Finance E2E", status: "ACTIVE", passwordHash: await hash(password.normalize("NFKC"), options) },
      create: {
        email,
        name: "Finance E2E",
        status: "ACTIVE",
        passwordHash: await hash(password.normalize("NFKC"), options),
      },
      select: { id: true },
    });
    await db.userRoleAssignment.upsert({
      where: { userId_roleCode: { userId: restricted.id, roleCode: "FINANCE" } },
      update: {},
      create: { userId: restricted.id, roleCode: "FINANCE" },
    });
    await db.$transaction([
      db.mfaFactor.deleteMany({ where: { userId: restricted.id } }),
      db.mfaRecoveryCode.deleteMany({ where: { userId: restricted.id } }),
      db.session.deleteMany({ where: { userId: restricted.id } }),
    ]);
    const destination = await db.destination.upsert({
      where: { slug: "e2e-cartagena" },
      update: { name: "Cartagena E2E", status: "DRAFT", deletedAt: null },
      create: {
        slug: "e2e-cartagena",
        name: "Cartagena E2E",
        country: "Colombia",
        category: "NACIONAL",
        status: "DRAFT",
      },
      select: { id: true },
    });
    const media = await db.mediaAttachment.findMany({
      where: { destinationId: destination.id },
      select: { assetId: true },
    });
    await db.mediaAttachment.deleteMany({ where: { destinationId: destination.id } });
    if (media.length) await db.mediaAsset.deleteMany({ where: { id: { in: media.map((item) => item.assetId) } } });
    const hotel = await db.hotel.upsert({
      where: { slug: "e2e-hotel-cartagena" },
      update: { destinationId: destination.id, name: "Hotel Cartagena E2E", status: "DRAFT", deletedAt: null },
      create: {
        destinationId: destination.id,
        slug: "e2e-hotel-cartagena",
        name: "Hotel Cartagena E2E",
        status: "DRAFT",
        stars: 3,
      },
      select: { id: true },
    });
    const room = await db.roomType.upsert({
      where: { hotelId_name: { hotelId: hotel.id, name: "Doble E2E" } },
      update: { deletedAt: null, active: true },
      create: { hotelId: hotel.id, name: "Doble E2E", maxOccupancy: 2, active: true },
      select: { id: true },
    });
    const pkg = await db.tourPackage.upsert({
      where: { slug: "e2e-cartagena-4d3n" },
      update: {
        destinationId: destination.id,
        title: "Cartagena E2E 4 días 3 noches",
        durationDays: 4,
        status: "DRAFT",
        isFictitious: true,
        deletedAt: null,
      },
      create: {
        destinationId: destination.id,
        slug: "e2e-cartagena-4d3n",
        title: "Cartagena E2E 4 días 3 noches",
        durationDays: 4,
        status: "DRAFT",
        isFictitious: true,
        includes: ["Datos de prueba aislados"],
      },
      select: { id: true },
    });
    await db.packageComponent.deleteMany({ where: { packageId: pkg.id } });
    await db.packageComponent.createMany({
      data: [
        { packageId: pkg.id, type: "HOTEL", hotelId: hotel.id, included: true, sortOrder: 0 },
        { packageId: pkg.id, type: "ROOM_TYPE", roomTypeId: room.id, included: true, sortOrder: 1 },
      ],
    });
    const existingRate = await db.priceRule.findFirst({
      where: { packageId: pkg.id, name: "Tarifa borrador Cartagena E2E" },
      select: { id: true },
    });
    const rate = existingRate
      ? await db.priceRule.update({
          where: { id: existingRate.id },
          data: { amountCents: 123_450_000n, active: false, isFictitious: true },
          select: { id: true },
        })
      : await db.priceRule.create({
          data: {
            packageId: pkg.id,
            name: "Tarifa borrador Cartagena E2E",
            ruleSetVersion: "e2e-v1",
            unit: "PER_PERSON",
            amountCents: 123_450_000n,
            active: false,
            isFictitious: true,
            conditions: { label: "Hotel Cartagena E2E · doble" },
          },
          select: { id: true },
        });
    await db.auditLog.deleteMany({ where: { entity: "price_rule", entityId: rate.id } });
    console.log(
      JSON.stringify({ destinationId: destination.id, packageId: pkg.id, hotelId: hotel.id, rateId: rate.id }),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "E2E seed failed");
  process.exit(1);
});
