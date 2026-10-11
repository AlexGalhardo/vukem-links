"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { createProject, deleteProject, importProducts, rotateToken } from "@/app/actions";
import { Button, Confirm, inputClass, Modal, TextField, toast, useAction } from "@/components/ui";

export function NewProjectDialog(): ReactNode {
	const [open, setOpen] = useState(false);
	const create = useAction(createProject, () => {
		setOpen(false);
		return "Projeto criado";
	});

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		create.mutate([Object.fromEntries(new FormData(event.currentTarget))]);
	}

	return (
		<>
			<Button variant="primary" onClick={() => setOpen(true)}>
				Novo projeto
			</Button>
			<Modal title="Novo projeto" open={open} onOpenChange={setOpen}>
				<form onSubmit={submit} className="flex flex-col gap-3">
					<TextField label="Nome" name="name" required placeholder="Produtos Tech" />
					<TextField label="Slug" name="slug" required pattern="[a-z0-9-]+" placeholder="produtostech" />
					<TextField
						label="URL base"
						name="baseUrl"
						type="url"
						required
						placeholder="https://app.produtostech.com.br"
						hint="As páginas de produto precisam estar neste domínio."
					/>
					<div className="flex justify-end gap-2">
						<Button type="button" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button type="submit" variant="primary" disabled={create.isPending}>
							Criar
						</Button>
					</div>
				</form>
			</Modal>
		</>
	);
}

export function ProjectTools({ id, name }: { id: string; name: string }): ReactNode {
	const router = useRouter();
	const [importing, setImporting] = useState(false);
	const [text, setText] = useState("");
	const [errors, setErrors] = useState<string[]>([]);
	const [token, setToken] = useState<string | null>(null);

	const runImport = useAction(importProducts, ({ summary }) => {
		setErrors(summary.errors);
		if (summary.errors.length === 0) {
			setImporting(false);
			setText("");
		}
		return `${summary.productsCreated} produto(s) e ${summary.linksAdded} link(s) importados, ${summary.errors.length} erro(s)`;
	});
	const rotate = useAction(rotateToken, (result) => {
		setToken(result.token);
		return undefined;
	});
	const remove = useAction(deleteProject, () => {
		router.replace("/projects");
		return "Projeto excluído";
	});

	return (
		<div className="flex flex-wrap gap-2">
			<Button onClick={() => setImporting(true)}>Importar JSON/CSV</Button>
			<Button onClick={() => rotate.mutate([id])} disabled={rotate.isPending}>
				Gerar token da API
			</Button>
			<Confirm
				trigger="Excluir projeto"
				title={`Excluir ${name}?`}
				description="Todos os produtos, links e cliques do projeto são apagados. As URLs /link?id= desses produtos param de funcionar. Não dá para desfazer."
				confirmLabel="Excluir projeto"
				onConfirm={() => remove.mutate([id])}
			/>

			<Modal title="Importar produtos e links" open={importing} onOpenChange={setImporting}>
				<p className="text-muted">
					Cole um array JSON (formato novo ou o <code>seed.json</code> da v4) ou um CSV com cabeçalho{" "}
					<code>externalId,url,name,pageUrl,category,store</code>. Produtos e links já existentes são
					ignorados.
				</p>
				<input
					type="file"
					accept=".json,.csv,application/json,text/csv"
					aria-label="Arquivo JSON ou CSV"
					onChange={(e) => e.target.files?.[0]?.text().then(setText)}
				/>
				<textarea
					aria-label="Conteúdo JSON ou CSV"
					value={text}
					onChange={(e) => setText(e.target.value)}
					rows={8}
					className={`${inputClass} h-auto py-1.5 font-mono text-xs`}
				/>
				{errors.length > 0 && (
					<ul className="max-h-32 overflow-y-auto text-xs text-bad">
						{errors.map((error) => (
							<li key={error}>{error}</li>
						))}
					</ul>
				)}
				<div className="flex justify-end gap-2">
					<Button onClick={() => setImporting(false)}>Fechar</Button>
					<Button
						variant="primary"
						disabled={!text.trim() || runImport.isPending}
						onClick={() => runImport.mutate([id, text])}
					>
						{runImport.isPending ? "Importando…" : "Importar"}
					</Button>
				</div>
			</Modal>

			<Modal title="Token da API" open={token !== null} onOpenChange={() => setToken(null)}>
				<p className="text-muted">
					Copie agora: o token não é exibido de novo. Gerar outro invalida este. Uso em{" "}
					<code>docs/api.md</code>.
				</p>
				<code className="rounded-md border border-line bg-raised p-2 font-mono text-xs break-all">{token}</code>
				<div className="flex justify-end gap-2">
					<Button
						variant="primary"
						onClick={() => navigator.clipboard.writeText(token ?? "").then(() => toast("Token copiado"))}
					>
						Copiar
					</Button>
				</div>
			</Modal>
		</div>
	);
}
