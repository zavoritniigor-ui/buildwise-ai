import os

from sqlalchemy import Engine, create_engine

DATABASE_URL_ENV = "BUILDWISE_DATABASE_URL"


def database_url() -> str:
    url = os.environ.get(DATABASE_URL_ENV)
    if not url:
        raise RuntimeError(f"{DATABASE_URL_ENV} is not set")
    return url


def make_engine(url: str | None = None) -> Engine:
    return create_engine(url or database_url())
