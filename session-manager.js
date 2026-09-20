// session-manager.js
// یه بخش «⚙️ تنظیمات» داخل مودالِ «ویرایش پروفایل» تزریق می‌کنه، بدون دست‌زدن به
// index.html. دو تیکه داره:
//   ۱) امنیت نشست - فقط برای ادمین: یه دکمه‌ی «باطل کردن تمام نشست‌های دیگر»
//      (بدون لیست و جزئیات، تا مصرف اضافه نداشته باشه)
//   ۲) تعیین/تغییر رمز عبور - برای همه‌ی کاربرها
//
// چون openProfileEditModal هر بار محتوای #admin-modal-form رو از صفر می‌سازه، به‌جای
// اورراید کردن خودِ آن تابع، window.openAdminModal رو (که همه‌ی مودال‌های اپ ازش رد
// می‌شن) می‌پوشونیم و فقط وقتی عنوان مودال «ویرایش پروفایل» بود، این بخش رو اضافه
// می‌کنیم؛ برای بقیه‌ی مودال‌ها (افزودن درس، تسک و...) هیچ تغییری ایجاد نمی‌شه.

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

    function isAdminUser() {
        try {
            return typeof currentUser !== 'undefined' && currentUser && currentUser.isAdmin;
        } catch (e) {
            return false;
        }
    }

    function injectSettingsSection() {
        const form = document.getElementById('admin-modal-form');
        if (!form) return;

        const section = document.createElement('div');
        section.id = 'profile-settings-section';
        section.className = 'settings-section';
        section.innerHTML = '<h4 class="settings-title">⚙️ تنظیمات</h4>';
        form.appendChild(section);

        if (isAdminUser()) injectAdminSecurityBox(section);
        injectPasswordBox(section);
    }

    // ---------- امنیت نشست (فقط ادمین) ----------

    function injectAdminSecurityBox(container) {
        const box = document.createElement('div');
        box.id = 'session-security-section';
        box.className = 'settings-box';
        box.innerHTML =
            '<strong class="settings-box-title">🔐 امنیت نشست</strong>' +
            '<div class="settings-box-hint">اگه فکر می‌کنی توکن ورودت جایی لو رفته، همه‌ی نشست‌های دیگه (روی همه‌ی دستگاه‌ها، به‌جز همینی که الان باهاش کار می‌کنی) رو باطل کن.</div>' +
            '<button id="revoke-others-btn" type="button" class="settings-btn settings-btn-danger">باطل کردن تمام نشست‌های دیگر</button>';
        container.appendChild(box);

        document.getElementById('revoke-others-btn').addEventListener('click', async () => {
            if (!confirm('همه‌ی نشست‌های دیگر (روی همه‌ی دستگاه‌ها) باطل بشن؟')) return;
            const btn = document.getElementById('revoke-others-btn');
            btn.disabled = true;
            try {
                const token = getSessionToken();
                const res = await fetch('/api/account/sessions/revoke-others', {
                    method: 'POST',
                    cache: 'no-store',
                    headers: { Authorization: 'Bearer ' + token }
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.error) throw new Error(data.error || 'خطا در ابطال نشست‌ها');
                showToast('✅ ' + (data.revokedCount || 0) + ' نشست دیگر باطل شد');
            } catch (e) {
                showToast('⚠️ خطا: ' + (e.message || ''));
            } finally {
                btn.disabled = false;
            }
        });
    }

    // ---------- تعیین / تغییر رمز عبور (برای همه) ----------

    async function injectPasswordBox(container) {
        const box = document.createElement('div');
        box.id = 'password-set-section';
        box.className = 'settings-box';
        box.innerHTML = '<div class="settings-box-hint" style="text-align:center;">در حال بررسی...</div>';
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
            '<div id="password-compact-row" class="settings-row">' +
            '<span>🔑 رمز عبور تنظیم شده ✅</span>' +
            '<button id="change-password-toggle-btn" type="button" class="settings-btn-small">تغییر رمز</button>' +
            '</div>' +
            '<div id="password-compact-form" class="hidden-block"></div>';

        document.getElementById('change-password-toggle-btn').addEventListener('click', () => {
            const formHost = document.getElementById('password-compact-form');
            const opening = !formHost.classList.contains('shown');
            formHost.classList.toggle('shown', opening);
            if (opening && !formHost.dataset.built) {
                formHost.dataset.built = '1';
                formHost.innerHTML = passwordFormHtml();
                wirePasswordForm(formHost, () => {
                    formHost.classList.remove('shown');
                });
            }
        });
    }

    function renderFullPasswordForm(box) {
        box.innerHTML =
            '<strong class="settings-box-title">🔑 تعیین رمز عبور برای ورود</strong>' +
            '<div class="settings-box-hint">با این کار می‌تونی دفعات بعد با همین ایمیل و یه رمز عبور هم وارد بشی، بدون گوگل یا کد ایمیلی.</div>' +
            '<div class="settings-form-wrap">' + passwordFormHtml() + '</div>';
        wirePasswordForm(box, () => {
            renderCompactPasswordBox(box);
        });
    }

    function passwordFormHtml() {
        return (
            '<input type="password" class="new-password-input settings-input" placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)" />' +
            '<input type="password" class="new-password-confirm settings-input" placeholder="تکرار رمز عبور" />' +
            '<button class="set-password-btn settings-btn">ذخیره رمز عبور</button>'
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
