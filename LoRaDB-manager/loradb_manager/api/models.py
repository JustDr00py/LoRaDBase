"""Pydantic models for LoRaDB API responses."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TokenInfo(BaseModel):
    """Token information (matches LoRaDB API response)."""

    id: str
    name: str
    created_by: str
    created_at: str  # ISO 8601 timestamp
    last_used_at: Optional[str] = None  # ISO 8601 timestamp
    expires_at: Optional[str] = None  # ISO 8601 timestamp
    is_active: bool


class TokenResponse(BaseModel):
    """Response when creating a new token."""

    token: str  # The actual token value
    id: str
    name: str
    created_at: str  # ISO 8601 timestamp
    expires_at: Optional[str] = None  # ISO 8601 timestamp


class TokenListResponse(BaseModel):
    """List of tokens response."""

    total: int
    tokens: List[TokenInfo]


class CreateTokenRequest(BaseModel):
    """Request to create a new API token."""

    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: Optional[int] = Field(None, ge=1)
