// Package accounts wires the administrator login: the session guard and the
// creation of the single admin account. There is no sign-up and no password
// reset by e-mail: the account is managed by the admin:create command.
package accounts

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"

	"github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/auth"
	"github.com/AlexGalhardo/vukem/auth/hash"
	"github.com/AlexGalhardo/vukem/database"
	"github.com/AlexGalhardo/vukem/orm"

	"github.com/AlexGalhardo/vukem-links/app/models"
)

// MinPasswordLength is the shortest admin password accepted.
const MinPasswordLength = 8

// Accounts holds the authentication services.
type Accounts struct {
	DB     *database.DB
	Users  *auth.ORMProvider[models.User]
	Web    *auth.SessionGuard[models.User]
	Hasher hash.Hasher
}

// New builds Accounts from the app.
func New(app *vukem.App) (*Accounts, error) {
	db, err := app.DB()
	if err != nil {
		return nil, fmt.Errorf("opening the database: %w", err)
	}

	hasher := hash.Default()
	if app.Kind == vukem.KindTest {
		hasher = hash.Fake() // fast hashing keeps tests quick
	}

	users := auth.NewORMProvider[models.User](db)
	web := auth.NewSessionGuard("web", users, hasher, auth.NewRememberStore(db))
	web.InsecureCookies = !app.Config.IsProduction() && !strings.HasPrefix(app.Config.URL, "https://")

	return &Accounts{DB: db, Users: users, Web: web, Hasher: hasher}, nil
}

// ErrInvalidAdmin is returned for an unusable e-mail or password.
var ErrInvalidAdmin = errors.New("invalid admin credentials")

// CreateAdmin creates the admin when no account has that e-mail. It never
// changes the password of an existing account, so running it again is safe.
// It reports whether the account was created.
func (a *Accounts) CreateAdmin(ctx context.Context, email, password string) (bool, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	if _, err := mail.ParseAddress(email); err != nil || len(password) < MinPasswordLength {
		return false, fmt.Errorf("%w: a valid e-mail and a password of %d+ characters are required",
			ErrInvalidAdmin, MinPasswordLength)
	}

	exists, err := orm.QueryOf[models.User](a.DB).Where("email", email).Exists(ctx)
	if err != nil {
		return false, err
	}

	if exists {
		return false, nil
	}

	h, err := a.Hasher.Make(password)
	if err != nil {
		return false, fmt.Errorf("hashing the password: %w", err)
	}

	u := models.User{Name: "Admin", Email: email, Password: h}
	if err := orm.Create(ctx, a.DB, &u); err != nil {
		return false, fmt.Errorf("creating the admin: %w", err)
	}

	return true, nil
}
