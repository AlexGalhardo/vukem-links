package models

import "github.com/AlexGalhardo/vukem/orm"

// Link health states. Unknown (never checked) is usable: a new link must
// redirect before its first check.
const (
	StatusAlive   = "alive"
	StatusDead    = "dead"
	StatusUnknown = "unknown"
)

// Project is an application where the affiliate links appear (a site).
type Project struct {
	orm.Model

	Name    string `json:"name"`
	Slug    string `json:"slug"`
	BaseURL string `json:"base_url" db:"base_url"`
}

// Product is a product page of a project. ExternalID is the public
// identifier of /link?id=: it is unique across every project.
type Product struct {
	orm.Model

	ProjectID  int64   `json:"project_id" db:"project_id"`
	ExternalID string  `json:"external_id" db:"external_id"`
	Name       string  `json:"name"`
	PageURL    string  `json:"page_url" db:"page_url"`
	Category   *string `json:"category"`
}

// AffiliateLink is one affiliate URL of a product. Lower Priority wins.
type AffiliateLink struct {
	orm.Model

	ProductID           int64        `json:"product_id" db:"product_id"`
	Store               string       `json:"store"`
	URL                 string       `json:"url"`
	Priority            int          `json:"priority"`
	Status              string       `json:"status"`
	ConsecutiveFailures int          `json:"consecutive_failures" db:"consecutive_failures"`
	LastCheckedAt       orm.NullTime `json:"last_checked_at" db:"last_checked_at"`
	LastStatusCode      *int         `json:"last_status_code" db:"last_status_code"`
	FinalURL            *string      `json:"final_url" db:"final_url"`
	// LegacyClicks are clicks counted before per-click events existed.
	LegacyClicks int `json:"legacy_clicks" db:"legacy_clicks"`
}

// ClickEvent is one click on /link. LinkID is nil when the product had no
// usable link and the visitor went back to the product page.
type ClickEvent struct {
	orm.Model

	ProductID int64   `json:"product_id" db:"product_id"`
	LinkID    *int64  `json:"link_id" db:"link_id"`
	Device    string  `json:"device"`
	OS        *string `json:"os" db:"os"`
	Browser   *string `json:"browser"`
	Country   *string `json:"country"`
	Referer   *string `json:"referer"`
	IsBot     bool    `json:"is_bot" db:"is_bot"`
}

// LinkCheck is the outcome of one health check; CreatedAt is the check time.
type LinkCheck struct {
	orm.Model

	LinkID     int64   `json:"link_id" db:"link_id"`
	StatusCode *int    `json:"status_code" db:"status_code"`
	FinalURL   *string `json:"final_url" db:"final_url"`
	Result     string  `json:"result"`
}
