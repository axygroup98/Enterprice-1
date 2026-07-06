export type Priority = 'critical' | 'high' | 'medium' | 'informative';
export type DivergenceType = 'stock' | 'title' | 'status' | 'photo' | 'description' | 'price' | 'orphan';
export type Marketplace = 'mercadolivre' | 'shopee' | 'both';
export type SyncStatus = 'success' | 'error' | 'partial';
export type AuditResult = 'success' | 'error' | 'partial' | 'info';
export type IntegrationSource = 'bling' | 'mercadolivre' | 'shopee' | 'system';

export interface SystemConfig {
  key: string;
  value: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  created_at: string;
  source: IntegrationSource;
  operation: string;
  status: SyncStatus;
  duration_ms: number | null;
  details: Record<string, unknown>;
}

export interface Divergence {
  id: string;
  created_at: string;
  updated_at: string;
  product_name: string;
  sku: string;
  divergence_type: DivergenceType;
  priority: Priority;
  erp_value: string | null;
  ml_value: string | null;
  shopee_value: string | null;
  recommended_action: string;
  marketplace: Marketplace;
  ml_item_id: string | null;
  shopee_item_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  ignored: boolean;
}

export interface AuditRecord {
  id: string;
  created_at: string;
  module: string;
  description: string;
  result: AuditResult;
  details: Record<string, unknown>;
}

export interface IntegrationStatus {
  source: IntegrationSource;
  label: string;
  connected: boolean;
  lastSync: string | null;
  responseMs: number | null;
  errorCount: number;
  tokenConfigured: boolean;
}

export interface DashboardSummary {
  critical: number;
  high: number;
  medium: number;
  informative: number;
  ordersToday: number;
  pendingOrders: number;
  stoppedOrders: number;
}

export interface ProductMonitor {
  sku: string;
  name: string;
  erpStock: number;
  mlStock: number | null;
  shopeeStock: number | null;
  hasPhoto: boolean;
  hasDescription: boolean;
  hasVideo: boolean;
  mlStatus: 'active' | 'paused' | 'closed' | 'not_listed' | null;
  shopeeStatus: 'active' | 'paused' | 'closed' | 'not_listed' | null;
}

export interface OrderMonitor {
  id: string;
  marketplace: 'mercadolivre' | 'shopee';
  status: 'new' | 'paid' | 'awaiting_nf' | 'separating' | 'shipped' | 'delivered' | 'stopped';
  buyerName: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  daysStopped?: number;
}

export interface ConciliationResult {
  updated: number;
  ignored: number;
  errors: number;
  durationMs: number;
  details: Array<{ sku: string; status: 'success' | 'error' | 'ignored'; message: string }>;
}

export interface UpdateIntegrationsResult {
  bling: { success: boolean; durationMs: number; error?: string };
  mercadolivre: { success: boolean; durationMs: number; error?: string };
  shopee: { success: boolean; durationMs: number; error?: string };
  totalDurationMs: number;
}
