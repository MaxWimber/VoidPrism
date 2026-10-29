class NoCacheInDebugMiddleware:
    """Не даёт браузеру кэшировать HTML/JS/CSS при DEBUG."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        from django.conf import settings

        if settings.DEBUG:
            response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response["Pragma"] = "no-cache"
        return response
