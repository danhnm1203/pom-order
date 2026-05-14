"""Unit tests for order status state machine."""

import pytest

from app.exceptions import ApiError
from app.models.order import OrderStatus
from app.services.order_status import (
    allowed_next_statuses,
    is_valid_transition,
    validate_transition,
)


class TestValidTransitions:
    """Happy path: documented valid transitions."""

    @pytest.mark.parametrize(
        "from_status, to_status",
        [
            (OrderStatus.PENDING, OrderStatus.ORDERED),
            (OrderStatus.ORDERED, OrderStatus.IN_TRANSIT),
            (OrderStatus.IN_TRANSIT, OrderStatus.ARRIVED),
            (OrderStatus.ARRIVED, OrderStatus.DELIVERED),
            (OrderStatus.DELIVERED, OrderStatus.COMPLETED),
            (OrderStatus.PENDING, OrderStatus.CANCELLED),
            (OrderStatus.ORDERED, OrderStatus.PROBLEM),
            (OrderStatus.PROBLEM, OrderStatus.ORDERED),  # recover from problem
            (OrderStatus.PROBLEM, OrderStatus.CANCELLED),
        ],
    )
    def test_valid_transition_returns_true(
        self, from_status: OrderStatus, to_status: OrderStatus
    ) -> None:
        assert is_valid_transition(from_status, to_status) is True

    @pytest.mark.parametrize(
        "from_status, to_status",
        [
            (OrderStatus.PENDING, OrderStatus.ORDERED),
            (OrderStatus.ORDERED, OrderStatus.IN_TRANSIT),
        ],
    )
    def test_validate_transition_no_raise(
        self, from_status: OrderStatus, to_status: OrderStatus
    ) -> None:
        validate_transition(from_status, to_status)  # no exception


class TestInvalidTransitions:
    """Forbidden transitions raise 422."""

    @pytest.mark.parametrize(
        "from_status, to_status",
        [
            # Cannot jump from pending straight to completed
            (OrderStatus.PENDING, OrderStatus.COMPLETED),
            # Cannot go backwards from completed to pending
            (OrderStatus.COMPLETED, OrderStatus.PENDING),
            # Cancelled is terminal — no escape
            (OrderStatus.CANCELLED, OrderStatus.ORDERED),
            (OrderStatus.CANCELLED, OrderStatus.PENDING),
            # No-op transition not allowed
            (OrderStatus.PENDING, OrderStatus.PENDING),
        ],
    )
    def test_invalid_transition_returns_false(
        self, from_status: OrderStatus, to_status: OrderStatus
    ) -> None:
        assert is_valid_transition(from_status, to_status) is False

    def test_validate_transition_raises_422(self) -> None:
        with pytest.raises(ApiError) as exc_info:
            validate_transition(OrderStatus.PENDING, OrderStatus.COMPLETED)
        assert exc_info.value.status_code == 422
        assert exc_info.value.code == "invalid_status_transition"
        assert "pending" in exc_info.value.message
        assert "completed" in exc_info.value.message


class TestAllowedNextStatuses:
    """Helper for frontend status buttons."""

    def test_pending_can_transition_to_three_statuses(self) -> None:
        result = allowed_next_statuses(OrderStatus.PENDING)
        assert OrderStatus.ORDERED in result
        assert OrderStatus.CANCELLED in result
        assert OrderStatus.PROBLEM in result
        assert OrderStatus.COMPLETED not in result

    def test_cancelled_is_terminal(self) -> None:
        result = allowed_next_statuses(OrderStatus.CANCELLED)
        assert result == []

    def test_problem_can_recover_to_many_statuses(self) -> None:
        result = allowed_next_statuses(OrderStatus.PROBLEM)
        assert len(result) >= 4  # can resume to most non-pending states
