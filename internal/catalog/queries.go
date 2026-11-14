package catalog

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/AlexGalhardo/vukem/orm"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

// ErrNotFound is returned when a link does not exist.
var ErrNotFound = errors.New("not found")

// LinkRow is a link with its product, project and click counts, for the table.
type LinkRow struct {
	ID             int64   `db:"id" json:"id"`
	URL            string  `db:"url" json:"url"`
	Store          string  `db:"store" json:"store"`
	Status         string  `db:"status" json:"status"`
	Priority       int     `db:"priority" json:"priority"`
	LastCheckedAt  *string `db:"last_checked_at" json:"last_checked_at"`
	LastStatusCode *int    `db:"last_status_code" json:"last_status_code"`
	ProductID      int64   `db:"product_id" json:"product_id"`
	ProductName    string  `db:"product_name" json:"product_name"`
	ExternalID     string  `db:"external_id" json:"external_id"`
	PageURL        string  `db:"page_url" json:"page_url"`
	Category       *string `db:"category" json:"category"`
	ProjectSlug    string  `db:"project_slug" json:"project_slug"`
	ProjectName    string  `db:"project_name" json:"project_name"`
	// Clicks are human clicks plus the ones counted before per-click events.
	Clicks int `db:"clicks" json:"clicks"`
	Mobile int `db:"mobile" json:"mobile"`
}

// ListLinks returns every link (of one project when projectID > 0).
// ponytail: the table filters in memory; paginate server-side past ~5k links.
func (s *Service) ListLinks(ctx context.Context, projectID int64) ([]LinkRow, error) {
	query := `SELECT l.id AS id, l.url AS url, l.store AS store, l.status AS status, l.priority AS priority,
		l.last_checked_at AS last_checked_at, l.last_status_code AS last_status_code,
		p.id AS product_id, p.name AS product_name, p.external_id AS external_id, p.page_url AS page_url,
		p.category AS category, pr.slug AS project_slug, pr.name AS project_name,
		COALESCE(c.clicks, 0) + l.legacy_clicks AS clicks, COALESCE(c.mobile, 0) AS mobile
		FROM affiliate_links l
		JOIN products p ON p.id = l.product_id
		JOIN projects pr ON pr.id = p.project_id
		LEFT JOIN (
			SELECT link_id, COUNT(*) AS clicks, SUM(CASE WHEN device <> 'desktop' THEN 1 ELSE 0 END) AS mobile
			FROM click_events WHERE is_bot = 0 AND link_id IS NOT NULL GROUP BY link_id
		) c ON c.link_id = l.id`

	var args []any

	if projectID > 0 {
		query += " WHERE pr.id = ?"

		args = append(args, projectID)
	}

	return orm.Raw[LinkRow](ctx, s.DB, query+" ORDER BY p.name, l.priority", args...)
}

// ProjectRow is a project with its totals, for the projects list.
type ProjectRow struct {
	ID       int64  `db:"id" json:"id"`
	Name     string `db:"name" json:"name"`
	Slug     string `db:"slug" json:"slug"`
	BaseURL  string `db:"base_url" json:"base_url"`
	Products int    `db:"products" json:"products"`
	Links    int    `db:"links" json:"links"`
	Dead     int    `db:"dead" json:"dead"`
	Clicks   int    `db:"clicks" json:"clicks"`
}

// ListProjects returns every project with its totals.
func (s *Service) ListProjects(ctx context.Context) ([]ProjectRow, error) {
	return orm.Raw[ProjectRow](ctx, s.DB, `SELECT pr.id AS id, pr.name AS name, pr.slug AS slug, pr.base_url AS base_url,
		(SELECT COUNT(*) FROM products p WHERE p.project_id = pr.id) AS products,
		(SELECT COUNT(*) FROM affiliate_links l JOIN products p ON p.id = l.product_id WHERE p.project_id = pr.id) AS links,
		(SELECT COUNT(*) FROM affiliate_links l JOIN products p ON p.id = l.product_id
			WHERE p.project_id = pr.id AND l.status = 'dead') AS dead,
		(SELECT COUNT(*) FROM click_events e JOIN products p ON p.id = e.product_id
			WHERE p.project_id = pr.id AND e.is_bot = 0 AND e.link_id IS NOT NULL) AS clicks
		FROM projects pr ORDER BY pr.name`)
}

// Bucket is a value with how many clicks it got.
type Bucket struct {
	Key   string `db:"key" json:"key"`
	Count int    `db:"count" json:"count"`
}

// Stats are the click statistics of a scope.
type Stats struct {
	// Clicks are human clicks with per-click data.
	Clicks       int `json:"clicks"`
	LegacyClicks int `json:"legacy_clicks"`
	BotClicks    int `json:"bot_clicks"`
	// LostClicks found no usable link and went back to the product page.
	LostClicks int      `json:"lost_clicks"`
	ByDay      []Bucket `json:"by_day"`
	ByDevice   []Bucket `json:"by_device"`
	ByCountry  []Bucket `json:"by_country"`
	ByReferer  []Bucket `json:"by_referer"`
	ByOS       []Bucket `json:"by_os"`
	ByBrowser  []Bucket `json:"by_browser"`
}

// StatsScope narrows Stats to a project or a link; Days defaults to 30.
type StatsScope struct {
	ProjectID int64
	LinkID    int64
	Days      int
}

func isoDay(t time.Time) string { return t.UTC().Format("2006-01-02") }

type count struct {
	N int `db:"n"`
}

// GetStats computes the statistics of the scope over its window.
func (s *Service) GetStats(ctx context.Context, sc StatsScope) (Stats, error) {
	if sc.Days <= 0 {
		sc.Days = 30
	}

	where, args := []string{"1 = 1"}, []any{}

	if sc.ProjectID > 0 {
		where = append(where, "p.project_id = ?")
		args = append(args, sc.ProjectID)
	}

	if sc.LinkID > 0 {
		where = append(where, "e.link_id = ?")
		args = append(args, sc.LinkID)
	}

	scope := strings.Join(where, " AND ")
	from := " FROM click_events e JOIN products p ON p.id = e.product_id WHERE " + scope
	since := isoDay(time.Now().AddDate(0, 0, -(sc.Days - 1)))
	windowArgs := append(append([]any{}, args...), since)
	window := " AND e.is_bot = 0 AND substr(e.created_at, 1, 10) >= ?"

	var st Stats

	one := func(dst *int, query string, a ...any) error {
		rows, err := orm.Raw[count](ctx, s.DB, query, a...)
		if err != nil {
			return err
		}

		if len(rows) > 0 {
			*dst = rows[0].N
		}

		return nil
	}

	if err := one(&st.Clicks, "SELECT COUNT(*) AS n"+from+" AND e.is_bot = 0", args...); err != nil {
		return st, err
	}

	if err := one(&st.BotClicks, "SELECT COUNT(*) AS n"+from+" AND e.is_bot = 1", args...); err != nil {
		return st, err
	}

	if err := one(&st.LostClicks, "SELECT COUNT(*) AS n"+from+" AND e.is_bot = 0 AND e.link_id IS NULL", args...); err != nil {
		return st, err
	}

	legacyWhere, legacyArgs := []string{"1 = 1"}, []any{}

	if sc.ProjectID > 0 {
		legacyWhere = append(legacyWhere, "p.project_id = ?")
		legacyArgs = append(legacyArgs, sc.ProjectID)
	}

	if sc.LinkID > 0 {
		legacyWhere = append(legacyWhere, "l.id = ?")
		legacyArgs = append(legacyArgs, sc.LinkID)
	}

	if err := one(&st.LegacyClicks, `SELECT COALESCE(SUM(l.legacy_clicks), 0) AS n FROM affiliate_links l
		JOIN products p ON p.id = l.product_id WHERE `+strings.Join(legacyWhere, " AND "), legacyArgs...); err != nil {
		return st, err
	}

	group := func(column string) ([]Bucket, error) {
		return orm.Raw[Bucket](ctx, s.DB, "SELECT COALESCE("+column+", '—') AS key, COUNT(*) AS count"+from+window+
			" GROUP BY "+column+" ORDER BY COUNT(*) DESC LIMIT 8", windowArgs...)
	}

	var err error

	for _, g := range []struct {
		dst    *[]Bucket
		column string
	}{
		{&st.ByDevice, "e.device"}, {&st.ByCountry, "e.country"}, {&st.ByReferer, "e.referer"},
		{&st.ByOS, "e.os"}, {&st.ByBrowser, "e.browser"},
	} {
		if *g.dst, err = group(g.column); err != nil {
			return st, err
		}
	}

	perDay, err := orm.Raw[Bucket](ctx, s.DB, "SELECT substr(e.created_at, 1, 10) AS key, COUNT(*) AS count"+from+window+
		" GROUP BY substr(e.created_at, 1, 10)", windowArgs...)
	if err != nil {
		return st, err
	}

	byDay := map[string]int{}
	for _, d := range perDay {
		byDay[d.Key] = d.Count
	}

	for i := sc.Days - 1; i >= 0; i-- {
		key := isoDay(time.Now().AddDate(0, 0, -i))
		st.ByDay = append(st.ByDay, Bucket{Key: key, Count: byDay[key]})
	}

	return st, nil
}

// ClicksByProject counts the human clicks that reached a store in the last
// days, for every project (including the ones with none).
func (s *Service) ClicksByProject(ctx context.Context, days int) ([]rules.ProjectClicks, error) {
	type row struct {
		Name   string `db:"name"`
		Clicks int    `db:"clicks"`
	}

	since := isoDay(time.Now().AddDate(0, 0, -days))

	rows, err := orm.Raw[row](ctx, s.DB, `SELECT pr.name AS name, (
		SELECT COUNT(*) FROM click_events e JOIN products p ON p.id = e.product_id
		WHERE p.project_id = pr.id AND e.is_bot = 0 AND e.link_id IS NOT NULL AND e.created_at >= ?) AS clicks
		FROM projects pr`, since)
	if err != nil {
		return nil, err
	}

	out := make([]rules.ProjectClicks, len(rows))
	for i, r := range rows {
		out[i] = rules.ProjectClicks{Name: r.Name, Clicks: r.Clicks}
	}

	return out, nil
}

// LinkDetail is a link with everything the detail page shows.
type LinkDetail struct {
	Link     models.AffiliateLink
	Product  models.Product
	Project  models.Project
	Siblings []models.AffiliateLink
	Checks   []models.LinkCheck
}

// GetLinkDetail loads a link; ErrNotFound when it does not exist.
func (s *Service) GetLinkDetail(ctx context.Context, id int64) (LinkDetail, error) {
	var d LinkDetail

	link, err := orm.QueryOf[models.AffiliateLink](s.DB).Find(ctx, id)
	if errors.Is(err, orm.ErrNotFound) {
		return d, ErrNotFound
	}

	if err != nil {
		return d, err
	}

	d.Link = link

	if d.Product, err = orm.QueryOf[models.Product](s.DB).Find(ctx, link.ProductID); err != nil {
		return d, err
	}

	if d.Project, err = orm.QueryOf[models.Project](s.DB).Find(ctx, d.Product.ProjectID); err != nil {
		return d, err
	}

	if d.Siblings, err = orm.QueryOf[models.AffiliateLink](s.DB).Where("product_id", link.ProductID).
		OrderBy("priority", orm.Asc).Get(ctx); err != nil {
		return d, err
	}

	d.Checks, err = orm.QueryOf[models.LinkCheck](s.DB).Where("link_id", id).OrderBy("id", orm.Desc).Limit(30).Get(ctx)

	return d, err
}

// UpdateLink changes the URL and the priority of a link. A new URL has never
// been checked, so its health starts over.
func (s *Service) UpdateLink(ctx context.Context, id int64, rawURL string, priority int) error {
	if !rules.IsPublicHTTPURL(rawURL) {
		return errors.New("URL http(s) pública obrigatória")
	}

	link, err := orm.QueryOf[models.AffiliateLink](s.DB).Find(ctx, id)
	if errors.Is(err, orm.ErrNotFound) {
		return ErrNotFound
	}

	if err != nil {
		return err
	}

	link.Priority = priority

	cols := []string{"priority"}

	if rawURL != link.URL {
		link.URL = rawURL
		link.Store = rules.DetectStore(rawURL)
		link.Status = models.StatusUnknown
		link.ConsecutiveFailures = 0
		link.LastCheckedAt = orm.NullTime{}
		cols = append(cols, "url", "store", "status", "consecutive_failures", "last_checked_at")
	}

	return orm.UpdateOnly(ctx, s.DB, &link, cols...)
}

// PromoteLink makes the link the first choice of its product.
func (s *Service) PromoteLink(ctx context.Context, id int64) error {
	link, err := orm.QueryOf[models.AffiliateLink](s.DB).Find(ctx, id)
	if errors.Is(err, orm.ErrNotFound) {
		return ErrNotFound
	}

	if err != nil {
		return err
	}

	top, err := orm.QueryOf[models.AffiliateLink](s.DB).Where("product_id", link.ProductID).Min[int](ctx, "priority")
	if err != nil {
		return fmt.Errorf("reading the top priority: %w", err)
	}

	link.Priority = top - 1

	return orm.UpdateOnly(ctx, s.DB, &link, "priority")
}

// DeleteLinks removes links with their clicks and checks.
func (s *Service) DeleteLinks(ctx context.Context, ids []int64) error {
	for _, batch := range chunks(ids, chunkSize) {
		if _, err := orm.QueryOf[models.AffiliateLink](s.DB).WhereIn("id", anyOf(batch)...).Delete(ctx); err != nil {
			return err
		}
	}

	return nil
}
