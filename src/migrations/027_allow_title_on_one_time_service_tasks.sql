-- Migration: 027_allow_title_on_one_time_service_tasks
-- Purpose: Let a ONE-TIME service task carry its own title.
--
--          Background: a service can be offered at `one_time` frequency (mig 022) —
--          ad-hoc work under a service, with no recurring period. Unlike recurring
--          service tasks (named by their service + period), a one-time service task
--          is a distinct piece of work that needs its OWN name, and a client can
--          have MANY of them for the same service + financial year.
--
--          The "many" part already works: the uniqueness index
--          `idx_tax_tasks_client_service_period_unique` (mig 023) already exempts
--          `frequency = 'one_time'`. The only thing blocking it is the shape CHECK
--          `chk_tax_tasks_shape`, whose service branch forces `title IS NULL` for
--          EVERY service task. This migration splits that branch so:
--            - recurring service task (frequency <> 'one_time') -> title IS NULL   (unchanged)
--            - one-time service task  (frequency  = 'one_time') -> title IS NOT NULL (new)
--            - general task -> unchanged.
--
--          This only widens what's allowed (one-time service tasks may now carry a
--          title); no existing rows change (today no one-time service tasks exist,
--          and every recurring service task still has title NULL). Safe to run.

-- Swap the shape CHECK: drop the old single-branch service rule, add the split one.
ALTER TABLE tax_tasks
    DROP CONSTRAINT IF EXISTS chk_tax_tasks_shape;

ALTER TABLE tax_tasks
    ADD CONSTRAINT chk_tax_tasks_shape CHECK (
        -- Recurring service task: generated from a service + period, labelled by
        -- its service, so it carries NO title.
        (task_type = 'service'
            AND service_id IS NOT NULL
            AND frequency IS NOT NULL
            AND frequency <> 'one_time'
            AND title IS NULL)
        OR
        -- One-time service task: ad-hoc work under a service. It has no recurring
        -- period, so it carries its OWN required title. Many are allowed per
        -- client/service/financial year (the uniqueness index exempts one_time).
        (task_type = 'service'
            AND service_id IS NOT NULL
            AND frequency = 'one_time'
            AND title IS NOT NULL)
        OR
        -- General ad-hoc task: a plain title, no service/frequency/reviewer, and no
        -- period at all. (Unchanged from mig 023.)
        (task_type = 'general'
            AND service_id IS NULL
            AND frequency IS NULL
            AND title IS NOT NULL
            AND reviewer_id IS NULL
            AND quarter = 0 AND month = 0 AND fortnight_half = 0 AND week = 0
            AND period_start_date IS NULL AND period_end_date IS NULL)
    );
