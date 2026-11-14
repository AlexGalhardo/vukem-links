import { Link, router, useForm } from "@inertiajs/react";
import { type FormEvent, useMemo, useState } from "react";
import { fmt, relativeTime } from "../lib/utils";
import type { LinkRow, ProjectOption } from "../page-props";
import { Plus, Search } from "./icons";
import { StatusBadge } from "./stats";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { ConfirmDialog, Dialog } from "./ui/dialog";
import { Field, Input, Select, Textarea } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const PAGE_SIZE = 25;

type SortKey = "product_name" | "store" | "status" | "clicks" | "last_checked_at";

export function NewProductDialog({
  projects,
  projectId,
  open,
  onOpenChange,
}: {
  projects: ProjectOption[];
  projectId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm({
    project: projectId ?? projects[0]?.id ?? 0,
    externalId: "",
    name: "",
    pageUrl: "",
    category: "",
    urls: "",
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    form.transform(({ project: _project, ...data }) => data);
    form.post(`/projects/${form.data.project}/products`, {
      preserveScroll: true,
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Novo produto / link">
      <form onSubmit={submit} className="grid gap-3">
        {projectId === undefined && (
          <Field label="Projeto">
            <Select value={form.data.project} onChange={(e) => form.setData("project", Number(e.target.value))}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="ID do produto (externalId)"
          error={form.errors.externalId}
          hint="Usado em /link?id=… Se já existir, os links são adicionados ao produto."
        >
          <Input
            required
            placeholder="https://app.seuprojeto.com/categoria/produto"
            value={form.data.externalId}
            onChange={(e) => form.setData("externalId", e.target.value)}
          />
        </Field>
        <Field label="Nome" error={form.errors.name}>
          <Input
            placeholder="Opcional: derivado do ID"
            value={form.data.name}
            onChange={(e) => form.setData("name", e.target.value)}
          />
        </Field>
        <Field label="Página do produto" error={form.errors.pageUrl}>
          <Input
            type="url"
            placeholder="Opcional: usa o ID se for uma URL"
            value={form.data.pageUrl}
            onChange={(e) => form.setData("pageUrl", e.target.value)}
          />
        </Field>
        <Field label="Categoria" error={form.errors.category}>
          <Input
            placeholder="Opcional"
            value={form.data.category}
            onChange={(e) => form.setData("category", e.target.value)}
          />
        </Field>
        <Field label="Links de afiliado (um por linha, em ordem de prioridade)" error={form.errors.urls}>
          <Textarea
            required
            rows={3}
            className="font-mono"
            value={form.data.urls}
            onChange={(e) => form.setData("urls", e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.processing}>
            {form.processing ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function LinksTable({
  links,
  projects,
  projectId,
}: {
  links: LinkRow[];
  projects: ProjectOption[];
  projectId?: number;
}) {
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [store, setStore] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "clicks", desc: true });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const stores = useMemo(() => [...new Set(links.map((l) => l.store))].sort(), [links]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = links.filter(
      (l) =>
        (!project || l.project_slug === project) &&
        (!store || l.store === store) &&
        (!status || l.status === status) &&
        (!term || `${l.product_name} ${l.url} ${l.external_id} ${l.category ?? ""}`.toLowerCase().includes(term)),
    );
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) => {
      const x = a[sort.key] ?? "";
      const y = b[sort.key] ?? "";
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [links, search, project, store, status, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const ids = [...selected];

  const reset = (fn: () => void) => () => {
    fn();
    setPage(0);
  };

  function toggle(id: number) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  }

  function post(url: string, data: { ids: number[] }) {
    router.post(url, data, {
      preserveScroll: true,
      onStart: () => setBusy(true),
      onFinish: () => setBusy(false),
      onSuccess: () => setSelected(new Set()),
    });
  }

  const header = (key: SortKey, label: string) => (
    <TableHead aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium"
        onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key === "clicks" })}
      >
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
      </button>
    </TableHead>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 text-muted-foreground" />
          <Input
            aria-label="Buscar links"
            placeholder="Buscar produto, URL ou categoria"
            className="pl-8"
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))()}
          />
        </div>
        {projectId === undefined && projects.length > 1 && (
          <Select
            aria-label="Projeto"
            className="w-auto"
            value={project}
            onChange={(e) => reset(() => setProject(e.target.value))()}
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          aria-label="Loja"
          className="w-auto"
          value={store}
          onChange={(e) => reset(() => setStore(e.target.value))()}
        >
          <option value="">Todas as lojas</option>
          {stores.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          className="w-auto"
          value={status}
          onChange={(e) => reset(() => setStatus(e.target.value))()}
        >
          <option value="">Todo status</option>
          <option value="alive">Vivo</option>
          <option value="dead">Morto</option>
          <option value="unknown">Não checado</option>
        </Select>
        <Button onClick={() => setCreating(true)} disabled={projects.length === 0}>
          <Plus /> Novo link
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm">
          <span>{selected.size} selecionado(s)</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => post("/links/check", { ids })}>
            {busy ? "Checando…" : "Checar"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleting(true)}>
            Excluir
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8">
              <input
                type="checkbox"
                aria-label="Selecionar a página"
                checked={visible.length > 0 && visible.every((l) => selected.has(l.id))}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set([...selected, ...visible.map((l) => l.id)]) : new Set())
                }
              />
            </TableHead>
            {header("product_name", "Produto")}
            {header("store", "Loja")}
            {header("status", "Status")}
            {header("clicks", "Cliques")}
            {header("last_checked_at", "Checado")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Nenhum link encontrado.
              </TableCell>
            </TableRow>
          )}
          {visible.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${l.product_name}`}
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                />
              </TableCell>
              <TableCell className="max-w-md">
                <Link href={`/links/${l.id}`} className="block truncate font-medium hover:underline">
                  {l.product_name}
                </Link>
                <span className="block truncate font-mono text-xs text-muted-foreground">{l.url}</span>
              </TableCell>
              <TableCell>{l.store}</TableCell>
              <TableCell>
                <StatusBadge status={l.status} />
              </TableCell>
              <TableCell className="tabular-nums">
                {fmt(l.clicks)}
                {l.mobile > 0 && <span className="text-xs text-muted-foreground"> · {fmt(l.mobile)} mobile</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{relativeTime(l.last_checked_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between gap-2 p-3 text-sm text-muted-foreground">
        <span>
          {fmt(rows.length)} link(s) · página {current + 1} de {pages}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Anterior
          </Button>
          <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Próxima
          </Button>
        </div>
      </div>

      <NewProductDialog projects={projects} projectId={projectId} open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir ${selected.size} link(s)?`}
        description="Os cliques registrados desses links também são apagados. Não dá para desfazer."
        confirmLabel="Excluir"
        onConfirm={() => post("/links/delete", { ids })}
      />
    </Card>
  );
}
