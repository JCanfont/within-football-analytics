"""Aggregate football headlines from Spanish sports press + The Athletic."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
import re
from xml.etree import ElementTree as ET

import requests

from app.schemas.api import NewsHeadlineRead, NewsHeadlinesResult, NewsSourceResult


USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
CACHE_TTL = timedelta(minutes=5)
_CACHE: tuple[datetime, NewsHeadlinesResult] | None = None
_HTML_TAG_RE = re.compile(r"<[^>]+>")

NEWS_SOURCES: tuple[dict[str, str], ...] = (
    {
        "source": "marca",
        "source_label": "Marca",
        "feed_url": "https://e00-marca.uecdn.es/rss/futbol.xml",
    },
    {
        "source": "sport",
        "source_label": "Sport",
        "feed_url": "https://www.sport.es/es/rss/futbol/rss.xml",
    },
    {
        "source": "as",
        "source_label": "AS",
        # Legacy as.com/rss/futbol/portada.xml often stalls; MRSS stays current.
        "feed_url": "https://feeds.as.com/mrss-s/pages/as/site/as.com/section/futbol/portada",
    },
    {
        "source": "mundo_deportivo",
        "source_label": "Mundo Deportivo",
        "feed_url": "https://www.mundodeportivo.com/rss/futbol.xml",
    },
    {
        "source": "athletic",
        "source_label": "The Athletic",
        "feed_url": "https://www.theathletic.com/news/?rss",
    },
)


def clear_news_cache() -> None:
    global _CACHE
    _CACHE = None


def fetch_news_headlines(
    *,
    limit_per_source: int = 12,
    bypass_cache: bool = False,
) -> NewsHeadlinesResult:
    global _CACHE
    now = datetime.now(UTC)
    if not bypass_cache and _CACHE and now - _CACHE[0] < CACHE_TTL:
        return _CACHE[1]

    safe_limit = max(1, min(30, limit_per_source))
    sources: list[NewsSourceResult] = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(_fetch_source, spec, safe_limit): spec["source"]
            for spec in NEWS_SOURCES
        }
        by_source: dict[str, NewsSourceResult] = {}
        for future in as_completed(futures):
            result = future.result()
            by_source[result.source] = result
    for spec in NEWS_SOURCES:
        sources.append(by_source[spec["source"]])

    headlines = [item for source in sources for item in source.headlines]
    headlines.sort(key=lambda item: item.published_at or datetime.min.replace(tzinfo=UTC), reverse=True)

    ok_count = sum(1 for source in sources if source.status == "ok")
    if ok_count == len(sources):
        status = "ok"
        message = f"{len(headlines)} titulares de {ok_count} medios."
    elif ok_count > 0:
        status = "partial"
        failed = [source.source_label for source in sources if source.status != "ok"]
        message = (
            f"{len(headlines)} titulares de {ok_count}/{len(sources)} medios. "
            f"Fallaron: {', '.join(failed)}."
        )
    else:
        status = "request_failed"
        message = "No se pudieron cargar titulares de ningun medio."

    result = NewsHeadlinesResult(
        status=status,
        message=message,
        fetched_at=now,
        sources=sources,
        headlines=headlines,
    )
    _CACHE = (now, result)
    return result


def _fetch_source(spec: dict[str, str], limit: int) -> NewsSourceResult:
    source = spec["source"]
    label = spec["source_label"]
    feed_url = spec["feed_url"]
    try:
        response = requests.get(
            feed_url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
            },
            timeout=12,
        )
    except requests.RequestException as exc:
        return NewsSourceResult(
            source=source,
            source_label=label,
            status="request_failed",
            message=f"No se pudo pedir el RSS ({exc.__class__.__name__}).",
            feed_url=feed_url,
        )

    if response.status_code in {401, 403}:
        return NewsSourceResult(
            source=source,
            source_label=label,
            status="blocked",
            message=f"RSS bloqueado ({response.status_code}).",
            feed_url=feed_url,
        )
    if not response.ok:
        return NewsSourceResult(
            source=source,
            source_label=label,
            status="http_error",
            message=f"RSS respondio {response.status_code}.",
            feed_url=feed_url,
        )

    try:
        headlines = _parse_rss(response.content, source=source, source_label=label, limit=limit)
    except ET.ParseError:
        return NewsSourceResult(
            source=source,
            source_label=label,
            status="request_failed",
            message="El RSS no se pudo leer (XML invalido).",
            feed_url=feed_url,
        )

    if not headlines:
        return NewsSourceResult(
            source=source,
            source_label=label,
            status="empty",
            message="El RSS no trajo titulares.",
            feed_url=feed_url,
        )

    return NewsSourceResult(
        source=source,
        source_label=label,
        status="ok",
        message=f"{len(headlines)} titulares.",
        feed_url=feed_url,
        headlines=headlines,
    )


def _parse_rss(payload: bytes, *, source: str, source_label: str, limit: int) -> list[NewsHeadlineRead]:
    root = ET.fromstring(payload)
    items = root.findall(".//item")
    if not items:
        # Atom fallback
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items = root.findall(".//atom:entry", ns)
    headlines: list[NewsHeadlineRead] = []
    for item in items:
        title = _text(item, "title")
        link = _link(item)
        if not title or not link:
            continue
        published = _published_at(item)
        summary = _clean_summary(_text(item, "description") or _text(item, "summary"))
        headlines.append(
            NewsHeadlineRead(
                source=source,
                source_label=source_label,
                title=title.strip(),
                url=link.strip(),
                published_at=published,
                summary=summary,
            )
        )
        if len(headlines) >= limit:
            break
    return headlines


def _clean_summary(raw: str | None) -> str | None:
    if not raw:
        return None
    text = _HTML_TAG_RE.sub(" ", raw)
    text = " ".join(text.split())
    if not text:
        return None
    if len(text) > 280:
        return f"{text[:277]}..."
    return text


def _text(item: ET.Element, tag: str) -> str | None:
    node = item.find(tag)
    if node is not None and node.text:
        return node.text
    # Atom namespaced tags
    for child in item:
        local = child.tag.rsplit("}", 1)[-1]
        if local == tag and child.text:
            return child.text
    return None


def _link(item: ET.Element) -> str | None:
    direct = _text(item, "link")
    if direct:
        return direct
    for child in item:
        local = child.tag.rsplit("}", 1)[-1]
        if local == "link":
            href = child.attrib.get("href")
            if href:
                return href
            if child.text:
                return child.text
    return None


def _published_at(item: ET.Element) -> datetime | None:
    raw = _text(item, "pubDate") or _text(item, "published") or _text(item, "updated")
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None
