#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "voidprism.settings")
    # В DEBUG статику отдаём сами с no-cache (иначе runserver кэширует JS-модули).
    if len(sys.argv) > 1 and sys.argv[1] == "runserver" and "--nostatic" not in sys.argv:
        sys.argv.append("--nostatic")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
