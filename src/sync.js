// ============================================================
// FashionKiller Intake — Sync Engine
// ============================================================
// Offline-first architecture:
//   Local IndexedDB is the primary store (fast, always available).
//   Supabase is the cloud replica (durable, multi-device).
//   Sync runs on save, on load, and periodically.
//
// Conflict resolution: last-write-wins using updated_at timestamps.
//
// Image handling:
//   Images are stored in Supabase Storage under {user_id}/{image_id}.jpg
//   Local IndexedDB stores base64 data URLs (same as current app).
//   On sync: upload any local images not yet in cloud; download any cloud images not in local.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Auth ----
export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  return { message: 'Check your email for a login link.' };
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// ---- Products CRUD ----
export async function fetchProducts(userId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertProduct(product, userId) {
  const row = productToRow(product, userId);
  const { data, error } = await supabase
    .from('products')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProductCloud(productId) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);
  if (error) throw error;
}

// ---- Settings ----
export async function fetchSettings(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

export async function upsertSettings(settings, userId) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      currency: settings.currency || 'ZAR',
      default_duty_multiplier: settings.defaultDutyMultiplier || 1.34,
      target_margin_pct: settings.targetMarginPct || 60,
      sidebar_width: settings.sidebarWidth || 280,
    });
  if (error) throw error;
}

// ---- Image Storage ----
export async function uploadImage(userId, imageId, base64DataUrl) {
  const base64 = base64DataUrl.split(',')[1];
  const blob = base64ToBlob(base64, 'image/jpeg');
  const path = `${userId}/${imageId}.jpg`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

export async function downloadImage(userId, imageId) {
  const path = `${userId}/${imageId}.jpg`;
  const { data, error } = await supabase.storage
    .from('product-images')
    .download(path);
  if (error) return null;
  return await blobToDataUrl(data);
}

export async function deleteImageCloud(userId, imageId) {
  const path = `${userId}/${imageId}.jpg`;
  await supabase.storage
    .from('product-images')
    .remove([path]);
}

// ---- Conversion helpers ----
function productToRow(p, userId) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name || '',
    code: p.code || '',
    keywords: p.keywords || '',
    description: p.description || '',
    short_description: p.shortDescription || '',
    category: p.category || '',
    tags: p.tags || '',
    sizes: p.sizes || [],
    colours: p.colours || [],
    stock_by_size: p.stockBySize || {},
    cost_price: parseFloat(p.costPrice) || null,
    shipping_per_unit: parseFloat(p.shippingPerUnit) || null,
    duty_multiplier: parseFloat(p.dutyMultiplier) || 1.34,
    retail_price: parseFloat(p.retailPrice) || null,
    sale_price: parseFloat(p.salePrice) || null,
    currency: p.currency || 'ZAR',
    weight_grams: parseInt(p.weightGrams) || null,
    supplier_name: p.supplierName || '',
    supplier_url: p.supplierUrl || '',
    specs: p.specs || {},
    sizing_chart_data: p.sizingChartData || [],
    care_instructions: p.careInstructions || '',
    model_info: p.modelInfo || '',
    slot1_status: p.slot1Status || 'empty',
    slot2_status: p.slot2Status || 'empty',
    slot3_status: p.slot3Status || 'empty',
    manual_review_done: p.manualReviewDone || false,
    // Image IDs stored as arrays — actual files in Supabase Storage
    slot1_image_paths: p.slot1ImageIds || [],
    slot2_image_paths: p.slot2ImageIds || [],
    slot3_image_paths: p.slot3ImageIds || [],
    gallery_image_paths: p.galleryImageIds || [],
    primary_image_path: (p.slot1ImageIds && p.slot1ImageIds[0]) || (p.imageIds && p.imageIds[0]) || null,
    sizing_chart_image_path: (p.slot2ImageIds && p.slot2ImageIds[0]) || p.sizingChartId || null,
    sort_order: p.sortOrder || 0,
  };
}

export function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name || '',
    code: row.code || '',
    keywords: row.keywords || '',
    description: row.description || '',
    shortDescription: row.short_description || '',
    category: row.category || '',
    tags: row.tags || '',
    sizes: row.sizes || [],
    colours: row.colours || [],
    stockBySize: row.stock_by_size || {},
    costPrice: row.cost_price != null ? String(row.cost_price) : '',
    shippingPerUnit: row.shipping_per_unit != null ? String(row.shipping_per_unit) : '',
    dutyMultiplier: row.duty_multiplier != null ? String(row.duty_multiplier) : '1.34',
    retailPrice: row.retail_price != null ? String(row.retail_price) : '',
    salePrice: row.sale_price != null ? String(row.sale_price) : '',
    currency: row.currency || 'ZAR',
    weightGrams: row.weight_grams != null ? String(row.weight_grams) : '',
    supplierName: row.supplier_name || '',
    supplierUrl: row.supplier_url || '',
    specs: row.specs || {},
    sizingChartData: row.sizing_chart_data || [],
    careInstructions: row.care_instructions || '',
    modelInfo: row.model_info || '',
    slot1Status: row.slot1_status || 'empty',
    slot2Status: row.slot2_status || 'empty',
    slot3Status: row.slot3_status || 'empty',
    manualReviewDone: row.manual_review_done || false,
    slot1ImageIds: row.slot1_image_paths || [],
    slot2ImageIds: row.slot2_image_paths || [],
    slot3ImageIds: row.slot3_image_paths || [],
    galleryImageIds: row.gallery_image_paths || [],
    imageIds: row.primary_image_path ? [row.primary_image_path] : [],
    sizingChartId: row.sizing_chart_image_path || null,
    sortOrder: row.sort_order || 0,
    // Timestamps for conflict resolution
    _cloudUpdatedAt: row.updated_at,
  };
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

// ---- Full Sync (bi-directional) ----
// Called on login, on app load, and periodically.
// Returns { products, settings } from cloud.
export async function fullSync(userId, localProducts, localSettings, localImageStore) {
  console.log('[Sync] Starting full sync...');

  // 1. Sync settings
  const cloudSettings = await fetchSettings(userId);
  if (cloudSettings) {
    // Cloud wins for settings (simple — no per-field merging)
    await upsertSettings(localSettings, userId);
  } else {
    await upsertSettings(localSettings, userId);
  }

  // 2. Fetch all cloud products
  const cloudProducts = await fetchProducts(userId);
  const cloudMap = new Map(cloudProducts.map(p => [p.id, p]));

  // 3. Push local products to cloud (upsert)
  for (const lp of localProducts) {
    await upsertProduct(lp, userId);

    // 4. Upload any local images not yet in cloud
    const allImageIds = [
      ...(lp.slot1ImageIds || []),
      ...(lp.slot2ImageIds || []),
      ...(lp.slot3ImageIds || []),
      ...(lp.galleryImageIds || []),
      ...(lp.imageIds || []),
      ...(lp.sizingChartId ? [lp.sizingChartId] : []),
    ];
    for (const imgId of [...new Set(allImageIds)]) {
      try {
        const localData = await localImageStore.get(imgId);
        if (localData) {
          await uploadImage(userId, imgId, localData);
        }
      } catch (e) {
        console.warn('[Sync] Image upload failed:', imgId, e.message);
      }
    }
  }

  // 5. Pull cloud products not in local
  const localIds = new Set(localProducts.map(p => p.id));
  const newFromCloud = [];
  for (const [id, cloudRow] of cloudMap) {
    if (!localIds.has(id)) {
      newFromCloud.push(rowToProduct(cloudRow));
    }
  }

  console.log(`[Sync] Pushed ${localProducts.length} local, pulled ${newFromCloud.length} new from cloud`);
  return { newProducts: newFromCloud };
}

export { supabase };
