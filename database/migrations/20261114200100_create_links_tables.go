package migrations

import "github.com/AlexGalhardo/vukem/schema"

func m20261114200100CreateLinksTables() schema.Migration {
	return schema.Migration{
		ID: "20261114200100_create_links_tables",
		Up: func(s *schema.Schema) error {
			steps := []func() error{
				func() error {
					return s.Create("projects", func(t *schema.Table) {
						t.ID()
						t.String("name")
						t.String("slug").Unique()
						t.String("base_url")
						t.Timestamps()
					})
				},
				func() error {
					return s.Create("products", func(t *schema.Table) {
						t.ID()
						t.ForeignID("project_id").Constrained("projects").CascadeOnDelete().Index()
						// The public identifier of /link?id=.
						t.String("external_id", 500).Unique()
						t.String("name")
						t.Text("page_url")
						t.String("category").Nullable()
						t.Timestamps()
					})
				},
				func() error {
					return s.Create("affiliate_links", func(t *schema.Table) {
						t.ID()
						t.ForeignID("product_id").Constrained("products").CascadeOnDelete().Index()
						t.String("store")
						t.Text("url")
						t.Integer("priority").Default(0)
						t.String("status").Default("unknown")
						t.Integer("consecutive_failures").Default(0)
						t.Timestamp("last_checked_at").Nullable()
						t.Integer("last_status_code").Nullable()
						t.Text("final_url").Nullable()
						// Clicks counted before per-click events existed.
						t.Integer("legacy_clicks").Default(0)
						t.Timestamps()
					})
				},
				func() error {
					return s.Create("click_events", func(t *schema.Table) {
						t.ID()
						t.ForeignID("product_id").Constrained("products").CascadeOnDelete().Index()
						// Null: no usable link, the visitor went back to the product page.
						t.ForeignID("link_id").Nullable().Constrained("affiliate_links").CascadeOnDelete().Index()
						t.String("device")
						t.String("os").Nullable()
						t.String("browser").Nullable()
						t.String("country").Nullable()
						t.Text("referer").Nullable()
						t.Boolean("is_bot").Default(false)
						t.Timestamps()
						t.Index("created_at")
					})
				},
				func() error {
					return s.Create("link_checks", func(t *schema.Table) {
						t.ID()
						t.ForeignID("link_id").Constrained("affiliate_links").CascadeOnDelete().Index()
						t.Integer("status_code").Nullable()
						t.Text("final_url").Nullable()
						t.String("result")
						t.Timestamps()
					})
				},
			}
			for _, step := range steps {
				if err := step(); err != nil {
					return err
				}
			}

			return nil
		},
		Down: func(s *schema.Schema) error {
			for _, table := range []string{"link_checks", "click_events", "affiliate_links", "products", "projects"} {
				if err := s.DropIfExists(table); err != nil {
					return err
				}
			}

			return nil
		},
	}
}
