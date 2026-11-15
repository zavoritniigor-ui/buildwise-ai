from alembic import context

from buildwise_api.db.models import Base
from buildwise_api.db.session import make_engine

target_metadata = Base.metadata


def run_migrations() -> None:
    engine = make_engine(context.config.get_main_option("sqlalchemy.url"))
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
