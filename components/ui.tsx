"use client";

// Thin styled wrappers over Base UI primitives. Keep app-specific logic out of this file.
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button as BaseButton } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Toast } from "@base-ui/react/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

const toastManager = Toast.createToastManager();

export function toast(title: string, type: "success" | "error" = "success"): void {
	toastManager.add({ title, type, timeout: type === "error" ? 8000 : 4000 });
}

function ToastList(): ReactNode {
	const { toasts } = Toast.useToastManager();
	return toasts.map((t) => (
		<Toast.Root
			key={t.id}
			toast={t}
			className={`flex items-start gap-3 rounded-md border bg-panel px-3 py-2 shadow-lg ${t.type === "error" ? "border-bad text-bad" : "border-line"}`}
		>
			<Toast.Title className="flex-1" />
			<Toast.Close className="text-muted hover:text-fg" aria-label="Fechar">
				×
			</Toast.Close>
		</Toast.Root>
	));
}

export function Toasts(): ReactNode {
	return (
		<Toast.Provider toastManager={toastManager}>
			<Toast.Portal>
				<Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
					<ToastList />
				</Toast.Viewport>
			</Toast.Portal>
		</Toast.Provider>
	);
}

type Variant = "default" | "primary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
	default: "border-line bg-panel hover:bg-raised",
	primary: "border-transparent bg-fg text-bg hover:opacity-85",
	danger: "border-bad/40 text-bad hover:bg-bad/10",
	ghost: "border-transparent text-muted hover:bg-raised hover:text-fg",
};
const BUTTON =
	"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

export function buttonClass(variant: Variant = "default"): string {
	return `${BUTTON} ${VARIANTS[variant]}`;
}

export function Button({
	variant,
	className = "",
	...props
}: ComponentProps<typeof BaseButton> & { variant?: Variant }): ReactNode {
	return <BaseButton className={`${buttonClass(variant)} ${className}`} {...props} />;
}

export const inputClass =
	"h-7 w-full rounded-md border border-line bg-panel px-2 text-[13px] placeholder:text-muted/70 focus:border-accent focus:outline-none";

export function TextField({
	label,
	hint,
	className = "",
	...props
}: ComponentProps<typeof Field.Control> & { label: string; hint?: string }): ReactNode {
	return (
		<Field.Root className="flex flex-col gap-1">
			<Field.Label className="text-xs font-medium text-muted">{label}</Field.Label>
			<Field.Control className={`${inputClass} ${className}`} {...props} />
			{hint && <Field.Description className="text-xs text-muted">{hint}</Field.Description>}
			<Field.Error className="text-xs text-bad" />
		</Field.Root>
	);
}

export interface Option {
	value: string;
	label: string;
}

/** Controlled select. The empty-string value is the "all" option. */
export function Select({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: Option[];
}): ReactNode {
	return (
		<BaseSelect.Root items={options} value={value} onValueChange={(v) => onChange(v ?? "")}>
			<BaseSelect.Trigger aria-label={label} className={`${buttonClass()} min-w-28 justify-between font-normal`}>
				<BaseSelect.Value />
				<BaseSelect.Icon className="text-muted">▾</BaseSelect.Icon>
			</BaseSelect.Trigger>
			<BaseSelect.Portal>
				<BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-50">
					<BaseSelect.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-line bg-panel p-1 shadow-lg">
						{options.map((o) => (
							<BaseSelect.Item
								key={o.value}
								value={o.value}
								className="cursor-default rounded px-2 py-1 text-[13px] data-[highlighted]:bg-raised data-[selected]:font-semibold"
							>
								<BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
							</BaseSelect.Item>
						))}
					</BaseSelect.Popup>
				</BaseSelect.Positioner>
			</BaseSelect.Portal>
		</BaseSelect.Root>
	);
}

const BACKDROP = "fixed inset-0 z-40 bg-black/40";
const POPUP =
	"fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-panel p-4 shadow-xl";

export function Modal({
	title,
	open,
	onOpenChange,
	children,
}: {
	title: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}): ReactNode {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className={BACKDROP} />
				<Dialog.Popup className={POPUP}>
					<Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
					{children}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

export function Confirm({
	trigger,
	title,
	description,
	confirmLabel,
	onConfirm,
}: {
	trigger: ReactNode;
	title: string;
	description: string;
	confirmLabel: string;
	onConfirm: () => void;
}): ReactNode {
	return (
		<AlertDialog.Root>
			<AlertDialog.Trigger render={<Button variant="danger" />}>{trigger}</AlertDialog.Trigger>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className={BACKDROP} />
				<AlertDialog.Popup className={POPUP}>
					<AlertDialog.Title className="text-sm font-semibold">{title}</AlertDialog.Title>
					<AlertDialog.Description className="text-muted">{description}</AlertDialog.Description>
					<div className="flex justify-end gap-2">
						<AlertDialog.Close render={<Button />}>Cancelar</AlertDialog.Close>
						<AlertDialog.Close render={<Button variant="danger" />} onClick={onConfirm}>
							{confirmLabel}
						</AlertDialog.Close>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Runs a server action as a react-query mutation: failed results become errors (toast),
 * success refreshes the cached link list and the server-rendered page.
 */
export function useAction<TArgs extends unknown[], TResult extends ActionResult>(
	action: (...args: TArgs) => Promise<TResult>,
	onSuccess?: (result: Extract<TResult, { ok: true }>) => string | undefined,
) {
	const queryClient = useQueryClient();
	const router = useRouter();
	return useMutation({
		mutationFn: async (args: TArgs) => {
			const result = await action(...args);
			if (!result.ok) throw new Error(result.error);
			return result as Extract<TResult, { ok: true }>;
		},
		onSuccess: (result) => {
			const message = onSuccess?.(result);
			if (message) toast(message);
			void queryClient.invalidateQueries({ queryKey: ["links"] });
			router.refresh();
		},
		onError: (error) => toast(error.message, "error"),
	});
}
