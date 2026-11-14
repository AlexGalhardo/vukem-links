import { Head, Link, useForm } from "@inertiajs/react";
import { type FormEvent, useState } from "react";

import { Plus } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Field, Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { fmt } from "../../lib/utils";
import type { Page } from "../../page-props";

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useForm({ name: "", slug: "", baseUrl: "" });

  function submit(event: FormEvent) {
    event.preventDefault();
    form.post("/projects", { onSuccess: () => form.reset() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Novo projeto">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Nome" error={form.errors.name}>
          <Input
            required
            placeholder="Produtos Tech"
            value={form.data.name}
            onChange={(e) => form.setData("name", e.target.value)}
          />
        </Field>
        <Field label="Slug" error={form.errors.slug}>
          <Input
            required
            pattern="[a-z0-9\-]+"
            placeholder="produtostech"
            value={form.data.slug}
            onChange={(e) => form.setData("slug", e.target.value)}
          />
        </Field>
        <Field label="URL base" error={form.errors.baseUrl} hint="As páginas de produto precisam estar neste domínio.">
          <Input
            type="url"
            required
            placeholder="https://app.produtostech.com.br"
            value={form.data.baseUrl}
            onChange={(e) => form.setData("baseUrl", e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.processing}>
            Criar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ProjectsIndex({ projects }: Page<"Projects/Index">) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Head title="Projetos" />
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold">Projetos</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Novo projeto
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Projeto</TableHead>
              <TableHead>Produtos</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Mortos</TableHead>
              <TableHead>Cliques</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum projeto. Um site novo vira projeto no primeiro sync, ou crie um aqui.
                </TableCell>
              </TableRow>
            )}
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/projects/${p.slug}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <span className="block font-mono text-xs text-muted-foreground">{p.base_url}</span>
                </TableCell>
                <TableCell className="tabular-nums">{fmt(p.products)}</TableCell>
                <TableCell className="tabular-nums">{fmt(p.links)}</TableCell>
                <TableCell className={p.dead ? "text-destructive tabular-nums" : "tabular-nums"}>
                  {fmt(p.dead)}
                </TableCell>
                <TableCell className="tabular-nums">{fmt(p.clicks)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
