"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { deleteLinks, runHealthCheck, saveProduct } from "@/app/actions";
import { fmt, StatusBadge } from "@/components/stats";
import { Button, Confirm, inputClass, Modal, type Option, Select, TextField, toast, useAction } from "@/components/ui";
import type { LinkRow } from "@/lib/data";

const PAGE_SIZE = 50;

export interface ProjectOption {
	id: string;
	slug: string;
	name: string;
}

type SortKey = "productName" | "clicks" | "status" | "lastCheckedAt";
const STATUS_OPTIONS: Option[] = [
	{ value: "", label: "Todo status" },
	{ value: "alive", label: "Vivo" },
	{ value: "dead", label: "Morto" },
	{ value: "unknown", label: "Não checado" },
];

async function fetchLinks(): Promise<LinkRow[]> {
	const res = await fetch("/api/links");
	if (!res.ok) throw new Error(`Falha ao carregar links (${res.status})`);
	return res.json();
}

export function redirectUrl(externalId: string): string {
	return `${window.location.origin}/link?id=${encodeURIComponent(externalId)}`;
}

export function relativeTime(timestamp: number | null): string {
	if (!timestamp) return "nunca";
	const hours = Math.floor((Date.now() - timestamp) / 3_600_000);
	if (hours < 1) return "agora";
	return hours < 24 ? `há ${hours}h` : `há ${Math.floor(hours / 24)}d`;
}

function NewLinkDialog({
	projects,
	defaultProject,
}: {
	projects: ProjectOption[];
	defaultProject?: string;
}): ReactNode {
	const [open, setOpen] = useState(false);
	const [projectId, setProjectId] = useState(defaultProject ?? projects[0]?.id ?? "");
	const save = useAction(saveProduct, ({ summary }) => {
		setOpen(false);
		return `${summary.productsCreated} produto(s) e ${summary.linksAdded} link(s) criados`;
	});

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const text = (name: string): string | undefined => String(form.get(name) ?? "").trim() || undefined;
		const links = (text("urls") ?? "")
			.split(/\s+/)
			.filter(Boolean)
			.map((url) => ({ url }));
		save.mutate([
			projectId,
			{
				externalId: text("externalId"),
				name: text("name"),
				pageUrl: text("pageUrl"),
				category: text("category"),
				links,
			},
		]);
	}

	return (
		<>
			<Button variant="primary" onClick={() => setOpen(true)} disabled={projects.length === 0}>
				Novo link
			</Button>
			<Modal title="Novo produto / link" open={open} onOpenChange={setOpen}>
				<form onSubmit={submit} className="flex flex-col gap-3">
					{!defaultProject && (
						<Select
							label="Projeto"
							value={projectId}
							onChange={setProjectId}
							options={projects.map((p) => ({ value: p.id, label: p.name }))}
						/>
					)}
					<TextField
						label="ID do produto (externalId)"
						name="externalId"
						required
						placeholder="https://app.seuprojeto.com/categoria/produto"
						hint="Usado em /link?id=… . Se já existir, os links são adicionados ao produto."
					/>
					<TextField label="Nome" name="name" placeholder="Opcional: derivado do ID" />
					<TextField
						label="Página do produto"
						name="pageUrl"
						type="url"
						placeholder="Opcional: usa o ID se for uma URL"
					/>
					<TextField label="Categoria" name="category" placeholder="Opcional" />
					<label className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">
							Links de afiliado (um por linha, em ordem de prioridade)
						</span>
						<textarea name="urls" required rows={3} className={`${inputClass} h-auto py-1.5 font-mono`} />
					</label>
					<div className="flex justify-end gap-2">
						<Button type="button" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button type="submit" variant="primary" disabled={save.isPending}>
							{save.isPending ? "Salvando…" : "Salvar"}
						</Button>
					</div>
				</form>
			</Modal>
		</>
	);
}

export function LinksTable({ projects, projectSlug }: { projects: ProjectOption[]; projectSlug?: string }): ReactNode {
	const { data, isPending, error } = useQuery({ queryKey: ["links"], queryFn: fetchLinks });
	const [search, setSearch] = useState("");
	const [project, setProject] = useState(projectSlug ?? "");
	const [store, setStore] = useState("");
	const [status, setStatus] = useState("");
	const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "clicks", desc: true });
	const [page, setPage] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const check = useAction(runHealthCheck, ({ summary }) => {
		setSelected(new Set());
		return `${summary.checked} checados: ${summary.ok} ok, ${summary.failed} falhas, ${summary.inconclusive} inconclusivos`;
	});
	const remove = useAction(deleteLinks, () => {
		setSelected(new Set());
		return "Links excluídos";
	});

	const scoped = useMemo(
		() => (data ?? []).filter((l) => !projectSlug || l.projectSlug === projectSlug),
		[data, projectSlug],
	);
	const stores = useMemo(() => [...new Set(scoped.map((l) => l.store))].sort(), [scoped]);
	const rows = useMemo(() => {
		const term = search.trim().toLowerCase();
		const filtered = scoped.filter(
			(l) =>
				(!project || l.projectSlug === project) &&
				(!store || l.store === store) &&
				(!status || l.status === status) &&
				(!term || `${l.productName} ${l.externalId} ${l.url} ${l.category ?? ""}`.toLowerCase().includes(term)),
		);
		const direction = sort.desc ? -1 : 1;
		return filtered.sort((a, b) => {
			const [x, y] = [a[sort.key] ?? 0, b[sort.key] ?? 0];
			return (typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y)) * direction;
		});
	}, [scoped, search, project, store, status, sort]);

	const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
	const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));

	function filter<T>(setter: (value: T) => void): (value: T) => void {
		return (value) => {
			setter(value);
			setPage(0);
		};
	}
	function toggle(id: string): void {
		const next = new Set(selected);
		if (!next.delete(id)) next.add(id);
		setSelected(next);
	}
	function header(key: SortKey, label: string, align = ""): ReactNode {
		const active = sort.key === key;
		return (
			<th
				className={`px-2 py-1.5 font-medium ${align}`}
				aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
			>
				<button
					type="button"
					className="hover:text-fg"
					onClick={() => setSort({ key, desc: active ? !sort.desc : true })}
				>
					{label} {active ? (sort.desc ? "↓" : "↑") : ""}
				</button>
			</th>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<input
					type="search"
					aria-label="Buscar links"
					placeholder="Buscar produto, ID ou URL…"
					value={search}
					onChange={(e) => filter(setSearch)(e.target.value)}
					className={`${inputClass} max-w-64`}
				/>
				{!projectSlug && (
					<Select
						label="Projeto"
						value={project}
						onChange={filter(setProject)}
						options={[
							{ value: "", label: "Todo projeto" },
							...projects.map((p) => ({ value: p.slug, label: p.name })),
						]}
					/>
				)}
				<Select
					label="Loja"
					value={store}
					onChange={filter(setStore)}
					options={[{ value: "", label: "Toda loja" }, ...stores.map((s) => ({ value: s, label: s }))]}
				/>
				<Select label="Status" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} />
				<span className="text-muted">{fmt(rows.length)} links</span>
				<div className="ml-auto flex items-center gap-2">
					{selected.size > 0 ? (
						<>
							<span className="text-muted">{selected.size} selecionados</span>
							<Button onClick={() => check.mutate([[...selected]])} disabled={check.isPending}>
								{check.isPending ? "Checando…" : "Checar"}
							</Button>
							<Confirm
								trigger="Excluir"
								title={`Excluir ${selected.size} link(s)?`}
								description="Os cliques registrados desses links também são apagados. Não dá para desfazer."
								confirmLabel="Excluir"
								onConfirm={() => remove.mutate([[...selected]])}
							/>
						</>
					) : (
						<Button
							onClick={() => check.mutate([])}
							disabled={check.isPending}
							title="Checa os links há mais tempo sem verificação"
						>
							{check.isPending ? "Checando…" : "Checar próximo lote"}
						</Button>
					)}
					<NewLinkDialog
						projects={projects}
						defaultProject={projects.find((p) => p.slug === projectSlug)?.id}
					/>
				</div>
			</div>

			<div className="overflow-x-auto rounded-lg border border-line bg-panel">
				<table className="w-full text-left">
					<thead className="border-b border-line text-xs text-muted">
						<tr>
							<th className="w-8 px-2 py-1.5">
								<input
									type="checkbox"
									aria-label="Selecionar página"
									checked={allVisibleSelected}
									onChange={() => {
										const next = new Set(selected);
										for (const l of visible)
											allVisibleSelected ? next.delete(l.id) : next.add(l.id);
										setSelected(next);
									}}
								/>
							</th>
							{header("productName", "Produto")}
							{!projectSlug && <th className="px-2 py-1.5 font-medium">Projeto</th>}
							<th className="px-2 py-1.5 font-medium">Loja</th>
							{header("status", "Status")}
							<th className="px-2 py-1.5 text-right font-medium" title="Ordem de escolha no redirect">
								Ordem
							</th>
							{header("clicks", "Cliques", "text-right")}
							<th className="px-2 py-1.5 text-right font-medium">Mobile</th>
							{header("lastCheckedAt", "Checado", "text-right")}
							<th className="px-2 py-1.5" />
						</tr>
					</thead>
					<tbody>
						{visible.map((l) => (
							<tr key={l.id} className="border-b border-line last:border-0 hover:bg-raised/60">
								<td className="px-2 py-1">
									<input
										type="checkbox"
										aria-label={`Selecionar ${l.productName}`}
										checked={selected.has(l.id)}
										onChange={() => toggle(l.id)}
									/>
								</td>
								<td className="max-w-80 px-2 py-1">
									<Link
										href={`/links/${l.id}`}
										className="block truncate font-medium hover:text-accent"
										title={l.externalId}
									>
										{l.productName}
									</Link>
									<span className="block truncate font-mono text-[11px] text-muted" title={l.url}>
										{l.url}
									</span>
								</td>
								{!projectSlug && (
									<td className="px-2 py-1">
										<Link href={`/projects/${l.projectSlug}`} className="hover:text-accent">
											{l.projectName}
										</Link>
									</td>
								)}
								<td className="px-2 py-1">{l.store}</td>
								<td className="px-2 py-1">
									<StatusBadge status={l.status} />
								</td>
								<td className="px-2 py-1 text-right text-muted">{l.priority}</td>
								<td className="px-2 py-1 text-right font-medium">{fmt(l.clicks)}</td>
								<td className="px-2 py-1 text-right text-muted">{l.mobile ? fmt(l.mobile) : "—"}</td>
								<td className="px-2 py-1 text-right text-muted">{relativeTime(l.lastCheckedAt)}</td>
								<td className="px-2 py-1 text-right">
									<Button
										variant="ghost"
										title="Copiar URL de redirect"
										onClick={() =>
											navigator.clipboard
												.writeText(redirectUrl(l.externalId))
												.then(() => toast("URL de redirect copiada"))
										}
									>
										Copiar
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{isPending && <p className="p-4 text-muted">Carregando links…</p>}
				{error && <p className="p-4 text-bad">{error.message}</p>}
				{data && rows.length === 0 && <p className="p-4 text-muted">Nenhum link encontrado.</p>}
			</div>

			{pages > 1 && (
				<nav aria-label="Paginação" className="flex items-center justify-end gap-2 text-muted">
					<Button onClick={() => setPage(current - 1)} disabled={current === 0}>
						Anterior
					</Button>
					<span>
						{current + 1} / {pages}
					</span>
					<Button onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
						Próxima
					</Button>
				</nav>
			)}
		</div>
	);
}
