package rules_test

import (
	"strings"
	"testing"

	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

func TestDetectStore(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"https://meli.la/1qG3vci":                    "mercadolivre",
		"https://www.mercadolivre.com.br/x":          "mercadolivre",
		"https://amzn.to/abc":                        "amazon",
		"https://www.amazon.com.br/dp/1":             "amazon",
		"https://s.shopee.com.br/abc":                "shopee",
		"https://shope.ee/x":                         "shopee",
		"https://www.aliexpress.com/item/1":          "aliexpress",
		"https://www.magazinevoce.com.br/x":          "magalu",
		"https://pay.hotmart.com/x":                  "hotmart",
		"https://www.unknown-store.example.com/path": "unknown-store.example.com",
	}
	for url, want := range cases {
		if got := rules.DetectStore(url); got != want {
			t.Errorf("DetectStore(%q) = %q, want %q", url, got, want)
		}
	}
}

func TestIsPublicHTTPURL(t *testing.T) {
	t.Parallel()

	good := []string{"https://example.com/x", "http://amzn.to/a"}
	bad := []string{
		"", "javascript:alert(1)", "ftp://example.com", "https://localhost/x", "http://127.0.0.1/",
		"http://10.0.0.1/", "http://192.168.1.1/", "http://169.254.169.254/", "http://172.16.0.1/",
		"http://[::1]/", "not a url", "//example.com",
	}
	for _, u := range good {
		if !rules.IsPublicHTTPURL(u) {
			t.Errorf("%q should be public", u)
		}
	}
	for _, u := range bad {
		if rules.IsPublicHTTPURL(u) {
			t.Errorf("%q should be refused", u)
		}
	}
}

func TestSameHost(t *testing.T) {
	t.Parallel()

	if !rules.SameHost("https://a.example.com/x", "https://a.example.com") {
		t.Error("same host expected")
	}
	if rules.SameHost("https://evil.example.com/x", "https://a.example.com") {
		t.Error("different host must not match")
	}
	if rules.SameHost("::", "https://a.example.com") {
		t.Error("garbage must not match")
	}
}

func TestPickLink(t *testing.T) {
	t.Parallel()

	links := []rules.Candidate{
		{ID: 1, Status: "dead", Priority: 0, Store: "amazon"},
		{ID: 2, Status: "unknown", Priority: 2, Store: "shopee"},
		{ID: 3, Status: "alive", Priority: 1, Store: "mercadolivre"},
	}
	if got, ok := rules.PickLink(links, ""); !ok || got.ID != 3 {
		t.Errorf("by priority skipping dead: got %+v", got)
	}
	if got, _ := rules.PickLink(links, "shopee"); got.ID != 2 {
		t.Errorf("store preferred (unknown is usable): got %+v", got)
	}
	if got, _ := rules.PickLink(links, "amazon"); got.ID != 3 {
		t.Errorf("dead store falls back to priority order: got %+v", got)
	}
	if got, _ := rules.PickLink(links, "nope"); got.ID != 3 {
		t.Errorf("unknown store falls back: got %+v", got)
	}
	if _, ok := rules.PickLink([]rules.Candidate{{ID: 9, Status: "dead"}}, ""); ok {
		t.Error("all dead: no link")
	}
	if _, ok := rules.PickLink(nil, ""); ok {
		t.Error("none: no link")
	}
}

func TestClassifyProbe(t *testing.T) {
	t.Parallel()

	status := func(c int) rules.Probe { return rules.Probe{StatusCode: c} }
	cases := []struct {
		name  string
		url   string
		probe rules.Probe
		want  rules.CheckResult
	}{
		{"200", "https://s.com/p/1", rules.Probe{StatusCode: 200, FinalURL: "https://s.com/p/1"}, rules.CheckOK},
		{"302 chain", "https://s.com/p/1", rules.Probe{StatusCode: 200, FinalURL: "https://s.com/p/2"}, rules.CheckOK},
		{"404", "https://s.com/p/1", status(404), rules.CheckFailed},
		{"410", "https://s.com/p/1", status(410), rules.CheckFailed},
		{"500", "https://s.com/p/1", status(500), rules.CheckFailed},
		{"home redirect", "https://s.com/p/1", rules.Probe{StatusCode: 200, FinalURL: "https://s.com/"}, rules.CheckFailed},
		{"home to home", "https://s.com/", rules.Probe{StatusCode: 200, FinalURL: "https://s.com/"}, rules.CheckOK},
		{"401", "https://s.com/p/1", status(401), rules.CheckInconclusive},
		{"403", "https://s.com/p/1", status(403), rules.CheckInconclusive},
		{"429", "https://s.com/p/1", status(429), rules.CheckInconclusive},
		{"network error", "https://s.com/p/1", rules.Probe{}, rules.CheckFailed},
		{"timeout", "https://s.com/p/1", rules.Probe{TimedOut: true}, rules.CheckInconclusive},
	}
	for _, c := range cases {
		if got := rules.ClassifyProbe(c.url, c.probe); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestNextHealth(t *testing.T) {
	t.Parallel()

	h := rules.Health{Status: "unknown"}
	h = rules.NextHealth(h, rules.CheckFailed)
	h = rules.NextHealth(h, rules.CheckFailed)
	if h.Status != "unknown" || h.ConsecutiveFailures != 2 {
		t.Fatalf("two failures must not kill: %+v", h)
	}
	if got := rules.NextHealth(h, rules.CheckInconclusive); got != h {
		t.Errorf("inconclusive changes nothing: %+v", got)
	}
	h = rules.NextHealth(h, rules.CheckFailed)
	if h.Status != "dead" || h.ConsecutiveFailures != 3 {
		t.Fatalf("third failure kills: %+v", h)
	}
	h = rules.NextHealth(h, rules.CheckOK)
	if h.Status != "alive" || h.ConsecutiveFailures != 0 {
		t.Fatalf("ok revives: %+v", h)
	}
	if got := rules.NextHealth(rules.Health{Status: "alive", ConsecutiveFailures: 1}, rules.CheckFailed); got.Status != "alive" {
		t.Errorf("alive stays alive below the threshold: %+v", got)
	}
}

func TestNameFromExternalID(t *testing.T) {
	t.Parallel()

	if got := rules.NameFromExternalID("https://example.com/best/arno-dual_afd2/"); got != "arno dual afd2" {
		t.Errorf("got %q", got)
	}
}

func TestParseImportJSON(t *testing.T) {
	t.Parallel()

	rows, err := rules.ParseImport(`[
		{"externalId":"https://example.com/a","name":"A","links":[{"url":"https://amzn.to/1"}]},
		{"id":"https://example.com/b","category":"c","mercadolivreUrl":"https://meli.la/x","amazonUrl":"","shopeeUrl":"https://shope.ee/y"}
	]`)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Name != "A" || len(rows[1].Links) != 2 || rows[1].Category != "c" {
		t.Fatalf("unexpected rows: %+v", rows)
	}
}

func TestParseImportCSV(t *testing.T) {
	t.Parallel()

	rows, err := rules.ParseImport("externalId,url,name,pageUrl,category,store\r\n" +
		"https://example.com/a,https://amzn.to/1,\"A, the \"\"best\"\"\",,cat,\n" +
		"https://example.com/a,https://shope.ee/2,,,,shopee\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Name != `A, the "best"` || len(rows[0].Links) != 2 || rows[0].Links[1].Store != "shopee" {
		t.Fatalf("unexpected rows: %+v", rows)
	}
}

func TestParseImportRejects(t *testing.T) {
	t.Parallel()

	bad := []string{
		`[{"externalId":"x","links":[]}]`,
		`[{"externalId":"","links":[{"url":"https://amzn.to/1"}]}]`,
		`[{"externalId":"x","links":[{"url":"javascript:alert(1)"}]}]`,
		`[{"externalId":"x","links":[{"url":"http://127.0.0.1/"}]}]`,
		`[{"externalId":"x","pageUrl":"ftp://x","links":[{"url":"https://amzn.to/1"}]}]`,
		`[not json`,
	}
	for _, b := range bad {
		if _, err := rules.ParseImport(b); err == nil {
			t.Errorf("should reject %s", b)
		}
	}
}

func TestProductValidation(t *testing.T) {
	t.Parallel()

	links := make([]rules.LinkInput, 21)
	for i := range links {
		links[i] = rules.LinkInput{URL: "https://amzn.to/1"}
	}
	if err := (&rules.ProductInput{ExternalID: "x", Links: links}).Validate(); err == nil {
		t.Error("more than 20 links must be refused")
	}
	long := strings.Repeat("a", 501)
	if err := (&rules.ProductInput{ExternalID: long, Links: links[:1]}).Validate(); err == nil {
		t.Error("externalId over 500 chars must be refused")
	}
}

func TestPlanImport(t *testing.T) {
	t.Parallel()

	rows := []rules.ProductInput{
		{ExternalID: "a", Links: []rules.LinkInput{{URL: "https://x/1"}, {URL: "https://x/2"}, {URL: "https://x/3"}}},
		{ExternalID: "b", Links: []rules.LinkInput{{URL: "https://x/4"}}},
	}
	registered := map[string]map[string]bool{"a": {"https://x/1": true}}
	dead := map[string]bool{"https://x/4": true, "https://x/3": true}
	plan := rules.PlanImport(rows, registered, dead)
	if plan.SkippedExisting != 1 || plan.SkippedDead != 2 || len(plan.Rows) != 1 ||
		len(plan.Rows[0].Links) != 1 || plan.Rows[0].Links[0].URL != "https://x/2" {
		t.Fatalf("unexpected plan: %+v", plan)
	}
}

func TestMessages(t *testing.T) {
	t.Parallel()

	report := rules.WeeklyReport([]rules.ProjectClicks{{Name: "b", Clicks: 1}, {Name: "a", Clicks: 5}}, 7)
	if !strings.Contains(report, "últimos 7 dias") || strings.Index(report, "a: 5") > strings.Index(report, "b: 1") ||
		!strings.Contains(report, "Total: 6") {
		t.Errorf("report: %s", report)
	}
	if !strings.Contains(rules.WeeklyReport(nil, 7), "Nenhum projeto") {
		t.Error("empty report")
	}
	msg := rules.ClickMessage(rules.ClickNotice{Project: "P", Product: "Prod", PageURL: "https://p/x", TargetURL: "https://t/y"})
	for _, part := range []string{"Clique: P", "Prod", "Página: https://p/x", "Destino: https://t/y"} {
		if !strings.Contains(msg, part) {
			t.Errorf("click message misses %q: %s", part, msg)
		}
	}
}
