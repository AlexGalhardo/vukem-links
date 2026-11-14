package controllers

import (
	"strings"

	"github.com/AlexGalhardo/vukem/auth"
	"github.com/AlexGalhardo/vukem/inertia"
	"github.com/AlexGalhardo/vukem/web"

	"github.com/AlexGalhardo/vukem-links/app/accounts"
	"github.com/AlexGalhardo/vukem-links/app/pages"
	"github.com/AlexGalhardo/vukem-links/app/requests"
)

// Auth serves the administrator login.
type Auth struct {
	a *accounts.Accounts
}

// NewAuth returns the login handlers.
func NewAuth(a *accounts.Accounts) *Auth { return &Auth{a: a} }

// ShowLogin renders the login page.
func (*Auth) ShowLogin(c *web.Ctx) error { return pages.Login.Render(c, struct{}{}) }

// Login signs the administrator in and goes to the page they wanted.
func (h *Auth) Login(c *web.Ctx) error {
	in, err := web.Parse(c, requests.LoginSchema)
	if err != nil {
		return err
	}

	creds := map[string]string{"email": strings.ToLower(in.Email), "password": in.Password}

	u, err := h.a.Web.Validate(c, creds)
	if err != nil {
		return err
	}

	if err := h.a.Web.Login(c, u, auth.Remember(in.Remember)); err != nil {
		return err
	}

	target, _ := c.Session().Pull(auth.IntendedKey).(string)

	return c.Redirect(web.SafeRedirect(c.Request(), target, "/"))
}

// Logout signs the administrator out and rotates the history encryption key.
func (h *Auth) Logout(c *web.Ctx) error {
	if err := h.a.Web.Logout(c); err != nil {
		return err
	}

	inertia.ClearHistory(c)

	return c.Redirect("/login")
}
