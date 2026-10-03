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
      ${isAdminUser() ? `
      <div class="st-item" onclick="ST.openBigUpload()">
        <span class="st-icon">📤</span><span class="st-label">آپلود فایل بزرگ (تا ۳۰۰ مگابایت)</span>
      </div>
      ` : ''}
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
      <div id="add-reference-form-host"></div>
      <div id="references-list"><div class="st-loading">در حال بارگذاری...</div></div>
    `;
    if (isAdminUser()) {
      document.getElementById('add-reference-btn').addEventListener('click', () => {
        document.getElementById('add-reference-btn').style.display = 'none';
        renderAddReferenceForm(document.getElementById('add-reference-form-host'));
      });
    }
    await renderReferencesList();
  }

  function renderAddReferenceForm(host) {
    host.innerHTML = `
      <div class="st-form-box">
        <input type="text" id="ref-title-input" class="st-input" placeholder="عنوان رفرنس" />
        <input type="text" id="ref-year-input" class="st-input" placeholder="سال (اختیاری)" inputmode="numeric" />
        <div class="st-source-toggle">
          <button type="button" id="ref-source-arvan" class="st-toggle-btn active">آروان</button>
          <button type="button" id="ref-source-telegram" class="st-toggle-btn">تلگرام</button>
          <button type="button" id="ref-source-link" class="st-toggle-btn">لینک خارجی</button>
        </div>
        <input type="file" id="ref-file-input" class="st-input" accept=".pdf,.doc,.docx,image/*" />
        <div id="ref-telegram-hint" class="hidden-block" style="color:var(--brown-light);font-size:0.68rem;">سقف تلگرام ۴۵ مگابایته؛ برای حجم بیشتر، آروان رو انتخاب کن.</div>
        <input type="text" id="ref-link-input" class="st-input hidden-block" placeholder="لینک خارجی رو اینجا بچسبون" />
        <button id="ref-submit-btn" type="button" class="st-add-btn">ذخیره رفرنس</button>
      </div>
    `;

    const arvanBtn = host.querySelector('#ref-source-arvan');
    const telegramBtn = host.querySelector('#ref-source-telegram');
    const linkBtn = host.querySelector('#ref-source-link');
    const fileInput = host.querySelector('#ref-file-input');
    const telegramHint = host.querySelector('#ref-telegram-hint');
    const linkInput = host.querySelector('#ref-link-input');
    let sourceMode = 'arvan';

    function setMode(mode) {
      sourceMode = mode;
      [arvanBtn, telegramBtn, linkBtn].forEach((b) => b.classList.remove('active'));
      ({ arvan: arvanBtn, telegram: telegramBtn, link: linkBtn })[mode].classList.add('active');
      fileInput.classList.toggle('hidden-block', mode === 'link');
      telegramHint.classList.toggle('hidden-block', mode !== 'telegram');
      linkInput.classList.toggle('hidden-block', mode !== 'link');
    }
    arvanBtn.addEventListener('click', () => setMode('arvan'));
    telegramBtn.addEventListener('click', () => setMode('telegram'));
    linkBtn.addEventListener('click', () => setMode('link'));

    host.querySelector('#ref-submit-btn').addEventListener('click', async () => {
      const title = host.querySelector('#ref-title-input').value.trim();
      const year = host.querySelector('#ref-year-input').value.trim();
      if (!title) { showToast('⚠️ عنوان رو وارد کن'); return; }

      const submitBtn = host.querySelector('#ref-submit-btn');
      submitBtn.disabled = true;
      try {
        let url;
        if (sourceMode === 'link') {
          url = linkInput.value.trim();
          if (!url) { showToast('⚠️ لینک رو وارد کن'); submitBtn.disabled = false; return; }
        } else {
          const file = fileInput.files[0];
          if (!file) { showToast('⚠️ یه فایل انتخاب کن'); submitBtn.disabled = false; return; }
          showToast('⏳ در حال آپلود...');
          url = sourceMode === 'telegram' ? await uploadToTelegram(file) : await uploadToArvan(file);
        }

        await apiFs('add', 'references', { data: { title, year: year || null, url, createdAtMs: Date.now() } });
        showToast('✅ رفرنس اضافه شد');
        host.innerHTML = '';
        const addBtn = document.getElementById('add-reference-btn');
        if (addBtn) addBtn.style.display = 'block';
        await renderReferencesList();
      } catch (e) {
        showToast('⚠️ خطا: ' + (e.message || ''));
      } finally {
        submitBtn.disabled = false;
      }
    });
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
          <a class="st-label" href="${item.url}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">
            ${escapeHtml(item.title || 'بدون عنوان')}${item.year ? ` <span style="color:var(--brown-light);font-size:0.75rem;">(${escapeHtml(String(item.year))})</span>` : ''}
          </a>
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

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // سقف واقعی تلگرام برای آپلود فایل توسط بات ۵۰ مگابایته؛ ۴۵ می‌ذاریم برای حاشیه‌ی امن.
  const TELEGRAM_MAX_BYTES = 45 * 1024 * 1024;

  async function uploadToTelegram(file) {
    if (file.size > TELEGRAM_MAX_BYTES) {
      throw new Error('حجم فایل برای تلگرام زیاده (حداکثر ۴۵ مگابایت) — آروان رو انتخاب کن');
    }
    const fileBase64 = await fileToBase64(file);
    const token = getSessionToken();
    const res = await fetch('/telegram-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ fileBase64, fileName: file.name, mimeType: file.type })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || 'آپلود به تلگرام ناموفق بود');
    return data.secure_url;
  }

  // فرم‌های اصلی «افزودن جزوه» و «افزودن ویدیو» (توی index.html) برای گزینه‌ی
  // «آپلود فایل» تابعی به اسم uploadToCloudinary رو صدا می‌زنن که هیچ‌جا تعریف نشده
  // بود (از قبل خراب بود، نه کار ما) - همینجا تعریفش می‌کنیم و به آپلود آروان وصلش
  // می‌کنیم، با همون شکل خروجی‌ای که اون فرم‌ها انتظار دارن (secure_url, bytes).
  window.uploadToCloudinary = async function (file) {
    let secure_url;
    const wantsTelegram = file.size <= TELEGRAM_MAX_BYTES &&
      confirm('برای آپلود این فایل در تلگرام «OK» رو بزن؛ برای آپلود در فضای ابری آروان «Cancel» رو بزن.');
    if (wantsTelegram) secure_url = await uploadToTelegram(file);
    else secure_url = await uploadToArvan(file);
    return { secure_url, bytes: file.size };
  };

  // لینک امضاشده رو از Worker می‌گیره، بعد خودِ مرورگر مستقیم فایل رو به فضای ابری
  // آروان می‌فرسته (نه از Worker رد میشه)، پس هیچ محدودیت حجمی از سمت ما وجود نداره.
  async function uploadToArvan(file) {
    const token = getSessionToken();
    const contentType = file.type || 'application/octet-stream';
    const presignRes = await fetch(
      `/arvan-presign?name=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(contentType)}`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const presignData = await presignRes.json().catch(() => ({}));
    if (!presignRes.ok || presignData.error) throw new Error(presignData.error || 'ساخت لینک آپلود ناموفق بود');

    const putRes = await fetch(presignData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });
    if (!putRes.ok) throw new Error('آپلود به فضای ابری ناموفق بود (کد ' + putRes.status + ')');

    return presignData.publicUrl;
  }

  // ---------- آپلود فایل بزرگ (تا ۳۰۰ مگابایت) - مستقیم به فضای ابری آروان ----------
  function openBigUpload() {
    showBack(renderMainMenu);
    menuRoot.innerHTML = `
      <div class="st-form-box">
        <div style="color:var(--brown-light);font-size:0.75rem;line-height:1.7;">
          فایلت رو اینجا آپلود کن تا یه لینک بگیری؛ اون لینک رو می‌تونی توی فرم افزودن جزوه/ویدیو، قسمت «لینک خارجی» بچسبونی.
        </div>
        <div class="st-source-toggle">
          <button type="button" id="big-source-arvan" class="st-toggle-btn active">آروان (تا ۳۰۰ مگ)</button>
          <button type="button" id="big-source-telegram" class="st-toggle-btn">تلگرام (تا ۴۵ مگ)</button>
        </div>
        <input type="file" id="big-upload-file-input" class="st-input" />
        <button id="big-upload-submit-btn" type="button" class="st-add-btn">آپلود کن</button>
        <div id="big-upload-result"></div>
      </div>
    `;
    const bigArvanBtn = document.getElementById('big-source-arvan');
    const bigTelegramBtn = document.getElementById('big-source-telegram');
    let bigSourceMode = 'arvan';
    bigArvanBtn.addEventListener('click', () => {
      bigSourceMode = 'arvan';
      bigArvanBtn.classList.add('active');
      bigTelegramBtn.classList.remove('active');
    });
    bigTelegramBtn.addEventListener('click', () => {
      bigSourceMode = 'telegram';
      bigTelegramBtn.classList.add('active');
      bigArvanBtn.classList.remove('active');
    });

    document.getElementById('big-upload-submit-btn').addEventListener('click', async () => {
      const fileInput = document.getElementById('big-upload-file-input');
      const file = fileInput.files[0];
      const resultBox = document.getElementById('big-upload-result');
      if (!file) { showToast('⚠️ یه فایل انتخاب کن'); return; }
      const maxBytes = bigSourceMode === 'telegram' ? TELEGRAM_MAX_BYTES : 300 * 1024 * 1024;
      if (file.size > maxBytes) {
        showToast(`⚠️ حجم فایل برای ${bigSourceMode === 'telegram' ? 'تلگرام (۴۵ مگ)' : 'آروان (۳۰۰ مگ)'} زیاده`);
        return;
      }

      const btn = document.getElementById('big-upload-submit-btn');
      btn.disabled = true;
      resultBox.innerHTML = '<div class="st-loading">در حال آپلود... (ممکنه برای فایل بزرگ کمی طول بکشه)</div>';
      try {
        const url = bigSourceMode === 'telegram' ? await uploadToTelegram(file) : await uploadToArvan(file);

        resultBox.innerHTML = `
          <div style="margin-top:10px;">
            <div style="color:var(--brown-light);font-size:0.75rem;margin-bottom:6px;">✅ آپلود شد، لینک رو کپی کن:</div>
            <input type="text" readonly value="${url}" id="big-upload-link-output" class="st-input" onclick="this.select()" />
            <button id="big-upload-copy-btn" type="button" class="st-toggle-btn" style="width:100%;margin-top:6px;">📋 کپی لینک</button>
          </div>
        `;
        document.getElementById('big-upload-copy-btn').addEventListener('click', () => {
          const input = document.getElementById('big-upload-link-output');
          input.select();
          navigator.clipboard?.writeText(input.value).then(() => showToast('✅ لینک کپی شد'));
        });
        showToast('✅ آپلود کامل شد');
      } catch (e) {
        resultBox.innerHTML = '';
        showToast('⚠️ خطا: ' + (e.message || ''));
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.ST = { openLearnPlusMenu, openNeuro, openEpid, comingSoon, openReferences, openBigUpload };

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
