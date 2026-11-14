import { test as base, expect, type Page } from "@playwright/test";

// Every spec fails on browser console errors or uncaught exceptions: that is how
// CSP violations and JavaScript bugs surface in the browser.
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        // 4xx/5xx answers are part of the tested flows (wrong password, 302 hops).
        if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

const PRODUCT = "https://example.com/melhor-airfryer-8-litros/arno-dual-afd2-8-3l";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async function login(page: Page, password = "e2e-password-123") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@example.com");
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("a guest is sent to the login and a wrong password is refused", async ({ page }) => {
  await page.goto("/links");
  await expect(page).toHaveURL(/\/login$/);

  await login(page, "wrong-password");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("login, browse the links, edit one, count a click and log out", async ({ page, request }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await page.screenshot({ path: "test-results/overview.png" });

  // The sidebar is the navigation.
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Visão geral", exact: true })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Links", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Links", exact: true })).toBeVisible();
  await expect(page.getByText(/381 link\(s\)/)).toBeVisible();
  await page.screenshot({ path: "test-results/links.png" });

  // Search narrows the table and opens the link page.
  await page.getByLabel("Buscar links").fill("arno dual");
  await expect(page.getByText(/1 link\(s\)/)).toBeVisible();
  await page
    .getByRole("link", { name: /Arno Dual AFD2/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /Arno Dual AFD2/ })).toBeVisible();
  await expect(page.getByText("Ordem de fallback do produto")).toBeVisible();

  // Edit the priority from the dialog.
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Ordem (menor = escolhido primeiro)").fill("5");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Link atualizado")).toBeVisible();

  // The public redirect: 302 to the affiliate link, and the click is counted on the page.
  const redirect = await request.get(`/link?id=${encodeURIComponent(PRODUCT)}`, {
    headers: { "User-Agent": CHROME, Referer: "https://example.com/melhor-airfryer-8-litros?secret=1" },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toMatch(/^https:\/\/meli\.la\//);

  await page.reload();
  await expect(page.getByText("Cliques", { exact: true })).toBeVisible();
  await expect(page.locator("p", { hasText: /^Cliques$/ }).locator("xpath=following-sibling::p[1]")).toHaveText("1");
  await expect(page.locator("li", { hasText: /^https:\/\/example\.com\/melhor-airfryer-8-litros1$/ })).toBeVisible();

  // Deleting asks for confirmation and says what is erased.
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText(/cliques registrados deste link também são apagados/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/links");
  await expect(page).toHaveURL(/\/login$/);
});

test("projects page lists the seeded project", async ({ page }) => {
  await login(page);
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Projetos", exact: true })
    .click();
  await expect(page.getByRole("link", { name: "EletroRadar" })).toBeVisible();
  await page.getByRole("link", { name: "EletroRadar" }).click();
  await expect(page.getByRole("button", { name: "Importar JSON/CSV" })).toBeVisible();
});

test("the health endpoint answers for any origin", async ({ request }) => {
  const res = await request.get("/health", { headers: { Origin: "https://other.example.org" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["access-control-allow-origin"]).toBe("*");
  expect(await res.json()).toEqual({ status: "ok" });
});
