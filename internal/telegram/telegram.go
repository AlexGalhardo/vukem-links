// Package telegram sends the best-effort alerts of the dashboard.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const defaultAPI = "https://api.telegram.org"

// Client posts messages to a Telegram chat. The zero token or chat disables it.
type Client struct {
	Token  string
	ChatID string
	// API is the base URL of the Telegram API (tests point it elsewhere).
	API  string
	HTTP *http.Client
	Log  *slog.Logger
}

// Enabled reports whether the bot is configured.
func (c *Client) Enabled() bool { return c != nil && c.Token != "" && c.ChatID != "" }

// Notify sends message. It is a no-op when the bot is not configured and
// never returns an error into the caller: an alert must not break a request.
func (c *Client) Notify(ctx context.Context, message string) {
	if !c.Enabled() {
		return
	}

	if err := c.send(ctx, message); err != nil {
		log := c.Log
		if log == nil {
			log = slog.Default()
		}

		// The error never carries the token: send builds messages without the URL.
		log.WarnContext(ctx, "telegram notify failed", "err", err)
	}
}

func (c *Client) send(ctx context.Context, message string) error {
	api := c.API
	if api == "" {
		api = defaultAPI
	}

	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}

	body, err := json.Marshal(map[string]string{"chat_id": c.ChatID, "text": message})
	if err != nil {
		return fmt.Errorf("encoding message: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, api+"/bot"+c.Token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	res, err := client.Do(req)
	if err != nil {
		// url.Error would echo the URL, which holds the token.
		return fmt.Errorf("request failed: %s", redact(err, c.Token))
	}

	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))

	if res.StatusCode >= 300 {
		return fmt.Errorf("telegram answered %d", res.StatusCode)
	}

	return nil
}

func redact(err error, token string) string {
	msg := err.Error()
	if token == "" {
		return msg
	}

	return string(bytes.ReplaceAll([]byte(msg), []byte(token), []byte("***")))
}
