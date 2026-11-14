package tests

import (
	"net/url"
	"strings"
	"testing"
)

const (
	chromeWindows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
	safariIPhone  = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
	productID     = siteURL + "/best/airfryer"
)

func linkURL(id string, extra ...string) string {
	q := "/link?id=" + url.QueryEscape(id)
	if len(extra) > 0 {
		q += "&" + strings.Join(extra, "&")
	}

	return q
}

func TestLinkRedirectsToTheHighestPriorityLink(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first", "https://shope.ee/second"}})

	w.app.Client(t).Get(linkURL(productID)).
		AssertStatus(302).
		AssertHeader("Location", "https://amzn.to/first").
		AssertHeader("Cache-Control", "no-store").
		AssertHeader("X-Robots-Tag", "noindex, nofollow").
		AssertHeaderMissing("Set-Cookie")
}

func TestLinkUnknownOrMissingProductIs404(t *testing.T) {
	t.Parallel()

	w := newWorld(t)

	w.app.Client(t).Get(linkURL("https://nope.example.com/x")).AssertNotFound()
	w.app.Client(t).Get("/link").AssertNotFound()
	w.app.Client(t).Get("/link?id=").AssertNotFound()
}

func TestLinkPrefersTheRequestedStore(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first", "https://shope.ee/second", "https://meli.la/third"}})

	c := w.app.Client(t)
	c.Get(linkURL(productID, "store=shopee")).AssertHeader("Location", "https://shope.ee/second")
	c.Get(linkURL(productID, "store=mercadolivre")).AssertHeader("Location", "https://meli.la/third")
	// An unknown store falls back to the priority order.
	c.Get(linkURL(productID, "store=nope")).AssertHeader("Location", "https://amzn.to/first")
}

func TestLinkFallsBackWhenTheLinkIsDead(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first", "https://shope.ee/second"}})

	c := w.app.Client(t)
	c.Get(linkURL(productID)).AssertHeader("Location", "https://amzn.to/first")

	if _, err := w.db.ExecContext(t.Context(), "UPDATE affiliate_links SET status = 'dead' WHERE url = ?", "https://amzn.to/first"); err != nil {
		t.Fatal(err)
	}

	c.Get(linkURL(productID)).AssertHeader("Location", "https://shope.ee/second")
	// A dead store is skipped even when asked for.
	c.Get(linkURL(productID, "store=amazon")).AssertHeader("Location", "https://shope.ee/second")

	if _, err := w.db.ExecContext(t.Context(), "UPDATE affiliate_links SET status = 'dead'"); err != nil {
		t.Fatal(err)
	}

	// Every link is dead: back to the product page.
	c.Get(linkURL(productID)).AssertStatus(302).AssertHeader("Location", productID)
}

func TestLinkNeverCheckedIsUsable(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/new"}})

	if n := count(t, w, "SELECT COUNT(*) FROM affiliate_links WHERE status = 'unknown'"); n != 1 {
		t.Fatalf("a new link starts unknown, got %d", n)
	}

	w.app.Client(t).Get(linkURL(productID)).AssertHeader("Location", "https://amzn.to/new")
}

func TestLinkRecordsTheClick(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first"}})

	w.app.Client(t).
		WithHeader("User-Agent", safariIPhone).
		WithHeader("Referer", siteURL+"/best/airfryer?utm=secret&email=a@b.c").
		WithHeader("X-Vercel-IP-Country", "BR").
		Get(linkURL(productID)).AssertStatus(302)

	type click struct{ device, os, browser, country, referer string }

	var got click

	var isBot bool

	row := w.db.QueryRowContext(t.Context(), "SELECT device, os, browser, country, referer, is_bot FROM click_events WHERE link_id IS NOT NULL")
	if err := row.Scan(&got.device, &got.os, &got.browser, &got.country, &got.referer, &isBot); err != nil {
		t.Fatalf("one click must be recorded: %v", err)
	}

	want := click{"mobile", "iOS", "Safari", "BR", siteURL + "/best/airfryer"}
	if got != want || isBot {
		t.Fatalf("click = %+v bot=%v, want %+v (referer without its query string)", got, isBot, want)
	}
}

func TestLinkRecordsBotsAndLostClicks(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first"}})

	w.app.Client(t).WithHeader("User-Agent", "Googlebot/2.1").Get(linkURL(productID)).AssertStatus(302)

	if n := count(t, w, "SELECT COUNT(*) FROM click_events WHERE is_bot = 1"); n != 1 {
		t.Fatalf("bot click must be recorded as a bot, got %d", n)
	}

	if _, err := w.db.ExecContext(t.Context(), "UPDATE affiliate_links SET status = 'dead'"); err != nil {
		t.Fatal(err)
	}

	w.app.Client(t).WithHeader("User-Agent", chromeWindows).Get(linkURL(productID)).AssertStatus(302)

	if n := count(t, w, "SELECT COUNT(*) FROM click_events WHERE link_id IS NULL AND is_bot = 0"); n != 1 {
		t.Fatalf("a click without a usable link is recorded with a null link, got %d", n)
	}
}

func TestLinkTrackingFailureNeverBlocksTheRedirect(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first"}})

	if _, err := w.db.ExecContext(t.Context(), "DROP TABLE click_events"); err != nil {
		t.Fatal(err)
	}

	w.app.Client(t).WithHeader("User-Agent", chromeWindows).Get(linkURL(productID)).
		AssertStatus(302).AssertHeader("Location", "https://amzn.to/first")
}

func TestLinkAlertsTelegramForHumansOnly(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first"}})

	w.app.Client(t).WithHeader("User-Agent", "Googlebot/2.1").Get(linkURL(productID)).AssertStatus(302)
	w.app.Client(t).WithHeader("User-Agent", chromeWindows).Get(linkURL(productID)).AssertStatus(302)

	eventually(t, "the click alert", func() bool { return contains(w.net.alerts(), "https://amzn.to/first") })

	if n := len(w.net.alerts()); n != 1 {
		t.Fatalf("only the human click is alerted, got %d: %v", n, w.net.alerts())
	}

	if !contains(w.net.alerts(), "site.example.com") {
		t.Fatalf("the alert names the project: %v", w.net.alerts())
	}
}

func TestLinkAlertsWhenNoLinkIsAlive(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.seed(t, map[string][]string{productID: {"https://amzn.to/first"}})

	if _, err := w.db.ExecContext(t.Context(), "UPDATE affiliate_links SET status = 'dead'"); err != nil {
		t.Fatal(err)
	}

	w.app.Client(t).WithHeader("User-Agent", chromeWindows).Get(linkURL(productID)).AssertStatus(302)

	eventually(t, "the dead-link alert", func() bool { return contains(w.net.alerts(), "Clique sem link vivo") })
}

func TestHealthEndpoint(t *testing.T) {
	t.Parallel()

	w := newWorld(t)

	w.app.Client(t).
		WithHeader("Origin", "https://some-site.example.org").
		Get("/health").
		AssertOK().
		AssertJSON(map[string]any{"status": "ok"}).
		AssertHeader("Access-Control-Allow-Origin", "*").
		AssertHeader("Cache-Control", "no-store").
		AssertHeaderMissing("Set-Cookie")
}
