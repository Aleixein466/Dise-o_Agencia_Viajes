import { ForbiddenException } from "@nestjs/common";
import { permissionsForRoles, type RoleCode } from "@ricaurte/domain";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { ContentController, PublicContentController } from "./content.controller";

const ID = "00000000-0000-4000-8000-000000000001";
const STAMP = { expectedUpdatedAt: "2026-11-14T00:00:00.000Z" };
const request = { headers: { cookie: "rt_session=opaque" } } as FastifyRequest;
const ORIGIN = "http://localhost:3000";

function proxy() {
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => ({ ok: true }))),
  });
}
function setup(role: RoleCode) {
  const granted = permissionsForRoles([role]) as ReadonlySet<string>;
  const check = (permission: string) => {
    if (!granted.has(permission)) throw new ForbiddenException();
    return { user: { id: "staff" } };
  };
  const auth = {
    cookieName: vi.fn(() => "rt_session"),
    requirePermission: vi.fn(async (_t: string, _c?: string, _o?: string, permission = "") => check(permission)),
    requireReadPermission: vi.fn(async (_t: string, permission: string) => check(permission)),
  };
  const content = proxy();
  const blocks = proxy();
  return { auth, content, blocks, controller: new ContentController(auth as never, content as never, blocks as never) };
}

describe("ContentController", () => {
  it("only roles with content:write can read or write", async () => {
    const { controller, content } = setup("FINANCE");
    await expect(controller.listFaq(request, {})).rejects.toMatchObject({ status: 403 });
    await expect(controller.listBlocks(request)).rejects.toMatchObject({ status: 403 });
    await expect(
      controller.createFaq({ question: "¿Algo?", answer: "Sí" }, request, "csrf", ORIGIN),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(content.createFaq).not.toHaveBeenCalled();
  });
  it("ADMIN creates a FAQ with sanitised text and checks CSRF/Origin permission", async () => {
    const { controller, content, auth } = setup("ADMIN");
    await controller.createFaq(
      { question: " ¿Cómo <b>pago</b>? ", answer: "Por <script>x()</script>transferencia", topic: " " },
      request,
      "csrf",
      ORIGIN,
    );
    expect(auth.requirePermission).toHaveBeenLastCalledWith("opaque", "csrf", ORIGIN, "content:write");
    expect(content.createFaq).toHaveBeenCalledWith(
      { question: "¿Cómo pago?", answer: "Por transferencia", topic: null },
      "staff",
    );
  });
  it("rejects invalid FAQ, page and query input as VALIDATION_FAILED", async () => {
    const { controller, content } = setup("ADMIN");
    for (const body of [
      { question: "x", answer: "ab" },
      { question: "¿Algo útil?", answer: "ok", status: "PUBLISHED" },
    ])
      await expect(controller.createFaq(body, request, "csrf", ORIGIN)).rejects.toMatchObject({
        response: { code: "VALIDATION_FAILED" },
      });
    const page = { slug: "Mal Slug", kind: "PAGE", title: "Título", body: "x" };
    await expect(controller.createPage(page, request, "csrf", ORIGIN)).rejects.toMatchObject({ status: 400 });
    await expect(
      controller.createPage({ ...page, slug: "bien", kind: "HTML" }, request, "csrf", ORIGIN),
    ).rejects.toMatchObject({ status: 400 });
    await expect(controller.listFaq(request, { pageSize: "99" })).rejects.toMatchObject({ status: 400 });
    expect(content.createFaq).not.toHaveBeenCalled();
    expect(content.createPage).not.toHaveBeenCalled();
  });
  it("pages strip markup from the body before storing", async () => {
    const { controller, content } = setup("ADMIN");
    await controller.createPage(
      {
        slug: "terminos-viaje",
        kind: "PAGE",
        title: "Términos",
        body: "Hola <iframe src=x></iframe><b>mundo</b>",
        noindex: true,
      },
      request,
      "csrf",
      ORIGIN,
    );
    expect(content.createPage).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "terminos-viaje", body: "Hola mundo", noindex: true }),
      "staff",
    );
  });
  it("publishing needs the approval attestation; other transitions only the stamp", async () => {
    const { controller, content, blocks } = setup("ADMIN");
    await expect(controller.faqAction(ID, "publish", STAMP, request, "csrf", ORIGIN)).rejects.toMatchObject({
      response: { code: "APPROVAL_REQUIRED" },
    });
    await expect(
      controller.pageAction(ID, "publish", { ...STAMP, confirmApproved: false }, request, "csrf", ORIGIN),
    ).rejects.toMatchObject({
      response: { code: "APPROVAL_REQUIRED" },
    });
    await expect(controller.blockAction("banners", "publish", STAMP, request, "csrf", ORIGIN)).rejects.toMatchObject({
      response: { code: "APPROVAL_REQUIRED" },
    });
    expect(content.faqStatus).not.toHaveBeenCalled();
    expect(blocks.publish).not.toHaveBeenCalled();
    await controller.faqAction(ID, "publish", { ...STAMP, confirmApproved: true }, request, "csrf", ORIGIN);
    expect(content.faqStatus).toHaveBeenCalledWith(ID, "publish", new Date(STAMP.expectedUpdatedAt), "staff");
    await controller.pageAction(ID, "archive", STAMP, request, "csrf", ORIGIN);
    expect(content.pageStatus).toHaveBeenCalledWith(ID, "archive", new Date(STAMP.expectedUpdatedAt), "staff");
    await expect(controller.faqAction(ID, "delete", STAMP, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 404,
    });
    await expect(controller.faqAction("nope", "archive", STAMP, request, "csrf", ORIGIN)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("validates block drafts per block and passes a null stamp for the first save", async () => {
    const { controller, blocks } = setup("ADMIN");
    await controller.saveDraft(
      "hero",
      { expectedUpdatedAt: null, draft: { headline: "Viaja con calma" } },
      request,
      "csrf",
      ORIGIN,
    );
    expect(blocks.saveDraft).toHaveBeenCalledWith(
      "hero",
      { headline: "Viaja con calma", subheadline: null, ctaLabel: null, ctaHref: null, imageId: null },
      null,
      "staff",
    );
    for (const draft of [
      { headline: "ok ok", extra: 1 },
      { headline: "ok ok", imageId: "https://evil.example/a.png" },
      { headline: "x" },
    ])
      await expect(
        controller.saveDraft("hero", { expectedUpdatedAt: null, draft }, request, "csrf", ORIGIN),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      controller.saveDraft("nope", { expectedUpdatedAt: null, draft: {} }, request, "csrf", ORIGIN),
    ).rejects.toMatchObject({ status: 404 });
    await controller.blockAction("hero", "unpublish", STAMP, request, "csrf", ORIGIN);
    expect(blocks.unpublish).toHaveBeenCalled();
  });
  it("public controller is unauthenticated and validates slugs", async () => {
    const service = proxy();
    const publicApi = new PublicContentController(service as never);
    await publicApi.all();
    expect(service.content).toHaveBeenCalled();
    expect(() => publicApi.page("../etc/passwd")).toThrow();
    await publicApi.page("terminos-viaje");
    expect(service.page).toHaveBeenCalledWith("terminos-viaje");
  });
});
