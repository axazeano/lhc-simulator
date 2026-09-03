# LHC Simulator

Интерактивный обучающий симулятор Большого адронного коллайдера. Игрок настраивает ускоритель, сталкивает протоны и открывает частицы по пику на гистограмме. Формулы честные, модели упрощённые, каждое упрощение видно игроку.

An interactive educational simulator of the Large Hadron Collider. Honest formulas, simplified models, every simplification visible to the player.

Концепт первой версии: [docs/CONCEPT.md](docs/CONCEPT.md).

## Состояние

Этап 2: туториал из шести уровней с квизами, блокировкой ручек и карточками «как это было на самом деле», плюс песочница. Прогресс сохраняется в браузере.

## Запуск

```bash
npm install
npm run dev
```

Тесты и проверка типов:

```bash
npm test
npm run typecheck
```

## Структура

- `src/physics/` — физические модули без зависимости от интерфейса, с числовыми тестами.
- `src/data/` — параметры машины и частиц. У каждого числа есть поле `source`.
- `src/i18n/` — локализация. Все строки по ключам, тест проверяет полноту переводов.
- `src/ui/` — React-компоненты и Canvas.
- `docs/` — концепт и документация.

## Источники

Параметры машины взяты из [LHC Design Report](https://cds.cern.ch/record/782076), массы частиц из [Particle Data Group](https://pdg.lbl.gov/).
