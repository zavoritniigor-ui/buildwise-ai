"""product attribute: set-valued options

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "product_attribute"
VALUE_PRESENT = op.f("ck_product_attribute_value_present")
OPTIONS_NOT_EMPTY = op.f("ck_product_attribute_options_not_empty")


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("value_options", postgresql.ARRAY(sa.String(100))))
    op.drop_constraint(VALUE_PRESENT, TABLE, type_="check")
    op.create_check_constraint(
        VALUE_PRESENT, TABLE, "num_nonnulls(value_text, value_num, value_options) = 1"
    )
    op.create_check_constraint(
        OPTIONS_NOT_EMPTY, TABLE, "value_options IS NULL OR cardinality(value_options) > 0"
    )


def downgrade() -> None:
    op.drop_constraint(OPTIONS_NOT_EMPTY, TABLE, type_="check")
    op.drop_constraint(VALUE_PRESENT, TABLE, type_="check")
    op.execute(f"DELETE FROM {TABLE} WHERE value_text IS NULL AND value_num IS NULL")  # noqa: S608
    op.create_check_constraint(
        VALUE_PRESENT, TABLE, "value_text IS NOT NULL OR value_num IS NOT NULL"
    )
    op.drop_column(TABLE, "value_options")
