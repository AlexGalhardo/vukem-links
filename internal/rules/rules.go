// Package rules holds the pure business rules of the affiliate links: store
// detection, link choice, health classification, input validation and the
// import formats. Nothing here does I/O, so everything is unit-tested.
package rules

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
)

// DeadAfterFailures is how many failed checks in a row kill a link.
const DeadAfterFailures = 3

// Limits of the API and the import.
const (
	MaxLinksPerProduct = 20
	MaxImportProducts  = 5000
	MaxAppendProducts  = 500
)

const (
	statusAlive   = "alive"
	statusDead    = "dead"
	statusUnknown = "unknown"
)

type storePattern struct {
	re   *regexp.Regexp
	name string
}

var stores = []storePattern{ //nolint:gochecknoglobals // read-only table
	{regexp.MustCompile(`(^|\.)mercadoli[vb]re\.com(\.br)?$|(^|\.)meli\.la$`), "mercadolivre"},
	{regexp.MustCompile(`(^|\.)amazon\.com(\.br)?$|(^|\.)amzn\.to$`), "amazon"},
	{regexp.MustCompile(`(^|\.)shopee\.com(\.br)?$|(^|\.)shope\.ee$`), "shopee"},
	{regexp.MustCompile(`(^|\.)aliexpress\.com$`), "aliexpress"},
	{regexp.MustCompile(`(^|\.)magazineluiza\.com\.br$|(^|\.)magazinevoce\.com\.br$`), "magalu"},
	{regexp.MustCompile(`(^|\.)hotmart\.com$`), "hotmart"},
}

// DetectStore names the store of a URL, or its host without "www." when unknown.
func DetectStore(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}

	host := strings.ToLower(u.Hostname())
	for _, s := range stores {
		if s.re.MatchString(host) {
			return s.name
		}
	}

	return strings.TrimPrefix(host, "www.")
}

// IsPublicHTTPURL accepts only http(s) URLs whose host is not loopback,
// private or link-local: these URLs are fetched server-side (SSRF).
func IsPublicHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return false
	}

	host := strings.ToLower(u.Hostname())
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}

	if ip, err := netip.ParseAddr(host); err == nil {
		ip = ip.Unmap()

		return !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() ||
			ip.IsMulticast())
	}

	return true
}

// SameHost reports whether two URLs share the same host (and port).
func SameHost(a, b string) bool {
	ua, errA := url.Parse(a)
	ub, errB := url.Parse(b)

	return errA == nil && errB == nil && ua.Host != "" && ua.Host == ub.Host
}

// Candidate is a link the redirect may choose.
type Candidate struct {
	ID       int64
	Store    string
	URL      string
	Status   string
	Priority int
}

// PickLink returns the first non-dead link by ascending priority; unknown is
// usable. With store, that store is preferred, falling back to the order.
func PickLink(links []Candidate, store string) (Candidate, bool) {
	usable := make([]Candidate, 0, len(links))
	for _, l := range links {
		if l.Status != statusDead {
			usable = append(usable, l)
		}
	}

	slices.SortStableFunc(usable, func(a, b Candidate) int { return a.Priority - b.Priority })

	if store != "" {
		for _, l := range usable {
			if l.Store == store {
				return l, true
			}
		}
	}

	if len(usable) == 0 {
		return Candidate{}, false
	}

	return usable[0], true
}

// CheckResult is the outcome of one probe.
type CheckResult string

// The three outcomes of a probe.
const (
	CheckOK           CheckResult = "ok"
	CheckFailed       CheckResult = "failed"
	CheckInconclusive CheckResult = "inconclusive"
)

// Probe is what a health check observed.
type Probe struct {
	// StatusCode is 0 when the request never got a response.
	StatusCode int
	FinalURL   string
	// TimedOut tells a timeout from a hard network error (DNS, refused).
	TimedOut bool
}

// ClassifyProbe: stores block bots (401/403/429) and time out under load, so
// those never count against a link; a 2xx that landed on the store home page
// means the product is gone.
func ClassifyProbe(originalURL string, p Probe) CheckResult {
	switch {
	case p.StatusCode == 0 && p.TimedOut:
		return CheckInconclusive
	case p.StatusCode == 0:
		return CheckFailed
	case p.StatusCode == 401 || p.StatusCode == 403 || p.StatusCode == 429:
		return CheckInconclusive
	case p.StatusCode >= 400:
		return CheckFailed
	}

	orig, errO := url.Parse(originalURL)
	final, errF := url.Parse(p.FinalURL)
	if p.FinalURL != "" && errO == nil && errF == nil && orig.Path != "" && orig.Path != "/" &&
		(final.Path == "" || final.Path == "/") {
		return CheckFailed
	}

	return CheckOK
}

// Health is the persisted health state of a link.
type Health struct {
	Status              string
	ConsecutiveFailures int
}

// NextHealth applies a check result to the current state.
func NextHealth(cur Health, r CheckResult) Health {
	switch r {
	case CheckOK:
		return Health{Status: statusAlive}
	case CheckInconclusive:
		return cur
	}

	failures := cur.ConsecutiveFailures + 1
	status := cur.Status

	if failures >= DeadAfterFailures {
		status = statusDead
	}

	return Health{Status: status, ConsecutiveFailures: failures}
}

// LinkInput is one link of a product sent by a site or imported.
type LinkInput struct {
	URL   string `json:"url"`
	Store string `json:"store,omitempty"`
}

// ProductInput is the product format of the API and of the import.
type ProductInput struct {
	ExternalID string      `json:"externalId"`
	Name       string      `json:"name,omitempty"`
	PageURL    string      `json:"pageUrl,omitempty"`
	Category   string      `json:"category,omitempty"`
	Links      []LinkInput `json:"links"`
}

// Validate trims the fields and checks every limit; a product without a link
// would redirect every click back to its own page, so it is refused.
func (p *ProductInput) Validate() error {
	p.ExternalID = strings.TrimSpace(p.ExternalID)
	p.Name = strings.TrimSpace(p.Name)
	p.PageURL = strings.TrimSpace(p.PageURL)
	p.Category = strings.TrimSpace(p.Category)

	switch {
	case p.ExternalID == "" || len(p.ExternalID) > 500:
		return errors.New("externalId: 1 to 500 characters")
	case len(p.Name) > 200:
		return fmt.Errorf("%s: name over 200 characters", p.ExternalID)
	case len(p.Category) > 100:
		return fmt.Errorf("%s: category over 100 characters", p.ExternalID)
	case p.PageURL != "" && !IsPublicHTTPURL(p.PageURL):
		return fmt.Errorf("%s: pageUrl must be a public http(s) URL", p.ExternalID)
	case len(p.Links) < 1 || len(p.Links) > MaxLinksPerProduct:
		return fmt.Errorf("%s: 1 to %d links", p.ExternalID, MaxLinksPerProduct)
	}

	for i := range p.Links {
		l := &p.Links[i]
		l.URL = strings.TrimSpace(l.URL)
		l.Store = strings.TrimSpace(l.Store)

		if !IsPublicHTTPURL(l.URL) {
			return fmt.Errorf("%s: link %d must be a public http(s) URL", p.ExternalID, i+1)
		}

		if len(l.Store) > 50 {
			return fmt.Errorf("%s: store over 50 characters", p.ExternalID)
		}
	}

	return nil
}

// legacyRow is a v4 seed.json row.
type legacyRow struct {
	ProductInput
	ID              string `json:"id"`
	MercadoLivreURL string `json:"mercadolivreUrl"`
	AmazonURL       string `json:"amazonUrl"`
	ShopeeURL       string `json:"shopeeUrl"`
}

func (r legacyRow) product() ProductInput {
	p := r.ProductInput
	if p.ExternalID == "" {
		p.ExternalID = r.ID
	}

	for _, u := range []string{r.MercadoLivreURL, r.AmazonURL, r.ShopeeURL} {
		if u = strings.TrimSpace(u); u != "" {
			p.Links = append(p.Links, LinkInput{URL: u})
		}
	}

	return p
}

// ParseImport reads a JSON array (the API format or the v4 seed.json) or a CSV
// with the header externalId,url[,name,pageUrl,category,store], where rows
// sharing an externalId become one product. Every product is validated.
func ParseImport(text string) ([]ProductInput, error) {
	text = strings.TrimSpace(text)

	var rows []ProductInput

	if strings.HasPrefix(text, "[") {
		var raw []legacyRow
		if err := json.Unmarshal([]byte(text), &raw); err != nil {
			return nil, fmt.Errorf("invalid JSON: %w", err)
		}

		for _, r := range raw {
			rows = append(rows, r.product())
		}
	} else {
		var err error
		if rows, err = parseCSV(text); err != nil {
			return nil, err
		}
	}

	if len(rows) > MaxImportProducts {
		return nil, fmt.Errorf("more than %d products", MaxImportProducts)
	}

	for i := range rows {
		if err := rows[i].Validate(); err != nil {
			return nil, err
		}
	}

	return rows, nil
}

func parseCSV(text string) ([]ProductInput, error) {
	if text == "" {
		return nil, nil
	}

	r := csv.NewReader(strings.NewReader(text))
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("invalid CSV: %w", err)
	}

	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}

	cell := func(rec []string, name string) string {
		if i, ok := col[name]; ok && i < len(rec) {
			return strings.TrimSpace(rec[i])
		}

		return ""
	}

	var rows []ProductInput

	index := map[string]int{}

	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}

		if err != nil {
			return nil, fmt.Errorf("invalid CSV: %w", err)
		}

		id := cell(rec, "externalId")
		i, ok := index[id]

		if !ok {
			i = len(rows)
			index[id] = i
			rows = append(rows, ProductInput{
				ExternalID: id, Name: cell(rec, "name"), PageURL: cell(rec, "pageUrl"), Category: cell(rec, "category"),
			})
		}

		if u := cell(rec, "url"); u != "" {
			rows[i].Links = append(rows[i].Links, LinkInput{URL: u, Store: cell(rec, "store")})
		}
	}

	return rows, nil
}

// ImportPlan is what an import still has to write.
type ImportPlan struct {
	Rows            []ProductInput
	SkippedExisting int
	SkippedDead     int
}

// PlanImport drops the links a product already has and the ones that answered
// as dead; a product left without links is dropped too. registered maps an
// externalId to its current URLs.
func PlanImport(rows []ProductInput, registered map[string]map[string]bool, dead map[string]bool) ImportPlan {
	var plan ImportPlan

	for _, row := range rows {
		var keep []LinkInput

		for _, l := range row.Links {
			switch {
			case registered[row.ExternalID][l.URL]:
				plan.SkippedExisting++
			case dead[l.URL]:
				plan.SkippedDead++
			default:
				keep = append(keep, l)
			}
		}

		if len(keep) > 0 {
			row.Links = keep
			plan.Rows = append(plan.Rows, row)
		}
	}

	return plan
}

// NameFromExternalID is the default product name: the last path segment.
func NameFromExternalID(externalID string) string {
	parts := strings.Split(strings.TrimRight(externalID, "/"), "/")
	last := parts[len(parts)-1]

	if name := strings.TrimSpace(strings.NewReplacer("-", " ", "_", " ").Replace(last)); name != "" {
		return name
	}

	return externalID
}

// ClickNotice is one redirected click, for the Telegram message.
type ClickNotice struct {
	Project   string
	Product   string
	At        time.Time
	PageURL   string
	TargetURL string
}

func brasilia(t time.Time) string {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		loc = time.FixedZone("BRT", -3*60*60)
	}

	return t.In(loc).Format("02/01/2006 15:04:05")
}

// ClickMessage is the Telegram text of one redirected click.
func ClickMessage(n ClickNotice) string {
	return strings.Join([]string{
		"🔗 Clique: " + n.Project, brasilia(n.At), n.Product, "Página: " + n.PageURL, "Destino: " + n.TargetURL,
	}, "\n")
}

// ProjectClicks is a project with its click count.
type ProjectClicks struct {
	Name   string
	Clicks int
}

// WeeklyReport is the Telegram text of the weekly report: projects by clicks, then the total.
func WeeklyReport(projects []ProjectClicks, days int) string {
	sorted := slices.Clone(projects)
	slices.SortFunc(sorted, func(a, b ProjectClicks) int {
		if a.Clicks != b.Clicks {
			return b.Clicks - a.Clicks
		}

		return strings.Compare(a.Name, b.Name)
	})

	total := 0
	lines := make([]string, 0, len(sorted))

	for _, p := range sorted {
		total += p.Clicks
		lines = append(lines, fmt.Sprintf("• %s: %d", p.Name, p.Clicks))
	}

	if len(lines) == 0 {
		lines = []string{"Nenhum projeto cadastrado."}
	}

	out := []string{fmt.Sprintf("📊 Cliques nos últimos %d dias", days), ""}
	out = append(out, lines...)

	return strings.Join(append(out, "", fmt.Sprintf("Total: %d", total)), "\n")
}

// Device is the device class stored with a click.
type Device string

// ToDevice maps a user-agent device type to desktop, mobile or tablet.
func ToDevice(isMobile, isTablet bool) Device {
	switch {
	case isTablet:
		return "tablet"
	case isMobile:
		return "mobile"
	default:
		return "desktop"
	}
}

// Status constants reused by the catalog and health packages.
const (
	StatusAlive   = statusAlive
	StatusDead    = statusDead
	StatusUnknown = statusUnknown
)
