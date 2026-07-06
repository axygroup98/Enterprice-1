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

function priorityForStockGap(erp: number, mp: number): Priority {
  // Marketplace has MORE stock than ERP → critical (overselling risk)
  if (mp > erp) return 'critical';
  // ERP has stock but marketplace is zero → high (lost sales)
  if (erp > 0 && mp === 0) return 'high';
  // Small gap (≤2 units) → medium
  if (Math.abs(erp - mp) <= 2) return 'medium';
  return 'high';
}

async function computeDivergences(): Promise<{ rows: DivergenceRow[]; notConfigured: string[] }> {
  const notConfigured: string[] = [];

  const blingRes = await Bling.getProducts();
  if (!blingRes.ok) {
    // ERP is the single source of truth — without it we cannot compare anything.
    throw new Error(`Bling: ${blingRes.error}`);
  }
  const products = blingRes.data;
  // Build SKU → product map; skip products with empty SKU (cannot reconcile)
  const erpBySku = new Map(products.filter((p) => p.sku.trim() !== '').map((p) => [p.sku.trim(), p]));

  const mlRes = await ML.getListings();
  const mlListings = mlRes.ok ? mlRes.data : (notConfigured.push('mercadolivre'), [] as ML.MLListing[]);

  const shopeeRes = await Shopee.getListings();
  const shopeeListings = shopeeRes.ok ? shopeeRes.data : (notConfigured.push('shopee'), [] as Shopee.ShopeeListing[]);

  const rows: DivergenceRow[] = [];

  // ── Mercado Livre ──────────────────────────────────────────────────────────
  for (const ml of mlListings) {
    // RULE: Never use marketplace listing ID as SKU.
    // If the listing has no SELLER_SKU attribute, it cannot be reliably linked
    // to the ERP. Create an "unlinked" notice — never treat itemId as a SKU,
    // never auto-close without a confirmed ERP match.
    if (!ml.hasSkuAttribute || ml.sku.trim() === '') {
      rows.push({
        product_name: ml.title,
        sku: `ML:${ml.itemId}`,          // prefix makes clear this is NOT an ERP SKU
        divergence_type: 'unlinked',
        priority: 'informative',
        erp_value: null,
        ml_value: String(ml.stock),
        shopee_value: null,
        recommended_action:
          'Anúncio no Mercado Livre sem SKU vinculado ao ERP. Cadastre o SELLER_SKU no anúncio para permitir a conciliação automática.',
        marketplace: 'mercadolivre',
        ml_item_id: ml.itemId,
        shopee_item_id: null,
      });
      continue;
    }

    const sku = ml.sku.trim();
    const erp = erpBySku.get(sku);

    if (!erp) {
      // SKU exists in ML but not in ERP → true orphan.
      // FLAG as needing manual review — do NOT auto-close.
      rows.push({
        product_name: ml.title,
        sku,
        divergence_type: 'unlinked',
        priority: 'high',
        erp_value: null,
        ml_value: String(ml.stock),
        shopee_value: null,
        recommended_action:
          'Anúncio no Mercado Livre com SKU não encontrado no ERP. Verifique se o SKU está correto ou cadastre o produto no ERP antes de tomar qualquer ação.',
        marketplace: 'mercadolivre',
        ml_item_id: ml.itemId,
        shopee_item_id: null,
      });
      continue;
    }

    // Linked product — check stock divergence
    if (erp.stock !== ml.stock) {
      rows.push({
        product_name: erp.name,
        sku: erp.sku,
        divergence_type: 'stock',
        priority: priorityForStockGap(erp.stock, ml.stock),
        erp_value: String(erp.stock),
        ml_value: String(ml.stock),
        shopee_value: null,
        recommended_action:
          erp.stock === 0
            ? 'Zerar estoque no Mercado Livre (ERP: 0)'
            : `Atualizar estoque no Mercado Livre para ${erp.stock} (ERP)`,
        marketplace: 'mercadolivre',
        ml_item_id: ml.itemId,
        shopee_item_id: null,
      });
    }

    // Check paused listing with available ERP stock
    if (ml.status === 'paused' && erp.stock > 0) {
      rows.push({
        product_name: erp.name,
        sku: erp.sku,
        divergence_type: 'status',
        priority: 'high',
        erp_value: String(erp.stock),
        ml_value: ml.status,
        shopee_value: null,
        recommended_action: 'Reativar anúncio no Mercado Livre (ERP tem estoque disponível)',
        marketplace: 'mercadolivre',
        ml_item_id: ml.itemId,
        shopee_item_id: null,
      });
    }
  }

  // ── Shopee ─────────────────────────────────────────────────────────────────
  for (const sh of shopeeListings) {
    if (!sh.hasSkuAttribute || sh.sku.trim() === '') {
      rows.push({
        product_name: sh.name,
        sku: `SH:${sh.itemId}`,          // prefix makes clear this is NOT an ERP SKU
        divergence_type: 'unlinked',
        priority: 'informative',
        erp_value: null,
        ml_value: null,
        shopee_value: String(sh.stock),
        recommended_action:
          'Anúncio na Shopee sem SKU vinculado ao ERP. Cadastre o item_sku no produto para permitir a conciliação automática.',
        marketplace: 'shopee',
        ml_item_id: null,
        shopee_item_id: String(sh.itemId),
      });
      continue;
    }

    const sku = sh.sku.trim();
    const erp = erpBySku.get(sku);

    if (!erp) {
      rows.push({
        product_name: sh.name,
        sku,
        divergence_type: 'unlinked',
        priority: 'high',
        erp_value: null,
        ml_value: null,
        shopee_value: String(sh.stock),
        recommended_action:
          'Anúncio na Shopee com SKU não encontrado no ERP. Verifique se o SKU está correto ou cadastre o produto no ERP antes de tomar qualquer ação.',
        marketplace: 'shopee',
        ml_item_id: null,
        shopee_item_id: String(sh.itemId),
      });
      continue;
    }

    if (erp.stock !== sh.stock) {
      rows.push({
        product_name: erp.name,
        sku: erp.sku,
        divergence_type: 'stock',
        priority: priorityForStockGap(erp.stock, sh.stock),
        erp_value: String(erp.stock),
        ml_value: null,
        shopee_value: String(sh.stock),
        recommended_action:
          erp.stock === 0
            ? 'Zerar estoque na Shopee (ERP: 0)'
            : `Atualizar estoque na Shopee para ${erp.stock} (ERP)`,
        marketplace: 'shopee',
        ml_item_id: null,
        shopee_item_id: String(sh.itemId),
      });
    }
  }

  // ── ERP quality checks ─────────────────────────────────────────────────────
  for (const erp of products) {
    if (!erp.hasPhoto) {
      rows.push({
        product_name: erp.name,
        sku: erp.sku || `ERP:${erp.id}`,
        divergence_type: 'photo',
        priority: 'informative',
        erp_value: 'sem foto',
        ml_value: null,
        shopee_value: null,
        recommended_action: 'Adicionar foto ao produto no ERP',
        marketplace: 'both',
        ml_item_id: null,
        shopee_item_id: null,
      });
    }
    if (!erp.hasDescription) {
      rows.push({
        product_name: erp.name,
        sku: erp.sku || `ERP:${erp.id}`,
        divergence_type: 'description',
        priority: 'informative',
        erp_value: 'sem descrição',
        ml_value: null,
        shopee_value: null,
        recommended_action: 'Adicionar descrição ao produto no ERP',
        marketplace: 'both',
        ml_item_id: null,
        shopee_item_id: null,
      });
    }
  }

  return { rows, notConfigured };
}

// Apply a fix. Only applies to stock divergences where the marketplace item ID
// is confirmed. Never auto-closes or acts on 'unlinked' divergences.
async function applyFix(div: {
  divergence_type: string;
  marketplace: string;
  erp_value: string | null;
  ml_item_id: string | null;
  shopee_item_id: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  // GUARD: never auto-act on unlinked/orphan entries — require manual review
  if (div.divergence_type === 'unlinked') {
    return { ok: false, skipped: true, error: 'Anúncio sem vínculo confiável com o ERP. Ação manual necessária.' };
  }
  if (div.divergence_type === 'photo' || div.divergence_type === 'description') {
    return { ok: false, skipped: true, error: 'Requer ação manual no ERP.' };
  }

  if (div.marketplace === 'mercadolivre' || div.marketplace === 'both') {
    if (!div.ml_item_id) return { ok: false, error: 'ml_item_id ausente.' };

    if (div.divergence_type === 'stock') {
      const r = await ML.updateStock(div.ml_item_id, Number(div.erp_value ?? 0));
      if (!r.ok) return r;
    } else if (div.divergence_type === 'status') {
      // Reactivate paused listing — only if ERP confirms stock
      const r = await ML.reactivateListing(div.ml_item_id);
      if (!r.ok) return r;
    }
  }

  if (div.marketplace === 'shopee' || div.marketplace === 'both') {
    if (!div.shopee_item_id) return { ok: false, error: 'shopee_item_id ausente.' };

    if (div.divergence_type === 'stock') {
      const r = await Shopee.updateStock(Number(div.shopee_item_id), Number(div.erp_value ?? 0));
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

  // ── refresh_divergences ────────────────────────────────────────────────────
  if (action === 'refresh_divergences') {
    try {
      const { rows, notConfigured } = await computeDivergences();
      const now = new Date().toISOString();
      await db.from('divergences').delete().eq('resolved', false).eq('ignored', false);
      if (rows.length > 0) {
        await db.from('divergences').insert(
          rows.map((r) => ({
            ...r,
            resolved: false,
            resolved_at: null,
            ignored: false,
            created_at: now,
            updated_at: now,
          }))
        );
      }
      const { data } = await db
        .from('divergences')
        .select('*')
        .eq('resolved', false)
        .eq('ignored', false)
        .order('priority', { ascending: true });
      return jsonResponse({ ok: true, data: data ?? [], notConfigured });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await insertAuditRecord({
        module: 'conciliacao',
        description: 'Falha ao calcular divergências',
        result: 'error',
        details: { error: message },
      });
      return jsonResponse({ ok: false, error: message });
    }
  }

  // ── fix_one ────────────────────────────────────────────────────────────────
  if (action === 'fix_one') {
    const { divergenceId } = params as { divergenceId: string };
    const { data: div } = await db
      .from('divergences')
      .select('*')
      .eq('id', divergenceId)
      .maybeSingle();
    if (!div) return jsonResponse({ ok: false, error: 'Divergência não encontrada' });

    const result = await applyFix(div);
    if (result.skipped) {
      return jsonResponse({ ok: false, error: result.error });
    }
    if (result.ok) {
      await db
        .from('divergences')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', divergenceId);
    }
    return jsonResponse(result);
  }

  // ── conciliar_todos ────────────────────────────────────────────────────────
  if (action === 'conciliar_todos') {
    const { data: divergences } = await db
      .from('divergences')
      .select('*')
      .eq('resolved', false)
      .eq('ignored', false);
    const t0 = Date.now();
    let updated = 0, errors = 0, ignored = 0;
    const details: Array<{ sku: string; status: string; message: string }> = [];

    for (const div of divergences ?? []) {
      const result = await applyFix(div);
      if (result.skipped) {
        ignored++;
        details.push({ sku: div.sku, status: 'ignored', message: result.error ?? 'Ignorado' });
        continue;
      }
      if (result.ok) {
        await db
          .from('divergences')
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq('id', div.id);
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

  // ── update_integrations ────────────────────────────────────────────────────
  if (action === 'update_integrations') {
    const t0 = Date.now();
    const [blingRes, mlRes, shopeeRes] = await Promise.all([
      Bling.testConnection(),
      ML.testConnection(),
      Shopee.testConnection(),
    ]);
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
