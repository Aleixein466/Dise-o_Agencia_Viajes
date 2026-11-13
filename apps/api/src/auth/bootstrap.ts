import { hash, type Algorithm } from "@node-rs/argon2";
import { PERMISSION_KEYS, ROLE_CODES, ROLE_PERMISSIONS, checkPasswordPolicy } from "@ricaurte/domain";
import { createDbClient } from "@ricaurte/db";

const options = { algorithm: 2 as Algorithm, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

/**
 * Deliberately manual, non-production bootstrap. It seeds the static RBAC catalogue and creates one
 * administrator only when all three BOOTSTRAP_* variables have been supplied by the operator.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Bootstrap is prohibited in production");
  const url = process.env.DATABASE_URL;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrador inicial";
  if (!url || !email || !password)
    throw new Error("DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required");
  if (!checkPasswordPolicy(password, { email, name }).ok)
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD does not satisfy policy");
  const db = createDbClient(url);
  try {
    for (const role of ROLE_CODES)
      await db.role.upsert({ where: { code: role }, update: {}, create: { code: role, name: role } });
    const permissions = await Promise.all(
      PERMISSION_KEYS.map((key) =>
        db.permission.upsert({ where: { key }, update: { description: key }, create: { key, description: key } }),
      ),
    );
    const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
    for (const role of ROLE_CODES) {
      await db.rolePermission.deleteMany({ where: { roleCode: role } });
      await db.rolePermission.createMany({
        data: ROLE_PERMISSIONS[role].map((key) => ({ roleCode: role, permissionId: byKey.get(key)! })),
        skipDuplicates: true,
      });
    }
    const user = await db.user.upsert({
      where: { email },
      update: { name, status: "ACTIVE" },
      create: { email, name, passwordHash: await hash(password.normalize("NFKC"), options), status: "ACTIVE" },
    });
    await db.userRoleAssignment.upsert({
      where: { userId_roleCode: { userId: user.id, roleCode: "ADMIN" } },
      update: {},
      create: { userId: user.id, roleCode: "ADMIN" },
    });
    console.log(`Bootstrap completed for ${email}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exit(1);
});
