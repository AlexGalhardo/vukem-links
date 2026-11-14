package tests

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/AlexGalhardo/vukem/database"
	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-links/app/accounts"
	"github.com/AlexGalhardo/vukem-links/bootstrap"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/deps"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
	"github.com/AlexGalhardo/vukem-links/internal/telegram"
)

const (
	apiKey        = "test-api-key-0123456789abcdef0123"
	adminEmail    = "admin@example.com"
	adminPassword = "correct-horse-battery"
	siteURL       = "https://site.example.com"
)

// fakeNet answers the health probes and the Telegram API from tables: the
// tests never touch the network.
type fakeNet struct {
	mu    sync.Mutex
	calls []string
	// siteStatus is what every site root answers (200 by default).
	status func(url string) int
	// telegram holds the request bodies sent to the Telegram API.
	telegram []string
}

func (f *fakeNet) RoundTrip(r *http.Request) (*http.Response, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.calls = append(f.calls, r.URL.String())

	if r.URL.Host == "api.telegram.org" {
		b, _ := io.ReadAll(r.Body)
		f.telegram = append(f.telegram, string(b))

		return &http.Response{StatusCode: 200, Body: http.NoBody, Header: http.Header{}}, nil
	}

	code := 200
	if f.status != nil {
		code = f.status(r.URL.String())
	}

	return &http.Response{StatusCode: code, Body: http.NoBody, Header: http.Header{}}, nil
}

func (f *fakeNet) alerts() []string {
	f.mu.Lock()
	defer f.mu.Unlock()

	return append([]string(nil), f.telegram...)
}

type world struct {
	app *vukemtest.App
	net *fakeNet
	db  *database.DB
	svc *catalog.Service
}

func newWorld(t *testing.T) *world {
	t.Helper()

	f := &fakeNet{}
	bot := &telegram.Client{Token: "123:test", ChatID: "-1", HTTP: &http.Client{Transport: f}}

	app := vukemtest.New(t, bootstrap.NewWith(deps.Overrides{HTTP: &http.Client{Transport: f}, Telegram: bot}),
		vukemtest.Options{Env: map[string]string{"LINKS_API_KEY": apiKey}})

	db, err := app.DB()
	if err != nil {
		t.Fatal(err)
	}

	return &world{app: app, net: f, db: db, svc: catalog.New(db)}
}

// seed registers a site with products: each product is externalId -> store URLs.
func (w *world) seed(t *testing.T, products map[string][]string) {
	t.Helper()

	project, err := w.svc.FindOrCreateProject(t.Context(), siteURL)
	if err != nil {
		t.Fatal(err)
	}

	var inputs []rules.ProductInput

	for id, urls := range products {
		in := rules.ProductInput{ExternalID: id}
		for _, u := range urls {
			in.Links = append(in.Links, rules.LinkInput{URL: u})
		}

		inputs = append(inputs, in)
	}

	if _, err := w.svc.Upsert(t.Context(), project, inputs); err != nil {
		t.Fatal(err)
	}
}

func (w *world) admin(t *testing.T) {
	t.Helper()

	acc, err := accounts.New(w.app.App)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := acc.CreateAdmin(t.Context(), adminEmail, adminPassword); err != nil {
		t.Fatal(err)
	}
}

// eventually polls cond: the Telegram alert is sent in the background.
func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}

		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for %s", what)
}

func count(t *testing.T, w *world, query string, args ...any) int {
	t.Helper()

	var n int
	if err := w.db.QueryRowContext(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}

	return n
}

func contains(haystacks []string, needle string) bool {
	for _, h := range haystacks {
		if strings.Contains(h, needle) {
			return true
		}
	}

	return false
}
