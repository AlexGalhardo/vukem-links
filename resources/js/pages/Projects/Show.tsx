import { Head, router, useForm } from "@inertiajs/react";
import { type FormEvent, useState } from "react";

import { LinksTable } from "../../components/LinksTable";
import { ClickMetrics, StatsPanels } from "../../components/stats";
import { Button } from "../../components/ui/button";
import { ConfirmDialog, Dialog } from "../../components/ui/dialog";
import { Field, Textarea } from "../../components/ui/input";
import type { Page } from "../../page-props";

function ImportDialog({
  id,
  open,
  onOpenChange,
}: {
  id: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm({ text: "" });

  function submit(event: FormEvent) {
    event.preventDefault();
    form.post(`/projects/${id}/import`, {
      preserveScroll: true,
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    });
  }

  async function load(file: File | undefined) {
    if (file) form.setData("text", await file.text());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Importar JSON/CSV"
      description="Só entram links novos para o projeto e que respondem. O arquivo exportado pelo painel de um site usa este formato."
    >
      <form onSubmit={submit} className="grid gap-3">
        <input
          type="file"
          accept=".json,.csv,application/json,text/csv"
          aria-label="Arquivo"
          onChange={(e) => load(e.target.files?.[0])}
        />
        <Field
          label="Conteúdo"
          error={form.errors.text}
          hint="JSON (array) ou CSV com cabeçalho externalId,url,name,pageUrl,category,store."
        >
          <Textarea
            required
            rows={8}
            className="font-mono"
            value={form.data.text}
            onChange={(e) => form.setData("text", e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.processing}>
            {form.processing ? "Importando…" : "Importar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ProjectShow({ project, stats, links }: Page<"Projects/Show">) {
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Head title={project.name} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <a href={project.base_url} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
            {project.base_url}
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            Importar JSON/CSV
          </Button>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            Excluir projeto
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ClickMetrics stats={stats} />
      </div>
      <LinksTable
        links={links}
        projects={[{ id: project.id, slug: project.slug, name: project.name }]}
        projectId={project.id}
      />
      <StatsPanels stats={stats} />
      <ImportDialog id={project.id} open={importing} onOpenChange={setImporting} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir ${project.name}?`}
        description="Todos os produtos, links e cliques do projeto são apagados. As URLs /link?id= desses produtos param de funcionar. Não dá para desfazer."
        confirmLabel="Excluir projeto"
        onConfirm={() => router.delete(`/projects/${project.id}`)}
      />
    </>
  );
}
