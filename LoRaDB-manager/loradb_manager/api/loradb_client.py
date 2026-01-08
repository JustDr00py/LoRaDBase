"""HTTP client for LoRaDB API operations."""

import httpx
import jwt
from datetime import datetime, timedelta
from typing import List, Optional
from ..core.instance import InstanceMetadata
from .models import TokenInfo, TokenResponse, TokenListResponse, CreateTokenRequest


class LoRaDBClient:
    """HTTP client for LoRaDB API operations."""

    def __init__(self, instance: InstanceMetadata, timeout: int = 30):
        """
        Initialize LoRaDB API client.

        Args:
            instance: Instance metadata containing connection details
            timeout: Request timeout in seconds (default: 30)
        """
        self.base_url = f"http://localhost:{instance.ports.loradb_api}"
        self.jwt_secret = instance.jwt_secret
        self.instance = instance
        self.timeout = timeout

    def _generate_admin_token(self) -> str:
        """
        Generate temporary JWT token for API authentication.

        Returns:
            JWT token string valid for 5 minutes
        """
        payload = {
            "sub": "loradb-manager-tui",
            "exp": datetime.utcnow() + timedelta(seconds=300),  # 5 minutes
            "iat": datetime.utcnow(),
        }
        return jwt.encode(payload, self.jwt_secret, algorithm="HS256")

    def _get_headers(self) -> dict:
        """
        Get HTTP headers with authentication.

        Returns:
            Headers dict with Authorization bearer token
        """
        token = self._generate_admin_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def list_tokens(self) -> List[TokenInfo]:
        """
        List all API tokens for the authenticated user.

        Returns:
            List of TokenInfo objects

        Raises:
            httpx.ConnectError: If connection to LoRaDB API fails
            httpx.TimeoutException: If request times out
            httpx.HTTPStatusError: If API returns error status
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/tokens", headers=self._get_headers()
            )
            response.raise_for_status()

            data = response.json()
            token_list = TokenListResponse(**data)
            return token_list.tokens

    async def create_token(
        self, name: str, expires_in_days: Optional[int] = None
    ) -> TokenResponse:
        """
        Create a new API token.

        Args:
            name: Human-readable name for the token
            expires_in_days: Optional expiration in days (None = never expires)

        Returns:
            TokenResponse containing the generated token and metadata

        Raises:
            httpx.ConnectError: If connection to LoRaDB API fails
            httpx.TimeoutException: If request times out
            httpx.HTTPStatusError: If API returns error status
        """
        request = CreateTokenRequest(name=name, expires_in_days=expires_in_days)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/tokens",
                headers=self._get_headers(),
                json=request.model_dump(exclude_none=True),
            )
            response.raise_for_status()

            data = response.json()
            return TokenResponse(**data)

    async def revoke_token(self, token_id: str) -> bool:
        """
        Revoke an API token.

        Args:
            token_id: ID of the token to revoke

        Returns:
            True if token was revoked successfully

        Raises:
            httpx.ConnectError: If connection to LoRaDB API fails
            httpx.TimeoutException: If request times out
            httpx.HTTPStatusError: If API returns error status
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(
                f"{self.base_url}/tokens/{token_id}", headers=self._get_headers()
            )
            response.raise_for_status()

            # API returns 204 No Content on success
            return response.status_code == 204
