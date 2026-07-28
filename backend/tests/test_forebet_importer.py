from datetime import date
from decimal import Decimal

from bs4 import BeautifulSoup

from app.services.forebet_importer import _parse_forebet_reader_predictions, _prediction_from_row


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
