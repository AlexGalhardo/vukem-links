// Package legacy imports the data of the previous (Next.js, Drizzle) version
// of the dashboard into the current schema: from its seed.json, or from a
// copy of its SQLite/Turso database as a file.
package legacy

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/AlexGalhardo/vukem/database"
	"github.com/AlexGalhardo/vukem/orm"

	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

// SeedProject is the project the v4/v5 seed.json belongs to.
type SeedProject struct {
	Name, Slug, BaseURL string
}

// DefaultSeedProject is the EletroRadar project of the original seed.
var DefaultSeedProject = SeedProject{Name: "EletroRadar", Slug: "eletroradar", BaseURL: "https://example.com"} //nolint:gochecknoglobals // constant data

// SeedSummary counts what ImportSeed wrote.
type SeedSummary struct {
	ProductsCreated int
	LinksAdded      int
	Errors          []string
}

// ImportSeed loads a seed.json (the API format or the v4 { id, category,
// mercadolivreUrl, amazonUrl, shopeeUrl } rows) into the project, creating it
// when missing. Running it again adds nothing.
func ImportSeed(ctx context.Context, svc *catalog.Service, p SeedProject, path string) (SeedSummary, error) {
	raw, err := os.ReadFile(path) //nolint:gosec // the path is an operator-supplied CLI flag
	if err != nil {
		return SeedSummary{}, fmt.Errorf("reading %s: %w", path, err)
	}

	rows, err := rules.ParseImport(string(raw))
	if err != nil {
		return SeedSummary{}, fmt.Errorf("parsing %s: %w", path, err)
	}

	project, err := svc.EnsureProject(ctx, p.Name, p.Slug, p.BaseURL)
	if err != nil {
		return SeedSummary{}, err
	}

	sum, err := svc.Upsert(ctx, project, rows)
	if err != nil {
		return SeedSummary{}, err
	}

	return SeedSummary{ProductsCreated: sum.ProductsCreated, LinksAdded: sum.LinksAdded, Errors: sum.Errors}, nil
}

// Summary counts what ImportDatabase wrote.
type Summary struct {
	Projects, Products, Links int
	// Clicks and Checks are only imported into a database that has none yet:
	// they have no natural key, so a second run would duplicate them.
	Clicks, Checks int
	SkippedHistory bool
}

type oldProject struct {
	ID      string `db:"id"`
	Name    string `db:"name"`
	Slug    string `db:"slug"`
	BaseURL string `db:"base_url"`
	Created int64  `db:"created_at"`
}

type oldProduct struct {
	ID         string  `db:"id"`
	ProjectID  string  `db:"project_id"`
	ExternalID string  `db:"external_id"`
	Name       string  `db:"name"`
	PageURL    string  `db:"page_url"`
	Category   *string `db:"category"`
	Created    int64   `db:"created_at"`
}

type oldLink struct {
	ID                  string  `db:"id"`
	ProductID           string  `db:"product_id"`
	Store               string  `db:"store"`
	URL                 string  `db:"url"`
	Priority            int     `db:"priority"`
	Status              string  `db:"status"`
	ConsecutiveFailures int     `db:"consecutive_failures"`
	LastCheckedAt       *int64  `db:"last_checked_at"`
	LastStatusCode      *int    `db:"last_status_code"`
	FinalURL            *string `db:"final_url"`
	LegacyClicks        int     `db:"legacy_clicks"`
	Created             int64   `db:"created_at"`
}

type oldClick struct {
	ProductID string  `db:"product_id"`
	LinkID    *string `db:"link_id"`
	Device    string  `db:"device"`
	OS        *string `db:"os"`
	Browser   *string `db:"browser"`
	Country   *string `db:"country"`
	Referer   *string `db:"referer"`
	IsBot     int     `db:"is_bot"`
	Created   int64   `db:"created_at"`
}

type oldCheck struct {
	LinkID     string  `db:"link_id"`
	StatusCode *int    `db:"status_code"`
	FinalURL   *string `db:"final_url"`
	Result     string  `db:"result"`
	CheckedAt  int64   `db:"checked_at"`
}

func iso(ms int64) string { return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano) }

func isoPtr(ms *int64) any {
	if ms == nil {
		return nil
	}

	return iso(*ms)
}

// OpenOld opens the previous database file read-only.
func OpenOld(ctx context.Context, path string) (*database.DB, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("legacy database: %w", err)
	}

	db, err := database.Open(ctx, "file:"+path+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("opening the legacy database: %w", err)
	}

	return db, nil
}

// ImportDatabase copies projects, products, links, click events and checks
// from a copy of the previous database into db. Projects are matched by slug,
// products by externalId and links by (product, URL), so rerunning it only
// adds what is missing. Everything is written in one transaction.
func ImportDatabase(ctx context.Context, db, old *database.DB) (Summary, error) {
	var sum Summary

	err := db.Tx(ctx, func(tx *database.Tx) error {
		var err error

		sum, err = importAll(ctx, tx, old)

		return err
	})

	return sum, err
}

func importAll(ctx context.Context, tx *database.Tx, old *database.DB) (Summary, error) {
	var sum Summary

	projects, err := orm.Raw[oldProject](ctx, old, "SELECT id, name, slug, base_url, created_at FROM projects")
	if err != nil {
		return sum, fmt.Errorf("reading projects: %w", err)
	}

	projectIDs := map[string]int64{}

	for _, p := range projects {
		id, created, err := findOrInsert(ctx, tx, "SELECT id FROM projects WHERE slug = ?", []any{p.Slug},
			"INSERT INTO projects (name, slug, base_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			[]any{p.Name, p.Slug, p.BaseURL, iso(p.Created), iso(p.Created)})
		if err != nil {
			return sum, fmt.Errorf("project %s: %w", p.Slug, err)
		}

		projectIDs[p.ID] = id

		if created {
			sum.Projects++
		}
	}

	products, err := orm.Raw[oldProduct](ctx, old,
		"SELECT id, project_id, external_id, name, page_url, category, created_at FROM products")
	if err != nil {
		return sum, fmt.Errorf("reading products: %w", err)
	}

	productIDs := map[string]int64{}

	for _, p := range products {
		projectID, ok := projectIDs[p.ProjectID]
		if !ok {
			continue
		}

		id, created, err := findOrInsert(ctx, tx, "SELECT id FROM products WHERE external_id = ?", []any{p.ExternalID},
			"INSERT INTO products (project_id, external_id, name, page_url, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[]any{projectID, p.ExternalID, p.Name, p.PageURL, p.Category, iso(p.Created), iso(p.Created)})
		if err != nil {
			return sum, fmt.Errorf("product %s: %w", p.ExternalID, err)
		}

		productIDs[p.ID] = id

		if created {
			sum.Products++
		}
	}

	links, err := orm.Raw[oldLink](ctx, old, `SELECT id, product_id, store, url, priority, status, consecutive_failures,
		last_checked_at, last_status_code, final_url, legacy_clicks, created_at FROM affiliate_links`)
	if err != nil {
		return sum, fmt.Errorf("reading links: %w", err)
	}

	linkIDs := map[string]int64{}

	for _, l := range links {
		productID, ok := productIDs[l.ProductID]
		if !ok {
			continue
		}

		id, created, err := findOrInsert(ctx, tx, "SELECT id FROM affiliate_links WHERE product_id = ? AND url = ?", []any{productID, l.URL},
			`INSERT INTO affiliate_links (product_id, store, url, priority, status, consecutive_failures, last_checked_at,
				last_status_code, final_url, legacy_clicks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[]any{
				productID, l.Store, l.URL, l.Priority, l.Status, l.ConsecutiveFailures, isoPtr(l.LastCheckedAt),
				l.LastStatusCode, l.FinalURL, l.LegacyClicks, iso(l.Created), iso(l.Created),
			})
		if err != nil {
			return sum, fmt.Errorf("link %s: %w", l.URL, err)
		}

		linkIDs[l.ID] = id

		if created {
			sum.Links++
		}
	}

	return importHistory(ctx, tx, old, sum, productIDs, linkIDs)
}

func importHistory(ctx context.Context, tx *database.Tx, old *database.DB, sum Summary, productIDs, linkIDs map[string]int64) (Summary, error) {
	var existing int
	if err := tx.QueryRowContext(ctx, "SELECT (SELECT COUNT(*) FROM click_events) + (SELECT COUNT(*) FROM link_checks)").Scan(&existing); err != nil {
		return sum, err
	}

	if existing > 0 {
		sum.SkippedHistory = true

		return sum, nil
	}

	clicks, err := orm.Raw[oldClick](ctx, old, `SELECT product_id, link_id, device, os, browser, country, referer, is_bot, created_at
		FROM click_events ORDER BY id`)
	if err != nil {
		return sum, fmt.Errorf("reading click events: %w", err)
	}

	for _, c := range clicks {
		productID, ok := productIDs[c.ProductID]
		if !ok {
			continue
		}

		var linkID any

		if c.LinkID != nil {
			id, ok := linkIDs[*c.LinkID]
			if !ok {
				continue
			}

			linkID = id
		}

		if _, err := tx.ExecContext(ctx, `INSERT INTO click_events (product_id, link_id, device, os, browser, country, referer, is_bot,
			created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			productID, linkID, c.Device, c.OS, c.Browser, c.Country, c.Referer, c.IsBot != 0, iso(c.Created), iso(c.Created)); err != nil {
			return sum, fmt.Errorf("inserting click event: %w", err)
		}

		sum.Clicks++
	}

	checks, err := orm.Raw[oldCheck](ctx, old, "SELECT link_id, status_code, final_url, result, checked_at FROM link_checks ORDER BY id")
	if err != nil {
		return sum, fmt.Errorf("reading link checks: %w", err)
	}

	for _, c := range checks {
		linkID, ok := linkIDs[c.LinkID]
		if !ok {
			continue
		}

		if _, err := tx.ExecContext(ctx, `INSERT INTO link_checks (link_id, status_code, final_url, result, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)`, linkID, c.StatusCode, c.FinalURL, c.Result, iso(c.CheckedAt), iso(c.CheckedAt)); err != nil {
			return sum, fmt.Errorf("inserting link check: %w", err)
		}

		sum.Checks++
	}

	return sum, nil
}

// findOrInsert returns the id of the row the select finds, inserting it first
// when there is none; created tells which happened.
func findOrInsert(ctx context.Context, tx *database.Tx, selectSQL string, selectArgs []any, insertSQL string, insertArgs []any) (int64, bool, error) {
	var id int64

	err := tx.QueryRowContext(ctx, selectSQL, selectArgs...).Scan(&id)
	if err == nil {
		return id, false, nil
	}

	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}

	res, err := tx.ExecContext(ctx, insertSQL, insertArgs...)
	if err != nil {
		return 0, false, err
	}

	id, err = res.LastInsertId()

	return id, true, err
}
