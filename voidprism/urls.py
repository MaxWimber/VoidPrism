from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.views import serve
from django.urls import include, path, re_path
from django.views.decorators.cache import never_cache

admin.site.site_header = "VoidPrism"
admin.site.site_title = "VoidPrism"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("cosmos.urls")),
]

if settings.DEBUG:
    urlpatterns += [
        re_path(r"^static/(?P<path>.*)$", never_cache(serve)),
    ]
