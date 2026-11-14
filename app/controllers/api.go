package controllers

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"

	"github.com/AlexGalhardo/vukem/web"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/deps"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

// maxAPIBody bounds a catalogue upload (5000 products with their links).
const maxAPIBody = 16 << 20

// API serves /api/v1/links, the contract the sites sync their catalogue with
// (docs/api.md). Every site uses the same key and names itself with ?site=.
type API struct {
	d *deps.Deps
}

// NewAPI returns the API handlers.
func NewAPI(d *deps.Deps) *API { return &API{d: d} }

type apiError struct {
	Error   string   `json:"error"`
	BaseURL string   `json:"baseUrl,omitempty"`
	Issues  []string `json:"issues,omitempty"`
}

// hasBearer compares the key in constant time; an unset key never matches.
func hasBearer(c *web.Ctx, key string) bool {
	if key == "" {
		return false
	}

	given := []byte(c.Header("Authorization"))
	want := []byte("Bearer " + key)

	return subtle.ConstantTimeCompare(given, want) == 1
}

// authorize checks the key and the site, then reads the body. A non-nil
// error has already been answered.
func (a *API) authorize(c *web.Ctx) (models.Project, json.RawMessage, bool, error) {
	var none models.Project

	if !hasBearer(c, a.d.APIKey) {
		return none, nil, false, c.JSON(http.StatusUnauthorized, apiError{Error: "unauthorized"})
	}

	site := c.Query("site")
	if !rules.IsPublicHTTPURL(site) {
		return none, nil, false, c.JSON(http.StatusBadRequest, apiError{Error: "invalid_site"})
	}

	u, err := url.Parse(site)
	if err != nil {
		return none, nil, false, c.JSON(http.StatusBadRequest, apiError{Error: "invalid_site"})
	}

	baseURL := u.Scheme + "://" + u.Host

	var body json.RawMessage
	if err := json.NewDecoder(http.MaxBytesReader(c.Writer(), c.Request().Body, maxAPIBody)).Decode(&body); err != nil {
		return none, nil, false, c.JSON(http.StatusBadRequest, apiError{Error: "invalid_body", Issues: []string{"invalid JSON"}})
	}

	return models.Project{BaseURL: baseURL}, body, true, nil
}

// products decodes and validates the body: a single product only when single is true.
func products(body json.RawMessage, single bool, limit int) ([]rules.ProductInput, []string) {
	trimmed := bytes.TrimSpace(body)

	var items []rules.ProductInput

	switch {
	case len(trimmed) > 0 && trimmed[0] == '[':
		if err := json.Unmarshal(trimmed, &items); err != nil {
			return nil, []string{"invalid products: " + err.Error()}
		}
	case single && len(trimmed) > 0 && trimmed[0] == '{':
		var one rules.ProductInput
		if err := json.Unmarshal(trimmed, &one); err != nil {
			return nil, []string{"invalid product: " + err.Error()}
		}

		items = []rules.ProductInput{one}
	default:
		return nil, []string{"expected an array of products"}
	}

	if len(items) < 1 || len(items) > limit {
		return nil, []string{"expected 1 to " + strconv.Itoa(limit) + " products"}
	}

	var issues []string

	for i := range items {
		if err := items[i].Validate(); err != nil {
			issues = append(issues, err.Error())
		}
	}

	return items, issues
}

// project returns the project of an online site (links are only accepted for a
// site that answers); answered is true when the response was already written.
func (a *API) project(c *web.Ctx, baseURL string) (models.Project, bool, error) {
	var none models.Project

	if !a.d.Checker.IsSiteLive(c.Context(), baseURL) {
		return none, true, c.JSON(http.StatusConflict, apiError{Error: "project_offline", BaseURL: baseURL})
	}

	p, err := a.d.Catalog.FindOrCreateProject(c.Context(), baseURL)

	return p, err != nil, err
}

// Append is POST /api/v1/links: adds products and links, never removes.
func (a *API) Append(c *web.Ctx) error {
	site, body, ok, err := a.authorize(c)
	if !ok {
		return err
	}

	items, issues := products(body, true, rules.MaxAppendProducts)
	if len(issues) > 0 {
		return c.JSON(http.StatusBadRequest, apiError{Error: "invalid_body", Issues: issues})
	}

	project, answered, err := a.project(c, site.BaseURL)
	if answered {
		return err
	}

	sum, err := a.d.Catalog.Upsert(c.Context(), project, items)
	if err != nil {
		return err
	}

	status := http.StatusCreated
	if len(sum.Errors) > 0 {
		status = http.StatusMultiStatus
	}

	return c.JSON(status, sum)
}

// Sync is PUT /api/v1/links: the body is the site's whole catalogue and
// whatever is missing from it is removed.
func (a *API) Sync(c *web.Ctx) error {
	site, body, ok, err := a.authorize(c)
	if !ok {
		return err
	}

	items, issues := products(body, false, rules.MaxImportProducts)

	seen := map[string]bool{}

	for _, it := range items {
		if seen[it.ExternalID] {
			issues = append(issues, "externalId repetido: "+it.ExternalID)
		}

		seen[it.ExternalID] = true
	}

	if len(issues) > 0 {
		return c.JSON(http.StatusBadRequest, apiError{Error: "invalid_body", Issues: issues})
	}

	project, answered, err := a.project(c, site.BaseURL)
	if answered {
		return err
	}

	sum, err := a.d.Catalog.Sync(c.Context(), project, items)
	if err != nil {
		return err
	}

	status := http.StatusOK
	if len(sum.Errors) > 0 {
		status = http.StatusMultiStatus
	}

	return c.JSON(status, sum)
}
