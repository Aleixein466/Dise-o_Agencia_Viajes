"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

type DialogState = {
  kind: "confirm" | "prompt";
  text: string;
  confirmLabel: string;
  danger: boolean;
  value: string;
};
type ConfirmOptions = { confirmLabel?: string; danger?: boolean };

export function useDialog(): {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  prompt: (label: string, defaultValue?: string) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [state, setState] = useState<DialogState | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Resolver plus the value that means "cancelled" for that request (false for confirm, null for prompt).
  const resolver = useRef<{ resolve: (value: boolean | string | null) => void; cancelled: false | null } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const id = useId();
  const textId = `${id}-text`;

  const open = useCallback((next: DialogState) => {
    resolver.current?.resolve(resolver.current.cancelled);
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) trigger.current = active;
    setState(next);
    return new Promise<boolean | string | null>((resolve) => {
      resolver.current = { resolve, cancelled: next.kind === "confirm" ? false : null };
    });
  }, []);

  const finish = useCallback((value: boolean | string | null) => {
    resolver.current?.resolve(value);
    resolver.current = null;
    ref.current?.close();
    setState(null);
    const target = trigger.current;
    if (target?.isConnected) target.focus();
  }, []);

  // A manager unmounting with the dialog open (navigation) settles the pending request as cancelled.
  useEffect(
    () => () => {
      resolver.current?.resolve(resolver.current.cancelled);
      resolver.current = null;
    },
    [],
  );

  useEffect(() => {
    const el = ref.current;
    if (!state || !el) return;
    if (!el.open) el.showModal();
    (state.kind === "prompt" ? inputRef.current : cancelRef.current)?.focus();
  }, [state]);

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      open({
        kind: "confirm",
        text: message,
        confirmLabel: options?.confirmLabel ?? "Confirmar",
        danger: options?.danger ?? false,
        value: "",
      }) as Promise<boolean>,
    [open],
  );
  const prompt = useCallback(
    (label: string, defaultValue = "") =>
      open({ kind: "prompt", text: label, confirmLabel: "Guardar", danger: false, value: defaultValue }) as Promise<
        string | null
      >,
    [open],
  );

  const cancel = () => finish(state?.kind === "prompt" ? null : false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    finish(state?.kind === "prompt" ? (inputRef.current?.value ?? "") : true);
  };

  const dialog = (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby={textId}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      {state ? (
        <form method="dialog" onSubmit={submit}>
          {state.kind === "prompt" ? (
            <>
              <label id={textId} htmlFor={`${id}-input`}>
                {state.text}
              </label>
              <input
                id={`${id}-input`}
                ref={inputRef}
                className="field"
                value={state.value}
                onChange={(event) => setState({ ...state, value: event.target.value })}
              />
            </>
          ) : (
            <p id={textId}>{state.text}</p>
          )}
          <div className="admin-dialog-actions">
            <button ref={cancelRef} type="button" className="btn admin-btn-quiet" onClick={cancel}>
              Cancelar
            </button>
            <button type="submit" className={`btn btn-primary${state.danger ? " admin-dialog-danger" : ""}`}>
              {state.confirmLabel}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );

  return { confirm, prompt, dialog };
}
