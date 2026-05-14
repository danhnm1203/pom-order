import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { type OrderStatus } from '@/types/api'

interface StatusBadgeProps {
  status: OrderStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation()
  return (
    <span className={cn('badge', `badge--${status.replace('_', '-')}`, className)}>
      {t(`status.${status}`)}
    </span>
  )
}
