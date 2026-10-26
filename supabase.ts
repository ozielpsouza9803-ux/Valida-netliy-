import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://utrpckrchcbqgzbhvlzy.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_YkRZNDptF3UTgjhFjL2wVw_InE5wV7L';

function getCleanSupabaseConfig() {
  const rawUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL)
    ? String(import.meta.env.VITE_SUPABASE_URL)
    : '';
  const matchUrl = rawUrl.trim().match(/https:\/\/[a-z0-9.-]+\.supabase\.co/i)?.[0] 
    || rawUrl.trim().match(/https?:\/\/[^\s]+/)?.[0];
  const cleanUrl = matchUrl || DEFAULT_SUPABASE_URL;

  const rawKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY)
    ? String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim()
    : '';
  const anonKey = rawKey ? rawKey.split(/\s+/)[0] : DEFAULT_SUPABASE_ANON_KEY;

  return { cleanUrl, anonKey };
}

export const { cleanUrl: SUPABASE_CLEAN_URL, anonKey: SUPABASE_CLEAN_KEY } = getCleanSupabaseConfig();
// Cliente Supabase público seguro (usa chave anônima/publicável sanitizada)
export const supabase = createClient(SUPABASE_CLEAN_URL, SUPABASE_CLEAN_KEY);

function apiUnavailable(status: number): boolean {
  return status === 403 || status === 404 || status === 405 || status === 501;
}

function readableError(error: any, fallback: string): string {
  return error?.message || fallback;
}


// IDs dos perfis mestres existentes no Supabase para garantir integridade referencial
export const DEFAULT_ADMIN_PROFILE_ID = 'ab0ffd20-0846-44c0-9660-b79b6a3015f3';
export const DEFAULT_FAMILY_PROFILE_ID = '18df26ac-e2f3-4160-b872-30dfb55ba6c0';
export const DEFAULT_SPONSOR_PROFILE_ID = '7a3e5cac-f4cc-4f8b-b3e7-488ffb4fef13';

export interface SupabaseDataResult {
  kids: any[];
  gifts: any[];
  siteSettings: any | null;
  gallery: any[];
  profiles: any[];
  error?: string | null;
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.from('kids').select('id').limit(1);
    if (error) {
      return { ok: false, message: `Erro ao conectar com Supabase: ${error.message}` };
    }
    return { ok: true, message: 'Conexão com Supabase ativa e respondendo com sucesso.' };
  } catch (err: any) {
    return { ok: false, message: `Falha de rede/conexão: ${err?.message || err}` };
  }
}

export async function fetchAllSupabaseData(): Promise<SupabaseDataResult | null> {
  // 1. Tentar rota de API backend se disponível (utiliza SUPABASE_SERVICE_ROLE_KEY no servidor de forma protegida)
  try {
    const apiRes = await fetch('/api/supabase/data', {
    });
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json && typeof json === 'object') {
        return {
          kids: Array.isArray(json.kids) ? json.kids : [],
          gifts: Array.isArray(json.gifts) ? json.gifts : [],
          siteSettings: json.siteSettings || null,
          gallery: Array.isArray(json.gallery) ? json.gallery : [],
          profiles: Array.isArray(json.profiles) ? json.profiles : [],
          error: json.error || null
        };
      }
    }
  } catch {
    // API backend não disponível, prossegue com consulta direta pelo cliente Supabase
  }

  // 2. Consulta direta via cliente Supabase com tratamento individual para cada tabela
  try {
    const [kidsResult, giftsResult, settingsResult, galleryResult, profilesResult] = await Promise.allSettled([
      supabase.from('kids').select('*').order('created_at', { ascending: true }),
      supabase.from('gifts').select('*'),
      supabase.from('site_settings').select('*').limit(1),
      supabase.from('gallery').select('*').order('sort_order', { ascending: true }),
      supabase.from('profiles').select('*')
    ]);

    const kids = (kidsResult.status === 'fulfilled' && !kidsResult.value.error) ? (kidsResult.value.data || []) : [];
    const gifts = (giftsResult.status === 'fulfilled' && !giftsResult.value.error) ? (giftsResult.value.data || []) : [];
    const siteSettings = (settingsResult.status === 'fulfilled' && !settingsResult.value.error) ? (settingsResult.value.data?.[0] || null) : null;
    const gallery = (galleryResult.status === 'fulfilled' && !galleryResult.value.error) ? (galleryResult.value.data || []) : [];
    const profiles = (profilesResult.status === 'fulfilled' && !profilesResult.value.error) ? (profilesResult.value.data || []) : [];

    // Erros críticos apenas se tabelas públicas essenciais falharem
    const criticalErrors: string[] = [];
    if (kidsResult.status === 'fulfilled' && kidsResult.value.error) criticalErrors.push(`Kids: ${kidsResult.value.error.message}`);
    if (galleryResult.status === 'fulfilled' && galleryResult.value.error) criticalErrors.push(`Gallery: ${galleryResult.value.error.message}`);
    if (settingsResult.status === 'fulfilled' && settingsResult.value.error) criticalErrors.push(`Settings: ${settingsResult.value.error.message}`);

    // Log discreto para restrições RLS em gifts e profiles sem bloquear o carregamento
    if (giftsResult.status === 'fulfilled' && giftsResult.value.error) {
      console.warn('Nota RLS gifts (acesso restrito ao servidor):', giftsResult.value.error.message);
    }
    if (profilesResult.status === 'fulfilled' && profilesResult.value.error) {
      console.warn('Nota RLS profiles (acesso restrito ao servidor):', profilesResult.value.error.message);
    }

    return {
      kids,
      gifts,
      siteSettings,
      gallery,
      profiles,
      error: criticalErrors.length > 0 ? criticalErrors.join(' | ') : null
    };
  } catch (err: any) {
    console.error('Error fetching data from Supabase:', err);
    return {
      kids: [],
      gifts: [],
      siteSettings: null,
      gallery: [],
      profiles: [],
      error: err?.message || 'Falha imprevista na conexão com o Supabase'
    };
  }
}

export interface KidInput {
  family_id?: string;
  name: string;
  age?: number | string;
  birth_date?: string | null;
  gender?: string;
  status?: string;
  likes?: string;
  dream?: string;
  address?: string;
  image?: string;
  photo_path?: string;
  letter: string;
  wishlist?: any;
  approved?: boolean;
}

/**
 * Insere uma nova criança na tabela 'kids' do Supabase via backend seguro
 */
export async function createKidInSupabase(input: KidInput) {
  const targetFamilyId = (input.family_id && input.family_id.length === 36)
    ? input.family_id 
    : DEFAULT_ADMIN_PROFILE_ID;

  const row = {
    family_id: targetFamilyId,
    name: input.name.trim(),
    age: input.age !== undefined ? String(input.age) : '8',
    birth_date: input.birth_date || null,
    gender: input.gender || 'Infantil',
    status: input.status || 'Aguardando Apadrinhamento',
    likes: input.likes || null,
    dream: input.dream || null,
    address: input.address || null,
    photo_path: input.photo_path || input.image || null,
    image: input.image || input.photo_path || null,
    letter: input.letter?.trim() || 'Querido Papai Noel, gostaria de ganhar um presente especial de Natal!',
    wishlist: input.wishlist || null,
    approved: input.approved !== undefined ? input.approved : true
  };

  try {
    const apiRes = await fetch('/api/supabase/kids', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row)
    });

    const json = await apiRes.json().catch(() => null);
    if (apiRes.ok && json?.data) return { data: json.data, error: null };
    if (!apiUnavailable(apiRes.status)) {
      return { data: null, error: { message: json?.error || `Erro no servidor backend (${apiRes.status})`, code: json?.code } };
    }
  } catch { /* hospedagem estática: usar Supabase autenticado abaixo */ }

  let result = await supabase.from('kids').insert([row]).select().single();
  if (result.error && /column .*image|image.*column|schema cache/i.test(result.error.message)) {
    const { image, ...withoutImage } = row;
    result = await supabase.from('kids').insert([withoutImage]).select().single();
  }
  return result.error ? { data: null, error: { message: readableError(result.error, 'Não foi possível cadastrar a criança. Verifique o acesso administrativo.') } } : { data: result.data, error: null };
}

/**
 * Atualiza os dados de uma criança existente via backend seguro
 */
export async function updateKidInSupabase(id: string, updates: Partial<KidInput>) {
  const row: Record<string, any> = {};
  if (updates.name !== undefined) row.name = updates.name.trim();
  if (updates.age !== undefined) row.age = String(updates.age);
  if (updates.letter !== undefined) row.letter = updates.letter.trim();
  if (updates.image !== undefined) {
    row.image = updates.image;
    row.photo_path = updates.image;
  }
  if (updates.photo_path !== undefined) {
    row.photo_path = updates.photo_path;
  }
  if (updates.birth_date !== undefined) row.birth_date = updates.birth_date;
  if (updates.gender !== undefined) row.gender = updates.gender;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.likes !== undefined) row.likes = updates.likes;
  if (updates.dream !== undefined) row.dream = updates.dream;
  if (updates.address !== undefined) row.address = updates.address;
  if (updates.wishlist !== undefined) row.wishlist = updates.wishlist;
  if (updates.approved !== undefined) row.approved = updates.approved;

  try {
    const apiRes = await fetch(`/api/supabase/kids/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row)
    });

    const json = await apiRes.json().catch(() => null);
    if (apiRes.ok && json?.data) return { data: json.data, error: null };
    if (!apiUnavailable(apiRes.status)) return { data: null, error: { message: json?.error || `Erro no servidor backend (${apiRes.status})` } };
  } catch { /* hospedagem estática: usar Supabase autenticado abaixo */ }

  let result = await supabase.from('kids').update(row).eq('id', id).select().maybeSingle();
  if (result.error && /column .*image|image.*column|schema cache/i.test(result.error.message)) {
    const { image, ...withoutImage } = row;
    result = await supabase.from('kids').update(withoutImage).eq('id', id).select().maybeSingle();
  }
  if (result.error) return { data: null, error: { message: result.error.message } };
  if (!result.data) return { data: null, error: { message: 'Nenhuma criança foi atualizada. Confirme o acesso e o ID.' } };
  return { data: result.data, error: null };
}

/**
 * Exclui uma criança na tabela 'kids' via backend seguro
 */
export async function deleteKidInSupabase(id: string) {
  try {
    const apiRes = await fetch(`/api/supabase/kids/${id}`, {
      method: 'DELETE',
    });

    const json = await apiRes.json().catch(() => null);
    if (apiRes.ok) return { error: null };
    if (!apiUnavailable(apiRes.status)) return { error: { message: json?.error || `Erro no servidor backend (${apiRes.status})` } };
  } catch { /* hospedagem estática: usar Supabase autenticado abaixo */ }

  const gifts = await supabase.from('gifts').delete().eq('kid_id', id);
  if (gifts.error) return { error: { message: `Não foi possível remover os presentes relacionados: ${gifts.error.message}` } };
  const result = await supabase.from('kids').delete().eq('id', id).select('id').maybeSingle();
  if (result.error) return { error: { message: result.error.message } };
  if (!result.data) return { error: { message: 'Nenhuma criança foi removida. Confirme o acesso administrativo.' } };
  return { error: null };
}


/**
 * Exclui um perfil na tabela 'profiles' via backend seguro
 */
export async function deleteProfileInSupabase(id: string) {
  try {
    const apiRes = await fetch(`/api/supabase/profiles/${id}`, {
      method: 'DELETE',
    });

    const json = await apiRes.json().catch(() => null);
    if (apiRes.ok) return { error: null };
    if (!apiUnavailable(apiRes.status)) return { error: { message: json?.error || `Erro no servidor backend (${apiRes.status})` } };
  } catch { /* hospedagem estática: usar Supabase autenticado abaixo */ }

  const result = await supabase.from('profiles').delete().eq('id', id).select('id').maybeSingle();
  if (result.error) return { error: { message: result.error.message } };
  if (!result.data) return { error: { message: 'Nenhum perfil foi removido. Confirme o acesso administrativo.' } };
  return { error: null };
}

export interface ProfileUpdateInput {
  name?: string;
  phone?: string | null;
  bio?: string | null;
  photo_path?: string | null;
  birth_date?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

/**
 * Atualiza um perfil na tabela 'profiles' via backend seguro
 */
export async function updateProfileInSupabase(id: string, updates: ProfileUpdateInput) {
  const row: Record<string, any> = {
    updated_at: new Date().toISOString()
  };

  if (updates.name !== undefined) row.name = updates.name.trim();
  if (updates.phone !== undefined) row.phone = updates.phone;
  if (updates.bio !== undefined) row.bio = updates.bio;
  if (updates.photo_path !== undefined) row.photo_path = updates.photo_path;
  if (updates.birth_date !== undefined) row.birth_date = updates.birth_date;
  if (updates.address_line !== undefined) row.address_line = updates.address_line;
  if (updates.city !== undefined) row.city = updates.city;
  if (updates.state !== undefined) row.state = updates.state;
  if (updates.postal_code !== undefined) row.postal_code = updates.postal_code;

  try {
    const apiRes = await fetch(`/api/supabase/profiles/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row)
    });

    const json = await apiRes.json().catch(() => null);
    if (apiRes.ok && json?.data) return { data: json.data, error: null };
    if (!apiUnavailable(apiRes.status)) return { data: null, error: { message: json?.error || `Erro no servidor backend (${apiRes.status})` } };
  } catch { /* hospedagem estática: usar Supabase autenticado abaixo */ }

  const result = await supabase.from('profiles').update(row).eq('id', id).select().maybeSingle();
  if (result.error) return { data: null, error: { message: result.error.message } };
  if (!result.data) return { data: null, error: { message: 'Nenhum perfil foi atualizado. Confirme o acesso administrativo.' } };
  return { data: result.data, error: null };
}


export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

export interface GalleryPhotoRecord {
  id: string;
  path: string;
  url: string;
  type?: string;
  title?: string | null;
  created_at?: string;
}

/**
 * Envia a mídia diretamente ao Supabase Storage e só confirma sucesso
 * depois de gravar também o registro na tabela gallery. Não cria falsos
 * registros locais como se o upload remoto tivesse sido concluído.
 */
export async function uploadGalleryPhotoToSupabase(
  file: File,
  _base64Data?: string
): Promise<{ data?: GalleryPhotoRecord; error?: string }> {
  let storagePath: string | null = null;
  try {
    if (!file || file.size === 0) return { error: 'O arquivo está vazio.' };
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : (file.type === 'video/mp4' ? 'mp4' : 'jpg');
    const uniqueName = `gallery_${Date.now()}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${ext}`;
    storagePath = `gallery/${uniqueName}`;
    const contentType = file.type || (ext === 'mp4' ? 'video/mp4' : 'application/octet-stream');

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, file, { contentType, upsert: false, cacheControl: '3600' });
    if (uploadError) {
      return { error: `Falha ao enviar arquivo para o Supabase Storage: ${uploadError.message}` };
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('gallery')
      .insert({
        path: storagePath,
        type: file.type?.startsWith('video') ? 'v' : 'i',
        section: 'home',
        is_active: true,
        sort_order: 0
      })
      .select('id,path,type,title,created_at');

    if (insertError || !insertedRows?.[0]) {
      // Evita deixar arquivo órfão quando o registro da galeria não é gravado.
      await supabase.storage.from('media').remove([storagePath]).catch(() => undefined);
      return { error: `O arquivo foi enviado, mas não foi registrado na galeria: ${insertError?.message || 'o Supabase não retornou o registro.'}` };
    }

    const inserted = insertedRows[0];
    return {
      data: {
        id: inserted.id,
        path: inserted.path || storagePath,
        url: `${SUPABASE_CLEAN_URL}/storage/v1/object/public/media/${inserted.path || storagePath}`,
        type: inserted.type,
        title: inserted.title,
        created_at: inserted.created_at
      }
    };
  } catch (err: any) {
    if (storagePath) {
      try { await supabase.storage.from('media').remove([storagePath]); } catch {}
    }
    return { error: err?.message || 'Falha inesperada ao salvar a mídia no Supabase.' };
  }
}

/**
 * Exclui uma mídia remota e retorna erro real quando a operação é recusada.
 */
export async function deleteGalleryPhotoFromSupabase(target: {
  id?: string;
  path?: string;
  url?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let path = target.path;
    if (!path && target.url) {
      const marker = '/storage/v1/object/public/media/';
      if (target.url.includes(marker)) path = decodeURIComponent(target.url.split(marker)[1].split('?')[0]);
    }
    if (!target.id && !path) return { success: false, error: 'Não foi possível identificar a mídia para exclusão.' };
    if (target.id && !target.id.startsWith('local_')) {
      const { error } = await supabase.from('gallery').delete().eq('id', target.id);
      if (error) return { success: false, error: `Não foi possível excluir o registro da galeria: ${error.message}` };
    } else if (path && !path.startsWith('data:')) {
      const { error } = await supabase.from('gallery').delete().eq('path', path);
      if (error) return { success: false, error: `Não foi possível excluir o registro da galeria: ${error.message}` };
    }
    if (path && !path.startsWith('data:') && !path.startsWith('http')) {
      const { error } = await supabase.storage.from('media').remove([path]);
      if (error) return { success: false, error: `O registro foi removido, mas o arquivo no Storage não: ${error.message}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha inesperada ao excluir a mídia.' };
  }
}

/**
 * Busca fotos salvas no Supabase
 */
export async function fetchGalleryFromSupabase(): Promise<GalleryPhotoRecord[]> {
  try {
    // 1. Tentar backend
    try {
      const apiRes = await fetch('/api/supabase/gallery', {
        });
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.data && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {}

    // 2. Consulta direta
    const { data, error } = await supabase
      .from('gallery')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      path: row.path,
      type: row.type,
      created_at: row.created_at,
      title: row.title,
      url: row.path?.startsWith('http') || row.path?.startsWith('data:')
        ? row.path
        : `${SUPABASE_CLEAN_URL}/storage/v1/object/public/media/${row.path}`
    }));
  } catch {
    return [];
  }
}

/**
 * Salva configurações no Supabase. O endpoint Express é opcional; em hospedagem
 * estática como Netlify, usa a tabela site_settings diretamente com a chave pública
 * e as políticas RLS já configuradas no projeto.
 */
export async function updateSiteSettingsInSupabase(slidesData: any) {
  try {
    try {
      const apiRes = await fetch('/api/supabase/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: slidesData })
      });
      const json = await apiRes.json().catch(() => null);
      if (apiRes.ok && json?.data) return { data: json.data, error: null };
    } catch { /* A publicação estática não tem necessariamente uma rota Express. */ }

    const { data: existing, error: readError } = await supabase.from('site_settings').select('id').limit(1);
    if (readError) return { data: null, error: `Não foi possível consultar site_settings: ${readError.message}` };
    const current = existing?.[0];
    const payload = { slides: slidesData, updated_at: new Date().toISOString() };
    const result = current?.id
      ? await supabase.from('site_settings').update(payload).eq('id', current.id).select().single()
      : await supabase.from('site_settings').insert(payload).select().single();
    if (result.error) return { data: null, error: `Não foi possível salvar site_settings: ${result.error.message}` };
    return { data: result.data, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Erro ao salvar configurações do site.' };
  }
}

/**
 * Cria um novo perfil na tabela 'profiles' do Supabase via backend seguro
 */
export async function createProfileInSupabase(input: { name: string; email?: string; phone?: string; bio?: string; role: string; photo_path?: string }) {
  const row = {
    name: input.name.trim(),
    email: input.email || null,
    phone: input.phone || null,
    bio: input.bio || null,
    role: input.role,
    photo_path: input.photo_path || null,
    updated_at: new Date().toISOString()
  };

  try {
    const apiRes = await fetch('/api/supabase/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row)
    });
    const json = await apiRes.json().catch(() => null);
    if (apiRes.ok && json?.data) return { data: json.data, error: null };
    if (apiUnavailable(apiRes.status)) {
      return { data: null, error: { message: 'O cadastro de usuário precisa de uma função de servidor segura para criar o usuário no Supabase Auth e o perfil correspondente. Esta publicação estática não possui essa função.' } };
    }
    return { data: null, error: { message: json?.error || `Erro no servidor backend (${apiRes.status})` } };
  } catch (proxyErr: any) {
    return { data: null, error: { message: proxyErr?.message || 'Falha ao conectar com o servidor backend.' } };
  }
}


/**
 * Busca perfis na tabela 'profiles' filtrando por role ('sponsor' ou 'family') respeitando a RLS
 */
export async function fetchProfilesByRole(role: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', role);

    if (error) {
      console.warn(`Nota ao buscar perfis com role=${role}:`, error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error(`Erro ao buscar perfis com role=${role}:`, err);
    return [];
  }
}

