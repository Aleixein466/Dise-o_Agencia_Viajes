"use client";
import type { AdminSession } from "@/lib/auth/types";
import type { FieldDef } from "../commercial/form-fields";
import { FAQ_FIELD_LABELS, blankFaq, faqPayload, faqValues, validateFaq, type PublicationStatus } from "./helpers";
import { PublicationManager, type PublicationConfig } from "./publication-manager";

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  sortOrder: number;
  status: PublicationStatus;
  updatedAt: string;
};

const fields: FieldDef[] = [
  { name: "question", label: "Pregunta", required: true, maxLength: 300, wide: true },
  {
    name: "answer",
    label: "Respuesta",
    type: "textarea",
    required: true,
    maxLength: 8000,
    wide: true,
    hint: "Texto plano o Markdown. No incluyas precios, descuentos ni condiciones sin aprobación de la agencia.",
  },
  { name: "topic", label: "Tema", maxLength: 80, hint: "Opcional: agrupa las preguntas (por ejemplo, Pagos)." },
  {
    name: "sortOrder",
    label: "Orden",
    inputMode: "numeric",
    hint: "Número entero desde 0: las preguntas con número menor aparecen primero.",
  },
];

const config: PublicationConfig<FaqItem> = {
  base: "/api/v1/content/faq",
  heading: "Preguntas frecuentes",
  intro: "Cada pregunta se crea como borrador y solo se muestra en el sitio al publicarla.",
  noun: "la pregunta",
  newLabel: "Nueva pregunta",
  submitCreate: "Crear pregunta",
  fields,
  fieldLabels: FAQ_FIELD_LABELS,
  blank: blankFaq,
  toValues: faqValues,
  validate: validateFaq,
  payload: faqPayload,
  itemName: (item) => item.question,
  columns: [
    {
      header: "Pregunta",
      render: (item) => (
        <>
          {item.question}
          <p className="admin-hint">{item.answer.length > 120 ? `${item.answer.slice(0, 120)}…` : item.answer}</p>
        </>
      ),
    },
    { header: "Tema", render: (item) => item.topic ?? "—" },
    { header: "Orden", render: (item) => item.sortOrder },
  ],
};

export function FaqManager({ session }: Readonly<{ session: AdminSession }>) {
  return <PublicationManager session={session} config={config} />;
}
