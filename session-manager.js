// session-manager.js
// بخش «نشست‌های فعال» رو به صفحه‌ی پروفایل اضافه می‌کنه، بدون دست‌زدن به index.html.
// باید بعد از اسکریپت اصلی لود بشه (کنار university-treasury.js و بقیه).
// از توابع سراسری‌ای که در اسکریپت اصلی تعریف شدن استفاده می‌کنه:
// getSessionToken, escapeHtml, showToast, renderProfilePage (override می‌شه).

(function () {
    const _origRenderProfilePage = window.renderProfilePage;

    window.renderProfilePage = async function (...args) {
        if (typeof _origRenderProfilePage === 'function') {
            await _origRenderProfilePage.apply(this, args);
        }
        injectSessionsSection();
    };

    function injectSessionsSection() {
        if (document.getElementById('sessions-section')) {
            // از قبل ساخته شده؛ فقط لیست رو تازه کن اگر باز بود
            const list = document.getElementById('sessions-list');
            if (list && list.style.display !== 'none') renderSessionsList();
            return;
        }
        const anchor = document.getElementById('profile-email-row');
        if (!anchor) return;

        const box = document.createElement('div');
        box.id = 'sessions-section';
        box.style.cssText = 'margin-top:14px;background:var(--cream);border:1px solid var(--beige-dark);border-radius:14px;padding:12px;';
        box.innerHTML = `
            <div id="sessions-toggle-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                <strong style="font-size:0.85rem;">🔐 نشست‌های فعال</strong>
                <span id="sessions-toggle-icon">▾</span>
            </div>
            <div id="sessions-list" style="display:none;margin-top:10px;font-size:0.78rem;"></div>
        `;
        anchor.insertAdjacentElement('afterend', box);

        document.getElementById('sessions-toggle-header').addEventListener('click', async () => {
            const list = document.getElementById('sessions-list');
            const icon = document.getElementById('sessions-toggle-icon');
            const opening = list.style.display === 'none';
            list.style.display = opening ? 'block' : 'none';
            icon.textContent = opening ? '▴' : '▾';
            if (opening) await renderSessionsList();
        });
    }

    async function renderSessionsList() {
        const box = document.getElementById('sessions-list');
        if (!box) return;
        box.innerHTML = '<div style="text-align:center;color:var(--brown-light);padding:8px 0;">در حال بارگذاری...</div>';
        try {
            const token = getSessionToken();
            const res = await fetch('/api/account/sessions', {
                cache: 'no-store',
                headers: { Authorization: 'Bearer ' + token }
            });
            const data = await res.json().catch(() => ({}));
            console.log('[sessions] list response:', res.status, data);
            if (!res.ok || data.error) throw new Error(data.error || 'خطا در دریافت نشست‌ها');

            const sessions = data.sessions || [];
            if (!sessions.length) {
                box.innerHTML = '<div style="text-align:center;color:var(--brown-light);padding:8px 0;">نشستی یافت نشد</div>';
                return;
            }

            box.innerHTML = sessions.map(s => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--beige-dark);gap:8px;">
                    <div style="overflow:hidden;">
                        <div>${s.current ? '🟢 این دستگاه (نشست فعلی)' : '💻 دستگاه دیگر'}</div>
                        <div style="color:var(--brown-light);font-size:0.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml((s.userAgent || 'نامشخص')).slice(0, 60)}</div>
                        <div style="color:var(--brown-light);font-size:0.68rem;">${s.createdAtMs ? new Date(s.createdAtMs).toLocaleString('fa-IR') : ''}</div>
                    </div>
                    ${s.current ? '' : `<button data-sid="${s.id}" class="revoke-session-btn" style="flex-shrink:0;background:var(--terracotta);color:#fff;border:none;border-radius:20px;padding:5px 12px;font-size:0.7rem;cursor:pointer;">ابطال</button>`}
                </div>
            `).join('');

            box.querySelectorAll('.revoke-session-btn').forEach(btn => {
                btn.addEventListener('click', () => revokeSession(btn.dataset.sid));
            });
        } catch (e) {
            box.innerHTML = '<div style="text-align:center;color:var(--terracotta);padding:8px 0;">خطا در بارگذاری نشست‌ها</div>';
            console.error('sessions list error:', e);
        }
    }

    async function revokeSession(sessionId) {
        if (!confirm('این نشست باطل بشه؟ اگر همین دستگاه رو انتخاب کرده باشی، بلافاصله از حساب خارج می‌شی.')) return;
        try {
            const token = getSessionToken();
            const res = await fetch('/api/account/sessions/revoke', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ sessionId })
            });
            const data = await res.json().catch(() => ({}));
            console.log('[sessions] revoke response:', res.status, data);
            if (!res.ok || data.error) throw new Error(data.error || 'خطا در ابطال نشست');
            showToast('✅ نشست باطل شد');
            await renderSessionsList();
        } catch (e) {
            showToast('⚠️ ابطال نشست ناموفق بود: ' + (e.message || ''));
        }
    }
})();
