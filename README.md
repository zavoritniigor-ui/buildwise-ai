# BuildWise AI

Система інженерних знань для планування ремонту: вибір технології, перевірка
сумісності матеріалів, детерміновані розрахунки кількостей і кошторис.
Початковий ринок — Квебек, перший модуль — комплексний ремонт ванної кімнати.

Повна концепція: [docs/concept.md](docs/concept.md).

## Структура

| Шлях       | Що це                          |
| ---------- | ------------------------------ |
| `apps/web` | PWA: React + TypeScript + Vite |
| `apps/api` | Backend: Python + FastAPI (uv) |
| `docs`     | Концепція та рішення           |

## Локальний запуск

```bash
npm install
npm run dev -w apps/web
```

```bash
cd apps/api && uv sync && uv run fastapi dev src/buildwise_api/main.py
```

## Перевірки (ті самі, що в CI)

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

```bash
cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```

## Процес

Кожна зміна йде через feature-гілку та Pull Request. Злиття в `main` — лише
після зелених перевірок CI.
