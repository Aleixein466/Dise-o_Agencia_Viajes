"use client";
import type { AdminSession } from "@/lib/auth/types";
import type { FieldDef } from "../commercial/form-fields";
import {
  KIND_LABELS,
  PAGE_FIELD_LABELS,
  blankPage,
  kindLabel,
  pagePayload,
  pageValues,
  slugify,
  validatePage,
  type PublicationStatus,
} from "./helpers";
import { PublicationManager, type PublicationConfig } from "./publication-manager";

type PageItem = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  excerpt: string | null;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
  status: PublicationStatus;
  updatedAt: string;
};

const fields: FieldDef[] = [
  { name: "title", label: "Título", required: true, maxLength: 200, wide: true },
  {
    name: "slug",
    label: "Enlace",
    required: true,
    maxLength: 160,
    hint: "Minúsculas, números y guiones. Se sugiere desde el título al crear.",
  },
  {
    name: "kind",
    label: "Tipo",
    type: "select",
    required: true,
    options: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    name: "excerpt",
    label: "Resumen",
    type: "textarea",
    maxLength: 500,
    wide: true,
    hint: "Opcional. Máximo 500 caracteres.",
  },
  {
    name: "body",
    label: "Contenido",
    type: "textarea",
    required: true,
    maxLength: 40000,
    wide: true,
    hint: "Texto plano o Markdown. El HTML se elimina al guardar. Las promociones y condiciones requieren aprobación antes de publicar.",
  },
  { name: "seoTitle", label: "Título SEO", maxLength: 70, hint: "Opcional. Máximo 70 caracteres." },
  {
    name: "seoDescription",
    label: "Descripción SEO",
    type: "textarea",
    maxLength: 170,
    wide: true,
    hint: "Opcional. Máximo 170 caracteres.",
  },
  {
    name: "noindex",
    label: "Buscadores",
    type: "select",
    options: [
      { value: "false", label: "Permitir que aparezca en buscadores" },
      { value: "true", label: "No indexar en buscadores" },
    ],
  },
];

const config: PublicationConfig<PageItem> = {
  base: "/api/v1/content/pages",
  heading: "Páginas y artículos",
  intro: "Páginas informativas, guías y artículos. Se crean como borrador y solo se muestran al publicarlas.",
  noun: "la página",
  newLabel: "Nueva página",
  submitCreate: "Crear página",
  fields,
  fieldLabels: PAGE_FIELD_LABELS,
  blank: blankPage,
  toValues: pageValues,
  validate: validatePage,
  payload: pagePayload,
  itemName: (item) => item.title,
  columns: [
    {
      header: "Título",
      render: (item) => (
        <>
          {item.title}
          {item.excerpt ? <p className="admin-hint">{item.excerpt}</p> : null}
        </>
      ),
    },
    { header: "Enlace", render: (item) => `/${item.slug}` },
    { header: "Tipo", render: (item) => kindLabel(item.kind) },
  ],
  derive: (name, value, previous, creating) => {
    const next = { ...previous, [name]: value };
    // While creating, keep the slug following the title until the person edits the slug themselves.
    if (creating && name === "title" && (previous.slug === "" || previous.slug === slugify(previous.title)))
      next.slug = slugify(value);
    return next;
  },
};

export function PagesManager({ session }: Readonly<{ session: AdminSession }>) {
  return <PublicationManager session={session} config={config} />;
}
