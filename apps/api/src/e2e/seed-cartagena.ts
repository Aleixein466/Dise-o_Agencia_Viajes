import { createHash } from "node:crypto";
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
  // Hard guard before any write or cleanup: this seeder only ever touches the isolated E2E database.
  const target = new URL(url);
  if (
    !/^ricaurte_cartagena_e2e(_ci)?$/.test(target.pathname.replace(/^\//, "")) ||
    !["127.0.0.1", "localhost"].includes(target.hostname)
  )
    throw new Error("Refusing to seed: DATABASE_URL must point to a local ricaurte_cartagena_e2e[_ci] database");
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
    // Second FINANCE user: manual abonos need an approver different from the registrar (four eyes).
    const approverEmail = "finance2.cartagena-e2e@ricaurte.test";
    const approver = await db.user.upsert({
      where: { email: approverEmail },
      update: {
        name: "Finanzas Aprobador E2E",
        status: "ACTIVE",
        passwordHash: await hash(password.normalize("NFKC"), options),
      },
      create: {
        email: approverEmail,
        name: "Finanzas Aprobador E2E",
        status: "ACTIVE",
        passwordHash: await hash(password.normalize("NFKC"), options),
      },
      select: { id: true },
    });
    await db.userRoleAssignment.upsert({
      where: { userId_roleCode: { userId: approver.id, roleCode: "FINANCE" } },
      update: {},
      create: { userId: approver.id, roleCode: "FINANCE" },
    });
    await db.$transaction([
      db.mfaFactor.deleteMany({ where: { userId: approver.id } }),
      db.mfaRecoveryCode.deleteMany({ where: { userId: approver.id } }),
      db.session.deleteMany({ where: { userId: approver.id } }),
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
    const publicIds = await seedPublicBuilder(db);
    console.log(
      JSON.stringify({
        destinationId: destination.id,
        packageId: pkg.id,
        hotelId: hotel.id,
        rateId: rate.id,
        ...publicIds,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

/**
 * Published catalog for the public builder E2E. Only for the isolated E2E database: the data is labelled E2E,
 * and the "approved" rule and legal document exist solely so the public flow can be exercised end to end.
 */
async function seedPublicBuilder(db: ReturnType<typeof createDbClient>) {
  const destination = await db.destination.upsert({
    where: { slug: "e2e-publico" },
    update: { name: "Destino Público E2E", status: "PUBLISHED", deletedAt: null },
    create: {
      slug: "e2e-publico",
      name: "Destino Público E2E",
      country: "Colombia",
      category: "NACIONAL",
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  const hotel = await db.hotel.upsert({
    where: { slug: "e2e-hotel-publico" },
    update: { destinationId: destination.id, name: "Hotel Público E2E", status: "PUBLISHED", deletedAt: null },
    create: {
      destinationId: destination.id,
      slug: "e2e-hotel-publico",
      name: "Hotel Público E2E",
      status: "PUBLISHED",
      stars: 3,
    },
    select: { id: true },
  });
  const room = await db.roomType.upsert({
    where: { hotelId_name: { hotelId: hotel.id, name: "Doble Público E2E" } },
    update: { deletedAt: null, active: true },
    create: { hotelId: hotel.id, name: "Doble Público E2E", maxOccupancy: 2, active: true },
    select: { id: true },
  });
  const pkg = await db.tourPackage.upsert({
    where: { slug: "e2e-publico-3d2n" },
    update: {
      destinationId: destination.id,
      title: "Paquete Público E2E 3 días",
      durationDays: 3,
      status: "PUBLISHED",
      deletedAt: null,
    },
    create: {
      destinationId: destination.id,
      slug: "e2e-publico-3d2n",
      title: "Paquete Público E2E 3 días",
      durationDays: 3,
      status: "PUBLISHED",
      isFictitious: true,
      includes: ["Alojamiento de prueba"],
      excludes: ["Gastos personales"],
    },
    select: { id: true },
  });
  // Earlier public requests are kept: consent records are append-only (rt_reject_mutation) and quote lines keep
  // referencing their rule. Each run uses a fresh idempotency key, so old rows never collide.
  await db.packageComponent.deleteMany({ where: { packageId: pkg.id } });
  await db.packageComponent.createMany({
    data: [
      { packageId: pkg.id, type: "HOTEL", hotelId: hotel.id, included: true, sortOrder: 0 },
      { packageId: pkg.id, type: "ROOM_TYPE", roomTypeId: room.id, included: true, sortOrder: 1 },
    ],
  });
  const rule = {
    conditions: { label: "Hotel Público E2E · doble", roomTypeId: room.id },
    ruleSetVersion: "e2e-public-v1",
    unit: "PER_PERSON" as const,
    amountCents: 50_000_000n,
    active: true,
    isFictitious: false,
    validFrom: null,
    validTo: null,
  };
  const name = "Tarifa aprobada E2E · doble";
  const existing = await db.priceRule.findFirst({ where: { packageId: pkg.id, name }, select: { id: true } });
  if (existing) await db.priceRule.update({ where: { id: existing.id }, data: rule });
  else await db.priceRule.create({ data: { packageId: pkg.id, name, ...rule } });
  // Only one approved base rate, so the public base selection stays unambiguous.
  await db.priceRule.updateMany({ where: { packageId: pkg.id, name: { not: name } }, data: { active: false } });
  const body = "Documento de prueba E2E. No es un texto legal vigente.";
  await db.legalDocument.upsert({
    where: { type_version: { type: "DATA_TREATMENT_AUTHORIZATION", version: "e2e-v1" } },
    update: {},
    create: {
      type: "DATA_TREATMENT_AUTHORIZATION",
      version: "e2e-v1",
      title: "Autorización E2E",
      body,
      contentSha256: createHash("sha256").update(body).digest("hex"),
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  return { publicPackageId: pkg.id };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "E2E seed failed");
  process.exit(1);
});
