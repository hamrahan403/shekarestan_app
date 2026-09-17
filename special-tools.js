
(function () {
  'use strict';

  // ---------- ساخت overlay ابزار ویژه (یه صفحه‌ی کاملاً جدا، مزاحم بقیه‌ی سایت نمی‌شه) ----------
  const overlay = document.createElement('div');
  overlay.id = 'special-tools-overlay';
  overlay.innerHTML = `
    <div class="st-header">
      <button id="st-back-btn" class="st-back-btn">‹ بازگشت</button>
      <h2 id="st-title">☢️ ابزار ویژه</h2>
      <button id="st-close-btn" class="st-back-btn">✕ بستن</button>
    </div>
    <div id="st-menu-root" class="st-body"></div>
  `;
  document.body.appendChild(overlay);

  const menuRoot = overlay.querySelector('#st-menu-root');
  const titleEl = overlay.querySelector('#st-title');
  const backBtn = overlay.querySelector('#st-back-btn');
  const closeBtn = overlay.querySelector('#st-close-btn');

  // ---------- صفحه‌ی اصلی: ابزار ویژه ----------
  function renderMainMenu() {
    titleEl.textContent = '☢️ ابزار ویژه';
    backBtn.style.display = 'none';
    menuRoot.innerHTML = `
      <div class="st-item" onclick="ST.comingSoon('محاسبه معدل')">
        <span class="st-icon">🧮</span><span class="st-label">محاسبه معدل</span>
        <span class="st-badge">به‌زودی</span>
      </div>
      <div class="st-item" onclick="ST.comingSoon('آزمون')">
        <span class="st-icon">📝</span><span class="st-label">آزمون</span>
        <span class="st-badge">به‌زودی</span>
      </div>
      <div class="st-item" onclick="ST.comingSoon('رفرنس')">
        <span class="st-icon">📖</span><span class="st-label">رفرنس</span>
        <span class="st-badge">به‌زودی</span>
      </div>
      <div class="st-item" onclick="ST.openLearnPlusMenu()">
        <span class="st-icon">➕</span><span class="st-label">آموزش پلاس+</span>
      </div>
    `;
  }

  // ---------- زیرمنو: آموزش پلاس+ ----------
  function openLearnPlusMenu() {
    titleEl.textContent = 'آموزش پلاس+';
    backBtn.style.display = 'inline-block';
    backBtn.onclick = renderMainMenu;
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

  // ---------- باز کردن نوروآناتومی (از محتوای واقعی و موجود سایت استفاده می‌کنه) ----------
  function openNeuro() {
    titleEl.textContent = '🧠 راه‌های عصبی';
    backBtn.style.display = 'inline-block';
    backBtn.onclick = openLearnPlusMenu;
    menuRoot.innerHTML = `<div id="learn-neuro-list-mount"></div><div id="learn-neuro-step-mount"></div>`;

    // از رندرکننده‌ی واقعی خودِ سایت استفاده می‌کنیم تا محتوا (راه‌های عصبی) دقیقاً همون قبلی بمونه
    if (typeof renderNeuroList === 'function') {
      // ظرف واقعی سایت (#learn-neuro-list) رو موقت به اینجا منتقل می‌کنیم
      const realList = document.getElementById('learn-neuro-list');
      const realStep = document.getElementById('learn-neuro-step');
      if (realList) {
        document.getElementById('learn-neuro-list-mount').appendChild(realList);
        realList.style.display = 'block';
        renderNeuroList();
        // حذف لینک «اپ تعاملی آناتومی» که قبلاً بالای لیست بود (طبق درخواست حذف بشه)
        realList.querySelectorAll('a').forEach((a) => a.remove());
      }
      if (realStep) {
        document.getElementById('learn-neuro-step-mount').appendChild(realStep);
      }
    }
  }

  function openEpid() {
    titleEl.textContent = '🦠 داستان شهر شکرستان';
    backBtn.style.display = 'inline-block';
    backBtn.onclick = openLearnPlusMenu;
    menuRoot.innerHTML = `<div id="learn-epid-list-mount"></div><div id="learn-epid-step-mount"></div>`;

    if (typeof renderEpidList === 'function') {
      const realList = document.getElementById('learn-epid-list');
      const realStep = document.getElementById('learn-epid-step');
      if (realList) {
        document.getElementById('learn-epid-list-mount').appendChild(realList);
        realList.style.display = 'block';
        renderEpidList();
      }
      if (realStep) {
        document.getElementById('learn-epid-step-mount').appendChild(realStep);
      }
    }
  }

  function comingSoon(title) {
    if (typeof showToast === 'function') {
      showToast(`🚧 ${title}: در آپدیت‌های بعدی تکمیل می‌شود`);
    } else {
      alert(`${title}: در آپدیت‌های بعدی تکمیل می‌شود`);
    }
  }

  function openOverlay() {
    if (typeof pauseLearnMedia === 'function') pauseLearnMedia();
    overlay.classList.add('open');
    renderMainMenu();
  }

  function closeOverlay() {
    if (typeof pauseLearnMedia === 'function') pauseLearnMedia();
    overlay.classList.remove('open');
  }

  overlay.addEventListener('click', (e) => {
    // بستن با کلیک روی پس‌زمینه‌ی تیره
    if (e.target === overlay) closeOverlay();
  });

  closeBtn.addEventListener('click', closeOverlay);
  window.ST = { openLearnPlusMenu, openNeuro, openEpid, comingSoon, closeOverlay };

  // ---------- گرفتن کنترل آیکون هدر (☢️) - بدون حذف رفتار قدیمی، فقط override با اولویت ----------
  function hookHeaderIcon() {
    const learnBtn = document.getElementById('learnBtn');
    if (learnBtn) learnBtn.style.display = 'none'; // آیکون گوشه‌ی هدر رو مخفی می‌کنیم

    const nav = document.querySelector('.bottom-nav');
    if (!nav || document.getElementById('st-nav-btn')) return;

    const newBtn = document.createElement('button');
    newBtn.className = 'nav-item';
    newBtn.id = 'st-nav-btn';
    newBtn.innerHTML = '<span class="icon">☢️</span><span class="label">ابزار ویژه</span>';
    newBtn.addEventListener(
      'click',
      (e) => {
        e.stopImmediatePropagation();
        openOverlay();
      },
      true
    );
    nav.appendChild(newBtn);
  }

  if (document.readyState !== 'loading') hookHeaderIcon();
  else document.addEventListener('DOMContentLoaded', hookHeaderIcon);

  // ---------- مخفی کردن دائمی بخش انگل‌شناسی (اگه جایی لینک مستقیم بهش باشه) ----------
  const style = document.createElement('style');
  style.textContent = `
    #learn-tabs, #learn-para-list, #learn-para-step { display: none !important; }
  `;
  document.head.appendChild(style);
})();
