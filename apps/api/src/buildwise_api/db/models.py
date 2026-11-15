"""Product and retail catalogue schema.

Technical data about a product (what it is, what it can do, which document says
so) is kept apart from retail data (who sells it, for how much, checked when).
"""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class VerificationStatus(enum.StrEnum):
    UNVERIFIED = "unverified"
    AI_EXTRACTED = "ai_extracted"
    HUMAN_VERIFIED = "human_verified"
    REJECTED = "rejected"


class DocumentType(enum.StrEnum):
    TDS = "tds"
    INSTALLATION_MANUAL = "installation_manual"
    SDS = "sds"
    WARRANTY = "warranty"
    CERTIFICATION = "certification"
    BUILDING_CODE = "building_code"


class Availability(enum.StrEnum):
    IN_STOCK = "in_stock"
    LIMITED = "limited"
    OUT_OF_STOCK = "out_of_stock"
    UNKNOWN = "unknown"


def _enum(enum_cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda cls: [member.value for member in cls],
    )


class Base(DeclarativeBase):
    type_annotation_map = {datetime: DateTime(timezone=True)}
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Manufacturer(Base):
    __tablename__ = "manufacturer"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    website: Mapped[str | None] = mapped_column(String(500))

    products: Mapped[list["Product"]] = relationship(back_populates="manufacturer")


class MaterialCategory(Base):
    __tablename__ = "material_category"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("material_category.id"))


class SourceDocument(Base):
    """An official document that technical claims can cite."""

    __tablename__ = "source_document"
    __table_args__ = (UniqueConstraint("url", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    manufacturer_id: Mapped[int | None] = mapped_column(ForeignKey("manufacturer.id"))
    doc_type: Mapped[DocumentType] = mapped_column(_enum(DocumentType, "doc_type"))
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(1000))
    version: Mapped[str] = mapped_column(String(100), default="")
    published_on: Mapped[date | None]
    retrieved_at: Mapped[datetime] = mapped_column(server_default=func.now())
    content_sha256: Mapped[str | None] = mapped_column(String(64))


class Product(Base):
    __tablename__ = "product"
    __table_args__ = (
        UniqueConstraint("manufacturer_id", "manufacturer_sku"),
        CheckConstraint("package_quantity > 0", name="package_quantity_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    manufacturer_id: Mapped[int] = mapped_column(ForeignKey("manufacturer.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("material_category.id"))
    name: Mapped[str] = mapped_column(String(300))
    model: Mapped[str | None] = mapped_column(String(200))
    manufacturer_sku: Mapped[str] = mapped_column(String(100))
    package_quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    package_unit: Mapped[str | None] = mapped_column(String(20))
    verification_status: Mapped[VerificationStatus] = mapped_column(
        _enum(VerificationStatus, "verification_status"),
        default=VerificationStatus.UNVERIFIED,
    )
    last_verified_at: Mapped[datetime | None]

    manufacturer: Mapped[Manufacturer] = relationship(back_populates="products")
    attributes: Mapped[list["ProductAttribute"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    offers: Mapped[list["RetailOffer"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductAttribute(Base):
    """One technical characteristic of a product, with its evidence.

    A characteristic may only be marked human-verified when it cites a source
    document: every important characteristic must have a source.
    """

    __tablename__ = "product_attribute"
    __table_args__ = (
        UniqueConstraint("product_id", "key"),
        CheckConstraint("value_text IS NOT NULL OR value_num IS NOT NULL", name="value_present"),
        CheckConstraint(
            "verification_status <> 'human_verified' OR source_document_id IS NOT NULL",
            name="verified_requires_source",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(100))
    value_text: Mapped[str | None] = mapped_column(Text)
    value_num: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    unit: Mapped[str | None] = mapped_column(String(20))
    source_document_id: Mapped[int | None] = mapped_column(ForeignKey("source_document.id"))
    source_page: Mapped[int | None]
    verification_status: Mapped[VerificationStatus] = mapped_column(
        _enum(VerificationStatus, "verification_status"),
        default=VerificationStatus.UNVERIFIED,
    )
    verified_at: Mapped[datetime | None]

    product: Mapped[Product] = relationship(back_populates="attributes")


class Retailer(Base):
    __tablename__ = "retailer"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    website: Mapped[str | None] = mapped_column(String(500))


class Store(Base):
    __tablename__ = "store"

    id: Mapped[int] = mapped_column(primary_key=True)
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailer.id"))
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))
    province: Mapped[str] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(7))


class RetailOffer(Base):
    """A retailer's listing of a product.

    Price is nullable: an unknown price is stored as unknown, never guessed.
    Every offer records where the data came from and when it was last checked.
    """

    __tablename__ = "retail_offer"
    __table_args__ = (
        UniqueConstraint(
            "retailer_id", "store_id", "retailer_sku", postgresql_nulls_not_distinct=True
        ),
        CheckConstraint("price IS NULL OR price >= 0", name="price_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"))
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailer.id"))
    store_id: Mapped[int | None] = mapped_column(ForeignKey("store.id"))
    retailer_sku: Mapped[str] = mapped_column(String(100))
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    package_size: Mapped[str | None] = mapped_column(String(100))
    availability: Mapped[Availability] = mapped_column(
        _enum(Availability, "availability"), default=Availability.UNKNOWN
    )
    product_url: Mapped[str | None] = mapped_column(String(1000))
    data_source: Mapped[str] = mapped_column(String(200))
    last_checked_at: Mapped[datetime]

    product: Mapped[Product] = relationship(back_populates="offers")
