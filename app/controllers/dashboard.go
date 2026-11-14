package controllers

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/AlexGalhardo/vukem/errs"
	"github.com/AlexGalhardo/vukem/inertia"
	"github.com/AlexGalhardo/vukem/orm"
	"github.com/AlexGalhardo/vukem/web"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/app/pages"
	"github.com/AlexGalhardo/vukem-links/app/requests"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/deps"
	"github.com/AlexGalhardo/vukem-links/internal/health"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

// Dashboard serves the authenticated pages and their actions. Every route is
// behind auth.Required (routes/web.go): a protected layout is not enough for
// an action, so the guard is on the route group.
type Dashboard struct {
	d *deps.Deps
}

// NewDashboard returns the dashboard handlers.
func NewDashboard(d *deps.Deps) *Dashboard { return &Dashboard{d: d} }

func (h *Dashboard) svc() *catalog.Service { return h.d.Catalog }

func invalid(field, message string) error { return errs.NewValidation().Add(field, message) }

func success(c *web.Ctx, message string) { inertia.Flash(c, "success", message) }

// Overview renders the start page: totals, statistics, dead and top links.
func (h *Dashboard) Overview(c *web.Ctx) error {
	ctx := c.Context()

	stats, err := h.svc().GetStats(ctx, catalog.StatsScope{})
	if err != nil {
		return err
	}

	links, err := h.svc().ListLinks(ctx, 0)
	if err != nil {
		return err
	}

	props := pages.OverviewProps{Stats: stats, Links: len(links), DeadLinks: []catalog.LinkRow{}}

	for _, l := range links {
		switch l.Status {
		case models.StatusDead:
			props.Dead++

			if len(props.DeadLinks) < 10 {
				props.DeadLinks = append(props.DeadLinks, l)
			}
		case models.StatusUnknown:
			props.Unchecked++
		}
	}

	top := slices.Clone(links)
	slices.SortStableFunc(top, func(a, b catalog.LinkRow) int { return b.Clicks - a.Clicks })
	props.TopLinks = top[:min(10, len(top))]

	return pages.Overview.Render(c, props)
}

// LinksIndex renders the table of every link.
func (h *Dashboard) LinksIndex(c *web.Ctx) error {
	links, err := h.svc().ListLinks(c.Context(), 0)
	if err != nil {
		return err
	}

	projects, err := h.svc().ListProjects(c.Context())
	if err != nil {
		return err
	}

	opts := make([]pages.ProjectOption, len(projects))
	for i, p := range projects {
		opts[i] = pages.ProjectOption{ID: p.ID, Slug: p.Slug, Name: p.Name}
	}

	return pages.LinksIndex.Render(c, pages.LinksIndexProps{Links: links, Projects: opts})
}

// LinkShow renders one link: where it is, its fallback order and its checks.
func (h *Dashboard) LinkShow(c *web.Ctx) error {
	id, err := c.ParamInt("id")
	if err != nil {
		return c.Redirect("/")
	}

	d, err := h.svc().GetLinkDetail(c.Context(), id)
	if errors.Is(err, catalog.ErrNotFound) {
		// A link that does not exist (or was removed) goes back to the start page.
		return c.Redirect("/")
	}

	if err != nil {
		return err
	}

	stats, err := h.svc().GetStats(c.Context(), catalog.StatsScope{LinkID: id})
	if err != nil {
		return err
	}

	checks := make([]pages.LinkCheckRow, len(d.Checks))
	for i, ch := range d.Checks {
		checks[i] = pages.LinkCheckRow{
			ID: ch.ID, CheckedAt: ch.CreatedAt, Result: ch.Result, StatusCode: ch.StatusCode, FinalURL: ch.FinalURL,
		}
	}

	return pages.LinksShow.Render(c, pages.LinksShowProps{
		Link: d.Link, Product: d.Product, Project: d.Project, Siblings: d.Siblings, Checks: checks, Stats: stats,
	})
}

// LinkUpdate edits the URL and the priority of a link.
func (h *Dashboard) LinkUpdate(c *web.Ctx) error {
	id, err := c.ParamInt("id")
	if err != nil {
		return c.Redirect("/")
	}

	in, err := web.Parse(c, requests.LinkSchema)
	if err != nil {
		return err
	}

	if !rules.IsPublicHTTPURL(in.URL) {
		return invalid("url", "URL http(s) pública obrigatória")
	}

	if err := h.svc().UpdateLink(c.Context(), id, in.URL, in.Priority); err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			return c.Redirect("/")
		}

		return err
	}

	success(c, "Link atualizado")

	return c.Back("/links")
}

// LinkPromote makes the link the first choice of its product.
func (h *Dashboard) LinkPromote(c *web.Ctx) error {
	id, err := c.ParamInt("id")
	if err != nil {
		return c.Redirect("/")
	}

	if err := h.svc().PromoteLink(c.Context(), id); err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			return c.Redirect("/")
		}

		return err
	}

	success(c, "Link agora é a primeira opção do produto")

	return c.Back("/links")
}

// LinkDestroy removes one link with its clicks and checks.
func (h *Dashboard) LinkDestroy(c *web.Ctx) error {
	id, err := c.ParamInt("id")
	if err != nil {
		return c.Redirect("/")
	}

	if err := h.svc().DeleteLinks(c.Context(), []int64{id}); err != nil {
		return err
	}

	success(c, "Link excluído")

	return c.Redirect("/links")
}

// LinksDestroy removes the selected links.
func (h *Dashboard) LinksDestroy(c *web.Ctx) error {
	in, err := web.Parse(c, requests.IDsSchema)
	if err != nil {
		return err
	}

	if len(in.IDs) == 0 {
		return invalid("ids", "Selecione ao menos um link")
	}

	if err := h.svc().DeleteLinks(c.Context(), in.IDs); err != nil {
		return err
	}

	success(c, fmt.Sprintf("%d link(s) excluído(s)", len(in.IDs)))

	return c.Back("/links")
}

// LinksCheck checks the selected links, or every link when All is set.
func (h *Dashboard) LinksCheck(c *web.Ctx) error {
	in, err := web.Parse(c, requests.IDsSchema)
	if err != nil {
		return err
	}

	var sum health.Summary

	if in.All {
		sum, err = h.d.Checker.CheckAll(c.Context())
	} else {
		if len(in.IDs) == 0 {
			return invalid("ids", "Selecione ao menos um link")
		}

		sum, err = h.d.Checker.Check(c.Context(), in.IDs)
	}

	if err != nil {
		return err
	}

	success(c, fmt.Sprintf("%d checados: %d ok, %d falhas, %d inconclusivos, %d novos mortos",
		sum.Checked, sum.OK, sum.Failed, sum.Inconclusive, sum.Died))

	return c.Back("/links")
}

// ProjectsIndex renders the projects list.
func (h *Dashboard) ProjectsIndex(c *web.Ctx) error {
	projects, err := h.svc().ListProjects(c.Context())
	if err != nil {
		return err
	}

	return pages.ProjectsList.Render(c, pages.ProjectsListProps{Projects: projects})
}

// ProjectShow renders a project with its links and statistics.
func (h *Dashboard) ProjectShow(c *web.Ctx) error {
	project, err := orm.QueryOf[models.Project](h.d.Catalog.DB).Where("slug", c.Param("slug")).First(c.Context())
	if errors.Is(err, orm.ErrNotFound) {
		return c.Redirect("/")
	}

	if err != nil {
		return err
	}

	stats, err := h.svc().GetStats(c.Context(), catalog.StatsScope{ProjectID: project.ID})
	if err != nil {
		return err
	}

	links, err := h.svc().ListLinks(c.Context(), project.ID)
	if err != nil {
		return err
	}

	return pages.ProjectsShow.Render(c, pages.ProjectsShowProps{Project: project, Stats: stats, Links: links})
}

// ProjectStore creates a project; its site must answer.
func (h *Dashboard) ProjectStore(c *web.Ctx) error {
	in, err := web.Parse(c, requests.ProjectSchema)
	if err != nil {
		return err
	}

	if !slugPattern.MatchString(in.Slug) {
		return invalid("slug", "Slug: apenas a-z, 0-9 e hífen")
	}

	if !rules.IsPublicHTTPURL(in.BaseURL) {
		return invalid("baseUrl", "URL http(s) pública obrigatória")
	}

	u, err := url.Parse(in.BaseURL)
	if err != nil {
		return invalid("baseUrl", "URL inválida")
	}

	base := u.Scheme + "://" + u.Host

	if !h.d.Checker.IsSiteLive(c.Context(), base) {
		return invalid("baseUrl", fmt.Sprintf("O site %s não respondeu. Publique o site antes.", base))
	}

	if _, err := h.svc().CreateProject(c.Context(), in.Name, in.Slug, base); err != nil {
		if errors.Is(err, catalog.ErrSlugTaken) {
			return invalid("slug", "Já existe um projeto com esse slug")
		}

		return err
	}

	success(c, "Projeto criado")

	return c.Redirect("/projects/" + in.Slug)
}

// ProjectDestroy removes a project with everything under it.
func (h *Dashboard) ProjectDestroy(c *web.Ctx) error {
	id, err := c.ParamInt("id")
	if err != nil {
		return c.Redirect("/projects")
	}

	if err := h.svc().DeleteProject(c.Context(), id); err != nil {
		return err
	}

	success(c, "Projeto excluído")

	return c.Redirect("/projects")
}

func (h *Dashboard) project(c *web.Ctx) (models.Project, error) {
	id, err := c.ParamInt("id")
	if err != nil {
		return models.Project{}, errs.New(404, "Not Found")
	}

	p, err := orm.QueryOf[models.Project](h.d.Catalog.DB).Find(c.Context(), id)
	if errors.Is(err, orm.ErrNotFound) {
		return p, errs.New(404, "Not Found")
	}

	return p, err
}

// requireLive refuses a project whose site does not answer.
func (h *Dashboard) requireLive(c *web.Ctx, field string, p models.Project) error {
	if h.d.Checker.IsSiteLive(c.Context(), p.BaseURL) {
		return nil
	}

	return invalid(field, fmt.Sprintf("O site %s não respondeu. Publique o site antes.", p.BaseURL))
}

// ProductStore adds a product, or links to an existing product.
func (h *Dashboard) ProductStore(c *web.Ctx) error {
	project, err := h.project(c)
	if err != nil {
		return err
	}

	in, err := web.Parse(c, requests.ProductSchema)
	if err != nil {
		return err
	}

	product := rules.ProductInput{
		ExternalID: in.ExternalID, Name: in.Name, PageURL: in.PageURL, Category: in.Category,
	}
	for _, u := range strings.Fields(in.URLs) {
		product.Links = append(product.Links, rules.LinkInput{URL: u})
	}

	if err := product.Validate(); err != nil {
		return invalid("urls", err.Error())
	}

	if err := h.requireLive(c, "externalId", project); err != nil {
		return err
	}

	sum, err := h.svc().Upsert(c.Context(), project, []rules.ProductInput{product})
	if err != nil {
		return err
	}

	if len(sum.Errors) > 0 {
		return invalid("externalId", sum.Errors[0])
	}

	success(c, fmt.Sprintf("%d produto(s) e %d link(s) criados", sum.ProductsCreated, sum.LinksAdded))

	return c.Back("/projects/" + project.Slug)
}

// ProjectImport imports a JSON or CSV file: only links that are new to the
// project and not dead are written.
func (h *Dashboard) ProjectImport(c *web.Ctx) error {
	project, err := h.project(c)
	if err != nil {
		return err
	}

	in, err := web.Parse(c, requests.ImportSchema)
	if err != nil {
		return err
	}

	rows, err := rules.ParseImport(in.Text)
	if err != nil {
		return invalid("text", err.Error())
	}

	if err := h.requireLive(c, "text", project); err != nil {
		return err
	}

	registered, err := h.svc().RegisteredURLs(c.Context(), project.ID)
	if err != nil {
		return err
	}

	fresh := rules.PlanImport(rows, registered, nil)

	var urls []string

	for _, r := range fresh.Rows {
		for _, l := range r.Links {
			urls = append(urls, l.URL)
		}
	}

	plan := rules.PlanImport(rows, registered, h.d.Checker.FindDeadURLs(c.Context(), urls))

	sum, err := h.svc().Upsert(c.Context(), project, plan.Rows)
	if err != nil {
		return err
	}

	success(c, fmt.Sprintf("%d produto(s) e %d link(s) importados; ignorados: %d já cadastrado(s), %d morto(s); %d erro(s)",
		sum.ProductsCreated, sum.LinksAdded, plan.SkippedExisting, plan.SkippedDead, len(sum.Errors)))

	if len(sum.Errors) > 0 {
		return invalid("text", strings.Join(sum.Errors[:min(5, len(sum.Errors))], "; "))
	}

	return c.Back("/projects/" + project.Slug)
}
