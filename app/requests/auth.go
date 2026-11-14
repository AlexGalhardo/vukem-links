package requests

import "github.com/AlexGalhardo/vukem/z"

// Login is the login form.
type Login struct {
	Email    string `json:"email"    form:"email"`
	Password string `json:"password" form:"password"`
	Remember bool   `json:"remember" form:"remember"`
}

// LoginSchema validates Login.
var LoginSchema = z.Struct[Login](z.Shape{
	"email":    z.String().Trim().Email(),
	"password": z.String().Min(1),
	"remember": z.Bool().Optional(),
})
