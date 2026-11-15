import { describe, expect, it } from "vitest";
import {
  blankTransport,
  describeTransportError,
  modeLabel,
  summarizeTransportChanges,
  transportActionLabel,
  transportPayload,
  transportValues,
  validateTransport,
} from "./helpers";

describe("transport helpers", () => {
  it("labels modes in Spanish", () => {
    expect(["GROUND", "AIR", "SEA", "X"].map(modeLabel)).toEqual(["Terrestre", "Aéreo", "Marítimo", "X"]);
  });
  it("validates the form", () => {
    expect(validateTransport(blankTransport(), "create")).toEqual({
      destinationId: "Elige un destino.",
      name: "El nombre debe tener al menos 2 caracteres.",
    });
    const ok = { ...blankTransport("d1"), name: "Bus" };
    expect(validateTransport(ok, "create")).toEqual({});
    expect(validateTransport({ ...blankTransport(), name: "Bus" }, "edit")).toEqual({});
    expect(validateTransport({ ...ok, name: "x".repeat(121), description: "y".repeat(2001) }, "edit")).toEqual({
      name: "El nombre admite máximo 120 caracteres.",
      description: "La descripción admite máximo 2000 caracteres.",
    });
  });
  it("builds payloads: destination only on create, empty text as null", () => {
    const values = { ...blankTransport("d1"), name: "  Bus  ", description: " ", conditions: "Sin mascotas" };
    expect(transportPayload(values, "create")).toEqual({
      destinationId: "d1",
      mode: "GROUND",
      name: "Bus",
      description: null,
      conditions: "Sin mascotas",
    });
    expect(transportPayload(values, "edit")).not.toHaveProperty("destinationId");
    expect(transportValues({ destinationId: "d1", mode: "AIR", name: "V", description: null })).toMatchObject({
      description: "",
      conditions: "",
    });
  });
  it("maps API error codes to Spanish and fields", () => {
    expect(describeTransportError({ status: 409, data: { code: "TRANSPORT_NAME_TAKEN" } })).toMatchObject({
      field: "name",
      message: expect.stringContaining("Ya existe una opción"),
    });
    expect(describeTransportError({ status: 409, data: { code: "TRANSPORT_IN_USE", count: 2 } }).message).toContain(
      "2 componentes",
    );
    expect(describeTransportError({ status: 409, data: { code: "STALE_UPDATE" } }).message).toContain("Otra persona");
    expect(describeTransportError({ status: 403, data: {} }).message).toBe("No tienes permiso para esta acción.");
  });
  it("summarises history", () => {
    expect(transportActionLabel("transport_options.deactivated")).toBe("Desactivada");
    expect(
      summarizeTransportChanges({
        before: { name: "A", mode: "GROUND", status: "active" },
        after: { name: "A", mode: "AIR", status: "inactive" },
      }),
    ).toEqual(["Modo: Terrestre → Aéreo", "Estado: Activa → Inactiva"]);
    expect(summarizeTransportChanges({ before: null, after: { name: "A" } })).toEqual([]);
  });
});
