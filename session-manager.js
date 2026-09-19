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

        injectPasswordSection(box);
    }

    function injectPasswordSection(afterEl) {
        if (document.getElementById('password-set-section')) return;

        const box = document.createElement('div');
        box.id = 'password-set-section';
        box.style.cssText = 'margin-top:14px;background:var(--cream);border:1px solid var(--beige-dark);border-radius:14px;padding:12px;';
        box.innerHTML = `
            <strong style="font-size:0.85rem;">🔑 تعیین رمز عبور برای ورود</strong>
            <div style="color:var(--brown-light);font-size:0.7rem;margin-top:4px;">
                با این کار می‌تونی دفعات بعد با همین ایمیل و یه رمز عبور هم وارد بشی، بدون گوگل یا کد ایمیلی.
            </div>
            <input type="password" id="new-password-input" placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)"
                style="width:100%;margin-top:8px;padding:8px;border-radius:10px;border:1px solid var(--beige-dark);font-size:0.8rem;box-sizing:border-box;" />
            <input type="password" id="new-password-confirm" placeholder="تکرار رمز عبور"
                style="width:100%;margin-top:6px;padding:8px;border-radius:10px;border:1px solid var(--beige-dark);font-size:0.8rem;box-sizing:border-box;" />
            <button id="set-password-btn" type="button"
                style="width:100%;margin-top:8px;padding:9px;border-radius:12px;border:none;background:var(--terracotta);color:#fff;cursor:pointer;font-size:0.82rem;">
                ذخیره رمز عبور
            </button>
        `;
        afterEl.insertAdjacentElement('afterend', box);

        document.getElementById('set-password-btn').addEventListener('click', async () => {
            const pw = document.getElementById('new-password-input').value;
            const pw2 = document.getElementById('new-password-confirm').value;
            if (!pw || pw.length < 6) { showToast('⚠️ رمز عبور باید حداقل ۶ کاراکتر باشد'); return; }
            if (pw !== pw2) { showToast('⚠️ دو رمز عبور یکسان نیستند'); return; }
            const btn = document.getElementById('set-password-btn');
            btn.disabled = true;
            try {
                const token = getSessionToken();
                const res = await fetch('/api/account/set-password', {
                    method: 'POST',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ password: pw })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.error) throw new Error(data.error || 'خطا در ذخیره‌ی رمز عبور');
                document.getElementById('new-password-input').value = '';
                document.getElementById('new-password-confirm').value = '';
                showToast('✅ رمز عبور ذخیره شد؛ از این به بعد می‌تونی با ایمیل و همین رمز وارد بشی');
            } catch (e) {
                showToast('⚠️ ذخیره‌ی رمز عبور ناموفق بود: ' + (e.message || ''));
            } finally {
                btn.disabled = false;
            }
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
