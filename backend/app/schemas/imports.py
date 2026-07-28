from pydantic import BaseModel, Field


class ImportErrorDetail(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    import_type: str
    processed: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[ImportErrorDetail] = Field(default_factory=list)
