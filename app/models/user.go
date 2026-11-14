package models

import (
	"strconv"

	"github.com/AlexGalhardo/vukem/orm"
)

// User is the dashboard administrator. There is no sign-up: the account is
// created by the admin:create command.
type User struct {
	orm.Model

	Name           string `json:"name"`
	Email          string `json:"email"`
	Password       string `json:"-"`
	SessionVersion int64  `json:"-"`
}

// AuthID implements auth.Authenticatable.
func (u User) AuthID() string { return strconv.FormatInt(u.ID, 10) }

// AuthPassword implements auth.Authenticatable.
func (u User) AuthPassword() string { return u.Password }

// AuthSessionVersion implements auth.SessionVersioner: sessions logged in
// with another version are signed out.
func (u User) AuthSessionVersion() int64 { return u.SessionVersion }
