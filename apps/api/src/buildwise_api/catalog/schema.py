"""Schema of the catalogue data files in `data/`."""

from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Literal, Self

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


class Alternative(_Strict):
    group: str
    number: int = Field(gt=0)


class Rule(_Reviewed):
    slug: str
    category: str | None = None
    assembly: str | None = None
    alternative: Alternative | None = None
    kind: RuleKind
    condition: str
    material_attribute: str | None = None
    min_attribute: str | None = None
    max_attribute: str | None = None
    description: str

    @model_validator(mode="after")
    def _one_scope(self) -> Self:
        if (self.category is None) == (self.assembly is None):
            raise ValueError("a rule needs exactly one of category or assembly")
        return self


class Attribute(_Reviewed):
    key: str
    value: list[str] | Decimal | str
    unit: str | None = None
    note: str | None = None


type Dimension = Literal["width_mm", "length_mm", "thickness_mm", "height_mm"]


class Variant(_Strict):
    sku: str
    package_quantity: Decimal = Field(gt=0)
    package_unit: str
    dimensions: dict[Dimension, Decimal] = {}


class Minimum(_Strict):
    option: str
    min: Decimal = Field(gt=0)
    source: SourceRef


class DerivedOptions(_Strict):
    """Options a variant qualifies for, derived from one of its dimensions.

    A variant gets every option whose minimum its dimension meets or exceeds.
    Example: a 12.5 mm panel may be spot-bonded (9 mm minimum) but not used as
    a countertop (38 mm minimum).
    """

    key: str
    from_dimension: Dimension
    minimums: list[Minimum] = Field(min_length=1)
    status: VerificationStatus
    verified_by: str | None = None
    verified_on: date | None = None

    @model_validator(mode="after")
    def _review_is_complete(self) -> Self:
        verified = self.status is VerificationStatus.HUMAN_VERIFIED
        if verified != (self.verified_by is not None and self.verified_on is not None):
            raise ValueError("human_verified needs verified_by and verified_on, and only then")
        return self

    def options_for(self, variant: Variant) -> list[Minimum]:
        size = variant.dimensions.get(self.from_dimension)
        if size is None:
            return []
        return [m for m in self.minimums if size >= m.min]


class Family(_Strict):
    name: str
    category: str
    attributes: list[Attribute]
    derived_options: list[DerivedOptions] = []
    variants: list[Variant] = Field(min_length=1)
    variants_source: SourceRef


class Assembly(_Strict):
    slug: str
    name: str
    description: str
    attributes: list[Attribute] = Field(min_length=1)


class Manufacturer(_Strict):
    name: str
    brand: str
    """The name shoppers search for in stores, e.g. Schluter."""
    website: HttpUrl


class CatalogFile(_Strict):
    manufacturer: Manufacturer
    documents: list[Document]
    categories: list[Category]
    rules: list[Rule] = []
    assemblies: list[Assembly] = []
    families: list[Family] = []


class ConditionLabel(_Strict):
    label: str
    unit: str | None = None


class Vocabulary(_Strict):
    units: list[str]
    option_attributes: dict[str, str]
    substrate: dict[str, str]
    application: dict[str, str]
    bonding_mortar: dict[str, str]
    mounting: dict[str, str]
    subfloor: dict[str, str]
    subfloor_edge: dict[str, str]
    joist_type: dict[str, str]
    shower_base: dict[str, str]
    floor_waterproofing: dict[str, str]
    tile_material: dict[str, str]
    uncoupling_membrane: dict[str, str]
    drain_system: dict[str, str]
    pipe_connection: dict[str, str]
    waste_pipe_size: dict[str, str]
    country: dict[str, str]
    conditions: dict[str, ConditionLabel]
    attributes: dict[str, str]
    values: dict[str, str]

    def options(self, name: str) -> dict[str, str]:
        values: dict[str, str] = getattr(self, name)
        return values


BuildupRole = Literal[
    "structure",
    "substrate",
    "underlayment",
    "membrane",
    "drain",
    "mortar",
    "covering",
    "grout",
    "finish",
]


class Layer(_Strict):
    role: BuildupRole
    label: str
    material: str | None = None
    source: SourceRef | None = None


class Buildup(_Strict):
    id: str
    title: str
    summary: str
    layers: list[Layer] = Field(min_length=1)


class BuildupFile(_Strict):
    buildups: list[Buildup] = Field(min_length=1)
    surfaces: dict[str, dict[str, str]]


def load_buildups(data_dir: Path) -> BuildupFile:
    return BuildupFile.model_validate(read_yaml(data_dir / "buildups.yaml"))


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
