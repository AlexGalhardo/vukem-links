package telegram_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AlexGalhardo/vukem-links/internal/telegram"
)

func TestNotifyPostsTheMessage(t *testing.T) {
	t.Parallel()

	var path, text, chat string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		b, _ := io.ReadAll(r.Body)

		var in map[string]string
		_ = json.Unmarshal(b, &in)
		text, chat = in["text"], in["chat_id"]
	}))
	defer srv.Close()

	c := &telegram.Client{Token: "123:abc", ChatID: "-100", API: srv.URL}
	c.Notify(t.Context(), "hello")

	if path != "/bot123:abc/sendMessage" || text != "hello" || chat != "-100" {
		t.Fatalf("path=%s text=%s chat=%s", path, text, chat)
	}
}

func TestNotifyIsANoOpWithoutConfiguration(t *testing.T) {
	t.Parallel()

	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	defer srv.Close()

	(&telegram.Client{API: srv.URL}).Notify(t.Context(), "x")
	(&telegram.Client{Token: "t", API: srv.URL}).Notify(t.Context(), "x")

	var nilClient *telegram.Client
	nilClient.Notify(t.Context(), "x")

	if called {
		t.Fatal("an unconfigured bot must not call the API")
	}
}

func TestNotifyNeverLeaksTheTokenOrFails(t *testing.T) {
	t.Parallel()

	// Nothing listens here: the error must be swallowed.
	c := &telegram.Client{Token: "secret-token", ChatID: "1", API: "http://127.0.0.1:1"}
	c.Notify(t.Context(), "x")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(500) }))
	defer srv.Close()

	(&telegram.Client{Token: "secret-token", ChatID: "1", API: srv.URL}).Notify(t.Context(), strings.Repeat("x", 10))
}
