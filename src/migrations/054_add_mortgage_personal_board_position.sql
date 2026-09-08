-- Migration 054: the fourth board.
--
-- Migration 053 gave board_position to the three task tables that were known to
-- render a Kanban board. mortgage_personal_tasks renders one too and was missed,
-- which would have left three boards reorderable and one not - worse than none.
-- Same shape and same reasoning as 053: nullable, so a column nobody has dragged
-- keeps exactly the order it has today.

ALTER TABLE mortgage_personal_tasks ADD COLUMN IF NOT EXISTS board_position DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_mortgage_personal_tasks_board_order
    ON mortgage_personal_tasks (status, board_position)
    WHERE is_deleted = FALSE;
