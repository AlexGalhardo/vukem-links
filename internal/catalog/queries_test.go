package catalog_test

import (
	"testing"

	"github.com/AlexGalhardo/vukem/orm"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

func click(t *testing.T, svc *catalog.Service, l models.AffiliateLink, device string, bot bool, country string) {
	t.Helper()

	c := models.ClickEvent{ProductID: l.ProductID, LinkID: &l.ID, Device: device, IsBot: bot, Country: &country}
	if err := orm.Create(t.Context(), svc.DB, &c); err != nil {
		t.Fatal(err)
	}
}

func TestListLinksCountsHumansAndLegacy(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	id := p.BaseURL + "/l"

	if _, err := svc.Upsert(t.Context(), p, []rules.ProductInput{product(id, "https://amzn.to/1", "https://shope.ee/2")}); err != nil {
		t.Fatal(err)
	}

	links := linksOf(t, svc, id)
	click(t, svc, links[0], "desktop", false, "BR")
	click(t, svc, links[0], "mobile", false, "BR")
	click(t, svc, links[0], "desktop", true, "US")

	links[1].LegacyClicks = 10
	if err := orm.UpdateOnly(t.Context(), svc.DB, &links[1], "legacy_clicks"); err != nil {
		t.Fatal(err)
	}

	rows, err := svc.ListLinks(t.Context(), p.ID)
	if err != nil || len(rows) != 2 {
		t.Fatalf("rows: %+v %v", rows, err)
	}

	if rows[0].Clicks != 2 || rows[0].Mobile != 1 || rows[1].Clicks != 10 || rows[0].ProjectSlug != p.Slug {
		t.Fatalf("bots excluded, legacy added: %+v", rows)
	}

	all, _ := svc.ListLinks(t.Context(), 0)
	if len(all) != 2 {
		t.Fatalf("all projects: %d", len(all))
	}
}

func TestStats(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	id := p.BaseURL + "/s"

	if _, err := svc.Upsert(t.Context(), p, []rules.ProductInput{product(id, "https://amzn.to/1")}); err != nil {
		t.Fatal(err)
	}

	l := linksOf(t, svc, id)[0]
	click(t, svc, l, "desktop", false, "BR")
	click(t, svc, l, "mobile", false, "BR")
	click(t, svc, l, "mobile", false, "US")
	click(t, svc, l, "desktop", true, "DE")

	lost := models.ClickEvent{ProductID: l.ProductID, Device: "desktop"}
	if err := orm.Create(t.Context(), svc.DB, &lost); err != nil {
		t.Fatal(err)
	}

	st, err := svc.GetStats(t.Context(), catalog.StatsScope{ProjectID: p.ID})
	if err != nil {
		t.Fatal(err)
	}

	if st.Clicks != 4 || st.BotClicks != 1 || st.LostClicks != 1 {
		t.Fatalf("totals: %+v", st)
	}

	if len(st.ByDay) != 30 || st.ByDay[29].Count != 4 {
		t.Fatalf("by day (today is the last bucket): %+v", st.ByDay[28:])
	}

	if st.ByDevice[0].Key != "mobile" || st.ByDevice[0].Count != 2 || st.ByCountry[0].Key != "BR" || st.ByCountry[0].Count != 2 {
		t.Fatalf("buckets: %+v %+v", st.ByDevice, st.ByCountry)
	}

	one, err := svc.GetStats(t.Context(), catalog.StatsScope{LinkID: l.ID, Days: 7})
	if err != nil || one.Clicks != 3 || len(one.ByDay) != 7 {
		t.Fatalf("link scope: %+v %v", one, err)
	}
}

func TestClicksByProject(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	if _, err := svc.FindOrCreateProject(t.Context(), "https://quiet.example.com"); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.Upsert(t.Context(), p, []rules.ProductInput{product(p.BaseURL+"/c", "https://amzn.to/1")}); err != nil {
		t.Fatal(err)
	}

	l := linksOf(t, svc, p.BaseURL+"/c")[0]
	click(t, svc, l, "desktop", false, "BR")
	click(t, svc, l, "desktop", true, "BR")

	got, err := svc.ClicksByProject(t.Context(), 7)
	if err != nil || len(got) != 2 {
		t.Fatalf("every project is listed: %+v %v", got, err)
	}

	total := 0
	for _, g := range got {
		total += g.Clicks
	}

	if total != 1 {
		t.Fatalf("only human clicks that reached a store count: %+v", got)
	}
}

func TestLinkMutations(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	id := p.BaseURL + "/m"

	if _, err := svc.Upsert(t.Context(), p, []rules.ProductInput{product(id, "https://amzn.to/1", "https://shope.ee/2")}); err != nil {
		t.Fatal(err)
	}

	links := linksOf(t, svc, id)
	links[0].Status, links[0].ConsecutiveFailures = models.StatusDead, 3

	if err := orm.UpdateOnly(t.Context(), svc.DB, &links[0], "status", "consecutive_failures"); err != nil {
		t.Fatal(err)
	}

	if err := svc.UpdateLink(t.Context(), links[0].ID, "https://amzn.to/1", 5); err != nil {
		t.Fatal(err)
	}

	same, _ := svc.GetLinkDetail(t.Context(), links[0].ID)
	if same.Link.Status != models.StatusDead || same.Link.Priority != 5 {
		t.Fatalf("same URL keeps the health: %+v", same.Link)
	}

	if err := svc.UpdateLink(t.Context(), links[0].ID, "https://www.mercadolivre.com.br/new", 5); err != nil {
		t.Fatal(err)
	}

	changed, _ := svc.GetLinkDetail(t.Context(), links[0].ID)
	if changed.Link.Status != models.StatusUnknown || changed.Link.ConsecutiveFailures != 0 || changed.Link.Store != "mercadolivre" {
		t.Fatalf("new URL starts over: %+v", changed.Link)
	}

	if err := svc.UpdateLink(t.Context(), links[0].ID, "http://127.0.0.1/x", 0); err == nil {
		t.Fatal("private URL must be refused")
	}

	if err := svc.UpdateLink(t.Context(), 999999, "https://amzn.to/9", 0); err != catalog.ErrNotFound {
		t.Fatalf("got %v", err)
	}

	if err := svc.PromoteLink(t.Context(), links[1].ID); err != nil {
		t.Fatal(err)
	}

	d, _ := svc.GetLinkDetail(t.Context(), links[1].ID)
	if d.Siblings[0].ID != links[1].ID || d.Product.ExternalID != id || d.Project.ID != p.ID {
		t.Fatalf("promoted link is the first choice: %+v", d.Siblings)
	}

	if err := svc.DeleteLinks(t.Context(), []int64{links[0].ID, links[1].ID}); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.GetLinkDetail(t.Context(), links[0].ID); err != catalog.ErrNotFound {
		t.Fatalf("deleted: %v", err)
	}
}
