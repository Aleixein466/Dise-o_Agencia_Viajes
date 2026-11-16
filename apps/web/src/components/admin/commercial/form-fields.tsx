import type { FieldErrors, FormValues } from "./helpers";

export type FieldOption = { value: string; label: string };
export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea" | "select";
  options?: readonly FieldOption[];
  hint?: string;
  required?: boolean;
  visible?: (values: FormValues) => boolean;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "decimal";
  wide?: boolean;
};

export const fieldId = (prefix: string, name: string) => `${prefix}-${name}`;

export function focusFirstError(prefix: string, errors: FieldErrors, order: readonly string[]): boolean {
  const name = order.find((key) => errors[key]);
  if (!name) return false;
  document.getElementById(fieldId(prefix, name))?.focus();
  return true;
}

/** Labelled fields with inline errors wired through aria-invalid / aria-describedby. */
export function FormFields({
  prefix,
  fields,
  values,
  errors,
  disabled,
  onChange,
}: Readonly<{
  prefix: string;
  fields: readonly FieldDef[];
  values: FormValues;
  errors: FieldErrors;
  disabled?: boolean;
  onChange: (name: string, value: string) => void;
}>) {
  return (
    <>
      {fields
        .filter((field) => !field.visible || field.visible(values))
        .map((field) => {
          const id = fieldId(prefix, field.name);
          const error = errors[field.name];
          const describedBy = [field.hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
          const common = {
            id,
            name: field.name,
            disabled,
            value: values[field.name] ?? "",
            "aria-invalid": error ? true : undefined,
            "aria-required": field.required ? true : undefined,
            "aria-describedby": describedBy || undefined,
          } as const;
          return (
            <div key={field.name} className={`admin-field${field.wide ? " admin-field-wide" : ""}`}>
              <label htmlFor={id}>
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>
              {field.type === "select" ? (
                <select {...common} onChange={(event) => onChange(field.name, event.target.value)}>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  {...common}
                  maxLength={field.maxLength}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
              ) : (
                <input
                  {...common}
                  type={field.type === "date" ? "date" : "text"}
                  inputMode={field.inputMode ?? (field.type === "number" ? "numeric" : undefined)}
                  maxLength={field.maxLength}
                  autoComplete="off"
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
              )}
              {field.hint ? (
                <p id={`${id}-hint`} className="admin-hint">
                  {field.hint}
                </p>
              ) : null}
              {error ? (
                <p id={`${id}-error`} className="admin-field-error">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
    </>
  );
}

export const SCOPE_FIELDS = (
  destinations: readonly FieldOption[],
  packages: readonly FieldOption[],
): readonly FieldDef[] => [
  {
    name: "scope",
    label: "Alcance",
    type: "select",
    required: true,
    options: [
      { value: "GLOBAL", label: "Global (todos los destinos)" },
      { value: "DESTINATION", label: "Un destino" },
      { value: "PACKAGE", label: "Un paquete" },
    ],
  },
  {
    name: "destinationId",
    label: "Destino",
    type: "select",
    required: true,
    options: [{ value: "", label: "Elige un destino" }, ...destinations],
    visible: (values) => values.scope === "DESTINATION",
  },
  {
    name: "packageId",
    label: "Paquete",
    type: "select",
    required: true,
    options: [{ value: "", label: "Elige un paquete" }, ...packages],
    visible: (values) => values.scope === "PACKAGE",
  },
];
