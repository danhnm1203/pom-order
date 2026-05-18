"""Unit tests for order status transitions.

Policy (see services/order_status.py): any → any allowed except no-op.
Operators frequently mis-tap and need to revert; audit log captures changes
so opening transitions up is safer than blocking corrections.
"""

import pytest

from app.exceptions import ApiError
from app.models.order import OrderStatus
from app.services.order_status import (
    allowed_next_statuses,
    is_valid_transition,
    validate_transition,
)


class TestValidTransitions:
    """Every distinct (from, to) pair is valid."""

    @pytest.mark.parametrize(
        "from_status, to_status",
        [
            # Forward lifecycle (new 10-state model)
            (OrderStatus.CHATTING, OrderStatus.ORDER_PLACED),
            (OrderStatus.ORDER_PLACED, OrderStatus.PURCHASED),
            (OrderStatus.PURCHASED, OrderStatus.AT_KR_WAREHOUSE),
            (OrderStatus.AT_KR_WAREHOUSE, OrderStatus.AT_VN_WAREHOUSE),
            (OrderStatus.AT_VN_WAREHOUSE, OrderStatus.RECEIVED_BY_OWNER),
            (OrderStatus.RECEIVED_BY_OWNER, OrderStatus.SHIPPING_TO_CUSTOMER),
            (OrderStatus.SHIPPING_TO_CUSTOMER, OrderStatus.CUSTOMER_RECEIVED),
            # Skip-ahead
            (OrderStatus.CHATTING, OrderStatus.CUSTOMER_RECEIVED),
            (OrderStatus.ORDER_PLACED, OrderStatus.AT_VN_WAREHOUSE),
            # Backward (mis-click recovery — the main reason for opening up)
            (OrderStatus.SHIPPING_TO_CUSTOMER, OrderStatus.RECEIVED_BY_OWNER),
            (OrderStatus.CUSTOMER_RECEIVED, OrderStatus.CHATTING),
            # Cancelled is no longer terminal
            (OrderStatus.CANCELLED, OrderStatus.PURCHASED),
            (OrderStatus.CANCELLED, OrderStatus.CHATTING),
            # Problem ↔ anything
            (OrderStatus.PURCHASED, OrderStatus.PROBLEM),
            (OrderStatus.PROBLEM, OrderStatus.PURCHASED),
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
            (OrderStatus.CHATTING, OrderStatus.ORDER_PLACED),
            (OrderStatus.CUSTOMER_RECEIVED, OrderStatus.CHATTING),
        ],
    )
    def test_validate_transition_no_raise(
        self, from_status: OrderStatus, to_status: OrderStatus
    ) -> None:
        validate_transition(from_status, to_status)  # no exception


class TestInvalidTransitions:
    """Only no-op (same → same) is rejected."""

    @pytest.mark.parametrize("status", list(OrderStatus))
    def test_noop_is_rejected(self, status: OrderStatus) -> None:
        assert is_valid_transition(status, status) is False

    def test_validate_noop_raises_422(self) -> None:
        with pytest.raises(ApiError) as exc_info:
            validate_transition(OrderStatus.CHATTING, OrderStatus.CHATTING)
        assert exc_info.value.status_code == 422
        assert exc_info.value.code == "invalid_status_transition"
        assert "chatting" in exc_info.value.message


class TestAllowedNextStatuses:
    """Helper for frontend status buttons: returns every other status."""

    @pytest.mark.parametrize("from_status", list(OrderStatus))
    def test_returns_every_other_status(self, from_status: OrderStatus) -> None:
        result = allowed_next_statuses(from_status)
        assert from_status not in result
        assert len(result) == len(list(OrderStatus)) - 1

    def test_returns_in_lifecycle_order(self) -> None:
        # Enum-declaration order is the lifecycle: chatting → order_placed → ... → cancelled.
        # Removing one preserves the remaining order.
        result = allowed_next_statuses(OrderStatus.AT_VN_WAREHOUSE)
        expected = [s for s in OrderStatus if s != OrderStatus.AT_VN_WAREHOUSE]
        assert result == expected
