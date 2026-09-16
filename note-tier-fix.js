/*
  note-tier-fix.js
  ------------------------------------------------------------------
  اضافه کردن فیلد «دسته‌بندی» (دانشگاه/گنجینه) به فرم افزودن جزوه.
  ⚠️ این یکی رو نسبت به video-duration-fix.js با اطمینان کمتری نوشتم چون اسم دقیق
  دکمه‌ی «افزودن جزوه» توی HTML مشخص نبود (احتمالاً پویا ساخته می‌شه). اگه بعد از
  نصب امتحان کردید و کار نکرد (فیلد دسته‌بندی توی فرم نیومد)، بگید تا با دیدن
  دقیق HTML واقعی اون لحظه، اصلاحش کنم.
*/

(function () {
  'use strict';

  function tierFieldHtml(existingTier) {
    const tier = existingTier || 'university';
    return `
      <div class="admin-field">
        <label>دسته‌بندی *</label>
        <select name="manualTier">
          <option value="university" ${tier === 'university' ? 'selected' : ''}>📚 جزوه‌های دانشگاه</option>
          <option value="treasury" ${tier === 'treasury' ? 'selected' : ''}>💎 گنجینه جزوات</option>
        </select>
      </div>`;
  }

  async function afterSaveApplyTier(form, existing) {
    const manualTier = form.manualTier ? form.manualTier.value : 'university';
    const title = form.title ? form.title.value.trim() : '';
    const target = existing
      ? DATA.notes.find((n) => n.id === existing.id)
      : [...DATA.notes].reverse().find((n) => n.title === title);
    if (!target) return;
    try {
      await apiFs('update', 'notes', { docId: String(target.id), data: { tier: manualTier } });
      target.tier = manualTier;
      if (typeof renderNotesPage === 'function') renderNotesPage();
      if (window.UT && typeof UT.refreshCurrentView === 'function') UT.refreshCurrentView('notes');
    } catch (e) {
      console.error('note tier fix update error:', e);
    }
  }

  // اگه addNoteAdmin به‌صورت function declaration سراسری تعریف شده باشه، بازنویسیش می‌کنیم
  if (typeof window.addNoteAdmin === 'function') {
    const originalAddNoteAdmin = window.addNoteAdmin;
    window.addNoteAdmin = function (...args) {
      const result = originalAddNoteAdmin.apply(this, args);
      // بعد از باز شدن مودال اصلی، فیلد دسته‌بندی رو بهش اضافه می‌کنیم
      setTimeout(() => {
        const modalForm = document.querySelector('#admin-modal form, .admin-modal form');
        if (modalForm && !modalForm.querySelector('[name="manualTier"]')) {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = tierFieldHtml(args[0] && args[0].tier);
          modalForm.insertBefore(wrapper.firstElementChild, modalForm.querySelector('button[type="submit"], .admin-submit-btn'));

          // به‌جای submit اصلی، اول تیر رو ذخیره می‌کنیم و بعد اجازه می‌دیم فرم عادی ادامه بده
          modalForm.addEventListener(
            'submit',
            () => setTimeout(() => afterSaveApplyTier(modalForm, args[0]), 800),
            { once: true }
          );
        }
      }, 50);
      return result;
    };
  }
})();
