// Package catalog reads and writes projects, products and affiliate links.
// It is the only place with the business queries; handlers and jobs call it.
package catalog

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/AlexGalhardo/vukem/database"
	"github.com/AlexGalhardo/vukem/orm"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

// ErrSlugTaken is returned when a project with the slug already exists.
var ErrSlugTaken = errors.New("slug already in use")

const chunkSize = 400

// Service is the catalog over a database.
type Service struct {
	DB *database.DB
}

// New returns a Service.
func New(db *database.DB) *Service { return &Service{DB: db} }

var slugCleanup = regexp.MustCompile(`[^a-z0-9]+`)

// FindOrCreateProject returns the project of a site, creating it on first
// contact: name and slug come from the host.
func (s *Service) FindOrCreateProject(ctx context.Context, baseURL string) (models.Project, error) {
	p, err := orm.QueryOf[models.Project](s.DB).Where("base_url", baseURL).First(ctx)
	if err == nil {
		return p, nil
	}

	if !errors.Is(err, orm.ErrNotFound) {
		return p, err
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return p, fmt.Errorf("parsing base url: %w", err)
	}

	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")

	base := strings.Trim(slugCleanup.ReplaceAllString(host, "-"), "-")
	if len(base) > 34 {
		base = strings.Trim(base[:34], "-")
	}

	if base == "" {
		base = "site"
	}

	slug := base

	for n := 2; ; n++ {
		taken, err := orm.QueryOf[models.Project](s.DB).Where("slug", slug).Exists(ctx)
		if err != nil {
			return p, err
		}

		if !taken {
			break
		}

		slug = fmt.Sprintf("%s-%d", base, n)
	}

	p = models.Project{Name: host, Slug: slug, BaseURL: baseURL}
	if err := orm.Create(ctx, s.DB, &p); err != nil {
		return p, fmt.Errorf("creating project: %w", err)
	}

	return p, nil
}

// CreateProject adds a project by hand; the slug must be free.
func (s *Service) CreateProject(ctx context.Context, name, slug, baseURL string) (models.Project, error) {
	p := models.Project{Name: name, Slug: slug, BaseURL: baseURL}

	taken, err := orm.QueryOf[models.Project](s.DB).Where("slug", slug).Exists(ctx)
	if err != nil {
		return p, err
	}

	if taken {
		return p, ErrSlugTaken
	}

	return p, orm.Create(ctx, s.DB, &p)
}

// DeleteProject removes a project with its products, links and clicks.
func (s *Service) DeleteProject(ctx context.Context, id int64) error {
	_, err := orm.QueryOf[models.Project](s.DB).Where("id", id).Delete(ctx)

	return err
}

// UpsertSummary is the answer of POST /api/v1/links.
type UpsertSummary struct {
	ProductsCreated int      `json:"productsCreated"`
	LinksAdded      int      `json:"linksAdded"`
	Errors          []string `json:"errors"`
}

// SyncSummary is the answer of PUT /api/v1/links.
type SyncSummary struct {
	ProductsCreated int      `json:"productsCreated"`
	ProductsUpdated int      `json:"productsUpdated"`
	ProductsRemoved int      `json:"productsRemoved"`
	LinksAdded      int      `json:"linksAdded"`
	LinksRemoved    int      `json:"linksRemoved"`
	Errors          []string `json:"errors"`
}

func chunks[T any](items []T, size int) [][]T {
	var out [][]T

	for len(items) > 0 {
		n := min(size, len(items))
		out = append(out, items[:n])
		items = items[n:]
	}

	return out
}

func anyOf[T any](items []T) []any {
	out := make([]any, len(items))
	for i, v := range items {
		out[i] = v
	}

	return out
}

// Upsert is the single creation path (form, import, POST and PUT): products
// are matched by externalId and links are appended at the lowest priority,
// never replaced.
func (s *Service) Upsert(ctx context.Context, project models.Project, inputs []rules.ProductInput) (UpsertSummary, error) {
	var sum UpsertSummary

	err := s.DB.Tx(ctx, func(tx *database.Tx) error {
		var err error

		sum, err = upsert(ctx, tx, project, inputs)

		return err
	})

	return sum, err
}

func upsert(ctx context.Context, ex database.Executor, project models.Project, inputs []rules.ProductInput) (UpsertSummary, error) {
	sum := UpsertSummary{Errors: []string{}}

	ids := make([]string, len(inputs))
	for i, in := range inputs {
		ids[i] = in.ExternalID
	}

	existing := map[string]models.Product{}

	for _, batch := range chunks(ids, chunkSize) {
		found, err := orm.QueryOf[models.Product](ex).WhereIn("external_id", anyOf(batch)...).Get(ctx)
		if err != nil {
			return sum, err
		}

		for _, p := range found {
			existing[p.ExternalID] = p
		}
	}

	urls := map[int64]map[string]bool{}
	maxPriority := map[int64]int{}

	for _, p := range existing {
		links, err := orm.QueryOf[models.AffiliateLink](ex).Where("product_id", p.ID).Get(ctx)
		if err != nil {
			return sum, err
		}

		urls[p.ID] = map[string]bool{}
		maxPriority[p.ID] = -1

		for _, l := range links {
			urls[p.ID][l.URL] = true
			maxPriority[p.ID] = max(maxPriority[p.ID], l.Priority)
		}
	}

	for _, in := range inputs {
		product, ok := existing[in.ExternalID]
		if ok && product.ProjectID != project.ID {
			sum.Errors = append(sum.Errors, in.ExternalID+": pertence a outro projeto")

			continue
		}

		if !ok {
			pageURL := in.PageURL
			if pageURL == "" {
				pageURL = project.BaseURL
				if u, err := url.Parse(in.ExternalID); err == nil && u.Scheme != "" && u.Host != "" {
					pageURL = in.ExternalID
				}
			}

			// The redirect falls back to the page URL, so it must stay inside
			// the project (open-redirect guard).
			if !rules.SameHost(pageURL, project.BaseURL) {
				sum.Errors = append(sum.Errors, in.ExternalID+": pageUrl fora do domínio do projeto")

				continue
			}

			product = models.Product{ProjectID: project.ID, ExternalID: in.ExternalID, Name: in.Name, PageURL: pageURL}
			if product.Name == "" {
				product.Name = rules.NameFromExternalID(in.ExternalID)
			}

			if in.Category != "" {
				product.Category = &in.Category
			}

			if err := orm.Create(ctx, ex, &product); err != nil {
				return sum, fmt.Errorf("creating product %s: %w", in.ExternalID, err)
			}

			existing[in.ExternalID] = product
			urls[product.ID] = map[string]bool{}
			maxPriority[product.ID] = -1
			sum.ProductsCreated++
		}

		for _, l := range in.Links {
			if urls[product.ID][l.URL] {
				continue
			}

			urls[product.ID][l.URL] = true
			maxPriority[product.ID]++

			store := l.Store
			if store == "" {
				store = rules.DetectStore(l.URL)
			}

			link := models.AffiliateLink{
				ProductID: product.ID, URL: l.URL, Store: store, Priority: maxPriority[product.ID],
				Status: models.StatusUnknown,
			}
			if err := orm.Create(ctx, ex, &link); err != nil {
				return sum, fmt.Errorf("creating link of %s: %w", in.ExternalID, err)
			}

			sum.LinksAdded++
		}
	}

	return sum, nil
}

// Sync is the declarative counterpart of Upsert for PUT /api/v1/links:
// afterwards the project holds exactly inputs. Creation goes through upsert;
// the rest reconciles what existed (fields, link set, order) and removes what
// the project no longer publishes. Removing a product drops its clicks.
func (s *Service) Sync(ctx context.Context, project models.Project, inputs []rules.ProductInput) (SyncSummary, error) {
	var sum SyncSummary

	err := s.DB.Tx(ctx, func(tx *database.Tx) error {
		var err error

		sum, err = syncTx(ctx, tx, project, inputs)

		return err
	})

	return sum, err
}

func syncTx(ctx context.Context, ex database.Executor, project models.Project, inputs []rules.ProductInput) (SyncSummary, error) {
	up, err := upsert(ctx, ex, project, inputs)
	if err != nil {
		return SyncSummary{}, err
	}

	sum := SyncSummary{ProductsCreated: up.ProductsCreated, LinksAdded: up.LinksAdded, Errors: up.Errors}

	wanted := make(map[string]rules.ProductInput, len(inputs))
	for _, in := range inputs {
		wanted[in.ExternalID] = in
	}

	own, err := orm.QueryOf[models.Product](ex).Where("project_id", project.ID).Get(ctx)
	if err != nil {
		return sum, err
	}

	var stale []int64

	for _, p := range own {
		if _, ok := wanted[p.ExternalID]; !ok {
			stale = append(stale, p.ID)
		}
	}

	for _, batch := range chunks(stale, chunkSize) {
		if _, err := orm.QueryOf[models.Product](ex).WhereIn("id", anyOf(batch)...).Delete(ctx); err != nil {
			return sum, err
		}
	}

	sum.ProductsRemoved = len(stale)

	for _, p := range own {
		in, ok := wanted[p.ExternalID]
		if !ok {
			continue
		}

		if err := reconcileProduct(ctx, ex, project, p, in, &sum); err != nil {
			return sum, err
		}
	}

	return sum, nil
}

func reconcileProduct(ctx context.Context, ex database.Executor, project models.Project, p models.Product, in rules.ProductInput, sum *SyncSummary) error {
	changed := false

	if in.Name != "" && in.Name != p.Name {
		p.Name, changed = in.Name, true
	}

	if in.Category != "" && (p.Category == nil || *p.Category != in.Category) {
		p.Category, changed = &in.Category, true
	}

	if in.PageURL != "" && in.PageURL != p.PageURL {
		if rules.SameHost(in.PageURL, project.BaseURL) {
			p.PageURL, changed = in.PageURL, true
		} else {
			sum.Errors = append(sum.Errors, in.ExternalID+": pageUrl fora do domínio do projeto")
		}
	}

	if changed {
		if err := orm.UpdateOnly(ctx, ex, &p, "name", "category", "page_url"); err != nil {
			return err
		}

		sum.ProductsUpdated++
	}

	type target struct {
		index int
		store string
	}

	order := make(map[string]target, len(in.Links))
	for i, l := range in.Links {
		if _, dup := order[l.URL]; !dup {
			order[l.URL] = target{i, l.Store}
		}
	}

	links, err := orm.QueryOf[models.AffiliateLink](ex).Where("product_id", p.ID).Get(ctx)
	if err != nil {
		return err
	}

	var stale []int64

	for _, l := range links {
		t, ok := order[l.URL]
		if !ok {
			stale = append(stale, l.ID)

			continue
		}

		store := t.store
		if store == "" {
			store = l.Store
		}

		if l.Priority != t.index || l.Store != store {
			l.Priority, l.Store = t.index, store
			if err := orm.UpdateOnly(ctx, ex, &l, "priority", "store"); err != nil {
				return err
			}
		}
	}

	for _, batch := range chunks(stale, chunkSize) {
		if _, err := orm.QueryOf[models.AffiliateLink](ex).WhereIn("id", anyOf(batch)...).Delete(ctx); err != nil {
			return err
		}
	}

	sum.LinksRemoved += len(stale)

	return nil
}

// RegisteredURLs maps each externalId of the project to the URLs it already has.
func (s *Service) RegisteredURLs(ctx context.Context, projectID int64) (map[string]map[string]bool, error) {
	type row struct {
		ExternalID string `db:"external_id"`
		URL        string `db:"url"`
	}

	rows, err := orm.Raw[row](ctx, s.DB,
		`SELECT p.external_id AS external_id, l.url AS url FROM affiliate_links l
		 JOIN products p ON p.id = l.product_id WHERE p.project_id = ?`, projectID)
	if err != nil {
		return nil, err
	}

	out := map[string]map[string]bool{}

	for _, r := range rows {
		if out[r.ExternalID] == nil {
			out[r.ExternalID] = map[string]bool{}
		}

		out[r.ExternalID][r.URL] = true
	}

	return out, nil
}

// EnsureProject returns the project with the slug, creating it when missing.
func (s *Service) EnsureProject(ctx context.Context, name, slug, baseURL string) (models.Project, error) {
	p, err := orm.QueryOf[models.Project](s.DB).Where("slug", slug).First(ctx)
	if err == nil {
		return p, nil
	}

	if !errors.Is(err, orm.ErrNotFound) {
		return p, err
	}

	return s.CreateProject(ctx, name, slug, baseURL)
}
