# Photonic

**Свет без нейросетей. Ядро на виду. Файл никуда не уходит.**

Photonic — увеличитель и ресемплер растра в браузере. Откройте снимок, выберите фильтр, заберите файл другого размера. Нет аккаунта, нет облака, нет «ИИ-улучшения»: только классическая интерполяция и эталонный пайплайн **Photonic**.

[Открыть Photonic](https://skaletun.github.io/Photonic/) · [GitHub](https://github.com/skaletun/Photonic)

Light without neural nets. The kernel is in view. The file stays on this device. Photonic is a browser enlarger: drop a JPEG, PNG, WebP, BMP or GIF, pick a kernel, export. No upload. The default **Photonic** kernel works in OKLab — sharp lightness, quieter colour, fewer halos than textbook Lanczos.

## Зачем это, а не апскейл из соцсети

Нейросеть дорисовывает то, чего не было. Photonic меняет сетку пикселей честно: вы видите форму ядра, сравниваете «до / после» и сетку всех фильтров, удерживаете пробел, чтобы снова увидеть исходник.

- Снимок не уходит с устройства.
- Эталон Photonic: линейный свет, OKLab, сигмоида против ореолов, Kaiser-sinc по светлоте, Mitchell по цветности, NoHalo.
- Рядом — классика: nearest, bilinear, bicubic, Lanczos, sinc (Hann), B-spline.
- RU / EN, светлая тема по умолчанию, ставится как PWA. Офлайн кэшируется оболочка, не ваши фотографии.

## Как пользоваться

1. Перетащите файл, вставьте его или нажмите Ctrl+O.
2. Слева выберите ядро. **Photonic** — для фото, графики и текста. Пиксель-арт — nearest и целый 2× / 4×.
3. Справа задайте размер в пикселях, процентах или профилем ½ / 2× / 4×.
4. Сравните слайдером, рядом или сеткой ядер. Колесо — зум.
5. Экспорт: PNG, JPEG, WebP или как у исходника. Ctrl+S сохраняет файл.

На телефоне: превью сверху, ядра чипами, **Экспорт** липкой кнопкой внизу.

## FAQ

Полный список — в самом приложении, якорь [#faq](https://skaletun.github.io/Photonic/#faq). Коротко:

- **Это ИИ?** Нет. Именованные ядра и цветовой пайплайн, не обученная модель.
- **Куда уходит файл?** Никуда. Счёт идёт во вкладке.
- **GIF?** Первый кадр. GIF и BMP при экспорте становятся PNG.
- **Почему не открывается с диска?** Worker не стартует с `file://`. Нужен HTTPS или localhost.

## Контакты

Человек, не форма.

- GitHub: [skaletun](https://github.com/skaletun)
- Почта: [ettsonskal@gmail.com](mailto:ettsonskal@gmail.com)
- Telegram: [t.me/skaletun](https://t.me/skaletun)

## Поддержать проект

Без рекламы и телеметрии. Кофе или просто спасибо — чтобы увеличитель оставался на виду. Файл по-прежнему никуда не уходит.

- [Donatex](https://donatex.gg/donate/skaletun)
- [DonationAlerts](https://www.donationalerts.com/r/skaletun)
- [Т-Банк](https://www.tbank.ru/cf/4mmmJbR1Vox)

## Для тех, кто собирает из исходников

Нужен HTTP: модульный worker и service worker не живут на `file://`.

```bash
npm install
npm run dev
```

http://localhost:3000/ — локально без `basePath`. Статика:

```bash
npm test
npx tsc --noEmit
npm run build
npm start
```

`npm start` раздаёт `out/` (`next start` при `output: "export"` нет). GitHub Pages: Settings → Pages → Source: GitHub Actions. Workflow на `main` ставит `GITHUB_PAGES=true`, префикс `/<repo>/`, в `out` пишется `.nojekyll`. В git не кладите `node_modules/`, `.next/`, `out/`.

Проверка nearest: [`public/assets/checker.png`](public/assets/checker.png) и профиль **4×**. Photonic на клетке чуть мягче — так задумано.

Браузеры: актуальные Chrome, Firefox, Safari, Edge. Шрифты в `public/fonts/` (SIL OFL), без запроса к Google Fonts.
