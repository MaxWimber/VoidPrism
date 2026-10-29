from django.contrib import admin

from .models import Vault


@admin.register(Vault)
class VaultAdmin(admin.ModelAdmin):
    list_display = ("id", "updated_at")
    readonly_fields = ("updated_at",)
