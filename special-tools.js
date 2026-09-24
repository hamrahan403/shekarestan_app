(function () {
  'use strict';

  // ---------- ساخت صفحه‌ی ابزار ویژه به‌عنوان یه «page» واقعی، مثل بقیه‌ی تب‌ها ----------
  // برخلاف نسخه‌ی قبلی (یه overlay جدا که کل صفحه رو می‌پوشوند)، این نسخه یه div با
  // کلاس "page" داخل همون #page-content تزریق می‌کنه تا هدر و ناوبری پایین همیشه دیده
  // بمونن، دقیقاً مثل تب‌های دیگه (پروفایل، گروه‌ها و...).

  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const stPage = document.createElement('div');
  stPage.className = 'page';
  stPage.id = 'page-special-tools';
  stPage.innerHTML = `
    <div id="st-back-row" style="display:none;margin-bottom:14px;">
      <button id="st-back-btn" class="st-back-btn">‹ بازگشت</button>
    </div>
    <div id="st-menu-root"></div>
  `;
  pageContent.appendChild(stPage);

  const menuRoot = stPage.querySelector('#st-menu-root');
  const backRow = stPage.querySelector('#st-back-row');
  const backBtn = stPage.querySelector('#st-back-btn');

  // ---------- هماهنگ‌سازی با سیستم ناوبری اصلی اپ ----------
  // navigateTo فقط صفحاتی که از قبل تو شیء "pages" ثبت شدن رو مدیریت می‌کنه؛ چون این
  // صفحه بعداً و از بیرون اضافه شده، خودمون با یه wrapper کلاس active رو هماهنگ نگه می‌داریم.
  const _origNavigateTo = window.navigateTo;
  if (typeof _origNavigateTo === 'function') {
    window.navigateTo = function (pageName) {
      const result = _origNavigateTo(pageName);
      stPage.classList.toggle('active', pageName === 'special-tools');
      if (pageName === 'special-tools') renderMainMenu();
      return result;
    };
  }

  function goToSpecialTools() {
    if (typeof window.navigateTo === 'function') window.navigateTo('special-tools');
  }

  // ---------- صفحه‌ی اصلی: ابزار ویژه ----------
  function renderMainMenu() {
    backRow.style.display = 'none';
    menuRoot.innerHTML = `
      <div class="st-item" onclick="ST.comingSoon('محاسبه معدل')">
        <span class="st-icon">🧮</span><span class="st-label">محاسبه معدل</span>
        <span class="st-badge">به‌زودی</span>
      </div>
      <div class="st-item" onclick="ST.comingSoon('آزمون')">
        <span class="st-icon">📝</span><span class="st-label">آزمون</span>
        <span class="st-badge">به‌زودی</span>
      </div>
      <div class="st-item" onclick="ST.openReferences()">
        <span class="st-icon">📖</span><span class="st-label">رفرنس</span>
      </div>
      <div class="st-item" onclick="ST.openLearnPlusMenu()">
        <span class="st-icon">➕</span><span class="st-label">آموزش پلاس+</span>
      </div>
    `;
  }

  function showBack(onBack) {
    backRow.style.display = 'block';
    backBtn.onclick = onBack;
  }

  // ---------- زیرمنو: آموزش پلاس+ ----------
  function openLearnPlusMenu() {
    showBack(renderMainMenu);
    menuRoot.innerHTML = `
      <div class="st-item" onclick="ST.openNeuro()">
        <span class="st-icon">🧠</span><span class="st-label">آموزش نوروآناتومی</span>
      </div>
      <div class="st-sub-label">راه‌های عصبی</div>
      <div class="st-item" onclick="ST.openEpid()">
        <span class="st-icon">🦠</span><span class="st-label">آموزش اپیدمیولوژی</span>
      </div>
      <div class="st-sub-label">داستان شهر شکرستان</div>
    `;
  }

  function openNeuro() {
    showBack(openLearnPlusMenu);
    menuRoot.innerHTML = `<div id="learn-neuro-list-mount"></div><div id="learn-neuro-step-mount"></div>`;
    if (typeof renderNeuroList === 'function') {
      const realList = document.getElementById('learn-neuro-list');
      const realStep = document.getElementById('learn-neuro-step');
      if (realList) {
        document.getElementById('learn-neuro-list-mount').appendChild(realList);
        realList.style.display = 'block';
        renderNeuroList();
        realList.querySelectorAll('a').forEach((a) => a.remove());
      }
      if (realStep) document.getElementById('learn-neuro-step-mount').appendChild(realStep);
    }
  }

  function openEpid() {
    showBack(openLearnPlusMenu);
    menuRoot.innerHTML = `<div id="learn-epid-list-mount"></div><div id="learn-epid-step-mount"></div>`;
    if (typeof renderEpidList === 'function') {
      const realList = document.getElementById('learn-epid-list');
      const realStep = document.getElementById('learn-epid-step');
      if (realList) {
        document.getElementById('learn-epid-list-mount').appendChild(realList);
        realList.style.display = 'block';
        renderEpidList();
      }
      if (realStep) document.getElementById('learn-epid-step-mount').appendChild(realStep);
    }
  }

  function comingSoon(title) {
    if (typeof showToast === 'function') showToast(`🚧 ${title}: در آپدیت‌های بعدی تکمیل می‌شود`);
    else alert(`${title}: در آپدیت‌های بعدی تکمیل می‌شود`);
  }

  // ---------- رفرنس: لیست واقعی + آپلود توسط ادمین ----------
  function isAdminUser() {
    try {
      return typeof currentUser !== 'undefined' && currentUser && currentUser.isAdmin;
    } catch (e) {
      return false;
    }
  }

  async function openReferences() {
    showBack(renderMainMenu);
    menuRoot.innerHTML = `
      ${isAdminUser() ? '<button id="add-reference-btn" class="st-add-btn">➕ افزودن رفرنس جدید</button>' : ''}
      <div id="references-list"><div class="st-loading">در حال بارگذاری...</div></div>
    `;
    if (isAdminUser()) {
      document.getElementById('add-reference-btn').addEventListener('click', openAddReferenceFlow);
    }
    await renderReferencesList();
  }

  async function renderReferencesList() {
    const box = document.getElementById('references-list');
    if (!box) return;
    try {
      const items = await apiFs('list', 'references', { orderByField: 'createdAtMs', orderByDir: 'desc' });
      if (!items || !items.length) {
        box.innerHTML = '<div class="st-empty">هنوز رفرنسی اضافه نشده</div>';
        return;
      }
      box.innerHTML = items.map((item) => `
        <div class="st-item">
          <span class="st-icon">📄</span>
          <a class="st-label" href="${item.url}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">${escapeHtml(item.title || 'بدون عنوان')}</a>
          ${isAdminUser() ? `<button data-id="${item.id}" class="st-delete-btn">حذف</button>` : ''}
        </div>
      `).join('');
      box.querySelectorAll('.st-delete-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('این رفرنس حذف بشه؟')) return;
          try {
            await apiFs('delete', 'references', { docId: btn.dataset.id });
            await renderReferencesList();
            showToast('✅ رفرنس حذف شد');
          } catch (e) {
            showToast('⚠️ خطا: ' + (e.message || ''));
          }
        });
      });
    } catch (e) {
      box.innerHTML = '<div class="st-empty">خطا در بارگذاری رفرنس‌ها</div>';
    }
  }

  function openAddReferenceFlow() {
    const title = prompt('عنوان رفرنس رو وارد کن:');
    if (!title || !title.trim()) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,image/*';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 4.2 * 1024 * 1024) {
        showToast('⚠️ حجم فایل نباید بیشتر از ۴ مگابایت باشد');
        return;
      }
      showToast('⏳ در حال آپلود...');
      try {
        const fileBase64 = await fileToBase64(file);
        const token = getSessionToken();
        const res = await fetch('/telegram-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ fileBase64, fileName: file.name, mimeType: file.type })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'آپلود ناموفق بود');

        await apiFs('add', 'references', { data: { title: title.trim(), url: data.secure_url, createdAtMs: Date.now() } });
        showToast('✅ رفرنس اضافه شد');
        await renderReferencesList();
      } catch (e) {
        showToast('⚠️ خطا: ' + (e.message || ''));
      }
    });
    fileInput.click();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.ST = { openLearnPlusMenu, openNeuro, openEpid, comingSoon, openReferences };

  // ---------- اضافه‌کردن آیتم ناوبری، دقیقاً مثل بقیه (data-page + navigateTo) ----------
  function hookNavItem() {
    const learnBtn = document.getElementById('learnBtn');
    if (learnBtn) learnBtn.style.display = 'none';

    const nav = document.querySelector('.bottom-nav');
    if (!nav || document.getElementById('st-nav-btn')) return;

    const newBtn = document.createElement('button');
    newBtn.className = 'nav-item';
    newBtn.id = 'st-nav-btn';
    newBtn.dataset.page = 'special-tools';
    newBtn.innerHTML = '<span class="icon">☢️</span><span class="label">ابزار ویژه</span>';
    newBtn.addEventListener('click', () => {
      if (typeof pauseLearnMedia === 'function') pauseLearnMedia();
      goToSpecialTools();
    });
    nav.appendChild(newBtn);

    // navItems یه NodeList/آرایه‌ست که موقع لود اولیه ساخته شده؛ دکمه‌ی جدید رو هم بهش اضافه می‌کنیم
    // تا navigateTo بتونه active/غیرفعال بودنش رو هم مثل بقیه مدیریت کنه.
    if (typeof navItems !== 'undefined' && navItems && typeof navItems.push === 'function') {
      navItems.push(newBtn);
    } else if (typeof navItems !== 'undefined' && navItems && navItems.length !== undefined) {
      // اگه NodeList واقعی (نه آرایه) بود، یه querySelectorAll تازه جایگزینش می‌کنیم
      window.navItems = document.querySelectorAll('.bottom-nav .nav-item');
    }
  }

  if (document.readyState !== 'loading') hookNavItem();
  else document.addEventListener('DOMContentLoaded', hookNavItem);

  // ---------- مخفی کردن دائمی بخش انگل‌شناسی (اگه جایی لینک مستقیم بهش باشه) ----------
  const style = document.createElement('style');
  style.textContent = `
    #learn-tabs, #learn-para-list, #learn-para-step { display: none !important; }
  `;
  document.head.appendChild(style);
})();
