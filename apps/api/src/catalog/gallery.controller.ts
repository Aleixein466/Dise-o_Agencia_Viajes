import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { GalleryService } from "./gallery.service";

const ownerSchema = z.object({ type: z.enum(["destination", "hotel", "package"]), id: z.uuid() });
const updateSchema = z
  .object({
    altText: z.string().trim().max(250).optional(),
    owner: ownerSchema.optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    cover: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

@Controller("gallery")
export class GalleryController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GalleryService) private readonly gallery: GalleryService,
  ) {}
  private write(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    return this.auth.requirePermission(token(request, this.auth.cookieName()), csrf, origin, "catalog:write");
  }
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "catalog:write");
  }

  @Get()
  async list(@Req() request: FastifyRequest, @Query("type") type?: string, @Query("ownerId") id?: string) {
    await this.read(request);
    if ((type && !id) || (!type && id)) throw new BadRequestException();
    const owner = type && id ? ownerSchema.safeParse({ type, id }) : null;
    if (owner && !owner.success) throw new BadRequestException();
    return this.gallery.list(owner?.data);
  }

  @Post("upload/:type/:id")
  async upload(
    @Param("type") type: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const owner = ownerSchema.safeParse({ type, id });
    if (!owner.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    const part = await (
      request as FastifyRequest & {
        file: () => Promise<{ toBuffer: () => Promise<Buffer>; fields: Record<string, { value?: unknown }> }>;
      }
    ).file();
    if (!part) throw new BadRequestException();
    const field = part.fields.altText as { value?: unknown } | undefined;
    return this.gallery.upload(
      owner.data,
      typeof field?.value === "string" ? field.value : "",
      await part.toBuffer(),
      actor.user.id,
    );
  }

  @Post(":id/associate")
  async associate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const owner = ownerSchema.safeParse(body);
    if (!owner.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    await this.gallery.associate(id, owner.data, actor.user.id);
    return { ok: true };
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const input = updateSchema.safeParse(body);
    if (!input.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    return this.gallery.update(id, input.data, actor.user.id);
  }

  @Delete(":id/association/:type/:ownerId")
  async detach(
    @Param("id") id: string,
    @Param("type") type: string,
    @Param("ownerId") ownerId: string,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const owner = ownerSchema.safeParse({ type, id: ownerId });
    if (!owner.success) throw new BadRequestException();
    const actor = await this.write(request, csrf, origin);
    await this.gallery.detach(id, owner.data, actor.user.id);
    return { ok: true };
  }

  @Get(":id")
  async file(@Param("id") id: string, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.read(request);
    const { asset, body } = await this.gallery.read(id);
    reply.header("content-type", asset.mimeType).header("cache-control", "private, no-store");
    return body;
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const actor = await this.write(request, csrf, origin);
    await this.gallery.remove(id, actor.user.id);
    return { ok: true };
  }
}
