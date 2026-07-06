import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient, insertAuditRecord } from '../_shared/db.ts';
import * as Bling from '../_shared/bling.ts';
import * as ML from '../_shared/ml.ts';
import * as Shopee from '../_shared/shopee.ts';

type Priority = 'critical' | 'high' | 'medium' | 'informative';

interface DivergenceRow {
  product_name: string;
  sku: string;
  divergence_type: string;
  priority: Priority;
  erp_value: string | null;
  ml_value: string | null;
  shopee_value: string | null;
  recommended_action: string;
  marketplace: 'mercadolivre' | 'shopee' | 'both';
  ml_item_id: string | null;
  shopee_item_id: string | null;
}

function priorityForStock(erp: number, mp: number): Priority {
  if (mp > erp) return 'critical';
  if (erp > 0 && mp === 0) return 'high';
  if (Math.abs(erp - mp) <= 2) return 'medium';
  return 'high';
}

// ─── Passo 1: buscar dados reais (nunca mock) e calcular divergências ───────
async function computeDivergences(): Promise<{ rows: DivergenceRow[]; notConfigured: string[] }> {
  const notConfigured: string[] = [];

  const blingRes = await Bling.getProducts();
  if (!blingRes.ok) {
    // Sem o ERP não há como comparar nada (ele é a fonte da verdade). Aborta
    // com uma mensagem clara em vez de mostrar divergências parciais/erradas.
    throw new Error(`Bling: ${blingRes.error}`);
  }
  const products = blingRes.data;
  const erpMap = new Map(products.map((p) => [p.sku, p]));

  const mlRes = await ML.getListings();
  const mlListings = mlRes.ok ? mlRes.data : (notConfigured.push('mercadolivre'), []);

  const shopeeRes = await Shopee.getListings();
  const shopeeListings = shopeeRes.ok ? shopeeRes.data : (notConfigured.push('shopee'), []);

  const rows: DivergenceRow[] = [];

  for (const ml of mlListings) {
    const erp = erpMap.get(ml.sku);
    if (!erp) {
      rows.push({
        product_name: ml.title, sku: ml.sku, divergence_type: 'orphan', priority: 'critical',
        erp_value: null, ml_value: String(ml.stock), shopee_value: null,
        recommended_action: 'Encerrar anúncio no Mercado Livre', marketplace: 'mercadolivre',
        ml_item_id: ml.itemId, shopee_item_id: null,
      });
      continue;
    }
    if (erp.stock !== ml.stock) {
      rows.push({
        product_name: erp.name, sku: erp.sku, divergence_type: 'stock',
        priority: priorityForStock(erp.stock, ml.stock),
        erp_value: String(erp.stock), ml_value: String(ml.stock), shopee_value: null,
        recommended_action: erp.stock === 0 ? 'Zerar estoque no Mercado Livre' : 'Atualizar estoque no Mercado Livre',
        marketplace: 'mercadolivre', ml_item_id: ml.itemId, shopee_item_id: null,
      });
    }
    if (ml.status === 'paused' && erp.stock > 0) {
      rows.push({
        product_name: erp.name, sku: erp.sku, divergence_type: 'status', priority: 'high',
        erp_value: String(erp.stock), ml_value: ml.status, shopee_value: null,
        recommended_action: 'Reativar anúncio no Mercado Livre', marketplace: 'mercadolivre',
        ml_item_id: ml.itemId, shopee_item_id: null,
      });
    }
  }

  for (const sh of shopeeListings) {
    const erp = erpMap.get(sh.sku);
    if (!erp) {
      rows.push({
        product_name: sh.name, sku: sh.sku, divergence_type: 'orphan', priority: 'critical',
        erp_value: null, ml_value: null, shopee_value: String(sh.stock),
        recommended_action: 'Encerrar anúncio na Shopee', marketplace: 'shopee',
        ml_item_id: null, shopee_item_id: String(sh.itemId),
      });
      continue;
    }
    if (erp.stock !== sh.stock) {
      rows.push({
        product_name: erp.name, sku: erp.sku, divergence_type: 'stock',
        priority: priorityForStock(erp.stock, sh.stock),
        erp_value: String(erp.stock), ml_value: null, shopee_value: String(sh.stock),
        recommended_action: erp.stock === 0 ? 'Zerar estoque na Shopee' : 'Atualizar estoque na Shopee',
        marketplace: 'shopee', ml_item_id: null, shopee_item_id: String(sh.itemId),
      });
    }
  }

  for (const erp of products) {
    if (!erp.hasPhoto) {
      rows.push({
        product_name: erp.name, sku: erp.sku, divergence_type: 'photo', priority: 'informative',
        erp_value: 'sem foto', ml_value: null, shopee_value: null,
        recommended_action: 'Adicionar foto ao produto no ERP', marketplace: 'both',
        ml_item_id: null, shopee_item_id: null,
      });
    }
    if (!erp.hasDescription) {
      rows.push({
        product_name: erp.name, sku: erp.sku, divergence_type: 'description', priority: 'informative',
        erp_value: 'sem descrição', ml_value: null, shopee_value: null,
        recommended_action: 'Adicionar descrição ao produto no ERP', marketplace: 'both',
        ml_item_id: null, shopee_item_id: null,
      });
    }
  }

  return { rows, notConfigured };
}

// ─── Passo 2: aplicar uma correção real via API oficial ─────────────────────
async function applyFix(div: { divergence_type: string; marketplace: string; erp_value: string | null; ml_item_id: string | null; shopee_item_id: string | null }): Promise<{ ok: boolean; error?: string }> {
  if (div.marketplace === 'mercadolivre' || div.marketplace === 'both') {
    if (div.divergence_type === 'stock' && div.ml_item_id) {
      const r = await ML.updateStock(div.ml_item_id, Number(div.erp_value ?? 0));
      if (!r.ok) return r;
    } else if (div.divergence_type === 'orphan' && div.ml_item_id) {
      const r = await ML.closeListing(div.ml_item_id);
      if (!r.ok) return r;
    }
  }
  if (div.marketplace === 'shopee' || div.marketplace === 'both') {
    if (div.divergence_type === 'stock' && div.shopee_item_id) {
      const r = await Shopee.updateStock(Number(div.shopee_item_id), Number(div.erp_value ?? 0));
      if (!r.ok) return r;
    } else if (div.divergence_type === 'orphan' && div.shopee_item_id) {
      const r = await Shopee.unlistItem(Number(div.shopee_item_id));
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let action = '';
  let params: Record<string, unknown> = {};
  try {
    const body = await req.json();
    action = body.action;
    params = body.params ?? {};
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido' }, 400);
  }

  const db = serviceClient();

  if (action === 'refresh_divergences') {
    try {
      const { rows, notConfigured } = await computeDivergences();
      const now = new Date().toISOString();
      await db.from('divergences').delete().eq('resolved', false).eq('ignored', false);
      if (rows.length > 0) {
        await db.from('divergences').insert(rows.map((r) => ({ ...r, resolved: false, resolved_at: null, ignored: false, created_at: now, updated_at: now })));
      }
      const { data } = await db.from('divergences').select('*').eq('resolved', false).eq('ignored', false).order('priority', { ascending: true });
      return jsonResponse({ ok: true, data: data ?? [], notConfigured });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await insertAuditRecord({ module: 'conciliacao', description: 'Falha ao calcular divergências', result: 'error', details: { error: message } });
      return jsonResponse({ ok: false, error: message });
    }
  }

  if (action === 'fix_one') {
    const { divergenceId } = params as { divergenceId: string };
    const { data: div } = await db.from('divergences').select('*').eq('id', divergenceId).maybeSingle();
    if (!div) return jsonResponse({ ok: false, error: 'Divergência não encontrada' });
    const result = await applyFix(div);
    if (result.ok) await db.from('divergences').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', divergenceId);
    return jsonResponse(result);
  }

  if (action === 'conciliar_todos') {
    const { data: divergences } = await db.from('divergences').select('*').eq('resolved', false).eq('ignored', false);
    const t0 = Date.now();
    let updated = 0, errors = 0, ignored = 0;
    const details: Array<{ sku: string; status: string; message: string }> = [];

    for (const div of divergences ?? []) {
      if (div.divergence_type === 'photo' || div.divergence_type === 'description') {
        ignored++;
        details.push({ sku: div.sku, status: 'ignored', message: 'Requer ação manual no ERP' });
        continue;
      }
      const result = await applyFix(div);
      if (result.ok) {
        await db.from('divergences').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', div.id);
        updated++;
        details.push({ sku: div.sku, status: 'success', message: div.recommended_action });
      } else {
        errors++;
        details.push({ sku: div.sku, status: 'error', message: result.error ?? 'Erro desconhecido' });
      }
    }

    const durationMs = Date.now() - t0;
    await insertAuditRecord({
      module: 'conciliacao',
      description: `Conciliação em massa: ${updated} atualizados, ${ignored} ignorados, ${errors} erros`,
      result: errors === 0 ? 'success' : updated > 0 ? 'partial' : 'error',
      details: { updated, ignored, errors, durationMs },
    });

    return jsonResponse({ ok: true, updated, ignored, errors, durationMs, details });
  }

  if (action === 'update_integrations') {
    const t0 = Date.now();
    const [blingRes, mlRes, shopeeRes] = await Promise.all([Bling.testConnection(), ML.testConnection(), Shopee.testConnection()]);
    await insertAuditRecord({
      module: 'integrar',
      description: 'Atualização de integrações executada',
      result: blingRes.ok && mlRes.ok && shopeeRes.ok ? 'success' : 'partial',
      details: { bling: blingRes, mercadolivre: mlRes, shopee: shopeeRes },
    });
    return jsonResponse({
      bling: { success: blingRes.ok, durationMs: blingRes.ms, error: blingRes.error },
      mercadolivre: { success: mlRes.ok, durationMs: mlRes.ms, error: mlRes.error },
      shopee: { success: shopeeRes.ok, durationMs: shopeeRes.ms, error: shopeeRes.error },
      totalDurationMs: Date.now() - t0,
    });
  }

  return jsonResponse({ ok: false, error: `Ação desconhecida: ${action}` }, 400);
});
