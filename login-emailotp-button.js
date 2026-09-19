// login-emailotp-button.js
// یه دکمه‌ی «ورود با کد ایمیلی» به کارت گزینه‌های ورود اضافه می‌کنه (که الان فقط رمز
// عبور و گوگل داره)، بدون دست‌زدن به index.html. از همون مکانیزم کارت‌های اپ
// (showAuthCard) استفاده می‌کنه که ثبت‌نام هم برای همین منظور استفاده‌ش می‌کنه —
// یعنی خودِ ارسال کد و تایید کد و تکمیل ورود همون کدِ فعلیه، فقط یه راه ورودی جدید
// بهش اضافه می‌شه.

(function () {
    function inject() {
        const card = document.querySelector('#auth-login-options-card');
        if (!card || document.getElementById('email-otp-login-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'email-otp-login-btn';
        btn.type = 'button';
        btn.textContent = '📧 ورود با کد ایمیلی';
        btn.style.cssText = 'width:100%;margin-top:10px;padding:10px;border-radius:12px;border:1px solid var(--beige-dark);background:var(--cream);cursor:pointer;font-size:0.85rem;';
        btn.addEventListener('click', () => {
            if (typeof showAuthCard === 'function') showAuthCard('emailotp');
        });
        card.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
