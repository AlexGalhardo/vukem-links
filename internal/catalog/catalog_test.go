package catalog_test

import (
	"context"
	"errors"
	"testing"

	"github.com/AlexGalhardo/vukem/orm"
	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/bootstrap"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

func setup(t *testing.T) (*catalog.Service, models.Project) {
	t.Helper()

	app := vukemtest.New(t, bootstrap.New)

	db, err := app.DB()
	if err != nil {
		t.Fatal(err)
	}

	svc := catalog.New(db)

	p, err := svc.FindOrCreateProject(t.Context(), "https://www.Shop.example.com")
	if err != nil {
		t.Fatal(err)
	}

	return svc, p
}

func product(id string, urls ...string) rules.ProductInput {
	in := rules.ProductInput{ExternalID: id}
	for _, u := range urls {
		in.Links = append(in.Links, rules.LinkInput{URL: u})
	}

	return in
}

func linksOf(t *testing.T, svc *catalog.Service, externalID string) []models.AffiliateLink {
	t.Helper()

	p, err := orm.QueryOf[models.Product](svc.DB).Where("external_id", externalID).First(t.Context())
	if err != nil {
		t.Fatalf("product %s: %v", externalID, err)
	}

	links, err := orm.QueryOf[models.AffiliateLink](svc.DB).Where("product_id", p.ID).OrderBy("priority", orm.Asc).Get(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	return links
}

func TestFindOrCreateProject(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	if p.Name != "shop.example.com" || p.Slug != "shop-example-com" {
		t.Fatalf("name/slug from host: %+v", p)
	}

	again, err := svc.FindOrCreateProject(t.Context(), p.BaseURL)
	if err != nil || again.ID != p.ID {
		t.Fatalf("same site returns the same project: %+v %v", again, err)
	}

	other, err := svc.FindOrCreateProject(t.Context(), "http://shop.example.com")
	if err != nil || other.Slug != "shop-example-com-2" {
		t.Fatalf("slug collision gets a suffix: %+v %v", other, err)
	}
}

func TestUpsertAppendsAndNeverReplaces(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	ctx := context.Background()
	id := p.BaseURL + "/best/item"

	sum, err := svc.Upsert(ctx, p, []rules.ProductInput{product(id, "https://amzn.to/1")})
	if err != nil || sum.ProductsCreated != 1 || sum.LinksAdded != 1 || sum.Errors == nil {
		t.Fatalf("first upsert: %+v %v", sum, err)
	}

	sum, err = svc.Upsert(ctx, p, []rules.ProductInput{product(id, "https://amzn.to/1", "https://shope.ee/2")})
	if err != nil || sum.ProductsCreated != 0 || sum.LinksAdded != 1 {
		t.Fatalf("second upsert only appends: %+v %v", sum, err)
	}

	links := linksOf(t, svc, id)
	if len(links) != 2 || links[1].Store != "shopee" || links[1].Priority != 1 || links[0].Status != models.StatusUnknown {
		t.Fatalf("links: %+v", links)
	}

	prod, _ := orm.QueryOf[models.Product](svc.DB).Where("external_id", id).First(ctx)
	if prod.PageURL != id || prod.Name != "item" {
		t.Fatalf("defaults: pageUrl from externalId, name from last segment: %+v", prod)
	}
}

func TestUpsertRefusesForeignProjectAndForeignPage(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	ctx := context.Background()

	other, _ := svc.FindOrCreateProject(ctx, "https://other.example.com")
	if _, err := svc.Upsert(ctx, other, []rules.ProductInput{product("https://other.example.com/x", "https://amzn.to/1")}); err != nil {
		t.Fatal(err)
	}

	stolen := product("https://other.example.com/x", "https://amzn.to/evil")
	offsite := product("a", "https://amzn.to/2")
	offsite.PageURL = "https://evil.example.org/page"

	sum, err := svc.Upsert(ctx, p, []rules.ProductInput{stolen, offsite})
	if err != nil {
		t.Fatal(err)
	}

	if sum.ProductsCreated != 0 || sum.LinksAdded != 0 || len(sum.Errors) != 2 {
		t.Fatalf("both must be refused: %+v", sum)
	}

	if links := linksOf(t, svc, "https://other.example.com/x"); len(links) != 1 {
		t.Fatalf("the other project is untouched: %+v", links)
	}
}

func TestSyncReconcilesTheCatalogue(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	ctx := context.Background()
	a, b := p.BaseURL+"/a", p.BaseURL+"/b"

	if _, err := svc.Sync(ctx, p, []rules.ProductInput{product(a, "https://amzn.to/1", "https://shope.ee/2"), product(b, "https://amzn.to/3")}); err != nil {
		t.Fatal(err)
	}

	// Give link a/1 a click and a failed check: they must survive a sync that keeps the link.
	keep := linksOf(t, svc, a)[0]
	if err := orm.Create(ctx, svc.DB, &models.ClickEvent{ProductID: keep.ProductID, LinkID: &keep.ID, Device: "desktop"}); err != nil {
		t.Fatal(err)
	}

	renamed := product(a, "https://shope.ee/2", "https://amzn.to/1", "https://s.example.com/new")
	renamed.Name = "Renamed"
	renamed.Category = "cat"

	sum, err := svc.Sync(ctx, p, []rules.ProductInput{renamed})
	if err != nil {
		t.Fatal(err)
	}

	if sum.ProductsCreated != 0 || sum.ProductsUpdated != 1 || sum.ProductsRemoved != 1 || sum.LinksAdded != 1 || sum.LinksRemoved != 0 {
		t.Fatalf("summary: %+v", sum)
	}

	links := linksOf(t, svc, a)
	if len(links) != 3 || links[0].URL != "https://shope.ee/2" || links[1].URL != "https://amzn.to/1" || links[2].Priority != 2 {
		t.Fatalf("order follows the body: %+v", links)
	}

	if n, _ := orm.QueryOf[models.ClickEvent](svc.DB).Where("link_id", keep.ID).Count(ctx); n != 1 {
		t.Fatalf("a kept link keeps its clicks, got %d", n)
	}

	if ok, _ := orm.QueryOf[models.Product](svc.DB).Where("external_id", b).Exists(ctx); ok {
		t.Fatal("product missing from the body is removed")
	}

	sum, err = svc.Sync(ctx, p, []rules.ProductInput{product(a, "https://amzn.to/1")})
	if err != nil || sum.LinksRemoved != 2 {
		t.Fatalf("links that left are removed: %+v %v", sum, err)
	}

	again, _ := svc.Sync(ctx, p, []rules.ProductInput{product(a, "https://amzn.to/1")})
	if again.ProductsCreated+again.ProductsUpdated+again.ProductsRemoved+again.LinksAdded+again.LinksRemoved != 0 {
		t.Fatalf("sync is idempotent: %+v", again)
	}
}

func TestRemovingAProductDropsItsClicks(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	ctx := context.Background()
	id := p.BaseURL + "/gone"

	if _, err := svc.Sync(ctx, p, []rules.ProductInput{product(id, "https://amzn.to/1"), product(p.BaseURL+"/stay", "https://amzn.to/2")}); err != nil {
		t.Fatal(err)
	}

	l := linksOf(t, svc, id)[0]
	if err := orm.Create(ctx, svc.DB, &models.ClickEvent{ProductID: l.ProductID, LinkID: &l.ID, Device: "mobile"}); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.Sync(ctx, p, []rules.ProductInput{product(p.BaseURL+"/stay", "https://amzn.to/2")}); err != nil {
		t.Fatal(err)
	}

	if n, _ := orm.QueryOf[models.ClickEvent](svc.DB).Count(ctx); n != 0 {
		t.Fatalf("foreign keys must cascade, %d clicks left", n)
	}
}

func TestDeleteProjectCascades(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	ctx := context.Background()

	if _, err := svc.Upsert(ctx, p, []rules.ProductInput{product(p.BaseURL+"/x", "https://amzn.to/1")}); err != nil {
		t.Fatal(err)
	}

	if err := svc.DeleteProject(ctx, p.ID); err != nil {
		t.Fatal(err)
	}

	for _, n := range []func() (int64, error){
		func() (int64, error) { return orm.QueryOf[models.Product](svc.DB).Count(ctx) },
		func() (int64, error) { return orm.QueryOf[models.AffiliateLink](svc.DB).Count(ctx) },
	} {
		if c, err := n(); err != nil || c != 0 {
			t.Fatalf("rows left after deleting the project: %d %v", c, err)
		}
	}
}

func TestCreateProjectSlugTaken(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	if _, err := svc.CreateProject(t.Context(), "X", p.Slug, "https://x.example.com"); !errors.Is(err, catalog.ErrSlugTaken) {
		t.Fatalf("got %v", err)
	}
}

func TestRegisteredURLs(t *testing.T) {
	t.Parallel()

	svc, p := setup(t)
	id := p.BaseURL + "/r"

	if _, err := svc.Upsert(t.Context(), p, []rules.ProductInput{product(id, "https://amzn.to/1")}); err != nil {
		t.Fatal(err)
	}

	got, err := svc.RegisteredURLs(t.Context(), p.ID)
	if err != nil || !got[id]["https://amzn.to/1"] {
		t.Fatalf("got %v %v", got, err)
	}
}
