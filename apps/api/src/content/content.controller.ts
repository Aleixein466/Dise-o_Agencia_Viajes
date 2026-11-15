import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { badRequest, notFound } from "../catalog/commercial-rules.service";
import { blockSchemas, isBlockName, type BlockName } from "./blocks";
import { ContentBlocksService } from "./content-blocks.service";
import { ContentService, type StatusAction } from "./content.service";
import { PublicContentService } from "./public-content.service";
import { sanitizeText } from "./sanitize";

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(STATUSES).optional(),
  topic: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(["PAGE", "ARTICLE", "GUIDE"]).optional(),
});
const stamp = { expectedUpdatedAt: z.iso.datetime().transform((value) => new Date(value)) };
const transition = z.object(stamp).strict();
// Publishing is an explicit attestation that promotions, prices and conditions in the content were approved.
const publishBody = z.object({ ...stamp, confirmApproved: z.literal(true) }).strict();

const plain = (max: number, min = 0) =>
  z
    .string()
    .max(max * 4)
    .transform(sanitizeText)
    .pipe(z.string().min(min).max(max));
const optPlain = (max: number) =>
  z
    .union([z.null(), plain(max)])
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));
const faqFields = {
  question: plain(300, 5),
  answer: plain(8000, 2),
  topic: optPlain(80),
  sortOrder: z.number().int().min(0).max(100000),
};
const faqCreate = z.object({ ...faqFields, sortOrder: faqFields.sortOrder.optional() }).strict();
const faqPatch = z.object({ ...z.object(faqFields).partial().shape, ...stamp }).strict();

const slug = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const pageFields = {
  slug,
  kind: z.enum(["PAGE", "ARTICLE", "GUIDE"]),
  title: plain(200, 2),
  excerpt: optPlain(500),
  body: plain(40000, 1),
  seoTitle: optPlain(70),
  seoDescription: optPlain(170),
  noindex: z.boolean(),
};
const pageCreate = z.object({ ...pageFields, noindex: pageFields.noindex.optional() }).strict();
const pagePatch = z.object({ ...z.object(pageFields).partial().shape, ...stamp }).strict();

// Block drafts: first save has no row yet (expectedUpdatedAt null).
const draftStamp = z.union([z.null(), z.iso.datetime().transform((value) => new Date(value))]);

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest("VALIDATION_FAILED", "Datos inválidos");
  return parsed.data;
}
function parsePublish(value: unknown) {
  const parsed = publishBody.safeParse(value);
  if (!parsed.success) {
    const approval = value && typeof value === "object" && (value as Record<string, unknown>).confirmApproved !== true;
    throw badRequest(
      approval ? "APPROVAL_REQUIRED" : "VALIDATION_FAILED",
      approval
        ? "Confirma que las promociones, precios y condiciones fueron aprobados antes de publicar"
        : "Datos inválidos",
    );
  }
  return parsed.data.expectedUpdatedAt;
}
function uuidParam(id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}
function blockParam(name: string): BlockName {
  if (!isBlockName(name)) throw notFound();
  return name;
}
function token(request: FastifyRequest, name: string) {
  const value = request.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) throw new UnauthorizedException();
  return value;
}

/** Staff content admin. Permission: content:write. */
@Controller("content")
export class ContentController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(ContentBlocksService) private readonly blocks: ContentBlocksService,
  ) {}
  private read(request: FastifyRequest) {
    return this.auth.requireReadPermission(token(request, this.auth.cookieName()), "content:write");
  }
  private async actor(request: FastifyRequest, csrf: string | undefined, origin: string | undefined) {
    const principal = await this.auth.requirePermission(
      token(request, this.auth.cookieName()),
      csrf,
      origin,
      "content:write",
    );
    return principal.user.id;
  }

  // FAQ
  @Get("faq") async listFaq(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { page, pageSize, status, topic } = parse(listQuery, query);
    return this.content.listFaq({ status, topic }, page, pageSize);
  }
  @Get("faq/:id") async getFaq(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.content.getFaq(uuidParam(id));
  }
  @Get("faq/:id/history") async faqHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.content.history("faq_item", uuidParam(id));
  }
  @Post("faq") async createFaq(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.content.createFaq(parse(faqCreate, body), actorId);
  }
  @Patch("faq/:id") async updateFaq(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const { expectedUpdatedAt, ...patch } = parse(faqPatch, body);
    if (!Object.keys(patch).length) throw badRequest("VALIDATION_FAILED", "No hay cambios");
    return this.content.updateFaq(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post("faq/:id/:action") async faqAction(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const act = statusAction(action);
    const expected = act === "publish" ? parsePublish(body) : parse(transition, body).expectedUpdatedAt;
    return this.content.faqStatus(uuidParam(id), act, expected, actorId);
  }

  // Pages
  @Get("pages") async listPages(@Req() request: FastifyRequest, @Query() query: unknown) {
    await this.read(request);
    const { page, pageSize, status, kind } = parse(listQuery, query);
    return this.content.listPages({ status, kind }, page, pageSize);
  }
  @Get("pages/:id") async getPage(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.content.getPage(uuidParam(id));
  }
  @Get("pages/:id/history") async pageHistory(@Param("id") id: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.content.history("content_page", uuidParam(id));
  }
  @Post("pages") async createPage(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    return this.content.createPage(parse(pageCreate, body), actorId);
  }
  @Patch("pages/:id") async updatePage(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const { expectedUpdatedAt, ...patch } = parse(pagePatch, body);
    if (!Object.keys(patch).length) throw badRequest("VALIDATION_FAILED", "No hay cambios");
    return this.content.updatePage(uuidParam(id), patch, expectedUpdatedAt, actorId);
  }
  @Post("pages/:id/:action") async pageAction(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const act = statusAction(action);
    const expected = act === "publish" ? parsePublish(body) : parse(transition, body).expectedUpdatedAt;
    return this.content.pageStatus(uuidParam(id), act, expected, actorId);
  }

  // Home blocks and media
  @Get("media") async media(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.blocks.media();
  }
  @Get("blocks") async listBlocks(@Req() request: FastifyRequest) {
    await this.read(request);
    return this.blocks.list();
  }
  @Get("blocks/:block/history") async blockHistory(@Param("block") block: string, @Req() request: FastifyRequest) {
    await this.read(request);
    return this.blocks.history(blockParam(block));
  }
  @Put("blocks/:block") async saveDraft(
    @Param("block") block: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const name = blockParam(block);
    const envelope = parse(z.object({ expectedUpdatedAt: draftStamp, draft: z.unknown() }).strict(), body);
    const draft = parse(blockSchemas[name], envelope.draft);
    return this.blocks.saveDraft(name, draft as Record<string, unknown>, envelope.expectedUpdatedAt, actorId);
  }
  @Post("blocks/:block/:action") async blockAction(
    @Param("block") block: string,
    @Param("action") action: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers("x-csrf-token") csrf?: string,
    @Headers("origin") origin?: string,
  ) {
    const actorId = await this.actor(request, csrf, origin);
    const name = blockParam(block);
    if (action === "publish") return this.blocks.publish(name, parsePublish(body), actorId);
    const expected = parse(transition, body).expectedUpdatedAt;
    if (action === "unpublish") return this.blocks.unpublish(name, expected, actorId);
    if (action === "discard") return this.blocks.discardDraft(name, expected, actorId);
    throw notFound();
  }
}

function statusAction(action: string): StatusAction {
  if (action === "publish" || action === "unpublish" || action === "archive" || action === "restore") return action;
  throw notFound();
}

/** Unauthenticated read of PUBLISHED content only. */
@Controller("public/content")
export class PublicContentController {
  constructor(@Inject(PublicContentService) private readonly content: PublicContentService) {}
  @Get() all() {
    return this.content.content();
  }
  @Get("pages/:slug") page(@Param("slug") slug: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) throw notFound();
    return this.content.page(slug);
  }
}
