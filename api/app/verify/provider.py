"""Verification provider interface. The demo uses MockProvider; production would
plug in Stripe Identity or Persona behind the same interface."""
from dataclasses import dataclass
from typing import Protocol


@dataclass
class VerificationSession:
    session_id: str
    url: str  # where the client sends the user to complete verification


class VerificationProvider(Protocol):
    def start(self, user_id: str) -> VerificationSession:
        """Open a hosted verification session for the user."""
        ...

    def parse_webhook(self, payload: dict) -> tuple[str, bool]:
        """Return (session_id, verified) from the provider's webhook body."""
        ...
