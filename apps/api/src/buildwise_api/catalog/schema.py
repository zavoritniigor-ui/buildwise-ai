"""Schema of the catalogue data files in `data/`."""

from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from buildwise_api.db.models import DocumentType, RuleKind, VerificationStatus


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SourceRef(_Strict):
    document: str
    page: int = Field(gt=0)


class Document(_Strict):
    id: str
    type: DocumentType
    title: str
    url: HttpUrl
    version: str
    pages: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    retrieved_on: date


class Category(_Strict):
    slug: str
    name: str


class _Reviewed(_Strict):
    source: SourceRef
    status: VerificationStatus
    verified_by: str | None = None
    verified_on: date | None = None

    @model_validator(mode="after")
    def _review_is_complete(self) -> Self:
        verified = self.status is VerificationStatus.HUMAN_VERIFIED
        if verified != (self.verified_by is not None and self.verified_on is not None):
            raise ValueError("human_verified needs verified_by and verified_on, and only then")
        return self


class Rule(_Reviewed):
    slug: str
    category: str
    kind: RuleKind
    condition: str
    material_attribute: str | None = None
    min_attribute: str | None = None
    max_attribute: str | None = None
    description: str


class Attribute(_Reviewed):
    key: str
    value: list[str] | Decimal | str
    unit: str | None = None
    note: str | None = None


class Variant(_Strict):
    sku: str
    package_quantity: Decimal = Field(gt=0)
    package_unit: str
    width_mm: Decimal | None = None


class Family(_Strict):
    name: str
    category: str
    attributes: list[Attribute]
    variants: list[Variant] = Field(min_length=1)
    variants_source: SourceRef


class Manufacturer(_Strict):
    name: str
    website: HttpUrl


class CatalogFile(_Strict):
    manufacturer: Manufacturer
    documents: list[Document]
    categories: list[Category]
    rules: list[Rule] = []
    families: list[Family]


class Vocabulary(_Strict):
    units: list[str]
    option_attributes: dict[str, str]
    substrate: dict[str, str]
    application: dict[str, str]
    bonding_mortar: dict[str, str]

    def options(self, name: str) -> dict[str, str]:
        values: dict[str, str] = getattr(self, name)
        return values


def read_yaml(path: Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_vocabulary(data_dir: Path) -> Vocabulary:
    return Vocabulary.model_validate(read_yaml(data_dir / "vocabulary.yaml"))


def load_catalog_files(data_dir: Path) -> dict[Path, CatalogFile]:
    return {
        path: CatalogFile.model_validate(read_yaml(path))
        for path in sorted((data_dir / "catalog").glob("*.yaml"))
    }
