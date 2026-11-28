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


class Package(_Strict):
    size: Decimal = Field(gt=0)
    kind: Literal["bag", "roll", "box", "pail", "can", "sheet", "coil", "length"]


class Quantity(_Strict):
    """How much of a layer's material one surface needs."""

    per: Literal["area", "perimeter", "each"]
    amount: Decimal = Field(gt=0)
    unit: Literal["kg", "m2", "m", "L", "pcs"]
    waste: Decimal = Field(default=Decimal(0), ge=0, lt=1)
    basis: Literal["manufacturer", "geometry", "estimate"]
    source: SourceRef | None = None
    package: Package | None = None
    search: str = Field(min_length=2)

    @model_validator(mode="after")
    def _manufacturer_is_cited(self) -> Self:
        if self.basis == "manufacturer" and self.source is None:
            raise ValueError("a manufacturer rate must cite its document and page")
        return self


class Layer(_Strict):
    role: BuildupRole
    label: str
    material: str | None = None
    source: SourceRef | None = None
    quantity: Quantity | None = None
    slot: str | None = None
    """A product slot (products.yaml): the person may swap this layer's product."""


class Buildup(_Strict):
    id: str
    title: str
    summary: str
    layers: list[Layer] = Field(min_length=1)


class BuildupFile(_Strict):
    buildups: list[Buildup] = Field(min_length=1)
    surfaces: dict[str, dict[str, list[str]]]
    """room -> surface -> build-ups offered as technologies; the first is the default."""

    @model_validator(mode="after")
    def _every_surface_offers_one(self) -> Self:
        for room, surfaces in self.surfaces.items():
            for surface, options in surfaces.items():
                if not options or len(set(options)) != len(options):
                    raise ValueError(f"{room}.{surface} needs distinct build-ups")
        return self


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


ItemCategory = Literal[
    "cabinetry",
    "plumbing",
    "electrical",
    "lighting",
    "heating",
    "ventilation",
    "door",
    "window",
    "hardware",
    "trim",
]


class Item(_Strict):
    """Something in the example house a person can click and go and buy."""

    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    name: str
    category: ItemCategory
    measure: Literal["each", "length"] = "each"
    """each: counted in pieces; length: bought by the metre, such as baseboard."""
    summary: str
    search: str = Field(min_length=2)
    slot: str | None = None
    """A product slot (products.yaml item_products): the person may pick the brand."""


class ItemFile(_Strict):
    items: list[Item] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_ids(self) -> Self:
        ids = [item.id for item in self.items]
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        if duplicates:
            raise ValueError(f"duplicate item ids: {duplicates}")
        return self


def load_items(data_dir: Path) -> ItemFile:
    return ItemFile.model_validate(read_yaml(data_dir / "items.yaml"))


class Slot(_Strict):
    name: str


class Product(_Strict):
    """A product sold in Canada that can fill a slot, with its own rate."""

    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    slot: str
    brand: str
    name: str
    quantity: Quantity

    @model_validator(mode="after")
    def _rate_is_cited(self) -> Self:
        if self.quantity.basis != "manufacturer" or self.quantity.source is None:
            raise ValueError(f"product {self.id!r} needs a cited manufacturer rate")
        return self


class ItemPackage(_Strict):
    """How one item is sold by this product: its package and the store search."""

    package: Package | None = None
    """None when the item is bought by the piece, such as a fan."""
    search: str = Field(min_length=2)


class FanRating(_Strict):
    """One HVI-certified rating point of a fan."""

    setting: int | None = None
    """The speed setting (cfm) on fans with a selector."""
    in_wg: Decimal = Field(gt=0)
    """External static pressure, inches of water."""
    cfm: Decimal = Field(gt=0)
    sones: Decimal | None = Field(default=None, gt=0)


class Fan(_Strict):
    duct: int = Field(gt=0)
    """Round duct diameter at the fan's collar, mm."""
    ratings: list[FanRating] = Field(min_length=1)


class ItemProduct(_Strict):
    """A brand that can supply items of the house, such as pipe or cable."""

    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    slot: str
    brand: str
    name: str
    source: SourceRef
    """The data-sheet page that gives the packages."""
    items: dict[str, ItemPackage] = Field(min_length=1)
    swaps: dict[str, str] = Field(default_factory=dict)
    """Items this product needs in place of others, e.g. its own fitting rings."""
    fan: Fan | None = None
    """Ratings of an exhaust fan, checked against the building code."""


class ProductFile(_Strict):
    slots: dict[str, Slot]
    products: list[Product] = Field(min_length=1)
    item_products: list[ItemProduct] = Field(default_factory=list)

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        every: list[Product | ItemProduct] = [*self.products, *self.item_products]
        ids = [p.id for p in every]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate product ids")
        for product in every:
            if product.slot not in self.slots:
                raise ValueError(f"product {product.id!r} uses unknown slot {product.slot!r}")
        for slot in self.slots:
            if not any(p.slot == slot for p in every):
                raise ValueError(f"slot {slot!r} has no product")
        layer_slots = {p.slot for p in self.products}
        for item_product in self.item_products:
            if item_product.slot in layer_slots:
                raise ValueError(f"slot {item_product.slot!r} mixes layer and item products")
        return self


def load_products(data_dir: Path) -> ProductFile:
    return ProductFile.model_validate(read_yaml(data_dir / "products.yaml"))
