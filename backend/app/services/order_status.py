"""Order status state machine.

Enforces valid status transitions. Used by:
  - PATCH /api/v1/orders/{id}/status
  - Audit log entry creation
"""

from __future__ import annotations

from app.exceptions import ApiError
from app.models.order import OrderStatus


# Allowed transitions: from -> set of valid next statuses
_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {OrderStatus.ORDERED, OrderStatus.CANCELLED, OrderStatus.PROBLEM},
    OrderStatus.ORDERED: {OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED, OrderStatus.PROBLEM},
    OrderStatus.IN_TRANSIT: {OrderStatus.ARRIVED, OrderStatus.PROBLEM, OrderStatus.CANCELLED},
    OrderStatus.ARRIVED: {OrderStatus.DELIVERED, OrderStatus.PROBLEM, OrderStatus.CANCELLED},
    OrderStatus.DELIVERED: {OrderStatus.COMPLETED, OrderStatus.PROBLEM},
    OrderStatus.COMPLETED: {OrderStatus.PROBLEM},  # only re-open if discovered later
    OrderStatus.PROBLEM: {
        OrderStatus.ORDERED,
        OrderStatus.IN_TRANSIT,
        OrderStatus.ARRIVED,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CANCELLED: set(),  # terminal
}


def is_valid_transition(from_status: OrderStatus, to_status: OrderStatus) -> bool:
    """Check whether a status transition is permitted."""
    if from_status == to_status:
        return False  # noop transition not allowed
    return to_status in _TRANSITIONS.get(from_status, set())


def validate_transition(from_status: OrderStatus, to_status: OrderStatus) -> None:
    """Raise ApiError(422) if the transition is invalid."""
    if not is_valid_transition(from_status, to_status):
        raise ApiError(
            422,
            "invalid_status_transition",
            f"Cannot transition from '{from_status.value}' to '{to_status.value}'",
        )


def allowed_next_statuses(from_status: OrderStatus) -> list[OrderStatus]:
    """Return the list of statuses an order in `from_status` can move to.

    Useful for the frontend to render valid status buttons.
    """
    return sorted(_TRANSITIONS.get(from_status, set()), key=lambda s: s.value)
