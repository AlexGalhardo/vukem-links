package controllers

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/AlexGalhardo/vukem/orm"
	"github.com/AlexGalhardo/vukem/web"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/deps"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
	"github.com/AlexGalhardo/vukem-links/internal/useragent"
)

// Public serves the routes the sites call: the redirect and the health probe.
type Public struct {
	d *deps.Deps
}

// NewPublic returns the public handlers.
func NewPublic(d *deps.Deps) *Public { return &Public{d: d} }

const trackingTimeout = 3 * time.Second

// Link is GET /link?id=<externalId>[&store=<store>], published on the sites:
// the URL shape, the method and the 302 never change, only the destination.
// Tracking and alerts never stop the redirect: their failures are logged.
func (p *Public) Link(c *web.Ctx) error {
	ctx := c.Context()

	product, err := orm.QueryOf[models.Product](p.d.Catalog.DB).Where("external_id", c.Query("id")).First(ctx)
	if err != nil {
		if c.Query("id") == "" || errors.Is(err, orm.ErrNotFound) {
			return c.String(http.StatusNotFound, "Link não encontrado")
		}

		return err
	}

	links, err := orm.QueryOf[models.AffiliateLink](p.d.Catalog.DB).Where("product_id", product.ID).Get(ctx)
	if err != nil {
		return err
	}

	candidates := make([]rules.Candidate, len(links))
	for i, l := range links {
		candidates[i] = rules.Candidate{ID: l.ID, Store: l.Store, URL: l.URL, Status: l.Status, Priority: l.Priority}
	}

	// A page with one button per store asks for that store; an unknown one falls back to the priority order.
	picked, found := rules.PickLink(candidates, c.Query("store"))

	target := product.PageURL
	if found {
		target = picked.URL
	}

	ua := useragent.Parse(c.Header("User-Agent"))
	event := models.ClickEvent{
		ProductID: product.ID,
		Device:    ua.Device,
		OS:        nonEmpty(ua.OS),
		Browser:   nonEmpty(ua.Browser),
		Country:   nonEmpty(countryOf(c)),
		Referer:   nonEmpty(sanitizeReferer(c.Header("Referer"))),
		IsBot:     ua.IsBot,
	}

	if found {
		event.LinkID = &picked.ID
	}

	p.track(c, product, event, target, found)

	c.SetHeader("Cache-Control", "no-store")
	c.SetHeader("X-Robots-Tag", "noindex, nofollow")

	return c.RedirectStatus(http.StatusFound, target)
}

func (p *Public) track(c *web.Ctx, product models.Product, event models.ClickEvent, target string, found bool) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(c.Context()), trackingTimeout)
	defer cancel()

	if err := orm.Create(ctx, p.d.Catalog.DB, &event); err != nil {
		p.d.Log.ErrorContext(ctx, "recording click failed", "product", product.ExternalID, "err", err)
	}

	if event.IsBot {
		return
	}

	go func() {
		bg, stop := context.WithTimeout(context.WithoutCancel(c.Context()), 10*time.Second)
		defer stop()

		if !found {
			p.d.Telegram.Notify(bg, "⚠️ Clique sem link vivo: "+product.Name+"\n"+product.PageURL)

			return
		}

		project, err := orm.QueryOf[models.Project](p.d.Catalog.DB).Find(bg, product.ProjectID)
		if err != nil {
			p.d.Log.ErrorContext(bg, "loading project for the click alert failed", "err", err)

			return
		}

		p.d.Telegram.Notify(bg, rules.ClickMessage(rules.ClickNotice{
			Project: project.Name, Product: product.Name, At: time.Now(), PageURL: product.PageURL, TargetURL: target,
		}))
	}()
}

// Health is GET /health: public and readable from any origin (the route is
// declared cross-origin in routes.Web). The sites ask it before trusting the
// redirect and link straight to the store when it does not answer.
func (p *Public) Health(c *web.Ctx) error {
	c.SetHeader("Cache-Control", "no-store")

	if err := p.d.Catalog.DB.Ping(c.Context()); err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "down"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}

	return &s
}

// countryOf reads the country the edge (Vercel or Cloudflare) put in a header.
func countryOf(c *web.Ctx) string {
	for _, h := range []string{"X-Vercel-IP-Country", "CF-IPCountry"} {
		if v := c.Header(h); v != "" && v != "XX" {
			return v
		}
	}

	return ""
}

// sanitizeReferer keeps origin and path only: query strings can carry personal data.
func sanitizeReferer(raw string) string {
	u, err := url.Parse(raw)
	if raw == "" || err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}

	return u.Scheme + "://" + u.Host + u.Path
}
