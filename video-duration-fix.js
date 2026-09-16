/*
  video-duration-fix.js
  ------------------------------------------------------------------
  چرا این فایل لازمه: فرم فعلی آپلود ویدیو، مدت‌زمان رو خودکار از فایل آپلودشده
  محاسبه می‌کنه که همیشه درست کار نمی‌کنه (۰۰:۰۰:۰۰ نشون می‌ده). این فایل یه
  فیلد «مدت‌زمان» دستی (ساعت:دقیقه:ثانیه) به فرم اضافه می‌کنه.

  نحوه‌ی نصب: مثل بقیه‌ی فایل‌ها، همین یه خط رو قبل از </body> اضافه کنید:
    <script src="video-duration-fix.js"></script>
  (ترتیب مهم نیست، می‌تونه قبل یا بعد از university-treasury.js/special-tools.js باشه)
*/

(function () {
  'use strict';

  function pad(n) {
    return String(n || 0).padStart(2, '0');
  }

  function durationFieldsHtml(existingDuration) {
    let h = '0', m = '0', s = '0';
    if (existingDuration && existingDuration.includes(':')) {
      const parts = existingDuration.split(':');
      if (parts.length === 3) {
        [h, m, s] = parts.map((p) => String(parseInt(p, 10) || 0));
      }
    }
    return `
      <div class="admin-field">
        <label>مدت‌زمان ویدیو (دستی) *</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" min="0" max="99" name="manualHours" value="${h}" style="width:60px;text-align:center;" placeholder="ساعت">
          :
          <input type="number" min="0" max="59" name="manualMinutes" value="${m}" style="width:60px;text-align:center;" placeholder="دقیقه">
          :
          <input type="number" min="0" max="59" name="manualSeconds" value="${s}" style="width:60px;text-align:center;" placeholder="ثانیه">
        </div>
      </div>`;
  }

  function tierFieldHtml(existingTier) {
    const tier = existingTier || 'university';
    return `
      <div class="admin-field">
        <label>دسته‌بندی *</label>
        <select name="manualTier">
          <option value="university" ${tier === 'university' ? 'selected' : ''}>🎓 کلاس‌های دانشگاه</option>
          <option value="treasury" ${tier === 'treasury' ? 'selected' : ''}>💎 گنجینه تدریس</option>
        </select>
      </div>`;
  }

  async function openVideoFormFixed(existing) {
    // از تابع اصلی خودِ سایت برای فیلدهای استاندارد (عنوان، درس، استاد، توضیحات، فایل/لینک) استفاده می‌کنیم
    const standardFieldsHtml = videoFormFieldsHtml(existing);
    const fullHtml = standardFieldsHtml + durationFieldsHtml(existing ? existing.duration : null) + tierFieldHtml(existing ? existing.tier : null);

    openAdminModal(existing ? '✏️ ویرایش ویدیو' : '➕ افزودن ویدیو جدید', fullHtml, async (form) => {
      const manualDuration = `${pad(form.manualHours.value)}:${pad(form.manualMinutes.value)}:${pad(form.manualSeconds.value)}`;
      const manualTier = form.manualTier.value;

      // مرحله‌ی ۱: منطق اصلی و کامل خودِ سایت رو صدا می‌زنیم (آپلود فایل، ذخیره در Firestore، به‌روزرسانی DATA، رندر مجدد)
      await saveVideoFromForm(form, existing);

      // مرحله‌ی ۲: مدت‌زمان و دسته‌بندی دستی رو جایگزین/تکمیل می‌کنیم
      const title = form.title.value.trim();
      const target = existing
        ? DATA.videos.find((v) => v.id === existing.id)
        : [...DATA.videos].reverse().find((v) => v.title === title); // جدیدترین آیتم با همین عنوان

      if (target) {
        try {
          await apiFs('update', 'videos', { docId: String(target.id), data: { duration: manualDuration, tier: manualTier } });
          target.duration = manualDuration;
          target.tier = manualTier;
          if (typeof renderVideos === 'function') renderVideos();
          if (typeof renderVideoSubjectScroller === 'function') renderVideoSubjectScroller();
          if (window.UT && typeof UT.refreshCurrentView === 'function') UT.refreshCurrentView('videos');
        } catch (e) {
          console.error('duration/tier fix update error:', e);
        }
      }
    });

    if (typeof wireVideoFormToggles === 'function') wireVideoFormToggles();
  }

  function hookAddButton() {
    const addBtn = document.getElementById('add-video-btn');
    if (addBtn) {
      addBtn.addEventListener(
        'click',
        (e) => {
          e.stopImmediatePropagation();
          openVideoFormFixed(null);
        },
        true
      );
    }
  }

  // ویرایش ویدیو از توی لیست (onclick="editVideoAdmin('...')" داخل HTML رندرشده) -
  // چون این onclick هر بار موقع اجرا دنبال window.editVideoAdmin می‌گرده، بازنویسیش امنه
  window.editVideoAdmin = function (id) {
    const existing = DATA.videos.find((v) => v.id === id);
    if (!existing) return;
    openVideoFormFixed(existing);
  };

  if (document.readyState !== 'loading') hookAddButton();
  else document.addEventListener('DOMContentLoaded', hookAddButton);
})();
