package routes

import (
	"context"
	"fmt"
	"time"

	"github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/schedule"

	"github.com/AlexGalhardo/vukem-links/internal/deps"
	"github.com/AlexGalhardo/vukem-links/internal/rules"
)

// weeklyReportDays is the window of the weekly click report.
const weeklyReportDays = 7

// Schedule declares the scheduled tasks. "vukem serve" runs them in process;
// with SCHEDULE_IN_SERVE=false run "vukem schedule:work" or a cron entry
// calling "vukem schedule:run" every minute instead. List them with
// "vukem schedule:list". Tasks must honor ctx: on shutdown it is cancelled
// after SHUTDOWN_TIMEOUT.
func Schedule(o deps.Overrides) func(s *schedule.Schedule, app *vukem.App) {
	return func(s *schedule.Schedule, app *vukem.App) {
		// Each run lazily builds its services, so a database that is not
		// ready yet fails the run (logged by the scheduler), not the boot.
		s.Func("links:health", func(ctx context.Context) error {
			d, err := deps.New(app, o)
			if err != nil {
				return err
			}

			sum, err := d.Checker.Check(ctx, nil)
			d.Log.InfoContext(ctx, "health check", "checked", sum.Checked, "ok", sum.OK, "failed", sum.Failed,
				"inconclusive", sum.Inconclusive, "died", sum.Died)

			return err
		}).Hourly().WithoutOverlapping()

		// Sunday 17:00 in Brasília: clicks per project over the last 7 days.
		s.Func("links:weekly-report", func(ctx context.Context) error {
			d, err := deps.New(app, o)
			if err != nil {
				return err
			}

			projects, err := d.Catalog.ClicksByProject(ctx, weeklyReportDays)
			if err != nil {
				return fmt.Errorf("counting clicks by project: %w", err)
			}

			d.Telegram.Notify(ctx, rules.WeeklyReport(projects, weeklyReportDays))

			return nil
		}).WeeklyOn(time.Sunday, "17:00").In(brasilia()).WithoutOverlapping()
	}
}

func brasilia() *time.Location {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return time.FixedZone("BRT", -3*60*60)
	}

	return loc
}
