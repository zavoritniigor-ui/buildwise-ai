from collections.abc import Iterator
from pathlib import Path

import pgserver
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

API_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def database_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    server = pgserver.get_server(  # type: ignore[attr-defined]
        tmp_path_factory.mktemp("pg"), cleanup_mode="stop"
    )
    try:
        yield server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
    finally:
        server.cleanup()


@pytest.fixture(scope="session")
def alembic_config(database_url: str) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture(scope="session")
def engine(database_url: str, alembic_config: Config) -> Iterator[Engine]:
    command.upgrade(alembic_config, "head")
    engine = create_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """A session whose changes are rolled back after each test."""
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(connection, join_transaction_mode="create_savepoint") as session:
            yield session
        transaction.rollback()
