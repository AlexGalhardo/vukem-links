package health_test

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/AlexGalhardo/vukem/orm"
	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/bootstrap"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/health"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

// fakeNet answers every request from a table: no network is touched.
type fakeNet struct {
	mu    sync.Mutex
	calls []string
	reply func(url string) (*http.Response, error)
}

func (f *fakeNet) RoundTrip(r *http.Request) (*http.Response, error) {
	f.mu.Lock()
	f.calls = append(f.calls, r.URL.String())
	f.mu.Unlock()

	return f.reply(r.URL.String())
}

func status(code int) (*http.Response, error) {
	return &http.Response{StatusCode: code, Body: http.NoBody, Header: http.Header{}}, nil
}

func redirect(to string) (*http.Response, error) {
	return &http.Response{StatusCode: 302, Body: http.NoBody, Header: http.Header{"Location": {to}}}, nil
}

type notes struct {
	mu   sync.Mutex
	msgs []string
}

func (n *notes) Notify(_ context.Context, m string) {
	n.mu.Lock()
	n.msgs = append(n.msgs, m)
	n.mu.Unlock()
}

type env struct {
	checker *health.Checker
	net     *fakeNet
	notes   *notes
	svc     *catalog.Service
	project models.Project
}

func setup(t *testing.T, reply func(string) (*http.Response, error)) env {
	t.Helper()

	app := vukemtest.New(t, bootstrap.New)

	db, err := app.DB()
	if err != nil {
		t.Fatal(err)
	}

	f := &fakeNet{reply: reply}
	n := &notes{}
	svc := catalog.New(db)

	p, err := svc.FindOrCreateProject(t.Context(), "https://site.example.com")
	if err != nil {
		t.Fatal(err)
	}

	return env{
		checker: &health.Checker{DB: db, HTTP: &http.Client{Transport: f}, Notify: n},
		net:     f, notes: n, svc: svc, project: p,
	}
}

func (e env) add(t *testing.T, id string, urls ...string) []models.AffiliateLink {
	t.Helper()

	in := rules.ProductInput{ExternalID: e.project.BaseURL + "/" + id}
	for _, u := range urls {
		in.Links = append(in.Links, rules.LinkInput{URL: u})
	}

	if _, err := e.svc.Upsert(t.Context(), e.project, []rules.ProductInput{in}); err != nil {
		t.Fatal(err)
	}

	p, err := orm.QueryOf[models.Product](e.svc.DB).Where("external_id", in.ExternalID).First(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	links, err := orm.QueryOf[models.AffiliateLink](e.svc.DB).Where("product_id", p.ID).OrderBy("priority", orm.Asc).Get(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	return links
}

func (e env) link(t *testing.T, id int64) models.AffiliateLink {
	t.Helper()

	l, err := orm.QueryOf[models.AffiliateLink](e.svc.DB).Find(t.Context(), id)
	if err != nil {
		t.Fatal(err)
	}

	return l
}

func TestCheckClassifiesAndPersists(t *testing.T) {
	t.Parallel()

	e := setup(t, func(u string) (*http.Response, error) {
		switch {
		case strings.Contains(u, "/ok"):
			return status(200)
		case strings.Contains(u, "/gone"):
			return status(404)
		case strings.Contains(u, "/blocked"):
			return status(403)
		case strings.Contains(u, "/home"):
			if strings.HasSuffix(u, "/") {
				return status(200)
			}

			return redirect("https://shop.example.com/")
		default:
			return nil, errors.New("dial tcp: no such host")
		}
	})

	links := e.add(t, "p", "https://shop.example.com/ok", "https://shop.example.com/gone", "https://shop.example.com/blocked",
		"https://shop.example.com/home", "https://other.example.com/dns")

	sum, err := e.checker.Check(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}

	if sum.Checked != 5 || sum.OK != 1 || sum.Failed != 3 || sum.Inconclusive != 1 || sum.Died != 0 {
		t.Fatalf("summary: %+v", sum)
	}

	want := []struct {
		status   string
		failures int
	}{{"alive", 0}, {"unknown", 1}, {"unknown", 0}, {"unknown", 1}, {"unknown", 1}}
	for i, w := range want {
		l := e.link(t, links[i].ID)
		if l.Status != w.status || l.ConsecutiveFailures != w.failures || !l.LastCheckedAt.Valid {
			t.Errorf("link %d: %+v", i, l)
		}
	}

	if l := e.link(t, links[0].ID); l.LastStatusCode == nil || *l.LastStatusCode != 200 {
		t.Errorf("status code recorded: %+v", l.LastStatusCode)
	}

	checks, _ := orm.QueryOf[models.LinkCheck](e.svc.DB).Count(t.Context())
	if checks != 5 {
		t.Errorf("every check is recorded, got %d", checks)
	}

	if len(e.notes.msgs) != 0 {
		t.Errorf("no alert before a link dies: %v", e.notes.msgs)
	}
}

func TestLinkDiesAfterThreeFailuresAndAlertsOnce(t *testing.T) {
	t.Parallel()

	e := setup(t, func(string) (*http.Response, error) { return status(404) })
	links := e.add(t, "dies", "https://shop.example.com/gone")

	for i := 1; i <= 4; i++ {
		if _, err := e.checker.Check(t.Context(), []int64{links[0].ID}); err != nil {
			t.Fatal(err)
		}

		l := e.link(t, links[0].ID)
		wantDead := i >= 3

		if (l.Status == models.StatusDead) != wantDead {
			t.Fatalf("after %d checks: %+v", i, l)
		}
	}

	if len(e.notes.msgs) != 1 || !strings.Contains(e.notes.msgs[0], "https://shop.example.com/gone") {
		t.Fatalf("one alert, when it died: %v", e.notes.msgs)
	}
}

func TestDeadLinkRevivesOnOK(t *testing.T) {
	t.Parallel()

	code := 404
	e := setup(t, func(string) (*http.Response, error) { return status(code) })
	links := e.add(t, "revive", "https://shop.example.com/x")

	for range 3 {
		if _, err := e.checker.Check(t.Context(), []int64{links[0].ID}); err != nil {
			t.Fatal(err)
		}
	}

	code = 200

	if _, err := e.checker.Check(t.Context(), []int64{links[0].ID}); err != nil {
		t.Fatal(err)
	}

	if l := e.link(t, links[0].ID); l.Status != models.StatusAlive || l.ConsecutiveFailures != 0 {
		t.Fatalf("revived: %+v", l)
	}
}

func TestBatchChecksTheLeastRecentlyCheckedFirst(t *testing.T) {
	t.Parallel()

	e := setup(t, func(string) (*http.Response, error) { return status(200) })
	links := e.add(t, "batch", "https://shop.example.com/a", "https://shop.example.com/b", "https://shop.example.com/c")
	e.checker.Batch = 2

	if _, err := e.checker.Check(t.Context(), []int64{links[0].ID}); err != nil {
		t.Fatal(err)
	}

	e.net.calls = nil

	sum, err := e.checker.Check(t.Context(), nil)
	if err != nil || sum.Checked != 2 {
		t.Fatalf("batch of 2: %+v %v", sum, err)
	}

	for _, c := range e.net.calls {
		if strings.HasSuffix(c, "/a") {
			t.Fatalf("the recently checked link must wait its turn: %v", e.net.calls)
		}
	}
}

func TestTimeoutIsInconclusive(t *testing.T) {
	t.Parallel()

	e := setup(t, func(string) (*http.Response, error) { return nil, context.DeadlineExceeded })
	links := e.add(t, "slow", "https://shop.example.com/slow")

	sum, err := e.checker.Check(t.Context(), []int64{links[0].ID})
	if err != nil || sum.Inconclusive != 1 {
		t.Fatalf("%+v %v", sum, err)
	}

	if l := e.link(t, links[0].ID); l.ConsecutiveFailures != 0 {
		t.Fatalf("a timeout never counts: %+v", l)
	}
}

func TestIsSiteLive(t *testing.T) {
	t.Parallel()

	e := setup(t, func(u string) (*http.Response, error) {
		switch {
		case strings.Contains(u, "up"):
			return status(200)
		case strings.Contains(u, "forbidden"):
			return status(403)
		case strings.Contains(u, "broken"):
			return status(503)
		}

		return nil, errors.New("no such host")
	})

	for url, want := range map[string]bool{
		"https://up.example.com": true, "https://forbidden.example.com": true,
		"https://broken.example.com": false, "https://nxdomain.example.com": false,
	} {
		if got := e.checker.IsSiteLive(t.Context(), url); got != want {
			t.Errorf("IsSiteLive(%s) = %v, want %v", url, got, want)
		}
	}
}

func TestFindDeadURLs(t *testing.T) {
	t.Parallel()

	e := setup(t, func(u string) (*http.Response, error) {
		switch {
		case strings.HasSuffix(u, "/gone"):
			return status(410)
		case strings.HasSuffix(u, "/blocked"):
			return status(429)
		}

		return status(200)
	})

	dead := e.checker.FindDeadURLs(t.Context(), []string{
		"https://s.example.com/gone", "https://s.example.com/gone", "https://s.example.com/blocked", "https://s.example.com/ok",
	})
	if len(dead) != 1 || !dead["https://s.example.com/gone"] {
		t.Fatalf("only broken links are dead: %v", dead)
	}

	if n := len(e.net.calls); n != 3 {
		t.Fatalf("duplicates are probed once, got %d calls", n)
	}
}

func TestCheckAllCoversEveryLinkAcrossBatches(t *testing.T) {
	t.Parallel()

	e := setup(t, func(string) (*http.Response, error) { return status(200) })
	e.add(t, "all", "https://shop.example.com/1", "https://shop.example.com/2", "https://shop.example.com/3",
		"https://shop.example.com/4", "https://shop.example.com/5")
	e.checker.Batch = 2

	sum, err := e.checker.CheckAll(t.Context())
	if err != nil || sum.Checked != 5 || sum.OK != 5 {
		t.Fatalf("%+v %v", sum, err)
	}

	seen := map[string]bool{}
	for _, c := range e.net.calls {
		seen[c] = true
	}

	if len(seen) != 5 {
		t.Fatalf("every link is probed exactly once: %v", e.net.calls)
	}
}
