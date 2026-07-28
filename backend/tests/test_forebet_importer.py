from datetime import date
from decimal import Decimal

from bs4 import BeautifulSoup

from app.services import forebet_importer
from app.services.forebet_importer import (
    _actual_score_from_cells,
    _parse_forebet_predictions,
    _parse_forebet_reader_predictions,
    _prediction_from_row,
    _split_reader_compact_teams,
    _status_from_cells,
)


def test_prediction_from_row_builds_match_from_visible_forebet_link() -> None:
    html = """
    <tr>
      <td>
        <a title="KuPS Kuopio vs Sabah Prediction" href="/en/football/matches/kups-kuopio-sabah-2477553">
          KuPS Kuopio Sabah 28/07/2026 17:00
        </a>
      </td>
      <td>28 24 48</td>
      <td>2 0-1</td>
      <td>0 - 1</td>
      <td>2.07</td>
    </tr>
    """
    row = BeautifulSoup(html, "html.parser").select_one("tr")

    prediction = _prediction_from_row(row, date(2026, 7, 28))

    assert prediction is not None
    assert prediction.home_team == "KuPS Kuopio"
    assert prediction.away_team == "Sabah"
    assert prediction.prediction == "2"
    assert prediction.predicted_score == "0-1"
    assert prediction.expected_goals == Decimal("2.07")
    assert prediction.home_probability == Decimal("28")
    assert prediction.draw_probability == Decimal("24")
    assert prediction.away_probability == Decimal("48")


def test_parse_forebet_reader_predictions_builds_rows_from_markdown() -> None:
    markdown = """
    Champions League
     UCL
    KuPS Kuopio
    Sabah
    07/28/2026 3:00 PM
    28244820 - 12.0763°F+125
    PRE
    VIEW
    Lincoln Red Imps
    Mjällby AIF
    07/28/2026 4:00 PM
    30254521 - 32.7373°F-208
    """

    predictions = _parse_forebet_reader_predictions(markdown, date(2026, 7, 28))

    assert len(predictions) == 2
    assert predictions[0].home_team == "KuPS Kuopio"
    assert predictions[0].away_team == "Sabah"
    assert predictions[0].prediction == "2"
    assert predictions[0].predicted_score == "0-1"
    assert predictions[0].expected_goals == Decimal("2.07")
    assert predictions[1].home_team == "Lincoln Red Imps"
    assert predictions[1].away_team == "Mjällby AIF"
    assert predictions[1].prediction == "2"
    assert predictions[1].predicted_score == "1-3"


def test_parse_forebet_reader_predictions_accepts_european_date_links(monkeypatch) -> None:
    def fake_teams_from_detail(href: str | None) -> tuple[str, str] | None:
        assert href == "https://www.forebet.com/en/football/matches/kups-kuopio-sabah-2477553"
        return "KuPS Kuopio", "Sabah"

    monkeypatch.setattr(forebet_importer, "_teams_from_reader_detail_page", fake_teams_from_detail)
    markdown = """
    [KuPS Kuopio Sabah 28/07/2026 17:00](https://www.forebet.com/en/football/matches/kups-kuopio-sabah-2477553)
    28 24 48
    2 0-1
    0 - 1
    2.07
    """

    predictions = _parse_forebet_reader_predictions(markdown, date(2026, 7, 28))

    assert len(predictions) == 1
    assert predictions[0].home_team == "KuPS Kuopio"
    assert predictions[0].away_team == "Sabah"
    assert predictions[0].match_date.hour == 17
    assert predictions[0].prediction == "2"
    assert predictions[0].predicted_score == "0-1"
    assert predictions[0].expected_goals == Decimal("2.07")


def test_split_reader_compact_teams_handles_common_compound_names() -> None:
    assert _split_reader_compact_teams("FK Kauno Zalgiris Klaksvik") == ("FK Kauno Zalgiris", "Klaksvik")
    assert _split_reader_compact_teams("CA Tigre Nacional (URU)") == ("CA Tigre", "Nacional (URU)")
    assert _split_reader_compact_teams("CA Banfield Sarmiento Junín") == ("CA Banfield", "Sarmiento Junín")
    assert _split_reader_compact_teams("Gornik Zabrze Fenerbahçe") == ("Gornik Zabrze", "Fenerbahçe")
    assert _split_reader_compact_teams("Crvena Zvezda Larne") == ("Crvena Zvezda", "Larne")
    assert _split_reader_compact_teams("Slovan Bratislava Saburtalo") == ("Slovan Bratislava", "Saburtalo")
    assert _split_reader_compact_teams("Rapid Wien FC Santa Coloma") == ("Rapid Wien", "FC Santa Coloma")
    assert _split_reader_compact_teams("Argentinos Juniors Estudiantes Río Cuarto") == (
        "Argentinos Juniors",
        "Estudiantes Río Cuarto",
    )


def test_forebet_cells_extract_finished_score() -> None:
    cells = ["FT", "Getafe", "Osasuna", "1-0", "1", "1-1", "2.10"]

    assert _status_from_cells(cells) == "finished"
    assert _actual_score_from_cells(cells, "1-1") == "1-0"


def test_forebet_cells_extract_live_score() -> None:
    cells = ["62'", "Valencia", "Celta", "2-1", "X", "1-1", "2.60"]

    assert _status_from_cells(cells) == "live"
    assert _actual_score_from_cells(cells, "1-1") == "2-1"


def test_parse_forebet_card_extracts_actual_score_from_html() -> None:
    html = """
    <div class='rcnt tr_0'>
      <div class="tnms">
        <a class="tnmscn" href="/en/football/matches/kups-kuopio-sabah-2477553">
          <span class="homeTeam"><span itemprop="name">KuPS Kuopio</span></span>
          <span class="awayTeam"><span itemprop="name">Sabah</span></span>
          <time><span class="date_bah">28/07/2026 17:00</span></time>
        </a>
      </div>
      <div class='fprc'><span>28</span><span>24</span><span class="fpr">48</span></div>
      <div class="predict_y"><span class="forepr"><span>2</span></span><span class="scrmobpred ex_sc">0<span>-</span>1</span></div>
      <div class="ex_sc tabonly">0 - 1</div>
      <div class="avg_sc exact_yes tabonly">2.07</div>
      <div class="lmin_td"><div class="scoreLnk"><span>FT</span></div></div>
      <div class="lscr_td"><span><b class="l_scr">0 - 2</b></span><span class="ht_scr">(0 - 0)</span></div>
    </div>
    """

    predictions = _parse_forebet_predictions(html, date(2026, 7, 28))

    assert len(predictions) == 1
    assert predictions[0].home_team == "KuPS Kuopio"
    assert predictions[0].away_team == "Sabah"
    assert predictions[0].prediction == "2"
    assert predictions[0].predicted_score == "0-1"
    assert predictions[0].status == "finished"
    assert predictions[0].actual_score == "0-2"


def test_parse_forebet_reader_predictions_extracts_finished_result_after_ft() -> None:
    markdown = """
    KuPS Kuopio
    Sabah
    07/28/2026 3:00 PM
    28 24 48
    2 0-1
    0 - 1
    2.07
    17°
    2.40
    2.75 3.20 3.00
    FT
    0 - 2(0 - 0)
    """

    predictions = _parse_forebet_reader_predictions(markdown, date(2026, 7, 28))

    assert len(predictions) == 1
    assert predictions[0].predicted_score == "0-1"
    assert predictions[0].status == "finished"
    assert predictions[0].actual_score == "0-2"


def test_parse_forebet_reader_predictions_extracts_live_result_after_minute() -> None:
    markdown = """
    Caernarfon Town
    The New Saints
    07/28/2026 7:45 PM
    5 13 82
    2 0-2
    0 - 2
    3.56
    18°
    1.57
    66
    0 - 2
    32
    """

    predictions = _parse_forebet_reader_predictions(markdown, date(2026, 7, 28))

    assert len(predictions) == 1
    assert predictions[0].predicted_score == "0-2"
    assert predictions[0].status == "live"
    assert predictions[0].actual_score == "0-2"
