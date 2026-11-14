package bootstrap

import (
	"context"
	"errors"
	"flag"
	"fmt"

	vukem "github.com/AlexGalhardo/vukem"

	"github.com/AlexGalhardo/vukem-links/app/accounts"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/legacy"
)

// Commands lists the application commands; vukem make:command appends here.
func Commands() []vukem.Command {
	return []vukem.Command{adminCreate{}, &importSeed{}, &importLegacy{}}
}

// adminCreate creates the administrator from ADMIN_EMAIL and ADMIN_PASSWORD.
type adminCreate struct{}

func (adminCreate) Name() string { return "admin:create" }
func (adminCreate) Description() string {
	return "Create the administrator from ADMIN_EMAIL and ADMIN_PASSWORD (never changes an existing password)"
}
func (adminCreate) Flags(*flag.FlagSet) {}

func (adminCreate) Run(ctx context.Context, app *vukem.App, _ []string) error {
	acc, err := accounts.New(app)
	if err != nil {
		return err
	}

	email, password := app.Source.Get("ADMIN_EMAIL"), app.Source.Get("ADMIN_PASSWORD")
	if email == "" || password == "" {
		return errors.New("set ADMIN_EMAIL and ADMIN_PASSWORD")
	}

	created, err := acc.CreateAdmin(ctx, email, password)
	if err != nil {
		return err
	}

	if created {
		_, _ = fmt.Fprintf(app.Stdout(), "Admin %s created.\n", email)
	} else {
		_, _ = fmt.Fprintf(app.Stdout(), "Admin %s already exists.\n", email)
	}

	return nil
}

// importSeed loads a seed.json into a project.
type importSeed struct {
	file, name, slug, url string
}

func (*importSeed) Name() string { return "import:seed" }
func (*importSeed) Description() string {
	return "Import a seed.json (API or v4 format) into a project; safe to run again"
}

func (c *importSeed) Flags(fs *flag.FlagSet) {
	fs.StringVar(&c.file, "file", "seed.json", "the seed file")
	fs.StringVar(&c.name, "name", legacy.DefaultSeedProject.Name, "project name")
	fs.StringVar(&c.slug, "slug", legacy.DefaultSeedProject.Slug, "project slug")
	fs.StringVar(&c.url, "url", legacy.DefaultSeedProject.BaseURL, "project base URL")
}

func (c *importSeed) Run(ctx context.Context, app *vukem.App, _ []string) error {
	db, err := app.DB()
	if err != nil {
		return err
	}

	sum, err := legacy.ImportSeed(ctx, catalog.New(db), legacy.SeedProject{Name: c.name, Slug: c.slug, BaseURL: c.url}, c.file)
	if err != nil {
		return err
	}

	_, _ = fmt.Fprintf(app.Stdout(), "Seed: %d products, %d links, %d errors.\n", sum.ProductsCreated, sum.LinksAdded, len(sum.Errors))

	for _, e := range sum.Errors[:min(10, len(sum.Errors))] {
		_, _ = fmt.Fprintln(app.Stdout(), "  - "+e)
	}

	return nil
}

// importLegacy copies the data of the previous (Next.js/Drizzle) version.
type importLegacy struct {
	from string
}

func (*importLegacy) Name() string { return "import:legacy" }
func (*importLegacy) Description() string {
	return "Import projects, products, links, clicks and checks from a copy of the previous database file"
}

func (c *importLegacy) Flags(fs *flag.FlagSet) {
	fs.StringVar(&c.from, "from", "", "SQLite file with the previous database (turso db export)")
}

func (c *importLegacy) Run(ctx context.Context, app *vukem.App, _ []string) error {
	if c.from == "" {
		return errors.New("pass -from <file>")
	}

	db, err := app.DB()
	if err != nil {
		return err
	}

	old, err := legacy.OpenOld(ctx, c.from)
	if err != nil {
		return err
	}

	defer func() { _ = old.Close() }()

	sum, err := legacy.ImportDatabase(ctx, db, old)
	if err != nil {
		return err
	}

	_, _ = fmt.Fprintf(app.Stdout(), "Imported: %d projects, %d products, %d links, %d clicks, %d checks.\n",
		sum.Projects, sum.Products, sum.Links, sum.Clicks, sum.Checks)

	if sum.SkippedHistory {
		_, _ = fmt.Fprintln(app.Stdout(), "Clicks and checks skipped: this database already has some (they would be duplicated).")
	}

	return nil
}
