package tests

import (
	"testing"
)

func TestGuestSeesTheLoginPageAndIsSentThereFromTheDashboard(t *testing.T) {
	t.Parallel()

	w := newWorld(t)

	w.app.Client(t).Get("/login").AssertOK().AssertInertia("Auth/Login")

	for _, path := range []string{"/", "/links", "/links/1", "/projects", "/projects/x"} {
		w.app.Client(t).Get(path).AssertRedirect("/login")
	}
}

func TestLoginWithTheAdminAccount(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.admin(t)

	c := w.app.Client(t).Inertia("")
	c.PostJSON("/login", map[string]any{"email": adminEmail, "password": adminPassword}).AssertRedirect("/")
	c.Get("/").AssertOK().AssertInertia("Overview").PropEquals("auth.user.email", adminEmail)

	// A signed-in admin no longer sees the login page.
	c.Get("/login").AssertRedirect("/")
}

func TestLoginIsCaseInsensitiveOnTheEmail(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.admin(t)

	c := w.app.Client(t).Inertia("")
	c.PostJSON("/login", map[string]any{"email": "ADMIN@Example.com", "password": adminPassword}).AssertRedirect("/")
}

func TestLoginRefusesWrongCredentials(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.admin(t)

	for _, in := range []map[string]any{
		{"email": adminEmail, "password": "wrong-password"},
		{"email": "nobody@example.com", "password": adminPassword},
		{"email": adminEmail, "password": ""},
		{"email": "not-an-email", "password": adminPassword},
	} {
		c := w.app.Client(t).Inertia("")
		c.PostJSON("/login", in).AssertSessionHasErrors()
		c.Get("/").AssertRedirect("/login")
	}
}

func TestLoginIsThrottled(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.admin(t)

	c := w.app.Client(t).Inertia("")
	last := 0

	for range 8 {
		last = c.PostJSON("/login", map[string]any{"email": adminEmail, "password": "wrong-password"}).Status()
	}

	if last != 429 {
		t.Fatalf("repeated failures must be throttled, last status %d", last)
	}

	// Even the right password is refused while throttled.
	c.PostJSON("/login", map[string]any{"email": adminEmail, "password": adminPassword}).AssertStatus(429)
}

func TestLogoutEndsTheSession(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.admin(t)

	c := w.app.Client(t).Inertia("")
	c.PostJSON("/login", map[string]any{"email": adminEmail, "password": adminPassword}).AssertRedirect("/")
	c.Get("/links").AssertOK()
	c.PostJSON("/logout", map[string]any{}).AssertRedirect("/login")
	c.Get("/links").AssertRedirect("/login")
}

func TestThereIsNoSignUp(t *testing.T) {
	t.Parallel()

	w := newWorld(t)

	for _, path := range []string{"/register", "/forgot-password"} {
		w.app.Client(t).Get(path).AssertNotFound()
	}

	w.app.Client(t).Inertia("").PostJSON("/register", map[string]any{"email": "x@example.com", "password": "long-enough-password"}).AssertStatus(404)

	if n := count(t, w, "SELECT COUNT(*) FROM users"); n != 0 {
		t.Fatalf("no account may be created, got %d", n)
	}
}

func TestEveryDashboardActionRequiresTheSession(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/1"}})

	anon := w.app.Client(t).Inertia("")
	body := map[string]any{
		"ids": []int{1}, "all": true, "url": "https://amzn.to/9", "priority": 3, "name": "x", "slug": "x",
		"baseUrl": siteURL, "text": "[]", "externalId": "x", "urls": "https://amzn.to/1",
	}

	for _, r := range []struct{ method, path string }{
		{"POST", "/links/check"},
		{"POST", "/links/delete"},
		{"PUT", "/links/1"},
		{"DELETE", "/links/1"},
		{"POST", "/links/1/promote"},
		{"POST", "/projects"},
		{"DELETE", "/projects/1"},
		{"POST", "/projects/1/products"},
		{"POST", "/projects/1/import"},
	} {
		var status int

		switch r.method {
		case "POST":
			status = anon.PostJSON(r.path, body).Status()
		case "PUT":
			status = anon.PutJSON(r.path, body).Status()
		default:
			status = anon.Delete(r.path).Status()
		}

		if status != 302 && status != 303 && status != 401 && status != 409 {
			t.Errorf("%s %s answered %d to a guest", r.method, r.path, status)
		}
	}

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links"); n != 1 {
		t.Fatalf("a guest changed the data: %d links", n)
	}

	if n := count(t, w, "SELECT COUNT(*) FROM projects"); n != 1 {
		t.Fatalf("a guest created or removed a project: %d", n)
	}
}

func TestCreateAdminIsIdempotentAndNeverResetsThePassword(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.admin(t)
	w.admin(t) // second run: same e-mail

	if n := count(t, w, "SELECT COUNT(*) FROM users"); n != 1 {
		t.Fatalf("one admin, got %d", n)
	}

	c := w.app.Client(t).Inertia("")
	c.PostJSON("/login", map[string]any{"email": adminEmail, "password": adminPassword}).AssertRedirect("/")
}
