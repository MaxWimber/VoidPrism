from django.db import models


class Vault(models.Model):
    data = models.JSONField("состояние")
    updated_at = models.DateTimeField("обновлено", auto_now=True)

    class Meta:
        verbose_name = "космос"
        verbose_name_plural = "космос"

    def __str__(self):
        profile = self.data.get("profile", {}) if isinstance(self.data, dict) else {}
        return profile.get("name") or "Космос"
