-- Migration 053: manual card order inside a Kanban board column.
--
-- Adds a nullable `board_position` to each of the three task tables that render a
-- board. NULL means "never dragged", and every board query orders
--   ORDER BY board_position ASC NULLS LAST, <the table's existing sort>
-- so a column that nobody has touched keeps EXACTLY the order it has today. That
-- is what makes this safe to deploy against live data: adding the column changes
-- nothing a user can see until someone actually drags a card.
--
-- Ordering is SHARED, not per member: it lives on the task itself, so the order
-- one person arranges is the order everyone sees - the same way a status change
-- made on the board is what everyone sees.
--
-- DOUBLE PRECISION, not an integer, because cards are inserted BETWEEN their
-- neighbours: dropping between positions 1000 and 2000 stores 1500, and only the
-- dragged row is written. Renumbering the whole column instead is not an option -
-- a board column is an independently paginated infinite list, so the client
-- usually holds only the first page and cannot be trusted to restate the order of
-- rows it has never loaded. The service renumbers a column (spacing 1000) when it
-- first needs positions there, and again on the rare occasion a gap closes past
-- the precision a midpoint can split.
--
-- Positions are only ever compared WITHIN one status column. There is no meaning
-- to comparing a position across two different statuses.

ALTER TABLE tax_tasks           ADD COLUMN IF NOT EXISTS board_position DOUBLE PRECISION;
ALTER TABLE tax_personal_tasks  ADD COLUMN IF NOT EXISTS board_position DOUBLE PRECISION;
ALTER TABLE mortgage_tasks      ADD COLUMN IF NOT EXISTS board_position DOUBLE PRECISION;

-- The board reads one status column at a time and orders by position, so the
-- useful index is (status, board_position) over live rows only. Partial, to match
-- every other index in this schema.
CREATE INDEX IF NOT EXISTS idx_tax_tasks_board_order
    ON tax_tasks (status, board_position)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_tax_personal_tasks_board_order
    ON tax_personal_tasks (status, board_position)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mortgage_tasks_board_order
    ON mortgage_tasks (status, board_position)
    WHERE is_deleted = FALSE;
