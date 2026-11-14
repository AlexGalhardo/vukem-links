// Package pages declares the props of every Inertia page. Controllers render
// them with pages.<Page>.Render(c, props), inertia.Config lists them in
// Pages, and vukem codegen:pages writes resources/js/page-props.ts from them,
// so the page components and the Go controllers share one declaration.
package pages

import (
	"time"

	"github.com/AlexGalhardo/vukem/inertia"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/catalog"
)

// Shared is the props every page receives (inertia.Config.SharedType).
type Shared struct {
	AppName string      `json:"appName"`
	Auth    *SharedAuth `json:"auth"`
}

// SharedAuth is the signed-in user, or null.
type SharedAuth struct {
	User *SharedUser `json:"user"`
}

// SharedUser is the part of the user every page receives.
type SharedUser struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// The typed pages.
var (
	Login        = inertia.Define[struct{}]("Auth/Login")
	Overview     = inertia.Define[OverviewProps]("Overview")
	LinksIndex   = inertia.Define[LinksIndexProps]("Links/Index")
	LinksShow    = inertia.Define[LinksShowProps]("Links/Show")
	ProjectsList = inertia.Define[ProjectsListProps]("Projects/Index")
	ProjectsShow = inertia.Define[ProjectsShowProps]("Projects/Show")
)

// OverviewProps are the props of Overview.
type OverviewProps struct {
	Stats     catalog.Stats     `json:"stats"`
	Links     int               `json:"links"`
	Dead      int               `json:"dead"`
	Unchecked int               `json:"unchecked"`
	DeadLinks []catalog.LinkRow `json:"dead_links"`
	TopLinks  []catalog.LinkRow `json:"top_links"`
}

// ProjectOption is a project in a select.
type ProjectOption struct {
	ID   int64  `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// LinksIndexProps are the props of Links/Index.
type LinksIndexProps struct {
	Links    []catalog.LinkRow `json:"links"`
	Projects []ProjectOption   `json:"projects"`
}

// LinkCheckRow is one health check of a link.
type LinkCheckRow struct {
	ID         int64     `json:"id"`
	CheckedAt  time.Time `json:"checked_at"`
	Result     string    `json:"result"`
	StatusCode *int      `json:"status_code"`
	FinalURL   *string   `json:"final_url"`
}

// LinksShowProps are the props of Links/Show.
type LinksShowProps struct {
	Link     models.AffiliateLink   `json:"link"`
	Product  models.Product         `json:"product"`
	Project  models.Project         `json:"project"`
	Siblings []models.AffiliateLink `json:"siblings"`
	Checks   []LinkCheckRow         `json:"checks"`
	Stats    catalog.Stats          `json:"stats"`
}

// ProjectsListProps are the props of Projects/Index.
type ProjectsListProps struct {
	Projects []catalog.ProjectRow `json:"projects"`
}

// ProjectsShowProps are the props of Projects/Show.
type ProjectsShowProps struct {
	Project models.Project    `json:"project"`
	Stats   catalog.Stats     `json:"stats"`
	Links   []catalog.LinkRow `json:"links"`
}

// All lists the typed pages for inertia.Config.Pages.
func All() []inertia.PageInfo {
	return []inertia.PageInfo{
		Login.Info(), Overview.Info(), LinksIndex.Info(), LinksShow.Info(), ProjectsList.Info(), ProjectsShow.Info(),
	}
}
