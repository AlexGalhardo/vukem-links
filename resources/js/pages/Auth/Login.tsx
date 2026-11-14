import { Head, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, Input } from "../../components/ui/input";

export default function Login() {
  const form = useForm({ email: "", password: "", remember: false });

  function submit(event: FormEvent) {
    event.preventDefault();
    form.post("/login", { onFinish: () => form.reset("password") });
  }

  return (
    <>
      <Head title="Entrar" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Entrar</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <Field label="E-mail" error={form.errors.email}>
              <Input
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={form.data.email}
                onChange={(e) => form.setData("email", e.target.value)}
              />
            </Field>
            <Field label="Senha" error={form.errors.password}>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={form.data.password}
                onChange={(e) => form.setData("password", e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.data.remember}
                onChange={(e) => form.setData("remember", e.target.checked)}
              />
              Manter conectado
            </label>
            <Button type="submit" disabled={form.processing}>
              {form.processing ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
