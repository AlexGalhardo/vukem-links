package tests

import (
	"net/http"
	"strings"
	"testing"

	"github.com/AlexGalhardo/vukem/vukemtest"
)

// These tests pin the contract the sites (eletroradar, tudohardware) build
// against: scripts/sync-links.ts calls PUT /api/v1/links?site=<origin> with
// Authorization: Bearer <LINKS_DASHBOARD_TOKEN> and reads productsCreated,
// productsUpdated, productsRemoved, linksAdded, linksRemoved and errors.

func apiClient(w *world, t *testing.T) *vukemtest.Client {
	t.Helper()

	return w.app.Client(t).AcceptJSON().WithHeader("Authorization", "Bearer "+apiKey)
}

func apiPath(site string) string { return "/api/v1/links?site=" + site }

type product map[string]any

func prod(id string, urls ...string) product {
	links := make([]map[string]string, len(urls))
	for i, u := range urls {
		links[i] = map[string]string{"url": u}
	}

	return product{"externalId": id, "links": links}
}

func TestAPIRejectsMissingWrongOrUnconfiguredKey(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	body := []product{prod(siteURL+"/a", "https://amzn.to/1")}

	for _, c := range map[string]*vukemtest.Client{
		"no key":      w.app.Client(t).AcceptJSON(),
		"wrong key":   w.app.Client(t).AcceptJSON().WithHeader("Authorization", "Bearer wrong"),
		"longer key":  w.app.Client(t).AcceptJSON().WithHeader("Authorization", "Bearer "+apiKey+"-and-more"),
		"no scheme":   w.app.Client(t).AcceptJSON().WithHeader("Authorization", apiKey),
		"empty token": w.app.Client(t).AcceptJSON().WithHeader("Authorization", "Bearer "),
	} {
		c.PutJSON(apiPath(siteURL), body).AssertStatus(401).AssertJSON(map[string]any{"error": "unauthorized"})
		c.PostJSON(apiPath(siteURL), body).AssertStatus(401)

	}

	if n := count(t, w, "SELECT COUNT(*) FROM products"); n != 0 {
		t.Fatalf("nothing is written without the key, got %d products", n)
	}
}

func TestAPIRefusesEveryCallWhenTheKeyIsNotConfigured(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, newBuild(&fakeNet{}), vukemtest.Options{Env: map[string]string{"LINKS_API_KEY": ""}})
	c := app.Client(t).AcceptJSON()

	for _, h := range []string{"Bearer ", "Bearer undefined", ""} {
		c.WithHeader("Authorization", h).PutJSON(apiPath(siteURL), []product{prod(siteURL+"/a", "https://amzn.to/1")}).AssertStatus(401)
	}
}

func TestAPIRequiresAPublicSite(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	c := apiClient(w, t)
	body := []product{prod(siteURL+"/a", "https://amzn.to/1")}

	for _, site := range []string{"", "not-a-url", "ftp://site.example.com", "http://127.0.0.1", "http://localhost:3000", "http://192.168.0.5"} {
		c.PutJSON("/api/v1/links?site="+site, body).AssertStatus(400).AssertJSON(map[string]any{"error": "invalid_site"})
	}

	c.PutJSON("/api/v1/links", body).AssertStatus(400).AssertJSON(map[string]any{"error": "invalid_site"})
}

func TestAPIPutCreatesTheProjectOnFirstContactAndSyncs(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	c := apiClient(w, t)

	a, b := siteURL+"/best/a", siteURL+"/best/b"

	first := c.PutJSON(apiPath(siteURL+"/ignored/path?x=1"), []product{
		{"externalId": a, "name": "A", "category": "best", "pageUrl": siteURL + "/best", "links": []map[string]string{{"url": "https://amzn.to/1"}, {"url": "https://www.mercadolivre.com.br/x", "store": "mercadolivre"}}},
		prod(b, "https://shope.ee/2"),
	})
	first.AssertStatus(200).AssertJSON(map[string]any{
		"productsCreated": 2, "productsUpdated": 0, "productsRemoved": 0, "linksAdded": 3, "linksRemoved": 0, "errors": []any{},
	})

	if n := count(t, w, "SELECT COUNT(*) FROM projects WHERE base_url = ? AND name = 'site.example.com' AND slug = 'site-example-com'", siteURL); n != 1 {
		t.Fatal("the site becomes a project by its origin, named after the host")
	}

	// The same call again changes nothing (idempotent).
	again := []product{
		{"externalId": a, "name": "A", "category": "best", "pageUrl": siteURL + "/best", "links": []map[string]string{{"url": "https://amzn.to/1"}, {"url": "https://www.mercadolivre.com.br/x", "store": "mercadolivre"}}},
		prod(b, "https://shope.ee/2"),
	}
	c.PutJSON(apiPath(siteURL), again).AssertStatus(200).AssertJSON(map[string]any{
		"productsCreated": 0, "productsUpdated": 0, "productsRemoved": 0, "linksAdded": 0, "linksRemoved": 0, "errors": []any{},
	})

	// The body is the whole catalogue: b disappears, a loses a link and gains another.
	c.PutJSON(apiPath(siteURL), []product{prod(a, "https://amzn.to/1", "https://s.shopee.com.br/3")}).
		AssertStatus(200).
		AssertJSON(map[string]any{
			"productsCreated": 0, "productsUpdated": 0, "productsRemoved": 1, "linksAdded": 1, "linksRemoved": 1, "errors": []any{},
		})

	if n := count(t, w, "SELECT COUNT(*) FROM products"); n != 1 {
		t.Fatalf("products left: %d", n)
	}
}

func TestAPIPutEmptyBodyNeverWipesTheCatalogue(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	c := apiClient(w, t)

	for _, body := range []any{[]product{}, nil, map[string]any{}} {
		c.PutJSON(apiPath(siteURL), body).AssertStatus(400)
	}

	if n := count(t, w, "SELECT COUNT(*) FROM products"); n != 1 {
		t.Fatalf("the catalogue must survive, got %d", n)
	}
}

func TestAPIPutValidation(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	c := apiClient(w, t)
	id := siteURL + "/p"

	bad := map[string]any{
		"duplicate externalId": []product{prod(id, "https://amzn.to/1"), prod(id, "https://amzn.to/2")},
		"no links":             []product{{"externalId": id, "links": []any{}}},
		"unsafe url":           []product{prod(id, "javascript:alert(1)")},
		"private url":          []product{prod(id, "http://169.254.169.254/latest")},
		"missing id":           []product{{"links": []map[string]string{{"url": "https://amzn.to/1"}}}},
	}
	for name, body := range bad {
		res := c.PutJSON(apiPath(siteURL), body).AssertStatus(400)
		res.AssertJSONPath("error", "invalid_body")

		if _, ok := res.JSONPath("issues"); !ok {
			t.Errorf("%s: issues must list what is wrong", name)
		}
	}

	c.Do(http.MethodPut, apiPath(siteURL), strings.NewReader("{not json"), "application/json").AssertStatus(400)

	if n := count(t, w, "SELECT COUNT(*) FROM products"); n != 0 {
		t.Fatalf("an invalid body writes nothing, got %d", n)
	}
}

func TestAPIPutPartialAcceptanceIs207(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	c := apiClient(w, t)

	other := "https://other.example.com"
	c.PutJSON(apiPath(other), []product{prod(other+"/x", "https://amzn.to/o")}).AssertStatus(200)

	res := c.PutJSON(apiPath(siteURL), []product{
		prod(productID, "https://amzn.to/1"),
		prod(other+"/x", "https://amzn.to/steal"),
		{"externalId": siteURL + "/offsite", "pageUrl": "https://evil.example.org/p", "links": []map[string]string{{"url": "https://amzn.to/2"}}},
	}).AssertStatus(207)

	errs, _ := res.JSONPath("errors")
	if list, ok := errs.([]any); !ok || len(list) != 2 {
		t.Fatalf("a product of another project and a page outside the domain are refused: %v", errs)
	}

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE url = 'https://amzn.to/steal'"); n != 0 {
		t.Fatal("a site never writes into another project")
	}
}

func TestAPIPutIsRefusedWhileTheSiteIsOffline(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.net.status = func(string) int { return 503 }

	apiClient(w, t).PutJSON(apiPath(siteURL), []product{prod(siteURL+"/a", "https://amzn.to/1")}).
		AssertStatus(409).
		AssertJSON(map[string]any{"error": "project_offline", "baseUrl": siteURL})

	if n := count(t, w, "SELECT COUNT(*) FROM projects"); n != 0 {
		t.Fatalf("nothing is created for an offline site, got %d projects", n)
	}
}

func TestAPIPostAppendsAndNeverRemoves(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})
	c := apiClient(w, t)

	c.PostJSON(apiPath(siteURL), prod(productID, "https://amzn.to/1", "https://shope.ee/2")).
		AssertStatus(201).
		AssertJSON(map[string]any{"productsCreated": 0, "linksAdded": 1, "errors": []any{}})

	c.PostJSON(apiPath(siteURL), []product{prod(siteURL+"/two", "https://amzn.to/t"), prod(siteURL+"/three", "https://amzn.to/h")}).
		AssertStatus(201).
		AssertJSON(map[string]any{"productsCreated": 2, "linksAdded": 2, "errors": []any{}})

	if n := count(t, w, "SELECT COUNT(*) FROM products"); n != 3 {
		t.Fatalf("POST only adds: %d products", n)
	}

	c.PostJSON(apiPath(siteURL), []product{prod(siteURL+"/two", "https://amzn.to/t")}).
		AssertStatus(201).
		AssertJSON(map[string]any{"productsCreated": 0, "linksAdded": 0, "errors": []any{}})

	// The default store is detected from the host, the default name from the id.
	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE store = 'shopee'"); n != 1 {
		t.Fatal("store must be detected from the host")
	}

	c.PostJSON(apiPath(siteURL), "nope").AssertStatus(400)
}

func TestAPIPostBounds(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	c := apiClient(w, t)

	tooMany := make([]product, 501)
	for i := range tooMany {
		tooMany[i] = prod(siteURL+"/p"+strings.Repeat("x", i%7)+string(rune('a'+i%26))+string(rune('a'+i/26)), "https://amzn.to/1")
	}

	c.PostJSON(apiPath(siteURL), tooMany).AssertStatus(400)

	links := make([]map[string]string, 21)
	for i := range links {
		links[i] = map[string]string{"url": "https://amzn.to/" + string(rune('a'+i))}
	}

	c.PostJSON(apiPath(siteURL), product{"externalId": siteURL + "/many", "links": links}).AssertStatus(400)
}

func TestAPIDoesNotNeedACSRFTokenOrSession(t *testing.T) {
	t.Parallel()

	w := newWorld(t)

	// A site calls from a server: no Origin, no cookies. Neither a CSRF check
	// nor a session may get in the way, and no cookie is issued.
	w.app.Client(t).AcceptJSON().WithHeader("Authorization", "Bearer "+apiKey).
		PutJSON(apiPath(siteURL), []product{prod(siteURL+"/a", "https://amzn.to/1")}).
		AssertStatus(200).
		AssertHeaderMissing("Set-Cookie")
}
