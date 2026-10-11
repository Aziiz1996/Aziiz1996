from pydantic import BaseModel, Field, HttpUrl

class SearchHit(BaseModel):
    title: str
    url: HttpUrl
    source: str
    license: str | None = None
    year: int | None = None
    course_id: str = "supply-chain"

class AcademicAssessment(BaseModel):
    score: int = Field(ge=0, le=100)
    relevant: bool
    academically_sound: bool
    reason: str
    language: str
    topics: list[str] = Field(max_length=20)

class QuizQuestion(BaseModel):
    question: str
    choices: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str
    difficulty: str
    topic: str

class QuizBank(BaseModel):
    title: str
    questions: list[QuizQuestion] = Field(min_length=5, max_length=50)

class IngestRequest(BaseModel):
    course_id: str = Field(default="supply-chain", min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9_-]+$")
    queries: list[str] | None = None
    limit_per_query: int = Field(default=5, ge=1, le=20)

class QuizRequest(BaseModel):
    document_id: str = Field(min_length=1, max_length=128)
    count: int = Field(default=15, ge=5, le=40)

class QuizAnswers(BaseModel):
    answers: list[int] = Field(max_length=50)

class EOQRequest(BaseModel):
    annual_demand: float = Field(gt=0)
    ordering_cost: float = Field(gt=0)
    annual_holding_cost_per_unit: float = Field(gt=0)

class ROPRequest(BaseModel):
    demand_per_period: float = Field(ge=0)
    lead_time_periods: float = Field(ge=0)
    safety_stock: float = Field(default=0, ge=0)
