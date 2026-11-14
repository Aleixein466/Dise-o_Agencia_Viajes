import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { hash, type Algorithm } from "@node-rs/argon2";
import { checkPasswordPolicy, isStaffRole, type RoleCode } from "@ricaurte/domain";
import { DbService } from "../db/db.service";

const options = { algorithm: 2 as Algorithm, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

@Injectable()
export class UsersService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async list(query: string | undefined) {
    const client = await this.db.client();
    const where = query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" as const } },
            { name: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {};
    return client.user
      .findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          lastLoginAt: true,
          roles: { select: { roleCode: true } },
          mfaFactors: { where: { revokedAt: null, confirmedAt: { not: null } }, select: { id: true } },
        },
      })
      .then((users) =>
        users.map((user) => ({
          ...user,
          roles: user.roles.map((role) => role.roleCode),
          mfaEnrolled: user.mfaFactors.length > 0,
        })),
      );
  }

  async activity(id: string) {
    const client = await this.db.client();
    const user = await client.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException();
    return client.auditLog.findMany({
      where: { entity: "user", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, createdAt: true, actorId: true },
    });
  }

  async create(input: { email: string; name: string; password: string; roles: RoleCode[] }, actorId: string) {
    if (!input.roles.length || !input.roles.every(isStaffRole)) throw new ForbiddenException();
    const policy = checkPasswordPolicy(input.password, { email: input.email, name: input.name });
    if (!policy.ok) throw new ForbiddenException();
    const client = await this.db.client();
    const user = await client.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: await hash(input.password.normalize("NFKC"), options),
        status: "ACTIVE",
        roles: { createMany: { data: input.roles.map((roleCode) => ({ roleCode, grantedById: actorId })) } },
      },
      select: { id: true, email: true, name: true, status: true },
    });
    await client.auditLog.create({ data: { actorId, action: "users.created", entity: "user", entityId: user.id } });
    return user;
  }

  async update(id: string, input: { name?: string; status?: "ACTIVE" | "DISABLED" }, actorId: string) {
    if (id === actorId) throw new ForbiddenException();
    const client = await this.db.client();
    const user = await client.user
      .update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name.trim() } : {}),
          ...(input.status
            ? {
                status: input.status,
                ...(input.status === "DISABLED"
                  ? { sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } } }
                  : {}),
              }
            : {}),
        },
        select: { id: true, email: true, name: true, status: true },
      })
      .catch(() => {
        throw new NotFoundException();
      });
    await client.auditLog.create({ data: { actorId, action: "users.updated", entity: "user", entityId: id } });
    return user;
  }

  async assignRoles(id: string, roles: RoleCode[], actorId: string) {
    if (id === actorId || !roles.length || !roles.every(isStaffRole)) throw new ForbiddenException();
    const client = await this.db.client();
    const exists = await client.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException();
    await client.$transaction([
      client.userRoleAssignment.deleteMany({ where: { userId: id } }),
      client.userRoleAssignment.createMany({
        data: roles.map((roleCode) => ({ userId: id, roleCode, grantedById: actorId })),
      }),
      client.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await client.auditLog.create({ data: { actorId, action: "users.roles_changed", entity: "user", entityId: id } });
  }
}
