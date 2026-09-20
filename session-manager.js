// session-manager.js
// یه بخش «⚙️ تنظیمات» (نشست‌های فعال + تعیین/تغییر رمز عبور) رو داخل همون مودالِ
// «ویرایش پروفایل» تزریق می‌کنه، بدون دست‌زدن به index.html.
//
// چون openProfileEditModal هر بار محتوای #admin-modal-form رو از صفر می‌سازه، به‌جای
// اورراید کردن خودِ آن تابع، window.openAdminModal رو (که همه‌ی مودال‌های اپ ازش رد
// می‌شن) می‌پوشونیم و فقط وقتی عنوان مودال «ویرایش پروفایل» بود، بخش تنظیمات رو
// اضافه می‌کنیم؛ برای بقیه‌ی مودال‌ها (افزودن درس، تسک و...) هیچ تغییری ایجاد نمی‌شه.

(function () {
    const _origOpenAdminModal = window.openAdminModal;
    if (typeof _origOpenAdminModal !== 'function') return;

    window.openAdminModal = function (title, bodyHtml, callback) {
        const result = _origOpenAdminModal(title, bodyHtml, callback);
        if (typeof title === 'string' && title.indexOf('ویرایش پروفایل') !== -1) {
            injectSettingsSection();
        }
        return result;
    };

    function injectSettingsSection() {
        const form = document.getElementById('admin-modal-form');
        if (!form) return;

        const section = document.createElement('div');
        section.id = 'profile-settings-section';
        section.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid var(--beige-dark);';
        section.innerHTML = '<h4 style="margin:0 0 10px;font-size:0.85rem;">⚙️ تنظیمات</h4>';
        form.appendChild(section);

        injectSessionsBox(section);
        injectPasswordBox(section);
    }

    // ---------- نشست‌های فعال ----------

    function injectSessionsBox(container) {
        const box = document.createElement('div');
        box.id = 'sessions-section';
        box.style.cssText = 'background:var(--cream);border:1px solid var(--beige-dark);border-radius:14px;padding:12px;margin-bottom:10px;';
        box.innerHTML =
            '<div id="sessions-toggle-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">' +
            '<strong style="font-size:0.85rem;">🔐 نشست‌های فعال</strong>' +
            '<span id="sessions-toggle-icon">▾</span>' +
            '</div>' +
            '<div id="sessions-list" style="display:none;margin-top:10px;font-size:0.78rem;"></div>';
        container.appendChild(box);

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
            if (!res.ok || data.error) throw new Error(data.error || 'خطا در دریافت نشست‌ها');

            const sessions = data.sessions || [];
            if (!sessions.length) {
                box.innerHTML = '<div style="text-align:center;color:var(--brown-light);padding:8px 0;">نشستی یافت نشد</div>';
                return;
            }

            box.innerHTML = sessions.map(s =>
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--beige-dark);gap:8px;">' +
                '<div style="overflow:hidden;">' +
                '<div>' + (s.current ? '🟢 این دستگاه (نشست فعلی)' : '💻 دستگاه دیگر') + '</div>' +
                '<div style="color:var(--brown-light);font-size:0.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml((s.userAgent || 'نامشخص')).slice(0, 60) + '</div>' +
                '<div style="color:var(--brown-light);font-size:0.68rem;">' + (s.createdAtMs ? new Date(s.createdAtMs).toLocaleString('fa-IR') : '') + '</div>' +
                '</div>' +
                (s.current ? '' : '<button data-sid="' + s.id + '" class="revoke-session-btn" style="flex-shrink:0;background:var(--terracotta);color:#fff;border:none;border-radius:20px;padding:5px 12px;font-size:0.7rem;cursor:pointer;">ابطال</button>') +
                '</div>'
            ).join('');

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
            if (!res.ok || data.error) throw new Error(data.error || 'خطا در ابطال نشست');
            showToast('✅ نشست باطل شد');
            await renderSessionsList();
        } catch (e) {
            showToast('⚠️ ابطال نشست ناموفق بود: ' + (e.message || ''));
        }
    }

    // ---------- تعیین / تغییر رمز عبور ----------

    async function injectPasswordBox(container) {
        const box = document.createElement('div');
        box.id = 'password-set-section';
        box.style.cssText = 'background:var(--cream);border:1px solid var(--beige-dark);border-radius:14px;padding:12px;';
        box.innerHTML = '<div style="text-align:center;color:var(--brown-light);font-size:0.78rem;">در حال بررسی...</div>';
        container.appendChild(box);

        let hasPassword = false;
        try {
            const token = getSessionToken();
            const res = await fetch('/api/account/info', {
                cache: 'no-store',
                headers: { Authorization: 'Bearer ' + token }
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) hasPassword = !!data.hasPassword;
        } catch (e) {
            console.error('account info error:', e);
        }

        if (hasPassword) renderCompactPasswordBox(box);
        else renderFullPasswordForm(box);
    }

    function renderCompactPasswordBox(box) {
        box.innerHTML =
            '<div id="password-compact-row" style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:0.8rem;">🔑 رمز عبور تنظیم شده ✅</span>' +
            '<button id="change-password-toggle-btn" type="button" style="background:none;border:1px solid var(--beige-dark);border-radius:20px;padding:4px 12px;font-size:0.72rem;cursor:pointer;">تغییر رمز</button>' +
            '</div>' +
            '<div id="password-compact-form" style="display:none;margin-top:10px;"></div>';

        document.getElementById('change-password-toggle-btn').addEventListener('click', () => {
            const formHost = document.getElementById('password-compact-form');
            const opening = formHost.style.display === 'none';
            formHost.style.display = opening ? 'block' : 'none';
            if (opening && !formHost.dataset.built) {
                formHost.dataset.built = '1';
                formHost.innerHTML = passwordFormHtml();
                wirePasswordForm(formHost, () => {
                    formHost.style.display = 'none';
                });
            }
        });
    }

    function renderFullPasswordForm(box) {
        box.innerHTML =
            '<strong style="font-size:0.85rem;">🔑 تعیین رمز عبور برای ورود</strong>' +
            '<div style="color:var(--brown-light);font-size:0.7rem;margin-top:4px;">' +
            'با این کار می‌تونی دفعات بعد با همین ایمیل و یه رمز عبور هم وارد بشی، بدون گوگل یا کد ایمیلی.' +
            '</div>' +
            '<div style="margin-top:8px;">' + passwordFormHtml() + '</div>';
        wirePasswordForm(box, () => {
            renderCompactPasswordBox(box);
        });
    }

    function passwordFormHtml() {
        return (
            '<input type="password" class="new-password-input" placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)" ' +
            'style="width:100%;padding:8px;border-radius:10px;border:1px solid var(--beige-dark);font-size:0.8rem;box-sizing:border-box;" />' +
            '<input type="password" class="new-password-confirm" placeholder="تکرار رمز عبور" ' +
            'style="width:100%;margin-top:6px;padding:8px;border-radius:10px;border:1px solid var(--beige-dark);font-size:0.8rem;box-sizing:border-box;" />' +
            '<button class="set-password-btn" type="button" ' +
            'style="width:100%;margin-top:8px;padding:9px;border-radius:12px;border:none;background:var(--terracotta);color:#fff;cursor:pointer;font-size:0.82rem;">' +
            'ذخیره رمز عبور</button>'
        );
    }

    function wirePasswordForm(host, onSuccess) {
        const btn = host.querySelector('.set-password-btn');
        btn.addEventListener('click', async () => {
            const pwInput = host.querySelector('.new-password-input');
            const pw2Input = host.querySelector('.new-password-confirm');
            const pw = pwInput.value;
            const pw2 = pw2Input.value;
            if (!pw || pw.length < 6) { showToast('⚠️ رمز عبور باید حداقل ۶ کاراکتر باشد'); return; }
            if (pw !== pw2) { showToast('⚠️ دو رمز عبور یکسان نیستند'); return; }
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
                pwInput.value = '';
                pw2Input.value = '';
                showToast('✅ رمز عبور ذخیره شد؛ از این به بعد می‌تونی با ایمیل و همین رمز وارد بشی');
                if (typeof onSuccess === 'function') onSuccess();
            } catch (e) {
                showToast('⚠️ ذخیره‌ی رمز عبور ناموفق بود: ' + (e.message || ''));
            } finally {
                btn.disabled = false;
            }
        });
    }
})();
