import { Priority } from '../types';

interface Props {
  priority: Priority;
  size?: 'sm' | 'md';
}

const config: Record<Priority, { label: string; dot: string; bg: string; text: string }> = {
  critical: { label: 'Crítico', dot: 'bg-red-500', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
  high:     { label: 'Alto',    dot: 'bg-orange-500', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
  medium:   { label: 'Médio',   dot: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700' },
  informative: { label: 'Info', dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
};

export function PriorityBadge({ priority, size = 'md' }: Props) {
  const c = config[priority];
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${px} ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: Priority }) {
  const c = config[priority];
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.dot}`} title={c.label} />;
}
