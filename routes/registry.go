package routes

import (
	"github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/router"

	"github.com/AlexGalhardo/vukem-links/internal/deps"
)

// All lists the route files, in order; vukem install:* appends here.
func All(o deps.Overrides) []func(r *router.Router, app *vukem.App) error {
	return []func(r *router.Router, app *vukem.App) error{
		Web(o),
	}
}
