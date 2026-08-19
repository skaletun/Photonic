# Photonic

Клиентский ресемплер растровых изображений. Только классические методы — без нейросетей и без отправки файла на сервер. По умолчанию работает **алгоритм Photonic**: OKLab, сигмоида против ореолов, резкая светлота и мягкая цветность.

Стек: Next.js (App Router, static export), TypeScript, React. Ресемплинг идёт в браузере (Canvas + Web Worker). Интерфейс: RU / EN, PWA (офлайн-оболочка).

Client-side raster resampler. Classical methods only — no neural nets, no upload. Default kernel is **Photonic**: OKLab, sigmoid against halos, sharp lightness, softer chroma. Stack: Next.js App Router static export. UI: RU / EN, installable PWA.

## Запуск / Run

Нужен HTTP: модульный Web Worker и service worker не стартуют с `file://`. HTTPS (или localhost) нужен и для установки PWA.

HTTP is required: the module Worker and service worker will not start from `file://`. HTTPS (or localhost) is required to install the PWA.

```bash
cd Photonic
npm install
npm run dev
```

Откройте http://localhost:3000/

Сборка статики в `out/`:

```bash
npm run build
npm start
```

`npm start` раздаёт папку `out` (не `next start` — при `output: "export"` сервера Next нет). Локальная сборка без `basePath`; на GitHub Pages префикс берётся из имени репозитория.

Для проверки nearest на пиксель-арте можно взять [`public/assets/checker.png`](public/assets/checker.png) (16×16) и профиль **4×**. Photonic на клетках будет чуть мягче — так и задумано.

Поддержка: актуальные Chrome, Firefox, Safari, Edge.

## GitHub Pages

Статика собирается в CI и выкладывается из `out/`. В git не попадают `node_modules/`, `.next/`, `out/`, `.env*`, кэши и папки редактора (`.cursor/`, `.vscode/`, `.idea/`). В репозиторий нужен `package-lock.json`.

1. Создайте репозиторий, залейте ветку `main` (не коммитьте сборку — её делает Actions).
2. Settings → Pages → **Source: GitHub Actions**.
3. Workflow `.github/workflows/pages.yml` на push в `main`: `npm ci`, тесты, `GITHUB_PAGES=true` → `npm run build`, деплой артефакта `out`.
4. Адрес проектного сайта: `https://<user>.github.io/<repo>/`. Для репозитория `user.github.io` или своего домена в корне сайта задайте в job `NEXT_PUBLIC_BASE_PATH: ""`.

После деплоя Jekyll не трогает `_next` (в `out` пишется `.nojekyll`).

GitHub Pages: CI builds `out/` and deploys it. Do not commit `node_modules`, `.next`, or `out`. Enable Pages → Source: GitHub Actions. Project sites get `basePath=/<repo>`; a user site (`*.github.io`) stays at `/`.

## PWA

После `npm run build` и раздачи по HTTPS браузер может предложить установку. На iPhone: Share → Add to Home Screen. Офлайн кэшируется оболочка (HTML/CSS/JS/шрифты/иконки), не ваши снимки. Ресемплинг по-прежнему локальный.

After a HTTPS deploy, Chrome/Edge can install Photonic. On iPhone use Share → Add to Home Screen. The service worker caches the app shell only — not user photos. Resampling stays on-device.

## Как пользоваться / How to use

1. Откройте JPEG / PNG / WebP / BMP / GIF (кнопка, Ctrl+O, перетаскивание или вставка). У GIF берётся первый кадр.
2. Слева выберите ядро. **Photonic** — эталон для фото и графики. График — форма фильтра.
3. Справа задайте размер в пикселях, процентах (10–1000%) или профилем ½ / 2× / 4×. Пропорции по умолчанию включены.
4. Сравните «до / после» слайдером, рядом или сеткой всех ядер. Колесо — зум, пробел — исходник.
5. Экспорт: PNG, JPEG, WebP или формат исходника (GIF и BMP уходят в PNG). Ctrl+S сохраняет файл.

На телефоне: превью сверху, ядра чипами, размер и **Экспорт** снизу (липкая кнопка над индикатором домой).

Settings (kernel, locale, theme, color, unsharp, format) are stored in `localStorage`. Language follows the browser on first visit (`ru*` → Russian, otherwise English).

### Какое ядро брать / Which kernel

- **Фотография, графика, текст:** Photonic. Линейный свет встроен, переключатель sRGB отключается.
- **Пиксель-арт:** nearest и целый масштаб 2× / 4×.
- **Сравнить звон:** Lanczos — классика без сигмоиды, ореолы виднее.
- **Шумное фото без ореолов:** B-spline.
- **Экспертно:** sinc (Hann); окно `a` у Lanczos/sinc 2–4. Bicubic — стандарт для простого апскейла.

### Что делает Photonic

Это пайплайн, не одно ядро: sRGB → линейный RGB → OKLab → нормированная сигмоида на L (k = 6.5, как у ImageMagick / Robidoux) → Kaiser-sinc по светлоте и Mitchell по цветности → NoHalo по ближайшим соседям (не по всему окну ядра) → обратно в sRGB. Цветные ореолы гасятся, контур остаётся в светлоте.

## Горячие клавиши / Shortcuts

- **Ctrl/Cmd+O** — открыть / open
- **Ctrl/Cmd+S** — экспорт / export
- **Ctrl/Cmd+Z** — отмена настроек / undo settings
- **1–7** — ядра по порядку (1 = Photonic)
- **+ / −** — зум / zoom
- **Space** — исходник, пока удерживаете / hold for original

## Производительность и лимиты / Limits

Тяжёлая математика идёт в Web Worker по полосам, интерфейс не должен зависать. Photonic тяжелее чистого Lanczos из‑за OKLab и двух ядер.

- Если результат ≤ ~8 Мп, превью — полный кадр.
- Если больше — обзор (длинная сторона ≤ 2048) тем же ядром и лупа 1:1 по области просмотра. Полный размер считается при экспорте.
- Предупреждение около 80 Мп (Safari). Отказ выше 120 Мп или если сторона > 16384 / площадь больше лимита canvas.

## Архитектура / Layout

```
src/app/          Next.js layout and page
src/components/   React shell (mast, preview, kernels, inspector)
src/lib/i18n/     EN / RU dictionaries
src/lib/resample/ kernels, Photonic pipeline, worker
src/lib/io/       decode and export
src/styles/       tokens and tool layout
public/fonts/     Instrument Serif, IBM Plex Sans (SIL OFL)
public/icons/     PWA icons
public/manifest.webmanifest
public/sw.js      app-shell service worker
tests/            Vitest (kernels + i18n)
```

Проверка / checks:

```bash
npm test
npx tsc --noEmit
npm run build
```

Шрифты лежат в `public/fonts/` (SIL OFL), без запроса к Google Fonts в рантайме.
