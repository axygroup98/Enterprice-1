import { Sidebar, Page } from './Sidebar';

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  criticalCount?: number;
  children: React.ReactNode;
}

export function Layout({ current, onNavigate, criticalCount, children }: Props) {
  const titles: Record<Page, string> = {
    dashboard:   'Dashboard',
    monitor:     'Monitorar',
    conciliacao: 'Conciliação',
    analisar:    'Analisar',
    integrar:    'Integrar',
    administrar: 'Administrar',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar current={current} onNavigate={onNavigate} criticalCount={criticalCount} />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-30">
          <h1 className="text-lg font-semibold text-gray-900">{titles[current]}</h1>
        </header>
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
