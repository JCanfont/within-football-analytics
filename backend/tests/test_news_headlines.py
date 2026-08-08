from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.services import news_headlines


SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Demo</title>
    <item>
      <title>Titular uno</title>
      <link>https://example.com/uno</link>
      <pubDate>Sat, 08 Aug 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Resumen <b>corto</b> del titular.</p>]]></description>
    </item>
    <item>
      <title>Titular dos</title>
      <link>https://example.com/dos</link>
      <pubDate>Sat, 08 Aug 2026 09:00:00 GMT</pubDate>
      <description>Otro resumen</description>
    </item>
  </channel>
</rss>
"""


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    news_headlines.clear_news_cache()


def test_fetch_news_headlines_aggregates_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_get(url: str, headers=None, timeout=None):  # noqa: ANN001
        calls.append(url)
        return SimpleNamespace(status_code=200, ok=True, content=SAMPLE_RSS.encode("utf-8"))

    monkeypatch.setattr(news_headlines.requests, "get", fake_get)

    result = news_headlines.fetch_news_headlines(limit_per_source=1, bypass_cache=True)

    assert result.status == "ok"
    assert len(result.sources) == 5
    assert all(source.status == "ok" for source in result.sources)
    assert len(result.headlines) == 5
    assert result.headlines[0].title == "Titular uno"
    assert result.headlines[0].summary == "Resumen corto del titular."
    assert {source.source for source in result.sources} == {
        "marca",
        "sport",
        "as",
        "mundo_deportivo",
        "athletic",
    }
    assert any("feeds.as.com" in url for url in calls)


def test_fetch_news_headlines_partial_when_source_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_get(url: str, headers=None, timeout=None):  # noqa: ANN001
        if "marca" in url:
            raise news_headlines.requests.RequestException("timeout")
        return SimpleNamespace(status_code=200, ok=True, content=SAMPLE_RSS.encode("utf-8"))

    monkeypatch.setattr(news_headlines.requests, "get", fake_get)

    result = news_headlines.fetch_news_headlines(limit_per_source=2, bypass_cache=True)

    assert result.status == "partial"
    marca = next(source for source in result.sources if source.source == "marca")
    assert marca.status == "request_failed"
    assert len(result.headlines) == 8


def test_news_cache_reused_until_bypass(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def fake_get(url: str, headers=None, timeout=None):  # noqa: ANN001
        calls["n"] += 1
        return SimpleNamespace(status_code=200, ok=True, content=SAMPLE_RSS.encode("utf-8"))

    monkeypatch.setattr(news_headlines.requests, "get", fake_get)

    first = news_headlines.fetch_news_headlines(limit_per_source=1)
    second = news_headlines.fetch_news_headlines(limit_per_source=1)
    third = news_headlines.fetch_news_headlines(limit_per_source=1, bypass_cache=True)

    assert first.fetched_at == second.fetched_at
    assert third.fetched_at >= first.fetched_at
    assert calls["n"] == 10  # 5 sources * 2 fetches (first + bypass)


def test_parse_atom_entries() -> None:
    atom = """<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom title</title>
        <link href="https://example.com/atom"/>
        <updated>2026-08-08T11:00:00Z</updated>
        <summary>Atom summary</summary>
      </entry>
    </feed>
    """
    headlines = news_headlines._parse_rss(
        atom.encode("utf-8"),
        source="athletic",
        source_label="The Athletic",
        limit=5,
    )
    assert len(headlines) == 1
    assert headlines[0].title == "Atom title"
    assert headlines[0].url == "https://example.com/atom"
    assert headlines[0].published_at == datetime(2026, 8, 8, 11, 0, tzinfo=UTC)
