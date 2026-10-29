import json

from django.test import TestCase


class StateApiTests(TestCase):
    def test_get_creates_seed(self):
        response = self.client.get("/api/state/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreaterEqual(len(payload["entries"]), 1)
        self.assertEqual(payload["profile"]["name"], "Я")
        self.assertGreaterEqual(len(payload["boards"]), 1)

    def test_put_roundtrip(self):
        state = self.client.get("/api/state/").json()
        state["profile"]["name"] = "Мира"
        state["profile"]["epithet"] = "своя орбита"
        saved = self.client.put(
            "/api/state/",
            data=json.dumps(state),
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 200)
        again = self.client.get("/api/state/").json()
        self.assertEqual(again["profile"]["name"], "Мира")

    def test_put_rejects_empty_boards(self):
        state = self.client.get("/api/state/").json()
        state["boards"] = []
        saved = self.client.put(
            "/api/state/",
            data=json.dumps(state),
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 400)

    def test_home_renders(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "VoidPrism")
        self.assertContains(response, "csrf-token")
