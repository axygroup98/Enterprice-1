import { LayoutDashboard, Monitor, GitCompareArrows, BarChart3, Plug, Settings } from 'lucide-react';

export type Page = 'dashboard' | 'monitor' | 'conciliacao' | 'analisar' | 'integrar' | 'administrar';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'monitor',     label: 'Monitorar',   icon: Monitor },
  { id: 'conciliacao', label: 'Conciliação', icon: GitCompareArrows },
  { id: 'analisar',    label: 'Analisar',    icon: BarChart3 },
  { id: 'integrar',    label: 'Integrar',    icon: Plug },
  { id: 'administrar', label: 'Administrar', icon: Settings },
];

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  criticalCount?: number;
}

export function Sidebar({ current, onNavigate, criticalCount }: Props) {
  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-slate-900 flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold leading-none">CIO</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">CIO Enterprise</p>
            <p className="text-slate-400 text-xs leading-tight">Axy Group</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'conciliacao' && criticalCount != null && criticalCount > 0 && (
                <span className="flex-shrink-0 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {criticalCount > 99 ? '99+' : criticalCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-700/50">
        <p className="text-slate-500 text-xs text-center">v1.0.0 — Centro de Inteligência</p>
      </div>
    </aside>
  );
}
