package legacy_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/AlexGalhardo/vukem/database"
	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-links/bootstrap"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/legacy"
)

// oldSchema is the Drizzle schema of the previous version (db/schema.ts at v6.2.1).
const oldSchema = `
CREATE TABLE projects (id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, base_url text NOT NULL, created_at integer NOT NULL);
CREATE TABLE products (id text PRIMARY KEY, project_id text NOT NULL, external_id text NOT NULL UNIQUE, name text NOT NULL, page_url text NOT NULL, category text, created_at integer NOT NULL);
CREATE TABLE affiliate_links (id text PRIMARY KEY, product_id text NOT NULL, store text NOT NULL, url text NOT NULL, priority integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'unknown', consecutive_failures integer NOT NULL DEFAULT 0, last_checked_at integer, last_status_code integer, final_url text, legacy_clicks integer NOT NULL DEFAULT 0, created_at integer NOT NULL);
CREATE TABLE click_events (id integer PRIMARY KEY AUTOINCREMENT, product_id text NOT NULL, link_id text, device text NOT NULL, os text, browser text, country text, referer text, is_bot integer NOT NULL DEFAULT 0, created_at integer NOT NULL);
CREATE TABLE link_checks (id integer PRIMARY KEY AUTOINCREMENT, link_id text NOT NULL, status_code integer, final_url text, result text NOT NULL, checked_at integer NOT NULL);
INSERT INTO projects VALUES ('p1', 'EletroRadar', 'eletroradar', 'https://example.com', 1760000000000);
INSERT INTO products VALUES ('prod1', 'p1', 'https://example.com/best/a', 'A', 'https://example.com/best', 'best', 1760000000000);
INSERT INTO products VALUES ('prod2', 'p1', 'https://example.com/best/b', 'B', 'https://example.com/best', NULL, 1760000000000);
INSERT INTO affiliate_links VALUES ('l1', 'prod1', 'amazon', 'https://amzn.to/1', 0, 'alive', 0, 1760000100000, 200, 'https://www.amazon.com.br/dp/1', 42, 1760000000000);
INSERT INTO affiliate_links VALUES ('l2', 'prod1', 'shopee', 'https://shope.ee/2', 1, 'dead', 3, 1760000100000, 404, NULL, 0, 1760000000000);
INSERT INTO affiliate_links VALUES ('l3', 'prod2', 'amazon', 'https://amzn.to/3', 0, 'unknown', 0, NULL, NULL, NULL, 0, 1760000000000);
INSERT INTO click_events (product_id, link_id, device, os, browser, country, referer, is_bot, created_at) VALUES ('prod1', 'l1', 'mobile', 'iOS', 'Safari', 'BR', 'https://example.com/best', 0, 1760000200000);
INSERT INTO click_events (product_id, link_id, device, os, browser, country, referer, is_bot, created_at) VALUES ('prod1', NULL, 'desktop', NULL, NULL, NULL, NULL, 1, 1760000300000);
INSERT INTO link_checks (link_id, status_code, final_url, result, checked_at) VALUES ('l2', 404, NULL, 'failed', 1760000100000);
`

func openOld(t *testing.T) *database.DB {
	t.Helper()

	path := filepath.Join(t.TempDir(), "legacy.db")

	rw, err := database.Open(t.Context(), "file:"+path)
	if err != nil {
		t.Fatal(err)
	}

	for _, stmt := range splitStatements(oldSchema) {
		if _, err := rw.ExecContext(t.Context(), stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}

	if err := rw.Close(); err != nil {
		t.Fatal(err)
	}

	old, err := legacy.OpenOld(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = old.Close() })

	return old
}

func splitStatements(sql string) []string {
	var out []string

	cur := ""

	for _, line := range splitLines(sql) {
		cur += line + "\n"

		if len(line) > 0 && line[len(line)-1] == ';' {
			out = append(out, cur)
			cur = ""
		}
	}

	return out
}

func splitLines(s string) []string {
	var lines []string

	start := 0

	for i := range len(s) {
		if s[i] == '\n' {
			if i > start {
				lines = append(lines, s[start:i])
			}

			start = i + 1
		}
	}

	return lines
}

func count(t *testing.T, db *database.DB, query string) int {
	t.Helper()

	var n int
	if err := db.QueryRowContext(context.Background(), query).Scan(&n); err != nil {
		t.Fatal(err)
	}

	return n
}

func TestImportDatabaseKeepsEverythingAndIsIdempotent(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	db, err := app.DB()
	if err != nil {
		t.Fatal(err)
	}

	old := openOld(t)

	sum, err := legacy.ImportDatabase(t.Context(), db, old)
	if err != nil {
		t.Fatal(err)
	}

	if sum.Projects != 1 || sum.Products != 2 || sum.Links != 3 || sum.Clicks != 2 || sum.Checks != 1 || sum.SkippedHistory {
		t.Fatalf("summary: %+v", sum)
	}

	if n := count(t, db, "SELECT COUNT(*) FROM affiliate_links l JOIN products p ON p.id = l.product_id WHERE p.external_id = 'https://example.com/best/a' AND l.url = 'https://amzn.to/1' AND l.status = 'alive' AND l.legacy_clicks = 42 AND l.last_status_code = 200 AND l.final_url = 'https://www.amazon.com.br/dp/1'"); n != 1 {
		t.Fatal("link fields are kept")
	}

	if n := count(t, db, "SELECT COUNT(*) FROM click_events e JOIN affiliate_links l ON l.id = e.link_id WHERE l.url = 'https://amzn.to/1' AND e.device = 'mobile' AND e.is_bot = 0 AND e.country = 'BR'"); n != 1 {
		t.Fatal("a click stays attached to its link")
	}

	if n := count(t, db, "SELECT COUNT(*) FROM click_events WHERE link_id IS NULL AND is_bot = 1"); n != 1 {
		t.Fatal("a click without a link and a bot flag are kept")
	}

	// The dates survive: the first project was created on 2025-10-09.
	if n := count(t, db, "SELECT COUNT(*) FROM projects WHERE created_at LIKE '2025-10-09%'"); n != 1 {
		t.Fatal("created_at is converted from epoch milliseconds")
	}

	again, err := legacy.ImportDatabase(t.Context(), db, old)
	if err != nil {
		t.Fatal(err)
	}

	if again.Projects+again.Products+again.Links+again.Clicks+again.Checks != 0 || !again.SkippedHistory {
		t.Fatalf("a second run adds nothing: %+v", again)
	}

	if n := count(t, db, "SELECT COUNT(*) FROM click_events"); n != 2 {
		t.Fatalf("clicks are not duplicated, got %d", n)
	}
}

func TestImportDatabaseRefusesAMissingFile(t *testing.T) {
	t.Parallel()

	if _, err := legacy.OpenOld(t.Context(), filepath.Join(t.TempDir(), "nope.db")); err == nil {
		t.Fatal("a missing file must be an error, not an empty database")
	}
}

func TestImportSeedLoadsTheProductsOnceAndAcceptsTheV4Format(t *testing.T) {
	t.Parallel()

	app := vukem(t)
	db, _ := app.DB()
	svc := catalog.New(db)

	path := filepath.Join(t.TempDir(), "seed.json")

	seed := `[
		{"externalId":"https://example.com/best/a","name":"A","links":[{"url":"https://amzn.to/1"}]},
		{"id":"https://example.com/best/b","category":"best","mercadolivreUrl":"https://meli.la/x","amazonUrl":null,"shopeeUrl":"https://shope.ee/y"}
	]`
	if err := os.WriteFile(path, []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}

	sum, err := legacy.ImportSeed(t.Context(), svc, legacy.DefaultSeedProject, path)
	if err != nil || sum.ProductsCreated != 2 || sum.LinksAdded != 3 || len(sum.Errors) != 0 {
		t.Fatalf("%+v %v", sum, err)
	}

	again, err := legacy.ImportSeed(t.Context(), svc, legacy.DefaultSeedProject, path)
	if err != nil || again.ProductsCreated != 0 || again.LinksAdded != 0 {
		t.Fatalf("idempotent: %+v %v", again, err)
	}

	if n := count(t, db, "SELECT COUNT(*) FROM projects WHERE slug = 'eletroradar'"); n != 1 {
		t.Fatal("one project")
	}
}

func TestTheRealSeedFileIsImportable(t *testing.T) {
	t.Parallel()

	app := vukem(t)
	db, _ := app.DB()

	sum, err := legacy.ImportSeed(t.Context(), catalog.New(db), legacy.DefaultSeedProject, filepath.Join("..", "..", "seed.json"))
	if err != nil {
		t.Fatal(err)
	}

	if sum.ProductsCreated == 0 || sum.LinksAdded < sum.ProductsCreated || len(sum.Errors) != 0 {
		t.Fatalf("the repository seed must import cleanly: %+v", sum)
	}
}

func vukem(t *testing.T) *vukemtest.App {
	t.Helper()

	return vukemtest.New(t, bootstrap.New)
}
