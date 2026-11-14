package routes

import (
	"context"
	"net/http"
	"time"

	vukem "github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/auth"
	"github.com/AlexGalhardo/vukem/inertia"
	"github.com/AlexGalhardo/vukem/middleware"
	"github.com/AlexGalhardo/vukem/ratelimit"
	"github.com/AlexGalhardo/vukem/router"
	"github.com/AlexGalhardo/vukem/web"

	"github.com/AlexGalhardo/vukem-links/app/accounts"
	"github.com/AlexGalhardo/vukem-links/app/controllers"
	"github.com/AlexGalhardo/vukem-links/app/pages"
	"github.com/AlexGalhardo/vukem-links/internal/deps"
	"github.com/AlexGalhardo/vukem-links/resources"
)

// Web registers every route: the public ones the sites call (/link, /health,
// /api/v1/links), the administrator login and the dashboard. vukem route:list
// shows them.
func Web(o deps.Overrides) func(r *router.Router, app *vukem.App) error {
	return func(r *router.Router, app *vukem.App) error {
		d, err := deps.New(app, o)
		if err != nil {
			return err
		}

		acc, err := accounts.New(app)
		if err != nil {
			return err
		}

		// The sites call /link and /api/v1 without a browser session: no
		// cookie is read or set there, and the API authenticates with its key
		// instead of CSRF. /health is open to every origin so a site can ask it
		// before trusting the redirect.
		if err := vukem.DefaultMiddlewareWith(app, r, vukem.MiddlewareOptions{
			SessionBypass: []string{"GET /link", "/api/v1/"},
			CSRFBypass:    []string{"/api/v1/"},
			CrossOrigin: []vukem.CrossOriginRoute{{
				Pattern: "GET /health",
				CORS:    middleware.CORSConfig{AllowedOrigins: []string{"*"}, AllowedMethods: []string{http.MethodGet}},
			}},
		}); err != nil {
			return err
		}

		r.UseServer(middleware.Gzip()) // proxies in front of the app may not compress
		r.UseServer(middleware.StaticFS(resources.Public(), middleware.StaticConfig{Prefix: "/"}))
		r.Use(app.Inertia.Middleware, shareProps(app, acc))

		public := controllers.NewPublic(d)
		r.Get("/link", public.Link).Name("link")
		r.Get("/health", public.Health).Name("health")

		api := controllers.NewAPI(d)
		r.Put("/api/v1/links", api.Sync).Name("api.links.sync")
		r.Post("/api/v1/links", api.Append).Name("api.links.append")

		limiters, err := app.RateLimiters()
		if err != nil {
			return err
		}

		login := controllers.NewAuth(acc)
		guest := auth.Guest(acc.Web)
		required := auth.Required(acc.Web)
		loginIP, loginAccount := auth.ThrottleKeys("email")

		r.Get("/login", login.ShowLogin).Name("login").Use(guest)
		r.Post("/login", login.Login).Use(guest,
			ratelimit.Middleware(limiters("login.ip", 30, time.Minute), ratelimit.ByIP),
			ratelimit.Middleware(limiters("login", 5, time.Minute), loginIP),
			ratelimit.Middleware(limiters("login.account", 20, 10*time.Minute), loginAccount))
		r.Post("/logout", login.Logout).Name("logout").Use(required)

		dash := controllers.NewDashboard(d)

		r.Group("", func(g *router.Group) {
			g.Use(required)

			g.Get("/", dash.Overview).Name("overview")

			g.Get("/links", dash.LinksIndex).Name("links.index")
			g.Post("/links/check", dash.LinksCheck).Name("links.check")
			g.Post("/links/delete", dash.LinksDestroy).Name("links.destroy_many")
			g.Get("/links/{id}", dash.LinkShow).Name("links.show")
			g.Put("/links/{id}", dash.LinkUpdate).Name("links.update")
			g.Delete("/links/{id}", dash.LinkDestroy).Name("links.destroy")
			g.Post("/links/{id}/promote", dash.LinkPromote).Name("links.promote")

			g.Get("/projects", dash.ProjectsIndex).Name("projects.index")
			g.Post("/projects", dash.ProjectStore).Name("projects.store")
			g.Get("/projects/{slug}", dash.ProjectShow).Name("projects.show")
			g.Delete("/projects/{id}", dash.ProjectDestroy).Name("projects.destroy")
			g.Post("/projects/{id}/products", dash.ProductStore).Name("projects.products.store")
			g.Post("/projects/{id}/import", dash.ProjectImport).Name("projects.import")
		})

		return nil
	}
}

// shareProps adds the props every page receives (usePage().props): the app
// name and the signed-in administrator (or null), loaded only when a page renders.
func shareProps(app *vukem.App, acc *accounts.Accounts) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			inertia.Share(r.Context(), "appName", app.Config.Name)

			c := web.NewCtx(w, r, web.ServicesFrom(r.Context()))

			inertia.Share(r.Context(), "auth", func(context.Context) (any, error) {
				u, err := acc.Web.User(c)
				if err != nil {
					return pages.SharedAuth{}, nil //nolint:nilerr // signed out
				}

				return pages.SharedAuth{User: &pages.SharedUser{ID: u.ID, Name: u.Name, Email: u.Email}}, nil
			})

			next.ServeHTTP(w, r)
		})
	}
}
