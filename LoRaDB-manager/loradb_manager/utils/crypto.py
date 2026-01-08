"""Cryptographic utilities for secure secret generation."""

import secrets
import base64


def generate_jwt_secret(length: int = 32) -> str:
    """
    Generate a secure random JWT secret.

    Args:
        length: Number of random bytes to generate (default: 32)

    Returns:
        URL-safe base64-encoded random string (minimum 32 characters)
    """
    # Generate random bytes and encode as URL-safe base64
    # This will be longer than `length` characters due to base64 encoding
    return secrets.token_urlsafe(length)


def validate_jwt_secret(secret: str) -> bool:
    """
    Validate JWT secret meets minimum security requirements.

    Args:
        secret: JWT secret to validate

    Returns:
        True if secret is valid, False otherwise
    """
    if not secret:
        return False

    if len(secret) < 32:
        return False

    return True
