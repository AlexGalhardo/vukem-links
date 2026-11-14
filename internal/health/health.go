// Package health answers "does the affiliate link still exist?": it probes
// links over HTTP, records every check and moves each link between alive,
// dead and unknown (rules.NextHealth).
package health

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/AlexGalhardo/vukem/database"
	"github.com/AlexGalhardo/vukem/orm"

	"github.com/AlexGalhardo/vukem-links/app/models"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

const (
	probeTimeout = 8 * time.Second
	concurrency  = 20
	// DefaultBatch is how many links one scheduled run checks (least recently
	// checked first), so a sweep of N links takes N/DefaultBatch hourly runs.
	DefaultBatch = 400
	maxDeadList  = 30
)

// Stores serve bot-looking clients a 403; a browser UA gets the real redirect chain.
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/140.0.0.0 Safari/537.36"

// Doer is the HTTP client the probes use: httpclient.Safe in production, a
// fake transport in tests.
type Doer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Notifier receives the alerts (Telegram).
type Notifier interface {
	Notify(ctx context.Context, message string)
}

// Checker runs the health checks.
type Checker struct {
	DB     *database.DB
	HTTP   Doer
	Notify Notifier
	// Batch overrides DefaultBatch.
	Batch int
}

// Summary counts the outcome of a run.
type Summary struct {
	Checked      int `json:"checked"`
	OK           int `json:"ok"`
	Failed       int `json:"failed"`
	Inconclusive int `json:"inconclusive"`
	// Died are the links that became dead during this run.
	Died int `json:"died"`
}

// Probe fetches the URL following redirects and reports what happened.
func (c *Checker) Probe(ctx context.Context, rawURL string) rules.Probe {
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return rules.Probe{}
	}

	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,*/*")

	res, err := c.HTTP.Do(req)
	if err != nil {
		var netErr net.Error

		return rules.Probe{TimedOut: errors.Is(err, context.DeadlineExceeded) ||
			(errors.As(err, &netErr) && netErr.Timeout())}
	}

	defer func() { _ = res.Body.Close() }()

	final := rawURL
	if res.Request != nil && res.Request.URL != nil {
		final = res.Request.URL.String()
	}

	return rules.Probe{StatusCode: res.StatusCode, FinalURL: final}
}

// IsSiteLive tells whether a project's site answers: any response below 500
// proves DNS and server are up. Links only exist for a site that is online.
func (c *Checker) IsSiteLive(ctx context.Context, baseURL string) bool {
	p := c.Probe(ctx, baseURL)

	return p.StatusCode != 0 && p.StatusCode < 500
}

// FindDeadURLs returns the URLs that answered as broken. Blocked or timed-out
// probes are not counted as dead.
func (c *Checker) FindDeadURLs(ctx context.Context, urls []string) map[string]bool {
	var (
		mu   sync.Mutex
		dead = map[string]bool{}
	)

	unique := map[string]bool{}
	queue := make(chan string)

	var wg sync.WaitGroup

	for range concurrency {
		wg.Go(func() {
			for u := range queue {
				if rules.ClassifyProbe(u, c.Probe(ctx, u)) == rules.CheckFailed {
					mu.Lock()
					dead[u] = true
					mu.Unlock()
				}
			}
		})
	}

	for _, u := range urls {
		if !unique[u] {
			unique[u] = true
			queue <- u
		}
	}

	close(queue)
	wg.Wait()

	return dead
}

type target struct {
	link        models.AffiliateLink
	productName string
}

func (c *Checker) targets(ctx context.Context, ids []int64, limit int) ([]target, error) {
	q := orm.QueryOf[models.AffiliateLink](c.DB)

	if ids != nil {
		anyIDs := make([]any, len(ids))
		for i, id := range ids {
			anyIDs[i] = id
		}

		q = q.WhereIn("id", anyIDs...)
	} else {
		batch := c.Batch
		if batch <= 0 {
			batch = DefaultBatch
		}

		if limit > 0 {
			batch = min(batch, limit)
		}

		// NULL (never checked) sorts first in ascending order.
		q = q.OrderBy("last_checked_at", orm.Asc).Limit(batch)
	}

	links, err := q.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("loading links to check: %w", err)
	}

	names := map[int64]string{}

	out := make([]target, len(links))

	for i, l := range links {
		if _, ok := names[l.ProductID]; !ok {
			p, err := orm.QueryOf[models.Product](c.DB).Find(ctx, l.ProductID)
			if err != nil {
				return nil, fmt.Errorf("loading product %d: %w", l.ProductID, err)
			}

			names[l.ProductID] = p.Name
		}

		out[i] = target{link: l, productName: names[l.ProductID]}
	}

	return out, nil
}

// Check probes the given links, or the Batch least recently checked ones when
// ids is nil, records each check and alerts when links die.
func (c *Checker) Check(ctx context.Context, ids []int64) (Summary, error) {
	return c.run(ctx, ids, 0)
}

// run is Check with a cap on the batch, so CheckAll's last batch does not
// probe links it already checked.
func (c *Checker) run(ctx context.Context, ids []int64, limit int) (Summary, error) {
	targets, err := c.targets(ctx, ids, limit)
	if err != nil {
		return Summary{}, err
	}

	var (
		mu       sync.Mutex
		sum      Summary
		died     []string
		firstErr error
	)

	queue := make(chan target)

	var wg sync.WaitGroup

	for range concurrency {
		wg.Go(func() {
			for t := range queue {
				outcome, died1, err := c.checkOne(ctx, t.link)

				mu.Lock()

				if err != nil && firstErr == nil {
					firstErr = err
				}

				sum.Checked++

				switch outcome {
				case rules.CheckOK:
					sum.OK++
				case rules.CheckFailed:
					sum.Failed++
				case rules.CheckInconclusive:
					sum.Inconclusive++
				}

				if died1 {
					died = append(died, fmt.Sprintf("%s (%s): %s", t.productName, t.link.Store, t.link.URL))
				}

				mu.Unlock()
			}
		})
	}

	for _, t := range targets {
		queue <- t
	}

	close(queue)
	wg.Wait()

	sum.Died = len(died)

	if len(died) > 0 && c.Notify != nil {
		list := died[:min(len(died), maxDeadList)]
		c.Notify.Notify(ctx, fmt.Sprintf("🚨 %d link(s) de afiliado morto(s):\n\n%s", len(died), strings.Join(list, "\n")))
	}

	return sum, firstErr
}

func (c *Checker) checkOne(ctx context.Context, link models.AffiliateLink) (rules.CheckResult, bool, error) {
	probe := c.Probe(ctx, link.URL)
	outcome := rules.ClassifyProbe(link.URL, probe)
	next := rules.NextHealth(rules.Health{Status: link.Status, ConsecutiveFailures: link.ConsecutiveFailures}, outcome)

	check := models.LinkCheck{LinkID: link.ID, Result: string(outcome)}
	if probe.StatusCode != 0 {
		check.StatusCode = &probe.StatusCode
	}

	if probe.FinalURL != "" {
		check.FinalURL = &probe.FinalURL
	}

	if err := orm.Create(ctx, c.DB, &check); err != nil {
		return outcome, false, fmt.Errorf("recording check of link %d: %w", link.ID, err)
	}

	wasDead := link.Status == models.StatusDead
	link.Status, link.ConsecutiveFailures = next.Status, next.ConsecutiveFailures
	link.LastCheckedAt = orm.NullTime{}
	link.LastCheckedAt.V, link.LastCheckedAt.Valid = time.Now().UTC(), true
	link.LastStatusCode, link.FinalURL = check.StatusCode, check.FinalURL

	if err := orm.UpdateOnly(ctx, c.DB, &link, "status", "consecutive_failures", "last_checked_at",
		"last_status_code", "final_url"); err != nil {
		return outcome, false, fmt.Errorf("updating link %d: %w", link.ID, err)
	}

	return outcome, next.Status == models.StatusDead && !wasDead, nil
}

// CheckAll checks every link: it repeats the batch run, least recently
// checked first, until as many links were checked as exist.
func (c *Checker) CheckAll(ctx context.Context) (Summary, error) {
	total, err := orm.QueryOf[models.AffiliateLink](c.DB).Count(ctx)
	if err != nil {
		return Summary{}, fmt.Errorf("counting links: %w", err)
	}

	var sum Summary

	for sum.Checked < int(total) {
		part, err := c.run(ctx, nil, int(total)-sum.Checked)

		sum.Checked += part.Checked
		sum.OK += part.OK
		sum.Failed += part.Failed
		sum.Inconclusive += part.Inconclusive
		sum.Died += part.Died

		if err != nil {
			return sum, err
		}

		if part.Checked == 0 {
			break
		}
	}

	return sum, nil
}
