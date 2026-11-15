# Catalogue data

Technical facts about materials, taken from manufacturers' official documents.

- Each file in `catalog/` covers one product system from one manufacturer.
- Every fact cites a document and a page. The documents themselves are not
  stored here; the file keeps their URL, version and SHA-256.
- Allowed values come from `vocabulary.yaml`.

## Review

Facts start as `ai_extracted` and have no effect on compatibility verdicts.
A person approves a fact by comparing it with the cited page and setting
`status: human_verified`, `verified_by` and `verified_on`. Only approved facts
and rules reach the engine.

## Import

```bash
cd apps/api && BUILDWISE_DATABASE_URL=postgresql+psycopg://... uv run python -m buildwise_api.catalog.seed ../../data
```
