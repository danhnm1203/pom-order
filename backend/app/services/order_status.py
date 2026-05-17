"""Order status transitions.

Used by:
  - PATCH /api/v1/orders/{id}/status
  - Audit log entry creation

Policy: any status → any other status is allowed. The previous state-machine
restricted forward-only progression, but in practice operators often mis-tap
and need to roll back (e.g. accidentally marked 'delivered' → revert to
'arrived'). Audit log captures every change for traceability, so opening up
transitions is safer than blocking corrections.
"""

from __future__ import annotations

from app.exceptions import ApiError
from app.models.order import OrderStatus


def is_valid_transition(from_status: OrderStatus, to_status: OrderStatus) -> bool:
    """Reject only no-op transitions. Any other change is permitted."""
    return from_status != to_status


def validate_transition(from_status: OrderStatus, to_status: OrderStatus) -> None:
    """Raise ApiError(422) if the transition is a no-op."""
    if not is_valid_transition(from_status, to_status):
        raise ApiError(
            422,
            "invalid_status_transition",
            f"Order is already in status '{from_status.value}'",
        )


def allowed_next_statuses(from_status: OrderStatus) -> list[OrderStatus]:
    """Every status except the current one, in enum (lifecycle) order."""
    return [s for s in OrderStatus if s != from_status]
