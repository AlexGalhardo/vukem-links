// Package deps builds the services the routes and the scheduled jobs share.
// Overrides lets tests swap the outside world (HTTP, Telegram) for fakes.
package deps

import (
	"log/slog"
	"time"

	"github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/httpclient"

	"github.com/AlexGalhardo/vukem-links/internal/catalog"
	"github.com/AlexGalhardo/vukem-links/internal/health"
	"github.com/AlexGalhardo/vukem-links/internal/telegram"
)

// Overrides replace production services; the zero value changes nothing.
type Overrides struct {
	// HTTP is the client of the health probes (default httpclient.Safe, which
	// refuses private addresses).
	HTTP health.Doer
	// Telegram replaces the bot built from the environment.
	Telegram *telegram.Client
}

// Deps are the shared services.
type Deps struct {
	Catalog  *catalog.Service
	Checker  *health.Checker
	Telegram *telegram.Client
	// APIKey is LINKS_API_KEY, the key every site shares.
	APIKey string
	Log    *slog.Logger
}

// New builds the services of app.
func New(app *vukem.App, o Overrides) (*Deps, error) {
	db, err := app.DB()
	if err != nil {
		return nil, err
	}

	bot := o.Telegram
	if bot == nil {
		bot = &telegram.Client{
			Token:  app.Source.Get("TELEGRAM_BOT_HTTP_TOKEN"),
			ChatID: app.Source.Get("TELEGRAM_BOT_CHANNEL_ID"),
			Log:    app.Log,
		}
	}

	doer := o.HTTP
	if doer == nil {
		doer = httpclient.Safe(httpclient.Options{Timeout: 8 * time.Second})
	}

	return &Deps{
		Catalog:  catalog.New(db),
		Checker:  &health.Checker{DB: db, HTTP: doer, Notify: bot},
		Telegram: bot,
		APIKey:   app.Source.Get("LINKS_API_KEY"),
		Log:      app.Log,
	}, nil
}
