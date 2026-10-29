# VoidPrism Android

Мобильная оболочка VoidPrism: Kotlin WebView + локальный UI.

## Данные

- Хранятся в `localStorage` на устройстве (`voidprism.vault`).
- При сохранении зеркалятся в SharedPreferences для виджетов рабочего стола.
- Сайт и приложение **пока не синхронизируются** — в профиле есть заготовка «Синхронизация с сайтом — скоро».
- Точка расширения: `app/src/main/assets/www/js/sync.js`.

## Виджеты (1.0.4+)

На рабочий стол можно добавить:

1. **VoidPrism · Календарь** — текущий месяц, дни с задачами/событиями подсвечены.
2. **VoidPrism · Задачи** — при добавлении выбирается срок: день / неделя / месяц.

Данные появляются после первого открытия приложения (и дальше обновляются при сохранении в приложении).

## Сборка APK

Требуются JDK 17 и Android SDK (`ANDROID_HOME`).

```bat
cd android
gradlew.bat assembleDebug
```

Готовый файл:

`android/app/build/outputs/apk/debug/app-debug.apk`

Полный путь после сборки:

`c:\Users\murmanskiy.m\source\repos\VoidPrism\android\app\build\outputs\apk\debug\app-debug.apk`

Установка на телефон: разрешите установку из неизвестных источников и откройте APK.

## Открыть в Android Studio

File → Open → папка `android/`.
