package tests

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/AlexGalhardo/vukem/vukemtest"
)

func signedIn(w *world, t *testing.T) *vukemtest.Client {
	t.Helper()

	w.admin(t)

	c := w.app.Client(t).Inertia("")
	c.PostJSON("/login", map[string]any{"email": adminEmail, "password": adminPassword}).AssertRedirect("/")

	return c
}

func firstLinkID(t *testing.T, w *world) int64 {
	t.Helper()

	var id int64
	if err := w.db.QueryRowContext(t.Context(), "SELECT id FROM affiliate_links ORDER BY id LIMIT 1").Scan(&id); err != nil {
		t.Fatal(err)
	}

	return id
}

func TestOverviewShowsTotalsAndRankings(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1", "https://shope.ee/2"}})

	if _, err := w.db.ExecContext(t.Context(), "UPDATE affiliate_links SET status = 'dead' WHERE url = 'https://amzn.to/1'"); err != nil {
		t.Fatal(err)
	}

	w.app.Client(t).WithHeader("User-Agent", chromeWindows).Get(linkURL(productID)).AssertStatus(302)

	signedIn(w, t).Get("/").AssertOK().AssertInertia("Overview").
		PropEquals("links", 2).
		PropEquals("dead", 1).
		PropEquals("unchecked", 1).
		PropEquals("stats.clicks", 1).
		HasProp("dead_links", 1).
		HasProp("top_links", 2)
}

func TestLinksPageListsEveryLinkWithItsClicks(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	w.app.Client(t).WithHeader("User-Agent", safariIPhone).Get(linkURL(productID)).AssertStatus(302)

	signedIn(w, t).Get("/links").AssertOK().AssertInertia("Links/Index").
		HasProp("links", 1).
		HasProp("projects", 1).
		PropEquals("links.0.clicks", 1).
		PropEquals("links.0.mobile", 1).
		PropEquals("links.0.store", "amazon")
}

func TestLinkPageShowsTheFallbackOrderAndChecks(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1", "https://shope.ee/2"}})
	id := firstLinkID(t, w)

	if _, err := w.db.ExecContext(t.Context(), "INSERT INTO link_checks (link_id, status_code, result, created_at, updated_at) VALUES (?, 200, 'ok', datetime('now'), datetime('now'))", id); err != nil {
		t.Fatal(err)
	}

	signedIn(w, t).Get("/links/"+strconv.FormatInt(id, 10)).AssertOK().AssertInertia("Links/Show").
		PropEquals("link.id", int(id)).
		PropEquals("product.external_id", productID).
		HasProp("siblings", 2).
		HasProp("checks", 1)
}

func TestUnknownLinkOrProjectGoesBackToTheStartPage(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	c := signedIn(w, t)

	c.Get("/links/9999").AssertRedirect("/")
	c.Get("/links/abc").AssertRedirect("/")
	c.Get("/projects/nope").AssertRedirect("/")
}

func TestProjectsPages(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	c := signedIn(w, t)

	c.Get("/projects").AssertOK().AssertInertia("Projects/Index").
		HasProp("projects", 1).
		PropEquals("projects.0.links", 1).
		PropEquals("projects.0.slug", "site-example-com")

	c.Get("/projects/site-example-com").AssertOK().AssertInertia("Projects/Show").
		PropEquals("project.base_url", siteURL).
		HasProp("links", 1)
}

func TestCreateProject(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	c := signedIn(w, t)

	c.PostJSON("/projects", map[string]any{"name": "Shop", "slug": "shop", "baseUrl": "https://shop.example.com/some/page"}).
		AssertRedirect("/projects/shop")

	if n := count(t, w, "SELECT COUNT(*) FROM projects WHERE slug = 'shop' AND base_url = 'https://shop.example.com'"); n != 1 {
		t.Fatal("the project stores the origin of the URL")
	}

	// Duplicate slug, bad slug, private URL: refused with the field named.
	back := c.WithHeader("Referer", "/projects")
	back.PostJSON("/projects", map[string]any{"name": "Again", "slug": "shop", "baseUrl": "https://again.example.com"}).AssertSessionHasErrors("slug")
	back.PostJSON("/projects", map[string]any{"name": "Bad", "slug": "Bad Slug!", "baseUrl": "https://bad.example.com"}).AssertSessionHasErrors("slug")
	back.PostJSON("/projects", map[string]any{"name": "Local", "slug": "local", "baseUrl": "http://127.0.0.1:3000"}).AssertSessionHasErrors("baseUrl")

	if n := count(t, w, "SELECT COUNT(*) FROM projects"); n != 1 {
		t.Fatalf("only the valid project exists, got %d", n)
	}
}

func TestCreateProjectNeedsTheSiteOnline(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.net.status = func(string) int { return 502 }

	signedIn(w, t).WithHeader("Referer", "/projects").
		PostJSON("/projects", map[string]any{"name": "Down", "slug": "down", "baseUrl": "https://down.example.com"}).
		AssertSessionHasErrors("baseUrl")

	if n := count(t, w, "SELECT COUNT(*) FROM projects"); n != 0 {
		t.Fatal("an offline site never becomes a project")
	}
}

func TestDeleteProjectRemovesEverythingUnderIt(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	w.app.Client(t).Get(linkURL(productID)).AssertStatus(302)

	signedIn(w, t).Delete("/projects/1").AssertRedirect("/projects")

	for _, table := range []string{"projects", "products", "affiliate_links", "click_events"} {
		if n := count(t, w, "SELECT COUNT(*) FROM "+table); n != 0 {
			t.Errorf("%s: %d rows left", table, n)
		}
	}

	w.app.Client(t).Get(linkURL(productID)).AssertNotFound()
}

func TestAddAProductByHand(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	c := signedIn(w, t).WithHeader("Referer", "/projects/site-example-com")

	c.PostJSON("/projects/1/products", map[string]any{
		"externalId": siteURL + "/new", "name": "New", "urls": "https://amzn.to/a\nhttps://shope.ee/b",
	}).AssertRedirect("/projects/site-example-com")

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links l JOIN products p ON p.id = l.product_id WHERE p.name = 'New'"); n != 2 {
		t.Fatalf("both links are added, got %d", n)
	}

	// A page outside the project's domain, or an unsafe URL, is refused.
	c.PostJSON("/projects/1/products", map[string]any{
		"externalId": "plain-id", "pageUrl": "https://evil.example.org/x", "urls": "https://amzn.to/c",
	}).AssertSessionHasErrors("externalId")
	c.PostJSON("/projects/1/products", map[string]any{"externalId": siteURL + "/x", "urls": "http://10.0.0.1/admin"}).
		AssertSessionHasErrors("urls")
}

func TestImportSkipsKnownAndDeadLinks(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/known"}})
	w.net.status = func(u string) int {
		if strings.HasSuffix(u, "/gone") {
			return 404
		}

		return 200
	}

	c := signedIn(w, t).WithHeader("Referer", "/projects/site-example-com")
	text := `[{"externalId":"` + productID + `","links":[{"url":"https://amzn.to/known"},{"url":"https://shope.ee/gone"},{"url":"https://shope.ee/fresh"}]},` +
		`{"externalId":"` + siteURL + `/only-dead","links":[{"url":"https://amzn.to/gone"}]}]`

	c.PostJSON("/projects/1/import", map[string]any{"text": text}).AssertRedirect("/projects/site-example-com")

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE url = 'https://shope.ee/fresh'"); n != 1 {
		t.Fatal("the fresh link is imported")
	}

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE url LIKE '%/gone'"); n != 0 {
		t.Fatal("dead links are skipped")
	}

	if n := count(t, w, "SELECT COUNT(*) FROM products WHERE external_id LIKE '%/only-dead'"); n != 0 {
		t.Fatal("a product left without links is not created")
	}

	c.PostJSON("/projects/1/import", map[string]any{"text": "[not json"}).AssertSessionHasErrors("text")
}

func TestEditPromoteAndDeleteALink(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1", "https://shope.ee/2"}})
	c := signedIn(w, t).WithHeader("Referer", "/links")
	first := firstLinkID(t, w)
	second := first + 1

	c.PutJSON("/links/"+strconv.FormatInt(first, 10), map[string]any{"url": "https://www.mercadolivre.com.br/novo", "priority": 7}).
		AssertRedirect("/links")

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE id = ? AND store = 'mercadolivre' AND priority = 7 AND status = 'unknown'", first); n != 1 {
		t.Fatal("a new URL changes the store and starts the health over")
	}

	c.PutJSON("/links/"+strconv.FormatInt(first, 10), map[string]any{"url": "http://127.0.0.1/x", "priority": 0}).
		AssertSessionHasErrors("url")

	c.PostJSON("/links/"+strconv.FormatInt(first, 10)+"/promote", map[string]any{}).AssertRedirect("/links")

	w.app.Client(t).Get(linkURL(productID)).AssertHeader("Location", "https://www.mercadolivre.com.br/novo")

	c.Delete("/links/" + strconv.FormatInt(second, 10)).AssertRedirect("/links")

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links"); n != 1 {
		t.Fatalf("one link left, got %d", n)
	}

	c.PostJSON("/links/delete", map[string]any{"ids": []int64{first}}).AssertRedirect("/links")
	c.PostJSON("/links/delete", map[string]any{"ids": []int64{}}).AssertSessionHasErrors("ids")
}

func TestCheckSelectedAndAllLinks(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/ok", "https://shope.ee/gone"}})
	w.net.status = func(u string) int {
		if strings.HasSuffix(u, "/gone") {
			return http.StatusNotFound
		}

		return 200
	}

	c := signedIn(w, t).WithHeader("Referer", "/links")
	first := firstLinkID(t, w)

	c.PostJSON("/links/check", map[string]any{"ids": []int64{first}}).AssertRedirect("/links")

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE id = ? AND status = 'alive'", first); n != 1 {
		t.Fatal("the selected link is checked and alive")
	}

	if n := count(t, w, "SELECT COUNT(*) FROM link_checks"); n != 1 {
		t.Fatalf("only the selected link was checked, got %d checks", n)
	}

	c.PostJSON("/links/check", map[string]any{"all": true}).AssertRedirect("/links")

	if n := count(t, w, "SELECT COUNT(*) FROM link_checks"); n != 3 {
		t.Fatalf("all links are checked, got %d checks", n)
	}

	c.PostJSON("/links/check", map[string]any{"ids": []int64{}}).AssertSessionHasErrors("ids")
}
