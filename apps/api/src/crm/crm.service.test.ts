import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CrmService } from "./crm.service";

const quoteId = "00000000-0000-4000-8000-000000000001";
const advisorId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000003";

describe("CrmService mutations", () => {
  it("returns 409 when the expected revision is stale", async () => {
    const tx = { quote: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const client = {
      quote: { findUnique: vi.fn().mockResolvedValue({ id: quoteId, status: "NEW" }) },
      $transaction: vi.fn((work: (value: typeof tx) => Promise<void>) => work(tx)),
    };
    const service = new CrmService({ client: vi.fn().mockResolvedValue(client) } as never);

    await expect(service.changeStatus(quoteId, "ASSIGNED", 1, actorId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.quote.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: quoteId, revision: 1 } }));
  });

  it("rejects assignment to a user who is not an active advisor or admin", async () => {
    const client = {
      quote: { findUnique: vi.fn().mockResolvedValue({ id: quoteId, status: "NEW", revision: 1, assignedToId: null }) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new CrmService({ client: vi.fn().mockResolvedValue(client) } as never);

    await expect(service.assign(quoteId, advisorId, 1, undefined, actorId)).rejects.toBeInstanceOf(BadRequestException);
    expect(client.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) }),
    );
  });

  it("adds a note without updating the quote revision", async () => {
    const tx = {
      crmNote: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      quote: { updateMany: vi.fn() },
    };
    const client = {
      quote: { findUnique: vi.fn().mockResolvedValue({ id: quoteId }) },
      $transaction: vi.fn((work: (value: typeof tx) => Promise<void>) => work(tx)),
    };
    const service = new CrmService({ client: vi.fn().mockResolvedValue(client) } as never);

    await expect(service.addNote(quoteId, "Seguimiento interno", actorId)).resolves.toEqual({ ok: true });
    expect(tx.crmNote.create).toHaveBeenCalledWith({
      data: { quoteId, authorId: actorId, body: "Seguimiento interno" },
    });
    expect(tx.quote.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "crm.note_added" }) }),
    );
  });
});
