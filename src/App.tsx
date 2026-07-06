import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Page } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Monitor } from './pages/Monitor';
import { Conciliation } from './pages/Conciliation';
import { Analyze } from './pages/Analyze';
import { Integrate } from './pages/Integrate';
import { Admin } from './pages/Admin';
import { supabase } from './lib/supabase';

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    async function fetchCritical() {
      const { count } = await supabase
        .from('divergences')
        .select('*', { count: 'exact', head: true })
        .eq('priority', 'critical')
        .eq('resolved', false)
        .eq('ignored', false);
      setCriticalCount(count ?? 0);
    }
    fetchCritical();
    const interval = setInterval(fetchCritical, 60000);
    return () => clearInterval(interval);
  }, []);

  function renderPage() {
    switch (page) {
      case 'dashboard':   return <Dashboard onNavigate={setPage} />;
      case 'monitor':     return <Monitor />;
      case 'conciliacao': return <Conciliation />;
      case 'analisar':    return <Analyze onNavigate={setPage} />;
      case 'integrar':    return <Integrate />;
      case 'administrar': return <Admin />;
    }
  }

  return (
    <Layout current={page} onNavigate={setPage} criticalCount={criticalCount}>
      {renderPage()}
    </Layout>
  );
}

export default App;
