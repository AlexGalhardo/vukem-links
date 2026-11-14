// Package bootstrap wires the application together. There is no hidden
// registration: everything the app uses is listed here.
package bootstrap

import (
	"reflect"

	vukem "github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/inertia"

	"github.com/AlexGalhardo/vukem-links/app/jobs"
	"github.com/AlexGalhardo/vukem-links/app/listeners"
	"github.com/AlexGalhardo/vukem-links/app/pages"
	"github.com/AlexGalhardo/vukem-links/database/migrations"
	"github.com/AlexGalhardo/vukem-links/database/seeders"
	"github.com/AlexGalhardo/vukem-links/resources"
	"github.com/AlexGalhardo/vukem-links/routes"
)

// New builds the application; cmd/app and the tests call it.
func New(opts ...vukem.Option) (*vukem.App, error) {
	base := []vukem.Option{
		vukem.WithName("vukem-links"),
		vukem.WithProviders(Providers()...),
		vukem.WithMigrations(migrations.All()),
		vukem.WithSeeders(seeders.All()...),
		vukem.WithBench(Bench()...),
		vukem.WithListeners(listeners.All()...),
		vukem.WithJobsFunc(jobs.All),
		vukem.WithSchedule(routes.Schedule),
		vukem.WithViews(resources.Views()),
		vukem.WithVite(resources.Public()),
		vukem.WithInertia(inertia.Config{Pages: pages.All(), SharedType: reflect.TypeFor[pages.Shared]()}),
	}

	for _, fn := range routes.All() {
		base = append(base, vukem.WithRoutes(fn))
	}

	app, err := vukem.New(append(base, opts...)...)
	if err != nil {
		return nil, err
	}

	app.AddCommand(Commands()...)

	return app, nil
}
