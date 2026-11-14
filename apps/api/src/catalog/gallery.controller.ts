import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { GalleryService } from "./gallery.service";
function token(r: FastifyRequest, n: string) {
  const v = r.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${n}=`))
    ?.slice(n.length + 1);
  if (!v) throw new UnauthorizedException();
  return v;
}
@Controller("gallery")
export class GalleryController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(GalleryService) private gallery: GalleryService,
  ) {}
  @Post("upload/:type/:id") async upload(
    @Param("type") type: string,
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    if (type !== "destination" && type !== "hotel" && type !== "package") throw new BadRequestException();
    const actor = await this.auth.requirePermission(token(req, this.auth.cookieName()), csrf, origin, "catalog:write");
    const part = await (
      req as FastifyRequest & {
        file: () => Promise<{ toBuffer: () => Promise<Buffer>; fields: Record<string, { value?: unknown }> }>;
      }
    ).file();
    if (!part) throw new BadRequestException();
    const field = part.fields.altText as { value?: unknown } | undefined;
    const alt = typeof field?.value === "string" ? field.value : "Imagen sin descripción";
    return this.gallery.upload({ type, id }, alt, await part.toBuffer(), actor.user.id);
  }
  @Get(":id") async file(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.requireReadPermission(token(req, this.auth.cookieName()), "catalog:write");
    const { asset, body } = await this.gallery.read(id);
    res.header("content-type", asset.mimeType).header("cache-control", "private, no-store");
    return body;
  }
  @Delete(":id") async remove(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    const actor = await this.auth.requirePermission(token(req, this.auth.cookieName()), csrf, origin, "catalog:write");
    await this.gallery.remove(id, actor.user.id);
    return { ok: true };
  }
}
