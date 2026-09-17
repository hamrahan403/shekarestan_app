(function () {
  'use strict';

  // ---------- تنظیمات پایه ----------
  const TIERS = [
    { key: 'university', labelNotes: '📚 جزوه‌های دانشگاه', labelVideos: '🎓 کلاس‌های دانشگاه' },
    { key: 'treasury', labelNotes: '💎 گنجینه جزوات', labelVideos: '💎 گنجینه تدریس' },
  ];

  let activeTier = { notes: null, videos: null }; // null = هنوز دسته انتخاب نشده

  function hideOldUI() {
    ['notes-subjects-view', 'notes-sessions-view', 'video-subject-scroller', 'videos-list'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  // ---------- کمکی: گرفتن لیست دروسِ یک دسته‌ی خاص ----------
  function getSubjectsForTier(type, tier) {
    // type: 'notes' | 'videos'
    const items = type === 'videos' ? DATA.videos : DATA.notes;
    const namesFromItems = items.filter((i) => i.tier === tier).map((i) => i.subject);
    const namesFromSubjectsDoc = (DATA.subjects || [])
      .filter((s) => s.scope === type && s.tier === tier)
      .map((s) => s.name);
    const names = [...new Set([...namesFromItems, ...namesFromSubjectsDoc])];
    return names.map((name) => ({
      name,
      icon: DATA.subjectIcons[name] || (type === 'videos' ? '🎬' : '📘'),
      count: items.filter((i) => i.subject === name && i.tier === tier).length,
    }));
  }

  // ---------- رندر صفحه‌ی انتخاب دسته (کلاس‌های دانشگاه | گنجینه) ----------
  function renderTierChooser(type, containerEl) {
    const labelKey = type === 'videos' ? 'labelVideos' : 'labelNotes';
    containerEl.innerHTML = TIERS.map(
      (t) => `
      <div class="ut-tier-card" onclick="UT.selectTier('${type}','${t.key}')">
        <div class="ut-tier-label">${t[labelKey]}</div>
      </div>`
    ).join('');
  }

  // ---------- رندر صفحه‌ی لیست درس‌های یک دسته ----------
  function renderSubjectsForTier(type, tier, containerEl) {
    const subjects = getSubjectsForTier(type, tier);
    const isAdmin = currentUser && currentUser.isAdmin;
    const addBtn = isAdmin
      ? `<button class="ut-add-subject-btn" onclick="UT.addSubjectPrompt('${type}','${tier}')">➕ افزودن درس جدید</button>`
      : '';

    const backBtn = `<button class="ut-add-subject-btn" onclick="UT.backToTierChooser('${type}')" style="background:var(--cream);">← بازگشت</button>`;
    containerEl.innerHTML =
      backBtn +
      addBtn +
      subjects
        .map(
          (s) => `
      <div class="ut-subject-card" onclick="UT.openSubject('${type}','${tier}','${escapeHtml(s.name)}')">
        ${
          isAdmin
            ? `<span class="admin-delete-icon" onclick="event.stopPropagation();UT.deleteSubjectPrompt('${type}','${tier}','${escapeHtml(s.name)}')">🗑</span>`
            : ''
        }
        <div class="ut-subject-icon">${s.icon}</div>
        <div class="ut-subject-name">${escapeHtml(s.name)}</div>
        <div class="ut-subject-count">${s.count} مورد</div>
      </div>`
        )
        .join('') || '<div class="ut-empty">هنوز درسی ثبت نشده</div>';
  }

  // ---------- رندر لیست آیتم‌های (جزوه/ویدیو) یک درس خاص ----------
  function renderItemsForSubject(type, tier, subject, containerEl) {
    const items = (type === 'videos' ? DATA.videos : DATA.notes).filter(
      (i) => i.subject === subject && i.tier === tier
    );
    const isAdmin = currentUser && currentUser.isAdmin;

    const addItemBtn = isAdmin
      ? `<button class="ut-add-subject-btn" onclick="UT.openUploadForm('${type}','${tier}','${escapeHtml(subject)}')">➕ افزودن ${type === 'videos' ? 'ویدیو' : 'جزوه'}</button>`
      : '';

    containerEl.innerHTML =
      addItemBtn +
      (items
        .map((item) => {
          if (type === 'videos') {
            return `
          <div class="ut-item-card" onclick="openVideo('${item.id}')">
            <div class="ut-item-thumb">${item.thumb || '🎬'}</div>
            <div class="ut-item-title">${escapeHtml(item.title)}</div>
            <div class="ut-item-meta">${escapeHtml(item.instructor)} • ⏱ ${item.duration || '۰۰:۰۰:۰۰'}</div>
            ${
              isAdmin
                ? `<div class="ut-admin-row">
                     <span onclick="event.stopPropagation();UT.openUploadForm('${type}','${tier}','${escapeHtml(subject)}','${item.id}')">✏️</span>
                     <span onclick="event.stopPropagation();deleteVideoAdmin('${item.id}')">🗑</span>
                   </div>`
                : ''
            }
          </div>`;
          }
          return `
          <div class="ut-item-card" onclick="openNoteDetail('${item.id}')">
            <div class="ut-item-title">${escapeHtml(item.title)}</div>
            <div class="ut-item-meta">${escapeHtml(item.instructor)} • نسخه ${item.version} • ${item.size}</div>
            ${
              isAdmin
                ? `<div class="ut-admin-row">
                     <span onclick="event.stopPropagation();UT.openUploadForm('${type}','${tier}','${escapeHtml(subject)}','${item.id}')">✏️</span>
                     <span onclick="event.stopPropagation();deleteNoteAdmin('${item.id}')">🗑</span>
                   </div>`
                : ''
            }
          </div>`;
        })
        .join('') || '<div class="ut-empty">هنوز موردی ثبت نشده</div>');
  }

  function pad(n) {
    return String(parseInt(n, 10) || 0).padStart(2, '0');
  }

  // ---------- افزودن/ویرایش جزوه یا ویدیو مستقیم داخل درسِ فعلی (دیگه سوال نمی‌پرسه مال کدوم درسه) ----------
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

    const idsBefore = new Set(list.map((i) => i.id));
    openAdminModal(modalTitle, standardHtml + durationHtml, async (form) => {
      if (isVideo) await saveVideoFromForm(form, existing);
      else await saveNoteFromForm(form, existing);

      const target = existing
        ? list.find((i) => i.id === existing.id)
        : list.find((i) => !idsBefore.has(i.id));

      if (target) {
        const patch = { subject, tier };
        if (isVideo) {
          patch.duration = `${pad(form.manualHours.value)}:${pad(form.manualMinutes.value)}:${pad(form.manualSeconds.value)}`;
        }
        try {
          await apiFs('update', isVideo ? 'videos' : 'notes', { docId: String(target.id), data: patch });
          Object.assign(target, patch);
        } catch (e) {
          console.error('tier/subject patch error:', e);
        }
      }
      UT.refreshCurrentView();
    });

    // بعد از باز شدن مودال، فیلد «درس» رو پیدا و قفل می‌کنیم روی همین درس - دیگه چیزی نمی‌پرسه
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
    }, 60);
  }

  // ---------- افزودن درس جدید (ادمین) ----------
  async function addSubjectPrompt(type, tier) {
    const name = prompt('نام درس جدید رو وارد کن:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    try {
      await apiFs('set', 'subjects', {
        docId: `${type}-${tier}:${trimmed}`,
        data: { name: trimmed, icon: type === 'videos' ? '🎬' : '📘', scope: type, tier, createdAtMs: Date.now() },
      });
      if (!DATA.subjects) DATA.subjects = [];
      DATA.subjects.push({ name: trimmed, icon: type === 'videos' ? '🎬' : '📘', scope: type, tier });
      showToast('✅ درس اضافه شد');
      UT.refreshCurrentView();
    } catch (e) {
      showToast('⚠️ خطا: ' + (e.message || ''));
    }
  }

  async function deleteSubjectPrompt(type, tier, name) {
    const items = type === 'videos' ? DATA.videos : DATA.notes;
    const count = items.filter((i) => i.subject === name && i.tier === tier).length;
    if (count > 0) {
      showToast(`⚠️ این درس ${count} ${type === 'videos' ? 'ویدیو' : 'جزوه'} دارد، اول آن‌ها را حذف کن`);
      return;
    }
    if (!confirm(`درس «${name}» حذف شود؟`)) return;
    try {
      await apiFs('delete', 'subjects', { docId: `${type}-${tier}:${name}` });
      DATA.subjects = (DATA.subjects || []).filter((s) => !(s.name === name && s.scope === type && s.tier === tier));
      showToast('✅ درس حذف شد');
      UT.refreshCurrentView();
    } catch (e) {
      showToast('⚠️ خطا: ' + (e.message || ''));
    }
  }

  // ---------- ناوبری بین حالت‌ها ----------
  function selectTier(type, tier) {
    activeTier[type] = tier;
    UT.refreshCurrentView(type);
  }

  function openSubject(type, tier, subject) {
    hideOldUI();
    const containerId = type === 'videos' ? 'ut-videos-items' : 'ut-notes-items';
    const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
    const itemsView = type === 'videos' ? 'ut-videos-items-view' : 'ut-notes-items-view';
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
  }

  function backToTierChooser(type) {
    activeTier[type] = null;
    UT.refreshCurrentView(type);
  }

  function refreshCurrentView(onlyType) {
    hideOldUI();
    ['notes', 'videos'].forEach((type) => {
      if (onlyType && onlyType !== type) return;
      const chooserId = type === 'videos' ? 'ut-videos-chooser' : 'ut-notes-chooser';
      const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
      const chooserEl = document.getElementById(chooserId);
      const listEl = document.getElementById(listView);
      if (!chooserEl || !listEl) return;

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

  // ---------- در معرض window قرار دادن (برای onclick های HTML) ----------
  window.UT = {
    selectTier,
    openSubject,
    backToSubjects,
    backToTierChooser,
    addSubjectPrompt,
    deleteSubjectPrompt,
    refreshCurrentView,
    openUploadForm,
    editVideo: (id) => window.editVideoAdmin && window.editVideoAdmin(id),
    _current: null,
    // اجرای یک‌بارِ دستی برای جزوات/ویدیوهای قدیمی که فیلد tier ندارن (از کنسول مرورگر، فقط ادمین)
    // مثال استفاده: UT.migrateLegacyTier('university')
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

  // اجرای اول بعد از لود کامل صفحه
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

    // نکته‌ی مهم: سایت یه SPA‌ه (بدون رفرش صفحه)، پس هر بار که کاربر روی تب «جزوه‌ها» یا
    // «ویدیوها» توی نوار پایین می‌زنه، خودِ سایت دوباره رابط قدیمی رو می‌سازه. باید هر بار
    // بعد از اون، ما هم دوباره hideOldUI + رندر خودمون رو اجرا کنیم - وگرنه فقط یه‌بار اولش کار می‌کنه.
    document.querySelectorAll('.bottom-nav [data-page="notes"], .bottom-nav [data-page="videos"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          hideOldUI();
          refreshCurrentView();
        }, 60); // یه تاخیر کوچیک تا رندر قدیمی خودِ سایت اول تموم بشه
      });
    });
  }
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
