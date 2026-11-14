"use client";
/* eslint-disable @next/next/no-img-element -- private media must be fetched with the authenticated browser session */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchCsrfToken, requestJson } from "@/lib/auth/client";
import type { AdminSession } from "@/lib/auth/types";

type OwnerType = "destination" | "hotel" | "package";
type Owner = { id: string; name: string };
type AssetOwner = Owner & { type: OwnerType; sortOrder: number };
type Asset = {
  id: string;
  altText: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  owners: AssetOwner[];
};
const kinds: { value: OwnerType; label: string }[] = [
  { value: "destination", label: "Destino" },
  { value: "package", label: "Paquete" },
  { value: "hotel", label: "Hotel" },
];

async function mutation(path: string, method: "POST" | "PATCH" | "DELETE", csrf: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-csrf-token": csrf,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response.ok;
}

export function GalleryManager({ session }: Readonly<{ session: AdminSession }>) {
  const [csrf, setCsrf] = useState(session.csrfToken);
  const [kind, setKind] = useState<OwnerType>("destination");
  const [owners, setOwners] = useState<Owner[]>([]);
  const [uploadOwner, setUploadOwner] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState<{ asset: Asset; owner: AssetOwner } | null>(null);
  const selected = useMemo(() => owners.find((owner) => owner.id === filterOwner), [filterOwner, owners]);

  const loadOwners = useCallback(async (type: OwnerType) => {
    const path =
      type === "destination" ? "destinations" : type === "hotel" ? "hotels?pageSize=50" : "packages?pageSize=50";
    const response = await requestJson(`/api/v1/catalog/${path}`, "GET");
    const value = Array.isArray(response.data) ? response.data : (response.data as { items?: unknown } | null)?.items;
    setOwners(
      Array.isArray(value)
        ? value.map((row: { id: string; name?: string; title?: string }) => ({
            id: row.id,
            name: row.name ?? row.title ?? row.id,
          }))
        : [],
    );
    setUploadOwner("");
    setFilterOwner("");
  }, []);
  const loadAssets = useCallback(async (type?: OwnerType, ownerId?: string) => {
    const query = type && ownerId ? `?type=${type}&ownerId=${encodeURIComponent(ownerId)}` : "";
    const response = await requestJson(`/api/v1/gallery${query}`, "GET");
    if (response.ok && Array.isArray(response.data)) setAssets(response.data as Asset[]);
    else setMessage("No se pudieron cargar las imágenes privadas.");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOwners("destination");
      void loadAssets();
      void fetchCsrfToken().then((value) => value.csrfToken && setCsrf(value.csrfToken));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAssets, loadOwners]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    const ownerId = String(form.get("owner") ?? "");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Selecciona un JPEG, PNG o WebP de máximo 5 MB.");
      return;
    }
    if (!ownerId) {
      setMessage("Selecciona el contenido al que se asociará la imagen.");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/v1/gallery/upload/${kind}/${ownerId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": csrf },
      body: form,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("La carga fue rechazada. Revisa el archivo, los permisos y el token CSRF.");
      return;
    }
    formElement.reset();
    setPreview(null);
    if (replace) {
      const detached = await mutation(
        `/api/v1/gallery/${replace.asset.id}/association/${replace.owner.type}/${replace.owner.id}`,
        "DELETE",
        csrf,
      );
      setReplace(null);
      setMessage(
        detached
          ? "Fotografía reemplazada. El archivo anterior se conserva si tenía otros usos."
          : "La nueva fotografía se subió, pero no se pudo desvincular la anterior.",
      );
    } else setMessage("Fotografía privada subida y asociada como borrador.");
    await loadAssets(filterOwner ? kind : undefined, filterOwner || undefined);
  }

  async function update(asset: Asset, owner: AssetOwner, body: object, ok: string) {
    setBusy(true);
    const saved = await mutation(`/api/v1/gallery/${asset.id}`, "PATCH", csrf, {
      owner: { type: owner.type, id: owner.id },
      ...body,
    });
    setBusy(false);
    setMessage(saved ? ok : "No se pudo guardar el cambio.");
    if (saved) await loadAssets(filterOwner ? kind : undefined, filterOwner || undefined);
  }
  async function detach(asset: Asset, owner: AssetOwner) {
    if (!window.confirm(`¿Desvincular esta imagen de ${owner.name}? El archivo se conservará si tiene otros usos.`))
      return;
    setBusy(true);
    const deleted = await mutation(`/api/v1/gallery/${asset.id}/association/${owner.type}/${owner.id}`, "DELETE", csrf);
    setBusy(false);
    setMessage(
      deleted ? "Imagen desvinculada. No se eliminó ningún archivo compartido." : "No se pudo desvincular la imagen.",
    );
    if (deleted) await loadAssets(filterOwner ? kind : undefined, filterOwner || undefined);
  }
  async function associate(asset: Asset) {
    const ownerId = window.prompt("Pega el identificador del destino, paquete u hotel autorizado:");
    if (!ownerId) return;
    const type = window.prompt("Tipo: destination, package u hotel", kind) as OwnerType | null;
    if (!type || !kinds.some((entry) => entry.value === type)) return;
    setBusy(true);
    const saved = await mutation(`/api/v1/gallery/${asset.id}/associate`, "POST", csrf, { type, id: ownerId });
    setBusy(false);
    setMessage(saved ? "Imagen asociada." : "No se pudo asociar: verifica el identificador y los permisos.");
    if (saved) await loadAssets(filterOwner ? kind : undefined, filterOwner || undefined);
  }

  return (
    <div className="admin-users">
      <section className="admin-panel">
        <h2>Galería privada</h2>
        <p className="admin-hint">
          JPEG, PNG o WebP; máximo 5 MB. Las fotografías de borradores no se sirven desde rutas públicas.
        </p>
        {message ? (
          <p className="admin-success" role="status">
            {message}
          </p>
        ) : null}
        <form className="admin-form" onSubmit={submit}>
          <label className="admin-field">
            Entidad
            <select
              value={kind}
              onChange={(event) => {
                const value = event.target.value as OwnerType;
                setKind(value);
                void loadOwners(value);
              }}
            >
              {kinds.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Asociar a
            <select name="owner" required value={uploadOwner} onChange={(event) => setUploadOwner(event.target.value)}>
              <option value="" />
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            Texto alternativo
            <input name="altText" maxLength={250} required />
          </label>
          <label className="admin-field">
            Archivo
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (preview) URL.revokeObjectURL(preview);
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
          {preview ? (
            <img src={preview} alt="Vista previa local de la carga" style={{ maxWidth: "280px", height: "auto" }} />
          ) : null}
          {replace ? (
            <p className="admin-hint">
              Reemplazando la imagen de {replace.owner.name}. La anterior se desvinculará tras una carga correcta.
            </p>
          ) : null}
          <button className="admin-btn admin-btn-primary" disabled={busy}>
            {busy ? "Guardando…" : replace ? "Reemplazar fotografía" : "Subir fotografía"}
          </button>
        </form>
      </section>
      <section className="admin-panel">
        <h2>Fotografías almacenadas</h2>
        <div className="admin-form">
          <label className="admin-field">
            Filtrar por {kinds.find((entry) => entry.value === kind)?.label.toLowerCase()}
            <select
              value={filterOwner}
              onChange={(event) => {
                const value = event.target.value;
                setFilterOwner(value);
                void loadAssets(value ? kind : undefined, value || undefined);
              }}
            >
              <option value="">Todas las fotografías autorizadas</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          {selected ? <p className="admin-hint">Mostrando imágenes asociadas a {selected.name}.</p> : null}
        </div>
        {assets.length ? (
          <div className="admin-activity">
            {assets.map((asset) => (
              <article key={asset.id}>
                <img
                  src={`/api/v1/gallery/${asset.id}`}
                  alt={asset.altText}
                  style={{ maxWidth: "220px", height: "auto" }}
                />
                <p>
                  <strong>{asset.altText}</strong>
                  <br />
                  <small>
                    {asset.width}×{asset.height} · {asset.sizeBytes ?? 0} bytes
                  </small>
                </p>
                <label className="admin-field">
                  Texto alternativo
                  <input
                    defaultValue={asset.altText}
                    maxLength={250}
                    onBlur={(event) => {
                      if (event.currentTarget.value !== asset.altText && asset.owners[0])
                        void update(
                          asset,
                          asset.owners[0],
                          { altText: event.currentTarget.value },
                          "Texto alternativo actualizado.",
                        );
                    }}
                  />
                </label>
                {asset.owners.map((owner) => (
                  <div key={`${owner.type}-${owner.id}`}>
                    <span className="admin-role">
                      {owner.type}: {owner.name} · orden {owner.sortOrder}
                    </span>{" "}
                    <button
                      className="admin-link-button"
                      disabled={busy}
                      onClick={() => void update(asset, owner, { cover: true }, "Portada actualizada.")}
                    >
                      Usar como portada
                    </button>{" "}
                    <button
                      className="admin-link-button"
                      disabled={busy}
                      onClick={() =>
                        void update(asset, owner, { sortOrder: Math.max(0, owner.sortOrder - 1) }, "Orden actualizado.")
                      }
                    >
                      Subir orden
                    </button>{" "}
                    <button
                      className="admin-link-button"
                      disabled={busy}
                      onClick={() => {
                        setReplace({ asset, owner });
                        setKind(owner.type);
                        void loadOwners(owner.type).then(() => setUploadOwner(owner.id));
                      }}
                    >
                      Reemplazar
                    </button>{" "}
                    <button className="admin-link-button" disabled={busy} onClick={() => void detach(asset, owner)}>
                      Retirar
                    </button>
                  </div>
                ))}
                <button className="admin-link-button" disabled={busy} onClick={() => void associate(asset)}>
                  Asociar a otro contenido
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty">No hay imágenes para el filtro seleccionado.</p>
        )}
      </section>
    </div>
  );
}
