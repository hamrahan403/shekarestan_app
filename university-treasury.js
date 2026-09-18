(function () {
  'use strict';

  // ---------- تنظیمات پایه ----------
  const TIERS = [
    { key: 'university', labelNotes: '📚 جزوه‌های دانشگاه', labelVideos: '🎓 کلاس‌های دانشگاه' },
    { key: 'treasury', labelNotes: '💎 گنجینه جزوات', labelVideos: '💎 گنجینه تدریس' },
  ];

  let activeTier = { notes: null, videos: null };

  // ---------- استایل‌های تکمیلی ----------
  (function injectEnhancedStyles() {
    if (document.getElementById('ut-enhanced-styles')) return;
    const s = document.createElement('style');
    s.id = 'ut-enhanced-styles';
    s.textContent = `
      #ut-notes-items-view, #ut-videos-items-view {
        animation: utFadeSlide .28s ease;
      }
      @keyframes utFadeSlide {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      #ut-notes-items-title, #ut-videos-items-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--terracotta);
        margin: 0 0 14px;
        padding-bottom: 10px;
        border-bottom: 2px dashed var(--beige-dark);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ut-subject-card, .ut-item-card, .ut-tier-card {
        transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
      }
      .ut-subject-card:active, .ut-item-card:active, .ut-tier-card:active {
        transform: scale(.97);
      }
      .ut-subject-card:hover, .ut-item-card:hover {
        border-color: var(--gold);
        box-shadow: 0 4px 14px rgba(185, 139, 61, .18);
      }
      .ut-add-subject-btn {
        transition: transform .15s ease, filter .15s ease;
      }
      .ut-add-subject-btn:active {
        transform: scale(.98);
      }
      .ut-empty {
        grid-column: 1 / -1;
      }
    `;
    document.head.appendChild(s);
  })();

  // ---------- escape امن برای onclick ----------
  function jsStr(v) {
    let s = String(v == null ? '' : v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
    s = s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return "'" + s + "'";
  }

  function findById(list, idLike) {
    if (!Array.isArray(list)) return null;
    const s = String(idLike);
    return list.find((x) => x && String(x.id) === s) || null;
  }

  function openVideoById(idLike) {
    const item = findById(DATA.videos, idLike);
    if (!item) { console.warn('[UT] video not found:', idLike); return; }
    if (typeof window.openVideo === 'function') return window.openVideo(item.url);
    console.warn('[UT] openVideo در دسترس نیست');
  }
  function openNoteDetailById(idLike) {
    const item = findById(DATA.notes, idLike);
    const realId = item ? item.id : idLike;
    if (typeof window.openNoteDetail === 'function') return window.openNoteDetail(realId);
    console.warn('[UT] openNoteDetail در دسترس نیست');
  }
  function deleteVideoById(idLike) {
    const item = findById(DATA.videos, idLike);
    const realId = item ? item.id : idLike;
    if (typeof window.deleteVideoAdmin === 'function') return window.deleteVideoAdmin(realId);
    console.warn('[UT] deleteVideoAdmin در دسترس نیست');
  }
  function deleteNoteById(idLike) {
    const item = findById(DATA.notes, idLike);
    const realId = item ? item.id : idLike;
    if (typeof window.deleteNoteAdmin === 'function') return window.deleteNoteAdmin(realId);
    console.warn('[UT] deleteNoteAdmin در دسترس نیست');
  }

  // ---------- بستن کادر جزئیات / پلیر ----------
  function closeOpenDetailViews() {
    document.querySelectorAll('video').forEach((v) => {
      try { v.pause(); } catch (e) {}
    });
    document
      .querySelectorAll('[role="dialog"], .modal.active, .modal.show, .modal-open, .modal-overlay.show')
      .forEach((el) => {
        el.style.display = 'none';
        el.classList.remove('active', 'show', 'open', 'modal-open');
      });
  }

  function hideOldUI() {
    ['notes-subjects-view', 'notes-sessions-view', 'video-subject-scroller', 'videos-list'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  // ---------- همگام‌سازی دروس از extraSubjects سایت اصلی ----------
  function syncSubjects() {
    if (!Array.isArray(DATA.extraSubjects)) return;
    if (!Array.isArray(DATA.subjects)) DATA.subjects = [];
    const seen = new Set(DATA.subjects.map((s) => String(s.id)));
    for (const s of DATA.extraSubjects) {
      if (!seen.has(String(s.id))) {
        DATA.subjects.push(s);
        seen.add(String(s.id));
      }
    }
  }

  // ---------- کمکی: گرفتن لیست دروسِ یک دسته ----------
  function getSubjectsForTier(type, tier) {
    syncSubjects();
    const items = type === 'videos' ? DATA.videos : DATA.notes;
    const namesFromItems = items.filter((i) => (i.tier || 'university') === tier).map((i) => i.subject);
    const namesFromSubjectsDoc = (DATA.subjects || [])
      .filter((s) => {
        // استخراج scope و tier از docId اگه فیلدها خراب/ناقص بودن
        const docId = String(s.id || '');
        const m = docId.match(/^(notes|videos)-(university|treasury):/);
        const scope = (m && m[1]) || String(s.scope || '').replace(/-(university|treasury)$/, '');
        const tierFromDoc = (m && m[2]) || s.tier || 'university';
        return scope === type && tierFromDoc === tier;
      })
      .map((s) => s.name);
    const names = [...new Set([...namesFromItems, ...namesFromSubjectsDoc])];
    return names.map((name) => ({
      name,
      icon: DATA.subjectIcons[name] || (type === 'videos' ? '🎬' : '📘'),
      count: items.filter((i) => i.subject === name && (i.tier || 'university') === tier).length,
    }));
  }

  // ---------- رندر صفحه‌ی انتخاب دسته ----------
  function renderTierChooser(type, containerEl) {
    const labelKey = type === 'videos' ? 'labelVideos' : 'labelNotes';
    containerEl.innerHTML = TIERS.map(
      (t) => `
      <div class="ut-tier-card" onclick="UT.selectTier(${jsStr(type)}, ${jsStr(t.key)})">
        <div class="ut-tier-label">${t[labelKey]}</div>
      </div>`
    ).join('');
  }

  // ---------- رندر صفحه‌ی لیست درس‌های یک دسته ----------
  function renderSubjectsForTier(type, tier, containerEl) {
    const subjects = getSubjectsForTier(type, tier);
    const isAdmin = currentUser && currentUser.isAdmin;
    const addBtn = isAdmin
      ? `<button class="ut-add-subject-btn" onclick="UT.addSubjectPrompt(${jsStr(type)}, ${jsStr(tier)})">➕ افزودن درس جدید</button>`
      : '';

    const backBtn = `<button class="ut-add-subject-btn" onclick="UT.backToTierChooser(${jsStr(type)})" style="background:var(--cream);color:var(--brown);">← بازگشت به دسته‌ها</button>`;
    containerEl.innerHTML =
      backBtn +
      addBtn +
      subjects
        .map(
          (s) => `
      <div class="ut-subject-card" onclick="UT.openSubject(${jsStr(type)}, ${jsStr(tier)}, ${jsStr(s.name)})">
        ${
          isAdmin
            ? `<span class="admin-delete-icon" onclick="event.stopPropagation();UT.deleteSubjectPrompt(${jsStr(type)}, ${jsStr(tier)}, ${jsStr(s.name)})">🗑</span>`
            : ''
        }
        <div class="ut-subject-icon">${s.icon}</div>
        <div class="ut-subject-name">${escapeHtml(s.name)}</div>
        <div class="ut-subject-count">${s.count} مورد</div>
      </div>`
        )
        .join('') || '<div class="ut-empty">هنوز درسی ثبت نشده</div>';
  }

  // ---------- رندر لیست آیتم‌های یک درس ----------
  function renderItemsForSubject(type, tier, subject, containerEl) {
    const items = (type === 'videos' ? DATA.videos : DATA.notes).filter(
      (i) => i.subject === subject && (i.tier || 'university') === tier
    );
    const isAdmin = currentUser && currentUser.isAdmin;

    const addItemBtn = isAdmin
      ? `<button class="ut-add-subject-btn" onclick="UT.openUploadForm(${jsStr(type)}, ${jsStr(tier)}, ${jsStr(subject)})">➕ افزودن ${type === 'videos' ? 'ویدیو' : 'جزوه'} جدید</button>`
      : '';

    containerEl.innerHTML =
      addItemBtn +
      (items
        .map((item) => {
          const idArg = jsStr(String(item.id));
          if (type === 'videos') {
            return `
          <div class="ut-item-card" onclick="UT.openVideoById(${idArg})">
            <div class="ut-item-thumb">${item.thumb || '🎬'}</div>
            <div class="ut-item-title">${escapeHtml(item.title)}</div>
            <div class="ut-item-meta">${escapeHtml(item.instructor)} • ⏱ ${item.duration || '۰۰:۰۰:۰۰'}</div>
            ${
              isAdmin
                ? `<div class="ut-admin-row">
                     <span onclick="event.stopPropagation();UT.openUploadForm(${jsStr(type)}, ${jsStr(tier)}, ${jsStr(subject)}, ${idArg})">✏️</span>
                     <span onclick="event.stopPropagation();UT.deleteVideoById(${idArg})">🗑</span>
                   </div>`
                : ''
            }
          </div>`;
          }
          return `
          <div class="ut-item-card" onclick="UT.openNoteDetailById(${idArg})">
            <div class="ut-item-title">${escapeHtml(item.title)}</div>
            <div class="ut-item-meta">${escapeHtml(item.instructor)} • نسخه ${item.version} • ${item.size}</div>
            ${
              isAdmin
                ? `<div class="ut-admin-row">
                     <span onclick="event.stopPropagation();UT.openUploadForm(${jsStr(type)}, ${jsStr(tier)}, ${jsStr(subject)}, ${idArg})">✏️</span>
                     <span onclick="event.stopPropagation();UT.deleteNoteById(${idArg})">🗑</span>
                   </div>`
                : ''
            }
          </div>`;
        })
        .join('') || '<div class="ut-empty">هنوز موردی ثبت نشده</div>');
  }

  // ---------- pad (پشتیبانی از ارقام فارسی/عربی) ----------
  function pad(n) {
    if (n == null) return '00';
    let s = String(n);
    s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const num = parseInt(s, 10) || 0;
    return String(num).padStart(2, '0');
  }

  // ---------- افزودن / ویرایش جزوه یا ویدیو ----------
  async function openUploadForm(type, tier, subject, existingId) {
    const isVideo = type === 'videos';
    const list = isVideo ? DATA.videos : DATA.notes;
    const existing = existingId ? list.find((i) => String(i.id) === String(existingId)) : null;

    const standardHtml = isVideo
      ? videoFormFieldsHtml(existing)
      : noteFormFieldsHtml(existing);

    let h = '0', m = '0', s = '0';
    if (existing && existing.duration && existing.duration.includes(':')) {
      [h, m, s] = existing.duration.split(':');
    }
    const durationHtml = isVideo
      ? `<div class="admin-field">
          <label>مدت‌زمان ویدیو (دستی) *</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" min="0" max="99" name="manualHours" value="${parseInt(h, 10) || 0}" style="width:60px;text-align:center;">
            :
            <input type="number" min="0" max="59" name="manualMinutes" value="${parseInt(m, 10) || 0}" style="width:60px;text-align:center;">
            :
            <input type="number" min="0" max="59" name="manualSeconds" value="${parseInt(s, 10) || 0}" style="width:60px;text-align:center;">
          </div>
        </div>`
      : '';

    const modalTitle = existing
      ? `✏️ ویرایش ${isVideo ? 'ویدیو' : 'جزوه'} - ${subject}`
      : `➕ افزودن ${isVideo ? 'ویدیو' : 'جزوه'} جدید - ${subject}`;

    const idsBefore = new Set(list.map((i) => String(i.id)));
    openAdminModal(modalTitle, standardHtml + durationHtml, async (form) => {
      // این‌ها رو همین اول بخون، چون saveVideoFromForm در پایانش closeAdminModal()
      // رو صدا می‌زنه که محتوای فرم (از جمله این فیلدها) رو پاک می‌کنه
      let manualHH = '0', manualMM = '0', manualSS = '0';
      if (isVideo) {
        manualHH = form.manualHours ? form.manualHours.value : '0';
        manualMM = form.manualMinutes ? form.manualMinutes.value : '0';
        manualSS = form.manualSeconds ? form.manualSeconds.value : '0';
      }

      if (isVideo) await saveVideoFromForm(form, existing);
      else await saveNoteFromForm(form, existing);

      // از مرجع تازه استفاده کن
      const freshList = isVideo ? DATA.videos : DATA.notes;
      let target = null;

      if (existing) {
        target = freshList.find((i) => String(i.id) === String(existing.id));
      } else {
        const newItems = freshList.filter((i) => !idsBefore.has(String(i.id)));
        target = newItems[newItems.length - 1] || null;
      }

      if (!target) {
        console.warn('[UT] target not found after save');
        UT.refreshCurrentView(null, true);
        return;
      }

      const patch = { subject, tier };
      if (isVideo) {
        patch.duration = `${pad(manualHH)}:${pad(manualMM)}:${pad(manualSS)}`;
        console.log('[UT] manual duration =', patch.duration, '| raw:', manualHH, manualMM, manualSS);
      }

      try {
        await apiFs('update', isVideo ? 'videos' : 'notes', { docId: String(target.id), data: patch });
        Object.assign(target, patch);
        console.log('[UT] patch OK →', target.duration);
      } catch (e) {
        console.error('[UT] patch error:', e);
        Object.assign(target, patch);
      }
      UT.refreshCurrentView(null, true);
    });

    setTimeout(() => {
      const modalForm = document.querySelector('#admin-modal form, .admin-modal form');
      if (!modalForm) return;
      let subjectField = null;
      modalForm.querySelectorAll('label').forEach((lbl) => {
        if (lbl.textContent.trim().indexOf('درس') === 0) {
          const wrapper = lbl.closest('.admin-field') || lbl.parentElement;
          const sel = wrapper.querySelector('select');
          if (sel) subjectField = { sel, wrapper };
        }
      });
      if (subjectField) {
        const alreadyThere = Array.from(subjectField.sel.options).some((o) => o.value === subject || o.textContent.trim() === subject);
        if (!alreadyThere) {
          const opt = document.createElement('option');
          opt.value = subject;
          opt.textContent = subject;
          subjectField.sel.appendChild(opt);
        }
        subjectField.sel.value = subject;
        subjectField.wrapper.style.display = 'none';
      }
      if (isVideo && typeof wireVideoFormToggles === 'function') wireVideoFormToggles();
      if (!isVideo && typeof wireNoteSourceToggle === 'function') wireNoteSourceToggle();
    }, 60);
  }

  // ---------- افزودن درس جدید ----------
  async function addSubjectPrompt(type, tier) {
    const name = prompt('نام درس جدید رو وارد کن:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const defaultIcon = type === 'videos' ? '🎬' : '📘';
    const iconInput = prompt('یک ایموجی برای این درس انتخاب کن (اختیاری):', defaultIcon);
    const icon = (iconInput && iconInput.trim()) ? iconInput.trim() : defaultIcon;
    try {
      await apiFs('set', 'subjects', {
        docId: `${type}-${tier}:${trimmed}`,
        data: { name: trimmed, icon, scope: type, tier, createdAtMs: Date.now() },
      });
      if (!DATA.subjects) DATA.subjects = [];
      DATA.subjects.push({ id: `${type}-${tier}:${trimmed}`, name: trimmed, icon, scope: type, tier });
      showToast('✅ درس اضافه شد');
      UT.refreshCurrentView(type);
    } catch (e) {
      showToast('⚠️ خطا: ' + (e.message || ''));
    }
  }

  async function deleteSubjectPrompt(type, tier, name) {
    const items = type === 'videos' ? DATA.videos : DATA.notes;
    const count = items.filter((i) => i.subject === name && (i.tier || 'university') === tier).length;
    if (count > 0) {
      showToast(`⚠️ این درس ${count} ${type === 'videos' ? 'ویدیو' : 'جزوه'} دارد، اول آن‌ها را حذف کن`);
      return;
    }
    if (!confirm(`درس «${name}» حذف شود؟`)) return;
    try {
      await apiFs('delete', 'subjects', { docId: `${type}-${tier}:${name}` });
      const matchesDeleted = (s) =>
        s.name === name && (s.scope === type || String(s.id || '').startsWith(`${type}-${tier}:`));
      DATA.subjects = (DATA.subjects || []).filter((s) => !matchesDeleted(s));
      if (Array.isArray(DATA.extraSubjects)) {
        DATA.extraSubjects = DATA.extraSubjects.filter((s) => !matchesDeleted(s));
      }
      showToast('✅ درس حذف شد');
      UT.refreshCurrentView(type);
    } catch (e) {
      showToast('⚠️ خطا: ' + (e.message || ''));
    }
  }

  // ---------- ناوبری ----------
  function selectTier(type, tier) {
    activeTier[type] = tier;
    if (UT._current && UT._current.type === type) UT._current = null;
    UT.refreshCurrentView(type);
  }

  function openSubject(type, tier, subject) {
    hideOldUI();
    const containerId = type === 'videos' ? 'ut-videos-items' : 'ut-notes-items';
    const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
    const itemsView = type === 'videos' ? 'ut-videos-items-view' : 'ut-notes-items-view';
    const chooserId = type === 'videos' ? 'ut-videos-chooser' : 'ut-notes-chooser';
    const chooserEl = document.getElementById(chooserId);
    if (chooserEl) chooserEl.style.display = 'none';
    document.getElementById(listView).style.display = 'none';
    document.getElementById(itemsView).style.display = 'block';
    document.getElementById(itemsView.replace('-view', '-title')).textContent = subject;
    renderItemsForSubject(type, tier, subject, document.getElementById(containerId));
    UT._current = { type, tier, subject };
  }

  function backToSubjects(type) {
    const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
    const itemsView = type === 'videos' ? 'ut-videos-items-view' : 'ut-notes-items-view';
    document.getElementById(itemsView).style.display = 'none';
    document.getElementById(listView).style.display = 'block';
    if (UT._current && UT._current.type === type) UT._current = null;
  }

  function backToTierChooser(type) {
    activeTier[type] = null;
    if (UT._current && UT._current.type === type) UT._current = null;
    UT.refreshCurrentView(type);
  }

  // ---------- رفرش نما ----------
  function refreshCurrentView(onlyType, keepItemsView) {
    hideOldUI();
    ['notes', 'videos'].forEach((type) => {
      if (onlyType && onlyType !== type) return;

      const chooserId  = type === 'videos' ? 'ut-videos-chooser' : 'ut-notes-chooser';
      const listView   = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
      const itemsView  = type === 'videos' ? 'ut-videos-items-view' : 'ut-notes-items-view';
      const itemsWrap  = type === 'videos' ? 'ut-videos-items' : 'ut-notes-items';
      const titleId    = itemsView.replace('-view', '-title');

      const chooserEl = document.getElementById(chooserId);
      const listEl    = document.getElementById(listView);
      const itemsEl   = document.getElementById(itemsView);
      if (!chooserEl || !listEl || !itemsEl) return;

      const cur = UT._current;

      if (keepItemsView && cur && cur.type === type) {
        chooserEl.style.display = 'none';
        listEl.style.display = 'none';
        itemsEl.style.display = 'block';
        const titleEl = document.getElementById(titleId);
        if (titleEl) titleEl.textContent = cur.subject;
        renderItemsForSubject(type, cur.tier, cur.subject, document.getElementById(itemsWrap));
        return;
      }

      itemsEl.style.display = 'none';
      if (cur && cur.type === type) UT._current = null;

      if (!activeTier[type]) {
        chooserEl.style.display = 'block';
        listEl.style.display = 'none';
        renderTierChooser(type, chooserEl);
      } else {
        chooserEl.style.display = 'none';
        listEl.style.display = 'block';
        renderSubjectsForTier(type, activeTier[type], listEl);
      }
    });
  }

  // ---------- در معرض window ----------
  window.UT = {
    selectTier,
    openSubject,
    backToSubjects,
    backToTierChooser,
    addSubjectPrompt,
    deleteSubjectPrompt,
    refreshCurrentView,
    openUploadForm,
    openVideoById,
    openNoteDetailById,
    deleteVideoById,
    deleteNoteById,
    jsStr,
    editVideo: (id) => window.editVideoAdmin && window.editVideoAdmin(id),
    _current: null,
    migrateLegacyTier: async function (tier) {
      if (!currentUser || !currentUser.isAdmin) return console.warn('فقط ادمین');
      let count = 0;
      for (const n of DATA.notes) {
        if (!n.tier) {
          await apiFs('update', 'notes', { docId: String(n.id), data: { tier } });
          n.tier = tier;
          count++;
        }
      }
      for (const v of DATA.videos) {
        if (!v.tier) {
          await apiFs('update', 'videos', { docId: String(v.id), data: { tier } });
          v.tier = tier;
          count++;
        }
      }
      console.log(`✅ ${count} مورد به دسته‌ی «${tier}» منتقل شد`);
      refreshCurrentView();
    },
  };

  // ---------- اجرای اول ----------
  function init() {
    ['renderNotesPage', 'renderVideos', 'renderVideoSubjectScroller'].forEach((fnName) => {
      if (typeof window[fnName] === 'function' && !window[fnName]._utPatched) {
        const orig = window[fnName];
        const patched = function (...args) {
          const r = orig.apply(this, args);
          hideOldUI();
          return r;
        };
        patched._utPatched = true;
        window[fnName] = patched;
      }
    });

    hideOldUI();
    refreshCurrentView();

    document.querySelectorAll('.bottom-nav [data-page="notes"], .bottom-nav [data-page="videos"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeOpenDetailViews();
        const type = btn.dataset.page === 'notes' ? 'notes' : 'videos';
        if (UT._current && UT._current.type === type) UT._current = null;
        setTimeout(() => {
          hideOldUI();
          refreshCurrentView();
        }, 60);
      });
    });
  }
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
