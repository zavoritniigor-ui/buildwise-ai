# Catalogue data

Technical facts about materials, taken from manufacturers' official documents.

- Each file in `catalog/` covers one product system from one manufacturer.
- Every fact cites a document and a page. The documents themselves are not
  stored here; the file keeps their URL, version and SHA-256.
- Allowed values and the labels of job conditions come from `vocabulary.yaml`.
- `manufacturer.brand` is the name shoppers search for in stores.

## Review

Facts start as `ai_extracted` and have no effect on compatibility verdicts.
A person approves a fact by comparing it with the cited page and setting
`status: human_verified`, `verified_by` and `verified_on`. Only approved facts
and rules reach the engine.

## Import

```bash
cd apps/api && BUILDWISE_DATABASE_URL=postgresql+psycopg://... uv run python -m buildwise_api.catalog.seed ../../data
```

## Web snapshot

The web app has no server yet, so it reads a JSON snapshot of this folder and
runs the same rules in the browser. After changing any data file, regenerate
it; a test fails while it is out of date:

```bash
cd apps/api && uv run python -m buildwise_api.catalog.export ../../data ../web/src/generated/knowledge.json
```

`scenarios/` holds worked examples such as BW-001. When the snapshot is
exported, the Python engine computes each case's verdict, and the web engine's
tests must reach the same answers.
