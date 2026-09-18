// کمک‌کننده‌های Cloudflare D1 - جایگزین کالکشن‌های پرترافیک Firestore.
// این فایل عمداً همون شکل ورودی/خروجی lib-firestore.js رو تقلید می‌کنه (path کامل شامل
// docId برای get/set/update/delete، و مسیر کالکشن برای list/add) تا worker.js فقط با یه
// شرط ساده تصمیم بگیره از کدوم بک‌اند استفاده کنه، بدون این‌که منطق دیگه‌ای عوض بشه.

function nowMs() {
    return Date.now();
}

// آی‌دی خودکار شبیه Firestore auto-id: به‌ترتیب زمانی هم قابل مرتب‌سازیه
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// 'taskDeliveries/task123/threads/uid456' -> { collection: 'taskDeliveries/task123/threads', docId: 'uid456' }
function splitPath(path) {
    const parts = String(path).split('/').filter(Boolean);
    const docId = parts.pop();
    const collection = parts.join('/');
    return { collection, docId };
}

async function d1Get(env, path) {
    const { collection, docId } = splitPath(path);
    const row = await env.DB.prepare(
        `SELECT data FROM fs_documents WHERE collection = ? AND doc_id = ?`
    ).bind(collection, docId).first();
    if (!row) return null;
    return JSON.parse(row.data);
}

async function d1Set(env, path, data) {
    const { collection, docId } = splitPath(path);
    const payload = data || {};
    const createdAtMs = payload.createdAtMs || nowMs();
    await env.DB.prepare(
        `INSERT INTO fs_documents (collection, doc_id, data, created_at_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection, doc_id) DO UPDATE SET data = excluded.data, created_at_ms = excluded.created_at_ms`
    ).bind(collection, docId, JSON.stringify(payload), createdAtMs).run();
    return { name: `${collection}/${docId}` };
}

// آپدیت جزئی - فقط فیلدهای داده‌شده رو تغییر می‌ده، بقیه دست‌نخورده می‌مونن (مثل .update())
async function d1Update(env, path, data) {
    const { collection, docId } = splitPath(path);
    const existing = (await d1Get(env, path)) || {};
    const merged = { ...existing, ...(data || {}) };
    const createdAtMs = merged.createdAtMs || nowMs();
    await env.DB.prepare(
        `INSERT INTO fs_documents (collection, doc_id, data, created_at_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection, doc_id) DO UPDATE SET data = excluded.data, created_at_ms = excluded.created_at_ms`
    ).bind(collection, docId, JSON.stringify(merged), createdAtMs).run();
}

async function d1Delete(env, path) {
    const { collection, docId } = splitPath(path);
    await env.DB.prepare(`DELETE FROM fs_documents WHERE collection = ? AND doc_id = ?`).bind(collection, docId).run();
}

// افزودن سند با شناسه‌ی خودکار - مثل .collection(x).add()
async function d1Add(env, collectionPath, data) {
    const docId = generateId();
    const payload = data || {};
    const createdAtMs = payload.createdAtMs || nowMs();
    await env.DB.prepare(
        `INSERT INTO fs_documents (collection, doc_id, data, created_at_ms) VALUES (?, ?, ?, ?)`
    ).bind(collectionPath, docId, JSON.stringify(payload), createdAtMs).run();
    return { id: docId, ...payload };
}

// لیست یک کالکشن، با مرتب‌سازی اختیاری - مثل .collection(x).orderBy(f,'desc').get()
async function d1List(env, collectionPath, opts = {}) {
    const limit = opts.limit || 100;
    const params = [collectionPath];
    let sql = `SELECT doc_id, data FROM fs_documents WHERE collection = ?`;

    if (opts.orderByField) {
        // json_extract با مسیر به‌صورت پارامتر بایند می‌شه، پس امن در برابر SQL injection هست
        sql += ` ORDER BY json_extract(data, ?) ${opts.orderByDir === 'desc' ? 'DESC' : 'ASC'}`;
        params.push('$.' + opts.orderByField);
    } else {
        sql += ` ORDER BY created_at_ms ASC`;
    }
    sql += ` LIMIT ?`;
    params.push(limit);

    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return (results || []).map((row) => ({ id: row.doc_id, ...JSON.parse(row.data) }));
}

export { d1Get, d1Set, d1Update, d1Delete, d1Add, d1List };
