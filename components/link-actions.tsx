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
