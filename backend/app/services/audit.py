"""Audit log service — generic entity change tracking.

Pom Order's `audit_log` table has SELECT RLS policy only; no INSERT policy.
This is by design: only backend-controlled inserts (via direct Postgres connection
as the `postgres` superuser) should write audit entries. Frontend cannot insert
audit rows even if it tried.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log_audit(
    db: AsyncSession,
    *,
    shop_id: UUID,
    entity_type: str,
    entity_id: UUID,
    action: str,
    actor_id: UUID | None,
    changes: dict[str, Any] | None = None,
) -> AuditLog:
    """Insert an audit log row. Does NOT commit (caller controls transaction).

    Args:
        entity_type: 'order' | 'payment' | 'customer' | 'fx_rate' | ...
        action: 'created' | 'status_changed' | 'updated' | 'deleted' | 'refunded' | ...
        actor_id: Supabase auth.users.id; None for system actions.
        changes: free-form JSONB. Recommend shape {"from": {...}, "to": {...}}.
    """
    entry = AuditLog(
        shop_id=shop_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        changes=changes,
    )
    db.add(entry)
    await db.flush()
    return entry
