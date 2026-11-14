package migrations

import "github.com/AlexGalhardo/vukem/schema"

func m20261114200000CreateUsersTable() schema.Migration {
	return schema.Migration{
		ID: "20261114200000_create_users_table",
		Up: func(s *schema.Schema) error {
			if err := s.Create("users", func(t *schema.Table) {
				t.ID()
				t.String("name")
				t.String("email").Unique()
				t.String("password")
				// Bumped to end every session of the user.
				t.BigInteger("session_version").Default(0)
				t.Timestamps()
			}); err != nil {
				return err
			}

			// Remember-me tokens of vukem/auth: only SHA-256 hashes are stored.
			return s.Create("remember_tokens", func(t *schema.Table) {
				t.String("id").Unique()
				t.String("user_id").Index()
				t.String("hash")
				t.Timestamp("expires_at")
			})
		},
		Down: func(s *schema.Schema) error {
			if err := s.DropIfExists("remember_tokens"); err != nil {
				return err
			}

			return s.DropIfExists("users")
		},
	}
}
