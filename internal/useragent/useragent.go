// Package useragent classifies a User-Agent header into the device, system and
// browser stored with each click. It is deliberately small: the dashboard
// charts only need the common families, not full version parsing.
package useragent

import (
	"regexp"
	"strings"
)

// Info is what a click records about the visitor's client.
type Info struct {
	// Device is desktop, mobile or tablet.
	Device  string
	OS      string
	Browser string
	IsBot   bool
}

var (
	botRe = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|facebookexternalhit|preview|fetch|headless|` +
		`python-requests|curl/|wget/|httpclient|go-http-client|monitor|lighthouse|pingdom|uptime|telegram|whatsapp|discord`)
	tabletRe      = regexp.MustCompile(`(?i)ipad|tablet|kindle|silk/|playbook`)
	androidRe     = regexp.MustCompile(`(?i)android`)
	mobileTokenRe = regexp.MustCompile(`(?i)mobi`)
	mobileRe      = regexp.MustCompile(`(?i)mobi|iphone|ipod|android|windows phone`)
)

type family struct {
	re   *regexp.Regexp
	name string
}

// Order matters: the first match wins (Edge and Opera also say Chrome).
var (
	systems = []family{ //nolint:gochecknoglobals // read-only table
		{regexp.MustCompile(`(?i)windows phone`), "Windows Phone"},
		{regexp.MustCompile(`(?i)windows`), "Windows"},
		{regexp.MustCompile(`(?i)iphone|ipad|ipod`), "iOS"},
		{regexp.MustCompile(`(?i)android`), "Android"},
		{regexp.MustCompile(`(?i)cros`), "Chrome OS"},
		{regexp.MustCompile(`(?i)mac os x|macintosh`), "macOS"},
		{regexp.MustCompile(`(?i)linux|x11`), "Linux"},
	}
	browsers = []family{ //nolint:gochecknoglobals // read-only table
		{regexp.MustCompile(`(?i)edg(e|a|ios)?/`), "Edge"},
		{regexp.MustCompile(`(?i)opr/|opera`), "Opera"},
		{regexp.MustCompile(`(?i)samsungbrowser`), "Samsung Browser"},
		{regexp.MustCompile(`(?i)firefox/|fxios`), "Firefox"},
		{regexp.MustCompile(`(?i)crios|chrome/|chromium`), "Chrome"},
		{regexp.MustCompile(`(?i)safari/`), "Safari"},
		{regexp.MustCompile(`(?i)msie|trident/`), "IE"},
	}
)

// Parse classifies a User-Agent string.
func Parse(ua string) Info {
	ua = strings.TrimSpace(ua)
	info := Info{Device: "desktop", IsBot: botRe.MatchString(ua)}

	switch {
	case tabletRe.MatchString(ua), androidRe.MatchString(ua) && !mobileTokenRe.MatchString(ua):
		info.Device = "tablet"
	case mobileRe.MatchString(ua):
		info.Device = "mobile"
	}

	info.OS = first(systems, ua)
	info.Browser = first(browsers, ua)

	return info
}

func first(families []family, ua string) string {
	for _, f := range families {
		if f.re.MatchString(ua) {
			return f.name
		}
	}

	return ""
}
