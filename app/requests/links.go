package requests

import "github.com/AlexGalhardo/vukem/z"

// ProjectForm creates a project by hand.
type ProjectForm struct {
	Name    string `json:"name"    form:"name"`
	Slug    string `json:"slug"    form:"slug"`
	BaseURL string `json:"baseUrl" form:"baseUrl"`
}

// ProjectSchema validates ProjectForm.
var ProjectSchema = z.Struct[ProjectForm](z.Shape{
	"name":    z.String().Trim().Min(1).Max(80),
	"slug":    z.String().Trim().Min(1).Max(40),
	"baseUrl": z.String().Trim().Min(1).Max(500),
})

// ProductForm adds a product (or links to an existing one).
type ProductForm struct {
	ExternalID string `json:"externalId" form:"externalId"`
	Name       string `json:"name"       form:"name"`
	PageURL    string `json:"pageUrl"    form:"pageUrl"`
	Category   string `json:"category"   form:"category"`
	// URLs are the affiliate links, one per line, in priority order.
	URLs string `json:"urls" form:"urls"`
}

// ProductSchema validates ProductForm; the deeper rules live in rules.ProductInput.
var ProductSchema = z.Struct[ProductForm](z.Shape{
	"externalId": z.String().Trim().Min(1).Max(500),
	"name":       z.String().Trim().Max(200).Optional(),
	"pageUrl":    z.String().Trim().Max(2000).Optional(),
	"category":   z.String().Trim().Max(100).Optional(),
	"urls":       z.String().Min(1).Max(20000),
})

// ImportForm carries the text of a JSON or CSV import.
type ImportForm struct {
	Text string `json:"text" form:"text"`
}

// ImportSchema validates ImportForm.
var ImportSchema = z.Struct[ImportForm](z.Shape{
	"text": z.String().Min(1).Max(16 << 20),
})

// LinkForm edits a link.
type LinkForm struct {
	URL      string `json:"url"      form:"url"`
	Priority int    `json:"priority" form:"priority"`
}

// LinkSchema validates LinkForm.
var LinkSchema = z.Struct[LinkForm](z.Shape{
	"url":      z.String().Trim().Min(1).Max(2000),
	"priority": z.Int().Min(-9999).Max(9999),
})

// IDsForm selects links (the table selection); empty with All checks everything.
type IDsForm struct {
	IDs []int64 `json:"ids" form:"ids"`
	All bool    `json:"all" form:"all"`
}

// IDsSchema validates IDsForm.
var IDsSchema = z.Struct[IDsForm](z.Shape{
	"ids": z.Slice(z.Int64()).Max(500).Optional(),
	"all": z.Bool().Optional(),
})
