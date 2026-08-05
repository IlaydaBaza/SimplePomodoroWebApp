from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

# User Schemas
class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    
    model_config = ConfigDict(from_attributes=True)

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    username: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Topic Schemas
class TopicCreate(BaseModel):
    topic_name: str
    color_hex: str

class TopicResponse(BaseModel):
    id: int
    user_id: int
    topic_name: str
    color_hex: str

    model_config = ConfigDict(from_attributes=True)

# StudySession Schemas
class StudySessionCreate(BaseModel):
    topic_id: int
    duration_minutes: float

class StudySessionResponse(BaseModel):
    id: int
    user_id: int
    topic_id: int
    duration_minutes: float
    timestamp: datetime
    topic_name: Optional[str] = None
    color_hex: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
