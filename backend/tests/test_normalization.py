from app.utils.normalization import normalize_name


def test_normalize_team_name_removes_accents_and_noise() -> None:
    assert normalize_name("  Atletico de Madrid C.F.  ") == "atletico de madrid c f"


def test_normalize_collapses_repeated_spaces() -> None:
    assert normalize_name("Real    Sociedad") == "real sociedad"
