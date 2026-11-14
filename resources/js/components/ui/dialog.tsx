import { type ReactNode, useEffect, useRef } from "react";

import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

// Dialog is the shadcn dialog on the native <dialog>: modal, focus trap, Esc and
// the backdrop come from the browser, so no Radix dependency is needed.
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={() => onOpenChange(false)}
      onMouseDown={(event) => event.target === ref.current && onOpenChange(false)}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50"
    >
      {open && (
        <div className="grid gap-4 p-6">
          <div className="grid gap-1.5">
            <h2 id="dialog-title" className="text-lg leading-none font-semibold">
              {title}
            </h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

// ConfirmDialog is the shadcn alert dialog: every destructive action says what will be erased.
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }: ConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            onOpenChange(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
