"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { deleteLinks, promoteLink, runHealthCheck, updateLink } from "@/app/actions";
import { redirectUrl } from "@/components/links-table";
import { Button, Confirm, Modal, TextField, toast, useAction } from "@/components/ui";

export function LinkActions({
	id,
	url,
	priority,
	externalId,
}: {
	id: string;
	url: string;
	priority: number;
	externalId: string;
}): ReactNode {
	const router = useRouter();
	const [editing, setEditing] = useState(false);
	const check = useAction(runHealthCheck, ({ summary }) => {
		if (summary.ok) return "Link respondeu OK";
		return summary.failed ? "Checagem falhou" : "Checagem inconclusiva (loja bloqueou ou demorou)";
	});
	const promote = useAction(promoteLink, () => "Link agora é a primeira opção do produto");
	const update = useAction(updateLink, () => {
		setEditing(false);
		return "Link atualizado";
	});
	const remove = useAction(deleteLinks, () => {
		router.replace("/links");
		return "Link excluído";
	});

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		update.mutate([id, { url: form.get("url"), priority: form.get("priority") }]);
	}

	return (
		<div className="flex flex-wrap gap-2">
			<Button
				onClick={() =>
					navigator.clipboard.writeText(redirectUrl(externalId)).then(() => toast("URL de redirect copiada"))
				}
			>
				Copiar URL de redirect
			</Button>
			<Button onClick={() => check.mutate([[id]])} disabled={check.isPending}>
				{check.isPending ? "Checando…" : "Checar agora"}
			</Button>
			<Button onClick={() => promote.mutate([id])} disabled={promote.isPending}>
				Tornar principal
			</Button>
			<Button onClick={() => setEditing(true)}>Editar</Button>
			<Confirm
				trigger="Excluir"
				title="Excluir este link?"
				description="Os cliques registrados deste link também são apagados. Não dá para desfazer."
				confirmLabel="Excluir"
				onConfirm={() => remove.mutate([[id]])}
			/>
			<Modal title="Editar link" open={editing} onOpenChange={setEditing}>
				<form onSubmit={submit} className="flex flex-col gap-3">
					<TextField
						label="URL de afiliado"
						name="url"
						type="url"
						defaultValue={url}
						required
						hint="Trocar a URL zera o status de saúde."
					/>
					<TextField
						label="Ordem (menor = escolhido primeiro)"
						name="priority"
						type="number"
						defaultValue={priority}
						required
					/>
					<div className="flex justify-end gap-2">
						<Button type="button" onClick={() => setEditing(false)}>
							Cancelar
						</Button>
						<Button type="submit" variant="primary" disabled={update.isPending}>
							Salvar
						</Button>
					</div>
				</form>
			</Modal>
		</div>
	);
}

// The action checks one batch (least recently checked first), so repeating it until the count is reached covers every link.
async function checkEveryLink(total: number): ReturnType<typeof runHealthCheck> {
	const summary = { checked: 0, ok: 0, failed: 0, inconclusive: 0, died: 0 };
	while (summary.checked < total) {
		const result = await runHealthCheck();
		if (!result.ok) return result;
		if (result.summary.checked === 0) break;
		summary.checked += result.summary.checked;
		summary.ok += result.summary.ok;
		summary.failed += result.summary.failed;
		summary.inconclusive += result.summary.inconclusive;
		summary.died += result.summary.died;
	}
	return { ok: true, summary };
}

export function CheckAllLinks({ total }: { total: number }): ReactNode {
	const check = useAction(
		checkEveryLink,
		({ summary }) =>
			`${summary.checked} checados: ${summary.ok} ok, ${summary.failed} falhas, ${summary.inconclusive} inconclusivos, ${summary.died} novos mortos`,
	);
	return (
		<div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
			<Button onClick={() => check.mutate([total])} disabled={check.isPending || total === 0}>
				{check.isPending ? "Checando…" : "Checar todos os links"}
			</Button>
			<span className="text-xs text-muted">
				{check.isPending
					? "Pode levar alguns minutos. Mantenha a página aberta."
					: "Um link vira morto após 3 falhas seguidas."}
			</span>
		</div>
	);
}
