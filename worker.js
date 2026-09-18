// این فایل روی سرورهای Cloudflare اجرا می‌شود (نه در مرورگر کاربر)، پس هیچ‌کدام از این توکن‌ها
// (تلگرام، فایربیس، ایمیل‌جی‌اس) هرگز برای کاربر قابل مشاهده نیست. همه در
// Settings → Variables and Secrets پروژه‌ی Cloudflare ذخیره می‌شوند.
//
// این نسخه دیگر هیچ تماس مستقیمی بین مرورگر کاربر و سرورهای Google/Firebase انجام نمی‌دهد
// (چون بعضی کاربران از ایران بدون فیلترشکن به identitytoolkit.googleapis.com دسترسی نداشتند).
// به‌جایش: ورود با «کد ۶ رقمی ایمیل» یا «ثبت‌نام تلفنی»، و تمام عملیات نوشتن/خواندنِ محافظت‌شده
// روی Firestore، از طریق همین Worker (با Service Account) انجام می‌شود.

import { firestoreSet, firestoreGet, firestoreDelete, firestoreAdd, firestoreUpdate, firestoreList } from './lib-firestore.js';
import { d1Set, d1Get, d1Delete, d1Add, d1Update, d1List } from './lib-d1.js';
import { signTicket, verifyTicket } from './lib-ticket.js';

// کالکشن‌هایی که به D1 منتقل شدن (کم‌حجم‌تر نگه‌داشتن Firestore، چون سهمیه‌ی رایگانش تنگ‌تره).
// بقیه (notes, videos, users, pendingRequests, editors, taskAssignees, adminActions, verifiedEmails, settings)
// همچنان روی Firestore می‌مونن. برای هر مسیر (حتی تودرتو مثل taskDeliveries/x/threads/y/messages)
// فقط بخش اولش چک می‌شه.
const D1_TOP_LEVEL_COLLECTIONS = new Set([
    'announcements', 'notifications', 'notifDismissed', 'subjects',
    'collabCalls', 'tasks', 'taskDeliveries', 'publicChat', 'anonChat',
    'adminChat', 'reports', 'authCodes', 'sessions'
]);
function usesD1(path) {
    return D1_TOP_LEVEL_COLLECTIONS.has(String(path).split('/')[0]);
}
async function fsList(env, path, opts) { return usesD1(path) ? d1List(env, path, opts) : firestoreList(env, path, opts); }
async function fsGet(env, path) { return usesD1(path) ? d1Get(env, path) : firestoreGet(env, path); }
async function fsSet(env, path, data) { return usesD1(path) ? d1Set(env, path, data) : firestoreSet(env, path, data); }
async function fsUpdate(env, path, data) { return usesD1(path) ? d1Update(env, path, data) : firestoreUpdate(env, path, data); }
async function fsDelete(env, path) { return usesD1(path) ? d1Delete(env, path) : firestoreDelete(env, path); }
async function fsAdd(env, path, data) { return usesD1(path) ? d1Add(env, path, data) : firestoreAdd(env, path, data); }

const ADMIN_EMAIL = 'hamrahanjozveh@gmail.com';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ۳۰ روز

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const p = url.pathname;
        let response;

        try {
            if (p === '/telegram-upload' && request.method === 'POST') response = await handleTelegramUpload(request, env);
            else if (p === '/telegram-file' && request.method === 'GET') response = await handleTelegramFileProxy(request, env);
            else if (p === '/api/auth/request-code' && request.method === 'POST') response = await handleRequestCode(request, env);
            else if (p === '/api/auth/verify-code' && request.method === 'POST') response = await handleVerifyCode(request, env);
            else if (p === '/api/auth/complete-login' && request.method === 'POST') response = await handleCompleteLogin(request, env);
            else if (p === '/api/auth/register' && request.method === 'POST') response = await handleRegister(request, env);
            else if (p === '/api/auth/login' && request.method === 'POST') response = await handleLogin(request, env);
            else if (p === '/api/auth/google/start' && request.method === 'GET') response = await handleGoogleStart(request, env);
            else if (p === '/api/auth/google/callback' && request.method === 'GET') response = await handleGoogleCallback(request, env);
            else if (p === '/api/auth/google/verify-token' && request.method === 'POST') response = await handleGoogleVerifyToken(request, env);
            else if (p === '/api/auth/session-status' && request.method === 'POST') response = await handleSessionStatus(request, env);
            else if (p === '/api/fs' && request.method === 'POST') response = await handleFsProxy(request, env);
            else if (p === '/api/admin/migrate-to-d1' && request.method === 'POST') response = await handleMigrateToD1(request, env);
            else if (p === '/api/account/sessions' && request.method === 'GET') response = await handleListSessions(request, env);
            else if (p === '/api/account/sessions/revoke' && request.method === 'POST') response = await handleRevokeSession(request, env);
            else response = await env.ASSETS.fetch(request); // فایل‌های استاتیک (index.html و ...)
        } catch (e) {
            response = jsonRes({ error: e.message || 'خطای داخلی سرور' }, 500);
        }

        return addSecurityHeaders(response);
    },

    // ---------- خودکارسازی نظارت: هر بار که Cron اجرا می‌شه چک می‌کنه ----------
    // اگه پیامی ۵ گزارشِ در انتظار داشته باشه و ۲ ساعت از رسیدنش به این آستانه گذشته باشه
    // ولی هنوز ادمین اقدامی نکرده، خودکار (soft) حذف می‌شه.
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runAutoModeration(env));
    }
};

const AUTO_MOD_THRESHOLD = 5;
const AUTO_MOD_GRACE_MS = 2 * 60 * 60 * 1000; // ۲ ساعت

async function runAutoModeration(env) {
    try {
        const messages = await fsList(env, 'publicChat', {});
        const now = Date.now();
        for (const m of messages) {
            if (m.deleted) continue;
            if (!m.reportCount || m.reportCount < AUTO_MOD_THRESHOLD) continue;
            if (!m.thresholdReachedAtMs) continue;
            if (now - m.thresholdReachedAtMs < AUTO_MOD_GRACE_MS) continue;

            // آیا هنوز گزارش «در انتظار»ی برای این پیام هست؟ اگه ادمین قبلاً رسیدگی کرده، نادیده بگیر
            const reports = await fsList(env, 'reports', {});
            const stillPending = reports.some(r => r.messageId === m.id && r.status === 'pending');
            if (!stillPending) continue;

            await fsUpdate(env, `publicChat/${m.id}`, { deleted: true, deletedAtMs: now, deletedBy: 'auto' });
            for (const r of reports.filter(r => r.messageId === m.id && r.status === 'pending')) {
                await fsUpdate(env, `reports/${r.id}`, { status: 'action_taken' });
            }
            await firestoreAdd(env, 'adminActions', {
                type: 'auto_moderation', messageId: m.id, adminUid: 'system', createdAtMs: now
            });
        }
    } catch (e) {
        console.error('runAutoModeration error:', e);
    }
}

// هدرهای امنیتی استاندارد روی همه‌ی پاسخ‌ها (چه صفحه‌ی اصلی، چه API)
function addSecurityHeaders(response) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Frame-Options', 'DENY'); // جلوگیری از قرار گرفتن سایت داخل iframe سایت‌های دیگر (Clickjacking)
    newHeaders.set('X-Content-Type-Options', 'nosniff'); // مرورگر نوع فایل رو حدس نزنه
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    newHeaders.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains'); // فقط HTTPS
    newHeaders.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self)');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}

function jsonRes(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeId(str) {
    return String(str).toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '_');
}

async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- رمزنگاری رمز عبور (PBKDF2 با Web Crypto، بومی Cloudflare Workers، بدون کتابخانه‌ی خارجی) ----------
async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const iterations = 100000;
    const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
    const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${iterations}:${saltHex}:${hashHex}`;
}
async function verifyPassword(password, stored) {
    if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
    const [iterStr, saltHex, hashHex] = stored.split(':');
    const iterations = parseInt(iterStr, 10);
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
    const computedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (computedHex.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
}

async function getSession(request, env) {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    const payload = await verifyTicket(env.WORKER_AUTH_SECRET, token);
    if (!payload) return null;
    // نشست‌های قدیمی‌تر (بدون sid) هنوز کار می‌کنن؛ فقط نشست‌های جدید قابل ابطال‌اند
    if (payload.sid) {
        const sessionDoc = await fsGet(env, `sessions/${payload.sid}`);
        if (!sessionDoc || sessionDoc.revoked) return null;
    }
    return payload;
}

// یک «نشست قابل‌ابطال» می‌سازه: هم توکن امضاشده رو برمی‌گردونه، هم یک رکورد در D1
// ذخیره می‌کنه تا بشه بعداً از پروفایل کاربر لیستش کرد یا باطلش کرد.
async function createSession(env, request, payload) {
    const sid = crypto.randomUUID();
    const exp = payload.exp || (Date.now() + SESSION_TTL_MS);
    const ticket = await signTicket(env.WORKER_AUTH_SECRET, { ...payload, sid, exp });
    await fsSet(env, `sessions/${sid}`, {
        uid: payload.uid || null,
        email: payload.email || null,
        kind: payload.kind || null,
        isAdmin: !!payload.isAdmin,
        userAgent: request.headers.get('User-Agent') || '',
        createdAtMs: Date.now(),
        exp,
        revoked: false
    });
    return ticket;
}

async function handleListSessions(request, env) {
    const session = await getSession(request, env);
    if (!session) return jsonRes({ error: 'نشست نامعتبر است' }, 401);
    const all = await fsList(env, 'sessions', {});
    const mine = all
        .filter(s => s.uid && s.uid === session.uid && !s.revoked && (!s.exp || s.exp > Date.now()))
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
        .map(s => ({ id: s.id, userAgent: s.userAgent || '', createdAtMs: s.createdAtMs || 0, current: s.id === session.sid }));
    return jsonRes({ sessions: mine });
}

async function handleRevokeSession(request, env) {
    const session = await getSession(request, env);
    if (!session) return jsonRes({ error: 'نشست نامعتبر است' }, 401);
    const { sessionId } = await request.json();
    if (!sessionId) return jsonRes({ error: 'sessionId لازم است' }, 400);
    const target = await fsGet(env, `sessions/${sessionId}`);
    if (!target || target.uid !== session.uid) return jsonRes({ error: 'نشست یافت نشد' }, 404);
    await fsUpdate(env, `sessions/${sessionId}`, { revoked: true, revokedAtMs: Date.now() });
    return jsonRes({ ok: true });
}

// =====================================================================
// ورود ایمیلی: کد ۶ رقمی
// =====================================================================

async function handleRequestCode(request, env) {
    const { email } = await request.json();
    const emailLower = (email || '').trim().toLowerCase();
    if (!emailLower || !emailLower.includes('@')) return jsonRes({ error: 'ایمیل نامعتبر است' }, 400);

    const docId = safeId(emailLower);
    const existing = await fsGet(env, `authCodes/${docId}`);
    if (existing && existing.lockedUntilMs && Date.now() < existing.lockedUntilMs) {
        const minutesLeft = Math.ceil((existing.lockedUntilMs - Date.now()) / 60000);
        return jsonRes({ error: `تعداد تلاش‌های اشتباه زیاد بود؛ ${minutesLeft} دقیقه دیگر دوباره امتحان کنید` }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await fsSet(env, `authCodes/${docId}`, {
        email: emailLower, code,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 10 * 60 * 1000
    });

    const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_PUBLIC_KEY,
            accessToken: env.EMAILJS_PRIVATE_KEY,
            template_params: { to_email: emailLower, code }
        })
    });
    if (!emailRes.ok) {
        const errText = await emailRes.text().catch(() => '');
        return jsonRes({ error: 'ارسال ایمیل ناموفق بود: ' + errText }, 502);
    }
    return jsonRes({ ok: true });
}

async function handleVerifyCode(request, env) {
    const { email, code } = await request.json();
    const emailLower = (email || '').trim().toLowerCase();
    const docId = safeId(emailLower);
    const stored = await fsGet(env, `authCodes/${docId}`);

    if (!stored) {
        return jsonRes({ error: 'کد اشتباه یا منقضی‌شده است' }, 400);
    }

    // قفل موقت بعد از تلاش‌های ناموفق زیاد (جلوگیری از حدس زدن خودکار کد)
    if (stored.lockedUntilMs && Date.now() < stored.lockedUntilMs) {
        const minutesLeft = Math.ceil((stored.lockedUntilMs - Date.now()) / 60000);
        return jsonRes({ error: `تعداد تلاش‌های اشتباه زیاد بود؛ ${minutesLeft} دقیقه دیگر دوباره امتحان کنید` }, 429);
    }

    if (stored.code !== String(code) || Date.now() > stored.expiresAtMs) {
        const attempts = (stored.attempts || 0) + 1;
        const update = { attempts };
        if (attempts >= 5) {
            update.lockedUntilMs = Date.now() + 15 * 60 * 1000; // ۱۵ دقیقه قفل
        }
        await fsUpdate(env, `authCodes/${docId}`, update);
        return jsonRes({ error: 'کد اشتباه یا منقضی‌شده است' }, 400);
    }
    await fsDelete(env, `authCodes/${docId}`);

    const ticket = await signTicket(env.WORKER_AUTH_SECRET, {
        email: emailLower,
        exp: Date.now() + 5 * 60 * 1000
    });
    return jsonRes({ ticket });
}

// مرحله‌ی نهایی ورود ایمیلی: uid را خودِ Worker می‌سازد (دیگر نیازی به signInAnonymously نیست)
// و یک «توکن نشست» طولانی‌مدت برمی‌گرداند که از این پس هویت کاربر در همه‌ی درخواست‌هاست.
async function findEditorByEmail(env, email) {
    try {
        const editors = await firestoreList(env, 'editors', {});
        const match = editors.find(ed => (ed.email || '').toLowerCase() === email.toLowerCase());
        return match ? match.id : null;
    } catch (e) {
        return null;
    }
}

async function handleCompleteLogin(request, env) {
    const { ticket } = await request.json();
    const payload = await verifyTicket(env.WORKER_AUTH_SECRET, ticket);
    if (!payload || !payload.email) return jsonRes({ error: 'بلیط نامعتبر یا منقضی‌شده است' }, 401);

    const uid = 'u_' + (await sha256Hex(payload.email)).slice(0, 28);
    const isAdmin = payload.email === ADMIN_EMAIL;
    const editorId = isAdmin ? null : await findEditorByEmail(env, payload.email);

    await firestoreSet(env, `verifiedEmails/${uid}`, { email: payload.email, isAdmin, verifiedAtMs: Date.now() });

    const session = await createSession(env, request, {
        uid, email: payload.email, isAdmin, kind: 'email', editorId: editorId || null,
        exp: Date.now() + SESSION_TTL_MS
    });
    return jsonRes({ session, uid, email: payload.email, isAdmin, editorId: editorId || null });
}

// =====================================================================
// ثبت‌نام و ورود «کاربران عادی» (ایمیل + رمز عبور) — جایگزین ثبت‌نام تلفنی قدیمی
// همچنان نیاز به تایید دستی ادمین دارد (دقیقاً مثل روش قبلی).
// =====================================================================

async function handleRegister(request, env) {
    const { email, password, firstName, lastName, chatName, entryYear, major, avatarId } = await request.json();
    const emailLower = (email || '').trim().toLowerCase();
    if (!emailLower || !emailLower.includes('@')) return jsonRes({ error: 'ایمیل نامعتبر است' }, 400);
    if (!password || password.length < 6) return jsonRes({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, 400);
    if (!firstName || !lastName || !chatName) return jsonRes({ error: 'نام، نام‌خانوادگی و نام نمایشی الزامی است' }, 400);

    const uid = 'u_' + (await sha256Hex(emailLower)).slice(0, 28);
    const existing = await firestoreGet(env, `users/${uid}`);
    if (existing && existing.passwordHash) return jsonRes({ error: 'این ایمیل قبلاً ثبت‌نام کرده است؛ از بخش ورود استفاده کنید' }, 400);

    const passwordHash = await hashPassword(password);
    await firestoreSet(env, `users/${uid}`, {
        email: emailLower, passwordHash, firstName, lastName, chatName,
        name: chatName, entryYear: entryYear || '', major: major || '',
        avatarId: avatarId || '', authType: 'password', status: 'pending',
        profileCompleted: true, createdAtMs: existing ? existing.createdAtMs : Date.now()
    });

    const session = await createSession(env, request, {
        uid, kind: 'password', email: emailLower, name: chatName,
        isPending: true, exp: Date.now() + SESSION_TTL_MS
    });
    return jsonRes({ session, uid, status: 'pending', name: chatName });
}

async function handleLogin(request, env) {
    const { email, password } = await request.json();
    const emailLower = (email || '').trim().toLowerCase();
    if (!emailLower || !password) return jsonRes({ error: 'ایمیل و رمز عبور را وارد کنید' }, 400);

    const uid = 'u_' + (await sha256Hex(emailLower)).slice(0, 28);
    const user = await firestoreGet(env, `users/${uid}`);
    if (!user || !user.passwordHash) return jsonRes({ error: 'حساب کاربری با این ایمیل یافت نشد' }, 400);

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return jsonRes({ error: 'رمز عبور اشتباه است' }, 400);

    if (user.status === 'rejected') return jsonRes({ error: 'عضویت شما توسط مدیر رد شده است' }, 403);

    const isPending = user.status !== 'approved';
    const isAdmin = emailLower === ADMIN_EMAIL;
    const editorId = isAdmin ? null : await findEditorByEmail(env, emailLower);
    const session = await createSession(env, request, {
        uid, kind: 'password', email: emailLower, name: user.chatName || user.name,
        isAdmin, editorId: editorId || null, isPending, exp: Date.now() + SESSION_TTL_MS
    });
    return jsonRes({ session, uid, status: isPending ? 'pending' : 'active', name: user.chatName || user.name, isAdmin, editorId: editorId || null });
}



// چک کردن اینکه آیا حساب کاربر عادی (ایمیل+رمزعبور) هنوز تایید نشده (با polling صدا زده می‌شود)
async function handleSessionStatus(request, env) {
    const session = await getSession(request, env);
    if (!session) return jsonRes({ error: 'نشست نامعتبر است' }, 401);

    if (session.kind === 'email' || session.kind === 'google') {
        const editorId = session.isAdmin ? null : await findEditorByEmail(env, session.email);
        const newSession = await createSession(env, request, {
            uid: session.uid, email: session.email, isAdmin: session.isAdmin, kind: session.kind,
            editorId: editorId || null, exp: Date.now() + SESSION_TTL_MS
        });
        return jsonRes({
            status: 'active', kind: session.kind, session: newSession,
            uid: session.uid, email: session.email, isAdmin: session.isAdmin, editorId: editorId || null
        });
    }

    // کاربر عادی (ایمیل+رمزعبور): وضعیت تاییدش را دوباره چک کن
    const user = await firestoreGet(env, `users/${session.uid}`);
    if (!user) return jsonRes({ status: 'pending', kind: 'password', uid: session.uid, name: session.name });

    if (user.status === 'rejected') {
        return jsonRes({ status: 'rejected', reason: user.rejectReason || '' });
    }
    if (user.status === 'approved') {
        const isAdmin = session.email === ADMIN_EMAIL;
        const editorId = isAdmin ? null : await findEditorByEmail(env, session.email);
        const newSession = await createSession(env, request, {
            uid: session.uid, kind: 'password', email: session.email, name: user.chatName || user.name,
            isAdmin, editorId: editorId || null, isPending: false, exp: Date.now() + SESSION_TTL_MS
        });
        return jsonRes({
            status: 'approved', session: newSession, kind: 'password',
            uid: session.uid, name: user.chatName || user.name, isAdmin, editorId: editorId || null
        });
    }
    return jsonRes({ status: 'pending', kind: 'password', uid: session.uid, name: user.chatName || user.name });
}

// =====================================================================
// پروکسی عمومی Firestore — تمام خواندن/نوشتنِ محافظت‌شده از این مسیر عبور می‌کند.
// مجوزها اینجا دستی و مشابه firestore rules قبلی بررسی می‌شوند.
// =====================================================================

async function isTaskAssignee(env, uid) {
    const doc = await firestoreGet(env, `taskAssignees/${uid}`);
    return !!doc;
}

// کالکشن‌هایی که فقط ادمین حق نوشتن روشون رو داره (بیشتر محتوای اپ)
const ADMIN_ONLY_WRITE_COLLECTIONS = new Set([
    'notes', 'videos', 'subjects', 'extraSubjects', 'announcements', 'collabCalls', 'editors', 'taskAssignees'
]);

async function checkFsPermission(env, session, op, collection, docId, data) {
    const isAdmin = !!(session && session.isAdmin);
    const isBlockedGuest = !!(session && session.isPending); // کاربر عادیِ هنوز تاییدنشده

    // ---------- بخش چت کاملاً برای کاربران تاییدنشده قفل است ----------
    const CHAT_COLLECTIONS = ['publicChat', 'anonChat', 'adminChat', 'editors'];
    if (CHAT_COLLECTIONS.includes(String(collection).split('/')[0]) && isBlockedGuest) {
        return false;
    }

    const parts = String(collection).split('/').filter(Boolean);

    // ---------- چت عمومی: خواندن برای همه آزاد، ارسال برای کاربر واردشده، حذف فقط ادمین ----------
    if (parts[0] === 'publicChat') {
        if (op === 'list' || op === 'get') return true;
        if (op === 'delete') return isAdmin;
        if (op === 'update' && !isAdmin) {
            // کاربر عادی فقط اجازه داره شمارنده‌ی گزارش و زمان رسیدن به آستانه رو تغییر بده، نه فیلد دیگه‌ای
            const keys = Object.keys(data || {});
            const allowedKeys = new Set(['reportCount', 'thresholdReachedAtMs']);
            return keys.length > 0 && keys.every(k => allowedKeys.has(k));
        }
        if (op === 'add' && !isAdmin && session) {
            const userDoc = await firestoreGet(env, `users/${session.uid}`);
            if (userDoc && userDoc.suspendedUntil) {
                if (userDoc.suspendedUntil === 'permanent' || Date.now() < userDoc.suspendedUntil) return false;
            }
        }
        return !!session;
    }

    // ---------- چت ناشناس / چت مدیر ----------
    // 'anonChat' یا 'adminChat' (بدون ادامه، docId = uid خود کاربر): فقط خودِ همون کاربر یا ادمین
    // 'anonChat/{uid}/messages': فقط خودِ همون کاربر یا ادمین
    if (parts[0] === 'anonChat' || parts[0] === 'adminChat') {
        if (parts.length === 1) {
            if (op === 'list') return isAdmin;
            if (!session) return false;
            // set/update روی خودِ سند ترد: docId باید uid خودِ کاربر باشد (یا ادمین)
            return isAdmin || (docId && session.uid === docId);
        }
        if (!session) return false;
        const threadUid = parts[1]; // .../{uid}/messages
        return isAdmin || session.uid === threadUid;
    }

    // ---------- چت ویراستاران ----------
    // 'editors' (بدون ادامه): پروفایل ویراستاران، از قبل توسط ADMIN_ONLY_WRITE_COLLECTIONS پوشش داده می‌شه
    // 'editors/{editorId}/threads' (docId = uid کاربر عادی): خودِ همون کاربر، خودِ ویراستار مربوطه، یا ادمین
    // 'editors/{editorId}/threads/{uid}/messages': همان‌طور
    if (parts[0] === 'editors' && parts.length > 1) {
        if (!session) return false;
        if (isAdmin) return true;
        if (session.editorId && session.editorId === parts[1]) return true;
        if (parts.length >= 4) {
            const threadUid = parts[3]; // .../threads/{uid}/messages
            return session.uid === threadUid;
        }
        if (parts.length === 3 && parts[2] === 'threads') {
            // ست/آپدیت روی سطح خودِ ترد: docId باید uid خودِ کاربر باشد
            return !!(docId && session.uid === docId);
        }
        return false;
    }

    if (ADMIN_ONLY_WRITE_COLLECTIONS.has(collection)) {
        if (op === 'get' || op === 'list') return true; // خواندن برای همه آزاد
        return isAdmin; // نوشتن/حذف فقط ادمین
    }

    if (collection === 'tasks') {
        if (!session) return false;
        if (op === 'list' || op === 'get') return isAdmin || await isTaskAssignee(env, session.uid);
        if (op === 'add') return isAdmin;
        if (op === 'update') return isAdmin || await isTaskAssignee(env, session.uid);
        return isAdmin;
    }

    // ساختار جدید: 'taskDeliveries/{taskId}/threads' (لیست افراد پیام‌داده برای آن کار)
    // و 'taskDeliveries/{taskId}/threads/{uid}/messages' (گفتگوی اختصاصی با همان فرد)
    // هر ویراستاری اجازه دارد همه‌ی ترد‌های زیر یک کار را ببیند (تا بفهمد چه کسانی پیام داده‌اند)،
    // ولی کاربر عادی فقط به ترد خودش دسترسی دارد.
    if (parts[0] === 'taskDeliveries' && parts.length > 1) {
        if (!session) return false;
        if (isAdmin) return true;
        if (session.editorId) return true; // هر ویراستاری به همه‌ی ترد‌های زیر هر کاری دسترسی دارد
        // کاربر عادی: فقط به ترد خودش (parts[3] = uid صاحب ترد)
        if (parts.length >= 4 && parts[2] === 'threads') {
            return session.uid === parts[3];
        }
        if (parts.length === 3 && parts[2] === 'threads') {
            // درخواست set/update مستقیم روی سطح ترد: docId باید uid خودش باشد
            return !!(docId && session.uid === docId);
        }
        return false;
    }

    if (collection === 'users') {
        if (!session) return false;
        if (isAdmin) return true; // مدیر به همه‌ی کاربران دسترسی دارد (برای لیست کامل کاربران)
        // خواندن پروفایل هر کاربر واردشده‌ای آزاد است (برای نمایش پروفایل با کلیک روی نام در چت)
        if (op === 'get') return true;
        // نوشتن فقط روی سند خودِ کاربر
        if (op === 'set' || op === 'update') return docId === session.uid;
        return false;
    }

    if (collection === 'pendingRequests') {
        return isAdmin; // فقط ادمین برای تایید/رد
    }

    if (collection === 'settings') {
        if (op === 'get' || op === 'list') return true; // خواندن (مثلاً آواتار انتخابی مدیر) برای همه آزاد
        return isAdmin; // نوشتن فقط ادمین
    }

    // اعلان‌ها: هر کاربر واردشده‌ای می‌تونه اعلان بسازه (هر عملی که باید اعلان بده، از سمت کلاینت انجام می‌شه)
    // و لیست کامل رو بخونه (فیلتر مربوط‌بودن به خودش، سمت کلاینت انجام می‌شه)
    if (collection === 'notifications') {
        if (!session) return false;
        if (op === 'add' || op === 'list' || op === 'get') return true;
        return isAdmin;
    }

    // وضعیت خوانده‌شدن اعلان‌ها: فقط خودِ کاربر به رکوردهای خودش دسترسی داره
    if (parts[0] === 'notifDismissed' && parts.length > 1) {
        if (!session) return false;
        if (isAdmin) return true;
        return session.uid === parts[1];
    }

    // گزارش پیام‌ها: هر کاربر واردشده (غیرمهمان) می‌تونه گزارش بسازه، ولی فقط با شناسه‌ی خودش
    // (نمی‌تونه به‌جای کاربر دیگه گزارش ثبت کنه). دیدن/تغییر همه‌ی گزارش‌ها فقط با ادمینه.
    if (collection === 'reports') {
        if (!session || session.isGuest || session.isPending) return false;
        if (isAdmin) return true;
        if (op === 'add' || op === 'set') return !!data && data.reportedBy === session.uid;
        if (op === 'get') return true; // برای چک تکراری‌نبودن گزارش خودش لازم است
        return false; // list/update/delete فقط برای ادمین
    }

    // لاگ اقدامات مدیریتی روی گزارش‌ها: فقط ادمین می‌تونه بنویسه/بخونه
    if (collection === 'adminActions') {
        return isAdmin;
    }

    // پیش‌فرض محتاطانه: نیاز به نشست معتبر
    return !!session;
}

// ارسال نوتیفیکیشن Push به اپ اندروید/iOS از طریق سرویس Expo (رایگان، نیازی به فایربیس FCM جدا نیست)
async function sendExpoPush(pushToken, title, body, data) {
    if (!pushToken) return;
    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ to: pushToken, title, body, data: data || {}, sound: 'default' })
        });
    } catch (e) {
        // خطای ارسال نوتیفیکیشن نباید باعث خراب‌شدن پاسخ اصلی به کلاینت بشه
    }
}

async function handleFsProxy(request, env) {
    const session = await getSession(request, env);
    const { op, collection, docId, data, orderByField, orderByDir } = await request.json();
    if (!collection) return jsonRes({ error: 'collection مشخص نشده' }, 400);

    // پیام خطای واضح برای کاربر تعلیق‌شده (به‌جای «دسترسی غیرمجاز» مبهم)
    if (collection === 'publicChat' && op === 'add' && session && !session.isAdmin) {
        const userDoc = await firestoreGet(env, `users/${session.uid}`);
        if (userDoc && userDoc.suspendedUntil) {
            const permanent = userDoc.suspendedUntil === 'permanent';
            if (permanent || Date.now() < userDoc.suspendedUntil) {
                const untilText = permanent ? 'به‌طور دائم' : `تا ${new Date(userDoc.suspendedUntil).toLocaleString('fa-IR')}`;
                return jsonRes({ error: `حساب شما از ارسال پیام در چت عمومی تعلیق شده است (${untilText})${userDoc.suspensionReason ? '؛ دلیل: ' + userDoc.suspensionReason : ''}` }, 403);
            }
        }
    }

    const allowed = await checkFsPermission(env, session, op, collection, docId, data);
    if (!allowed) return jsonRes({ error: 'دسترسی غیرمجاز' }, 403);

    try {
        if (op === 'list') {
            // کش کوتاه‌مدت (۸ ثانیه) روی خروجی هر کالکشن - این تنها با تغییر همین فایل (بدون دست‌زدن
            // به index.html) مصرف Firestore رو به‌شدت کم می‌کنه: وقتی چند کاربر/تب همزمان باز باشن
            // و هرکدوم هر چند ثانیه یه‌بار poll بزنن، همه‌شون از یه پاسخ مشترک تازه استفاده می‌کنن
            // به‌جای اینکه هرکدوم جدا یه خوندن کامل (تا ۳۰۰ سند) از Firestore بزنن.
            const cache = caches.default;
            const cacheKey = new Request(
                `https://fs-list-cache.internal/${encodeURIComponent(collection)}?orderBy=${encodeURIComponent(orderByField || '')}:${orderByDir || ''}`
            );
            const cached = await cache.match(cacheKey);
            if (cached) {
                return cached;
            }

            const items = await fsList(env, collection, { orderByField, orderByDir });
            const response = jsonRes({ items });
            const cacheableResponse = new Response(response.clone().body, {
                status: response.status,
                headers: { ...Object.fromEntries(response.headers), 'Cache-Control': 'public, max-age=8' }
            });
            await cache.put(cacheKey, cacheableResponse);
            return response;
        }
        if (op === 'get') {
            if (!docId) return jsonRes({ error: 'docId لازم است' }, 400);
            const item = await fsGet(env, `${collection}/${docId}`);
            return jsonRes({ item });
        }
        if (op === 'set') {
            if (!docId) return jsonRes({ error: 'docId لازم است' }, 400);
            await fsSet(env, `${collection}/${docId}`, data || {});
            return jsonRes({ ok: true });
        }
        if (op === 'update') {
            if (!docId) return jsonRes({ error: 'docId لازم است' }, 400);
            await fsUpdate(env, `${collection}/${docId}`, data || {});

            // نوتیفیکیشن: وقتی ادمین وضعیت عضویت یک کاربر رو تغییر می‌ده (تایید/رد)
            if (collection === 'users' && data && (data.status === 'approved' || data.status === 'rejected')) {
                const userDoc = await firestoreGet(env, `users/${docId}`);
                if (userDoc && userDoc.pushToken) {
                    const title = data.status === 'approved' ? 'خوش اومدی! 🎉' : 'وضعیت عضویت';
                    const body = data.status === 'approved'
                        ? 'عضویتت تایید شد، حالا می‌تونی از همه‌ی امکانات استفاده کنی.'
                        : 'متاسفانه عضویتت این‌بار تایید نشد.';
                    await sendExpoPush(userDoc.pushToken, title, body, { type: 'membership', status: data.status });
                }
            }

            return jsonRes({ ok: true });
        }
        if (op === 'delete') {
            if (!docId) return jsonRes({ error: 'docId لازم است' }, 400);
            await fsDelete(env, `${collection}/${docId}`);
            return jsonRes({ ok: true });
        }
        if (op === 'add') {
            const result = await fsAdd(env, collection, data || {});

            // نوتیفیکیشن: پیام جدید در ترد گفتگوی ویراستار - فقط وقتی فرستنده صاحب ترد نباشه
            const fsParts = String(collection).split('/').filter(Boolean);
            if (fsParts[0] === 'editors' && fsParts.length >= 4 && fsParts[2] === 'threads') {
                const threadUid = fsParts[3];
                if (data && data.senderUid && data.senderUid !== threadUid) {
                    const userDoc = await firestoreGet(env, `users/${threadUid}`);
                    if (userDoc && userDoc.pushToken) {
                        await sendExpoPush(
                            userDoc.pushToken,
                            data.senderName || 'ویراستار',
                            data.text || 'پیام جدید داری',
                            { type: 'editorReply', editorId: fsParts[1] }
                        );
                    }
                }
            }

            return jsonRes({ item: result });
        }
        if (op === 'findByEmail') {
            // معادل ساده‌ی where('email','==', email) — چون UID کاربران از sha256(email) ساخته می‌شه،
            // به‌جای جستجوی واقعی، مستقیم UID رو حساب می‌کنیم و همون سند رو می‌خونیم.
            const email = String((data && data.email) || '').trim().toLowerCase();
            if (!email) return jsonRes({ error: 'email لازم است' }, 400);
            const uid = 'u_' + (await sha256Hex(email)).slice(0, 28);
            const item = await firestoreGet(env, `${collection}/${uid}`);
            return jsonRes({ item: item ? { ...item, id: uid } : null });
        }
        return jsonRes({ error: 'op نامعتبر است' }, 400);
    } catch (e) {
        return jsonRes({ error: e.message || 'خطای Firestore' }, 500);
    }
}

// =====================================================================
// مهاجرت یک‌بارمصرف: کپی کردن دیتای فعلیِ کالکشن‌های D1_TOP_LEVEL_COLLECTIONS
// از Firestore به D1. فقط ادمین می‌تونه صداش بزنه. بعد از اجرای موفق و چک کردن
// نتیجه، می‌تونی این تابع و مسیرش رو از worker.js حذف کنی.
// نکته: کالکشن‌های تودرتو (taskDeliveries/{id}/threads/{uid}/messages و مشابه)
// چون شناسه‌ی سطح بالاشون (task id، uid) از قبل معلوم نیست، شامل این مهاجرت خودکار
// نمی‌شن؛ اگه لازم بود، بعداً برات یه نسخه‌ی مخصوص همون‌ها رو می‌نویسم.
// =====================================================================
async function handleMigrateToD1(request, env) {
    const session = await getSession(request, env);
    if (!session || !session.isAdmin) return jsonRes({ error: 'فقط ادمین' }, 403);

    const results = {};
    for (const collection of D1_TOP_LEVEL_COLLECTIONS) {
        try {
            const items = await firestoreList(env, collection, {});
            let copied = 0;
            for (const item of items) {
                const { id, ...fields } = item;
                await d1Set(env, `${collection}/${id}`, fields);
                copied++;
            }
            results[collection] = { ok: true, copied };
        } catch (e) {
            results[collection] = { ok: false, error: e.message || String(e) };
        }
    }
    return jsonRes({ results });
}

// =====================================================================
// آپلود جزوه/عکس/فیلم به تلگرام (بدون تغییر نسبت به قبل)
// =====================================================================
async function handleTelegramUpload(request, env) {
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) return jsonRes({ error: 'TELEGRAM_BOT_TOKEN یا TELEGRAM_CHAT_ID تنظیم نشده است' }, 500);

    const { fileBase64, fileName, mimeType } = await request.json();
    if (!fileBase64) return jsonRes({ error: 'فایلی ارسال نشده است' }, 400);

    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length > 4.2 * 1024 * 1024) return jsonRes({ error: 'حجم فایل بیش از حد مجاز است' }, 413);

    const mt = mimeType || 'application/octet-stream';
    const isImage = mt.startsWith('image/');
    const isVideo = mt.startsWith('video/');
    const endpoint = isImage ? 'sendPhoto' : isVideo ? 'sendVideo' : 'sendDocument';
    const fieldName = isImage ? 'photo' : isVideo ? 'video' : 'document';

    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append(fieldName, new Blob([bytes], { type: mt }), fileName || 'file');

    const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, { method: 'POST', body: form });
    const sendJson = await sendRes.json();
    if (!sendJson.ok) return jsonRes({ error: sendJson.description || 'ارسال به تلگرام ناموفق بود' }, 502);

    const result = sendJson.result;
    const fileObj = result.document || result.video || (result.photo ? result.photo[result.photo.length - 1] : null);
    if (!fileObj || !fileObj.file_id) return jsonRes({ error: 'پاسخ تلگرام قابل شناسایی نبود' }, 502);

    const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileObj.file_id}`);
    const fileInfoJson = await fileInfoRes.json();
    if (!fileInfoJson.ok) return jsonRes({ error: 'دریافت مسیر فایل ناموفق بود' }, 502);

    // نکته مهم: مسیر فایل تلگرام (file_path) موقتیه و بعد از مدتی نامعتبر می‌شه.
    // برای همین به‌جای ذخیره‌ی خودِ مسیر، «file_id» رو ذخیره می‌کنیم (که همیشه معتبره)
    // و هر بار که کاربر خواست فایل رو دانلود کنه، یه مسیر تازه براش می‌گیریم (تابع پروکسی پایین‌تر).
    const secure_url = `/telegram-file?id=${encodeURIComponent(fileObj.file_id)}&name=${encodeURIComponent(fileName || 'file')}`;
    return jsonRes({ secure_url, bytes: bytes.length, duration: result.video ? result.video.duration : undefined });
}

// نمایش فایل‌های آپلودشده از طریق خودِ Worker (نه لینک مستقیم api.telegram.org) —
// این‌طوری حتی اگر دامنه‌ی تلگرام برای کاربر فیلتر باشد، نمایش عکس/فیلم/صدا مشکلی پیدا نمی‌کند.
// همچنین چون هر بار مسیر رو تازه از تلگرام می‌گیریم (با file_id)، فایل‌های قدیمی هم همیشه قابل‌دانلودن.
async function handleTelegramFileProxy(request, env) {
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return new Response('توکن بات تنظیم نشده', { status: 500 });

    const url = new URL(request.url);
    const fileId = url.searchParams.get('id');
    const originalName = url.searchParams.get('name') || '';
    const legacyPath = url.searchParams.get('path'); // سازگاری با فایل‌های قدیمی‌تر که فقط path داشتن

    let path = legacyPath;
    if (fileId) {
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
        const fileInfoJson = await fileInfoRes.json();
        if (!fileInfoJson.ok) return new Response('فایل مورد نظر یافت نشد یا از تلگرام حذف شده', { status: 502 });
        path = fileInfoJson.result.file_path;
    }
    if (!path) return new Response('مسیر یا شناسه فایل مشخص نشده', { status: 400 });

    const tgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`);
    if (!tgRes.ok) return new Response('دریافت فایل از تلگرام ناموفق بود', { status: 502 });

    // پسوند رو از اسم فایل اصلی (در زمان آپلود) یا از مسیر تلگرام استخراج کن
    const ext = ((originalName || path).split('.').pop() || '').toLowerCase();
    const MIME_MAP = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        mp4: 'video/mp4', mp3: 'audio/mpeg'
    };
    const contentType = MIME_MAP[ext] || tgRes.headers.get('Content-Type') || 'application/octet-stream';
    const fileName = originalName || path.split('/').pop() || ('file' + (ext ? '.' + ext : ''));

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    // attachment به‌جای inline: مرورگر/اپ رو مجبور می‌کنه فایل رو مستقیم دانلود کنه، نه اینکه سعی کنه نمایشش بده
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    // چون دیگه یه مسیر ثابت نیست (هر بار تازه گرفته می‌شه)، کش طولانی‌مدت نمی‌ذاریم
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(tgRes.body, { status: 200, headers });
}

// =====================================================================
// ورود با Google Sign-In (اختیاری، در کنار بقیه‌ی روش‌ها؛ هرگز جایگزین کامل نمی‌شود)
// =====================================================================

async function handleGoogleStart(request, env) {
    const url = new URL(request.url);
    const redirectUri = `${url.origin}/api/auth/google/callback`;
    // اگه اپ موبایل این پارامتر رو بفرسته (mobile=1)، بعد از ورود به‌جای صفحه‌ی وب، به خودِ اپ برمی‌گردیم
    const isMobile = url.searchParams.get('mobile') === '1';
    const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state: isMobile ? 'app' : ''
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}

async function handleGoogleCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const isMobile = url.searchParams.get('state') === 'app';
    const errorRedirect = isMobile ? 'shakerestanapp://auth?authError=google' : `${url.origin}/?authError=google`;
    if (!code) return Response.redirect(errorRedirect, 302);

    const redirectUri = `${url.origin}/api/auth/google/callback`;
    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri, grant_type: 'authorization_code'
            })
        });
        const tokenJson = await tokenRes.json();
        if (!tokenRes.ok || !tokenJson.access_token) return Response.redirect(errorRedirect, 302);

        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` }
        });
        const userInfo = await userInfoRes.json();
        const emailLower = (userInfo.email || '').trim().toLowerCase();
        if (!emailLower) return Response.redirect(errorRedirect, 302);

        const uid = 'u_' + (await sha256Hex(emailLower)).slice(0, 28);
        const isAdmin = emailLower === ADMIN_EMAIL;
        const editorId = isAdmin ? null : await findEditorByEmail(env, emailLower);

        // اگر قبلاً با روش دیگری (رمز عبور) ثبت‌نام نکرده، یک پروفایل پایه با گوگل بساز (تایید خودکار)
        const existing = await firestoreGet(env, `users/${uid}`);
        if (!existing) {
            await firestoreSet(env, `users/${uid}`, {
                email: emailLower, name: userInfo.name || emailLower.split('@')[0],
                chatName: userInfo.name || emailLower.split('@')[0],
                avatarId: '', authType: 'google', status: 'approved',
                profileCompleted: false, createdAtMs: Date.now()
            });
        }

        const session = await createSession(env, request, {
            uid, email: emailLower, isAdmin, kind: 'google', editorId: editorId || null,
            exp: Date.now() + SESSION_TTL_MS
        });
        const successRedirect = isMobile
            ? `shakerestanapp://auth?googleSession=${encodeURIComponent(session)}`
            : `${url.origin}/?googleSession=${encodeURIComponent(session)}`;
        return Response.redirect(successRedirect, 302);
    } catch (e) {
        return Response.redirect(errorRedirect, 302);
    }
}

// ورود با گوگل به روش «Native» (بدون باز شدن مرورگر) - مخصوص اپ موبایل.
// اپ با کتابخونه‌ی رسمی گوگل یه idToken می‌گیره، اینجا همون توکن رو تایید می‌کنیم.
async function handleGoogleVerifyToken(request, env) {
    try {
        const { idToken } = await request.json();
        if (!idToken) return jsonRes({ error: 'idToken لازم است' }, 400);

        // تایید اعتبار توکن مستقیم از خود گوگل (امن‌ترین روش، نیازی به کتابخونه‌ی جانبی نیست)
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        const payload = await verifyRes.json();
        if (!verifyRes.ok || !payload.email) return jsonRes({ error: 'توکن گوگل نامعتبر است' }, 401);

        // چک می‌کنیم توکن واقعاً برای همین اپ صادر شده (جلوگیری از جعل توکن)
        // نکته: مقدار aud همیشه همون Web Client ID هست (حتی برای ورود از اپ اندروید) -
        // این رفتار استاندارد گوگله، نه اشتباه.
        if (env.GOOGLE_WEB_CLIENT_ID && payload.aud !== env.GOOGLE_WEB_CLIENT_ID) {
            return jsonRes({ error: 'توکن گوگل برای این اپ معتبر نیست' }, 401);
        }

        const emailLower = (payload.email || '').trim().toLowerCase();
        const uid = 'u_' + (await sha256Hex(emailLower)).slice(0, 28);
        const isAdmin = emailLower === ADMIN_EMAIL;
        const editorId = isAdmin ? null : await findEditorByEmail(env, emailLower);

        const existing = await firestoreGet(env, `users/${uid}`);
        if (!existing) {
            await firestoreSet(env, `users/${uid}`, {
                email: emailLower, name: payload.name || emailLower.split('@')[0],
                chatName: payload.name || emailLower.split('@')[0],
                avatarId: '', authType: 'google', status: 'approved',
                profileCompleted: false, createdAtMs: Date.now()
            });
        }

        const session = await createSession(env, request, {
            uid, email: emailLower, isAdmin, kind: 'google', editorId: editorId || null,
            exp: Date.now() + SESSION_TTL_MS
        });
        return jsonRes({ session, uid, email: emailLower, isAdmin, editorId: editorId || null, status: 'active' });
    } catch (e) {
        return jsonRes({ error: 'ورود با گوگل ناموفق بود' }, 500);
    }
}

