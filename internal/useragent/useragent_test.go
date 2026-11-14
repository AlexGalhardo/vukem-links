package useragent_test

import (
	"testing"

	"github.com/AlexGalhardo/vukem-links/internal/useragent"
)

func TestParse(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, ua string
		want     useragent.Info
	}{
		{"chrome windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
			useragent.Info{Device: "desktop", OS: "Windows", Browser: "Chrome"}},
		{"edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
			useragent.Info{Device: "desktop", OS: "Windows", Browser: "Edge"}},
		{"safari iphone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
			useragent.Info{Device: "mobile", OS: "iOS", Browser: "Safari"}},
		{"chrome android phone", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
			useragent.Info{Device: "mobile", OS: "Android", Browser: "Chrome"}},
		{"android tablet", "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
			useragent.Info{Device: "tablet", OS: "Android", Browser: "Chrome"}},
		{"ipad", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
			useragent.Info{Device: "tablet", OS: "iOS", Browser: "Safari"}},
		{"firefox mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:140.0) Gecko/20100101 Firefox/140.0",
			useragent.Info{Device: "desktop", OS: "macOS", Browser: "Firefox"}},
		{"firefox linux", "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
			useragent.Info{Device: "desktop", OS: "Linux", Browser: "Firefox"}},
		{"samsung", "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
			useragent.Info{Device: "mobile", OS: "Android", Browser: "Samsung Browser"}},
		{"googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			useragent.Info{Device: "desktop", IsBot: true}},
		{"curl", "curl/8.5.0", useragent.Info{Device: "desktop", IsBot: true}},
		{"telegram preview", "TelegramBot (like TwitterBot)", useragent.Info{Device: "desktop", IsBot: true}},
		{"empty", "", useragent.Info{Device: "desktop"}},
	}

	for _, c := range cases {
		got := useragent.Parse(c.ua)
		// Bots keep whatever the string says: only the IsBot flag is asserted for them.
		if c.want.IsBot {
			if !got.IsBot {
				t.Errorf("%s: expected a bot", c.name)
			}

			continue
		}

		if got != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}
